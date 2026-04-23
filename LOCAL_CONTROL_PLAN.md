# Nirvana Heat Pump — Local Control Plan

**Goal:** Eliminate cloud dependency for pool heater control. Currently all commands relay through `nirvana.iot-endpoint.com` — if the Nirvana cloud is degraded, the device shows OFFLINE even when the pump has power and WiFi.

**Status:** Phase 1 (traffic recon) not yet started — waiting on device IP from Cox Panoramic app.

---

## Background

The `claude-nirvana` MCP server controls the heat pump through the Nirvana cloud REST API (AWS-hosted). The device connects outbound to the cloud; there is no known local LAN API. The cloud acts as a relay: commands posted to the REST API are forwarded to the device over a persistent cloud connection (likely MQTT or AWS IoT Core WebSocket).

When the Nirvana cloud is degraded, the device shows `OFFLINE` even though it has power and WiFi — the coordinator cannot send commands and the overnight heating schedule fails silently.

Known device MAC: `FC:0F:E7:98:06:0A`

---

## Phase 1 — Traffic Recon (ARP intercept)

**Goal:** Understand exactly what protocol and endpoints the heat pump device uses to talk to the cloud. This determines whether local interception is feasible.

### Prerequisites
- [ ] `[Code]` Look up heat pump IP by MAC address from NAS ARP table:
  ```bash
  python skills/synology.py ssh "arp -an | grep -i 'fc:0f:e7:98:06:0a'"
  # or if not in cache yet:
  python skills/synology.py ssh "sudo nmap -sn 192.168.1.0/24 && arp -an | grep -i 'fc:0f:e7:98:06:0a'"
  ```
- [ ] `[Human]` Confirm NAS is on the same subnet as the heat pump

### Implementation
- [ ] `[Code]` Build `nirvana-capture` Docker image on NAS:
  - Base: `debian:bookworm-slim`
  - Tools: `dsniff` (arpspoof), `tcpdump`, `mitmproxy`, `iptables`
  - Host networking mode (required for ARP operations)
- [ ] `[Code]` Write capture script (`capture.sh`):
  ```bash
  # Enable IP forwarding
  echo 1 > /proc/sys/net/ipv4/ip_forward

  # ARP spoof: tell the pump the NAS is the router, and vice versa
  arpspoof -i <iface> -t <pump_ip> <router_ip> &
  arpspoof -i <iface> -t <router_ip> <pump_ip> &

  # Redirect HTTP/HTTPS to mitmproxy
  iptables -t nat -A PREROUTING -s <pump_ip> -p tcp --dport 80  -j REDIRECT --to-port 8080
  iptables -t nat -A PREROUTING -s <pump_ip> -p tcp --dport 443 -j REDIRECT --to-port 8080

  # Raw packet capture (everything, not just HTTP)
  tcpdump -i <iface> host <pump_ip> -w /captures/nirvana-$(date +%s).pcap &

  # mitmproxy in transparent mode
  mitmproxy --mode transparent --listen-port 8080 \
            --save-stream-file /captures/nirvana-$(date +%s).mitm
  ```
- [ ] `[Code]` Write cleanup script (`cleanup.sh`) to restore iptables and stop ARP spoofing
- [ ] `[Code]` Add `docker-compose.yml` entry or standalone compose file for the capture container
- [ ] `[Human]` Run capture for 30 minutes; let the pump go through at least one full heartbeat/status cycle
- [ ] `[Human]` Export pcap and mitmproxy flow file from NAS `/volume1/docker/nirvana-capture/captures/`

### What to look for
- **Protocol**: Is it MQTT, WebSocket, HTTP polling, or AWS IoT Core?
- **Endpoints**: What hostnames/IPs does the device connect to?
- **Frequency**: How often does it heartbeat? (determines our polling window)
- **TLS pinning**: Does mitmproxy intercept cleanly, or does the device reject the cert?
- **Command delivery**: When we send a command via the REST API, does the cloud push it to the device, or does the device poll?

---

## Phase 2A — Local Proxy (if no TLS pinning)

*Only proceed here if Phase 1 shows mitmproxy intercepts successfully.*

**Goal:** Run a local server on the NAS that impersonates `nirvana.iot-endpoint.com`. The device talks to us instead of the cloud. We store state locally and issue commands directly.

- [ ] `[Code]` Implement `nirvana-local-server` — Node.js/Python HTTP server that:
  - Accepts the device's status reports and stores them in a local state file
  - Exposes the same REST endpoints as the real cloud (`/pump/parameter`, `/pump/desired/heating-mode`, etc.)
  - Responds to device heartbeats with queued commands
- [ ] `[Code]` DNS override: add a router-level DNS entry (or dnsmasq on NAS) pointing `nirvana.iot-endpoint.com` → NAS IP for the heat pump only
- [ ] `[Code]` TLS: generate a self-signed cert for `nirvana.iot-endpoint.com`; install the CA on the heat pump (via router DHCP option or direct device config if accessible)
- [ ] `[Code]` Update `claude-nirvana` MCP server to call the local server instead of the real cloud when `NIRVANA_LOCAL_MODE=true`
- [ ] `[Code]` Add health check: if local server can't reach device in 10 min, fall back to cloud API and send alert email

---

## Phase 2B — MQTT/AWS IoT Direct (if TLS pinning blocks 2A)

*Only proceed here if Phase 1 shows the device does certificate pinning.*

**Goal:** Connect directly to the same AWS IoT Core broker the device uses, using extracted device credentials.

- [ ] `[Human]` Physical access: open heat pump control panel and read the device certificate from the module (JTAG, serial console, or config file on flash)
- [ ] `[Code]` Connect to AWS IoT Core using device cert + private key, subscribe to the device's shadow topic
- [ ] `[Code]` Publish commands directly to the device's shadow `desired` state — bypasses the Nirvana REST API entirely
- [ ] `[Code]` Update `claude-nirvana` MCP to use direct IoT connection when `NIRVANA_IOT_DIRECT=true`

---

## Phase 2C — Modbus/RS485 (if WiFi module is separate from control board)

*Parallel investigation — check hardware while Phase 1 is running.*

**Goal:** Direct wired control via the heat pump's control board, bypassing WiFi entirely.

- [ ] `[Human]` Open the heat pump control panel and look for:
  - An RS485 terminal block (usually labeled A/B or +/-)
  - A Modbus RTU port
  - Any wiring diagrams on the inside of the panel door
- [ ] `[Human]` Note the model number from the nameplate (needed to find Modbus register map)
- [ ] `[Code]` If RS485 found: connect USB-RS485 adapter to NAS, scan Modbus addresses, map registers
- [ ] `[Code]` Build `nirvana-modbus` MCP tool — reads temp, sets mode/setpoint directly via Modbus
- [ ] `[Code]` This path gives 100% local control with zero cloud dependency

---

## Phase 3 — Replace claude-nirvana MCP

Once a local control path is proven, update the MCP server to use it as primary with cloud as fallback:

```
Local (Modbus/Proxy/IoT Direct)
  → Cloud API (current)
    → Alert email (if both fail)
```

- [ ] `[Code]` Add `CONTROL_MODE` env var: `local` | `cloud` | `auto` (default: `auto`)
- [ ] `[Code]` In `auto` mode: try local first, fall back to cloud if local fails, alert if both fail
- [ ] `[Code]` Update coordinator to receive a `control_mode` status in `get_status` response
- [ ] `[Code]` Integration tests covering all three modes

---

## Decision Tree

```
Phase 1 complete
├── mitmproxy intercepts cleanly (no TLS pinning)
│   └── → Phase 2A (local proxy)
├── TLS pinning — device rejects cert
│   ├── RS485 found on control board
│   │   └── → Phase 2C (Modbus) ← preferred
│   └── No RS485
│       └── → Phase 2B (AWS IoT direct)
└── Device uses MQTT (not HTTP)
    ├── RS485 found
    │   └── → Phase 2C (Modbus) ← preferred
    └── No RS485
        └── → Phase 2B (AWS IoT direct)
```
