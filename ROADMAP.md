# claude-nirvana Roadmap
> Tag key: `[Code]` = Claude Code · `[Cowork]` = Claude Cowork · `[Human]` = Charles must act

## 🔄 In Progress

### Local Control — Phase 1: Traffic Recon
See full plan: [LOCAL_CONTROL_PLAN.md](LOCAL_CONTROL_PLAN.md)
- [x] `[Code]` 2026-04-25 — Pump found at **192.168.0.122** (network MAC `52:d4:f7:98:06:0a`). On same subnet as NAS — ARP spoofing is feasible. No inbound TCP ports open (outbound-only device). Earlier "IoT VLAN" assessment was wrong.
- [x] `[Code]` 2026-04-23 — Built `nirvana-capture` Docker container (`capture/Dockerfile`, `capture/docker-compose.yml`)
- [x] `[Code]` 2026-04-23 — Wrote `capture/capture.sh` and `capture/cleanup.sh`
- [x] `[Human]` 2026-04-25 — Deploy capture container and run pcap
- [x] `[Code]` 2026-04-25 — Analyzed pcap: pump uses HTTPS REST to `nirvana.iot-endpoint.com` (uvicorn/ALB), no MQTT, no IoT Core, no TLS pinning → Phase 2A
- [x] `[Human]` 2026-04-25 — Cox DHCP changed to .4–.122 (excludes .2 JuiceBox, .3 pump)
- [x] `[Code]` 2026-04-25 — juicebox dnsmasq updated: reserve .3 for pump MAC, redirect `nirvana.iot-endpoint.com` → NAS
- [x] `[Human]` 2026-04-25 — Reboot pump (landed at .122 — Cox ceiling fix still needed)
- [ ] `[Human]` Change Cox DHCP ceiling from .122 → .121 so pump at .122 is outside pool → forces DHCPDISCOVER → dnsmasq wins with .3
- [ ] `[Human]` Reboot pump again after Cox ceiling fix
- [x] `[Code]` 2026-04-25 — Phase 2A proxy built: `proxy/` — nginx routes nirvana.iot-endpoint.com:443→proxy container HTTP:8444; proxy logs+forwards to real cloud; build-proxy.yml deploys via sshpass; nginx conf written to NAS sites-enabled

## 🔲 Backlog

### Track 1 — Local HTTP (still to try)
- [ ] `[Human]` Find module's LAN IP in router DHCP table (MAC: FC:0F:E7:98:06:0A) and probe http://<ip>/ in browser

### Track 2 — Cloud API (IMPLEMENTED ✅)
- [x] `[Code]` Downloaded + decompiled APK v2.9.6 — extracted full API (2026-04-19)
  - Base URL: https://nirvana.iot-endpoint.com
  - Auth: AWS Cognito us-east-2_zqlraOyU4 / USER_PASSWORD_AUTH
  - Endpoints: /customer/devices, /pump/parameter, /pump/desired/setpoint, /pump/desired/heating-mode, /pump/desired/fan-mode, /pump/desired/reset-running-time, /customer/get-history
- [x] `[Code]` Implemented MCP server: src/index.js, src/api.js, src/auth.js (2026-04-19)

### Build & Infrastructure
- [x] `[Code]` 2026-04-22 — Add SSE transport mode (port 8774) for NAS/coordinator use — `MCP_TRANSPORT=sse` env var
- [x] `[Code]` 2026-04-25 — Add GHCR build-push workflow — test → build → push to `ghcr.io/aldarondo/claude-nirvana:latest` + SHA tag; SSH key auth via Cloudflare tunnel (replaces broken sshpass approach)
- [x] `[Code]` 2026-04-25 — Weekly scheduled rebuild — `schedule: cron: "0 8 * * 0"` in build.yml picks up base-image security patches every Sunday

### Local Control — Phase 2 (pending Phase 1 results)
- [x] `[Code]` 2026-04-25 — Phase 2A — Local proxy server (no TLS pinning confirmed) — COMPLETE
- [ ] `[Code]` Phase 2B — AWS IoT direct connection (if TLS pinning blocks 2A)
- [ ] `[Code]` Phase 2C — Modbus/RS485 wired control (if hardware supports it — check nameplate)
- [ ] `[Code]` Phase 3 — Replace MCP primary path: local → cloud fallback → email alert

### Next steps
- [x] `[Human]` 2026-04-22 — Created .env on NAS; credentials + card_id FC-0F-E7-98-06-0A confirmed
- [x] `[Code]` 2026-04-19 — Write unit tests (tests/unit/api.test.js stubs in place)
- [x] `[Code]` 2026-04-25 — Integration tests complete — mcp.test.js covers all 7 tools end-to-end via InMemoryTransport; auth.test.js covers token caching, refresh, and sign-in failure paths
- [x] `[Code]` 2026-04-22 — Deployed to Synology NAS via docker compose; live API connection verified

## ✅ Completed
- [x] 2026-04-19 — Completed: Unit tests for api.js — 12 passing tests covering listDevices, getParameters, setTemperature/HeatingMode/FanMode validation, and formatStatus; moved formatStatus to api.js (exported); fixed npm test script for Windows

## 🚫 Blocked
<!-- no current blockers -->
<!-- log blockers here -->
