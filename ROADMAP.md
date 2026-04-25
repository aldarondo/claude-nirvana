# claude-nirvana Roadmap
> Tag key: `[Code]` = Claude Code · `[Cowork]` = Claude Cowork · `[Human]` = Charles must act

## 🔄 In Progress

### Local Control — Phase 1: Traffic Recon
See full plan: [LOCAL_CONTROL_PLAN.md](LOCAL_CONTROL_PLAN.md)
- [x] `[Code]` 2026-04-23 — Confirmed pump MAC `FC:0F:E7:98:06:0A` is NOT on NAS subnet (192.168.0.0/24) — on separate IoT VLAN. Need Cox Panoramic app to find pump IP and subnet.
- [x] `[Code]` 2026-04-23 — Built `nirvana-capture` Docker container (`capture/Dockerfile`, `capture/docker-compose.yml`)
- [x] `[Code]` 2026-04-23 — Wrote `capture/capture.sh` and `capture/cleanup.sh`
- [ ] `[Human]` Find pump IP + subnet in Cox Panoramic app (MAC: FC:0F:E7:98:06:0A). **Critical:** NAS must be on same L2 as pump for ARP spoofing — if pump is on IoT VLAN, check if NAS can be added to that VLAN.
- [ ] `[Human]` Deploy capture container: `PUMP_IP=<ip> ROUTER_IP=<gw> IFACE=<iface> docker compose up` in `capture/` on NAS
- [ ] `[Human]` Run 30-min capture; export pcap + mitmproxy flows from `/volume1/docker/nirvana-capture/captures/`
- [ ] `[Code]` Analyze results → decide Phase 2 path (proxy / IoT direct / Modbus)

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
- [x] `[Code]` 2026-04-22 — Add SSE transport mode (port 8769) for NAS/coordinator use — `MCP_TRANSPORT=sse` env var
- [ ] `[Code]` Add GHCR build-push workflow — migrate container from `node:20-alpine` to a versioned GHCR image (`ghcr.io/aldarondo/...`) with GitHub Actions auto-deploy
- [ ] `[Code]` Add weekly scheduled rebuild — GitHub Actions `schedule: cron` to repull and push a fresh image every week, picking up base-image security patches

### Local Control — Phase 2 (pending Phase 1 results)
- [ ] `[Code]` Phase 2A — Local proxy server (if no TLS pinning)
- [ ] `[Code]` Phase 2B — AWS IoT direct connection (if TLS pinning blocks 2A)
- [ ] `[Code]` Phase 2C — Modbus/RS485 wired control (if hardware supports it — check nameplate)
- [ ] `[Code]` Phase 3 — Replace MCP primary path: local → cloud fallback → email alert

### Next steps
- [x] `[Human]` 2026-04-22 — Created .env on NAS; credentials + card_id FC-0F-E7-98-06-0A confirmed
- [x] `[Code]` 2026-04-19 — Write unit tests (tests/unit/api.test.js stubs in place)
- [ ] `[Code]` Write integration tests once credentials confirmed working
- [x] `[Code]` 2026-04-22 — Deployed to Synology NAS via docker compose; live API connection verified

## ✅ Completed
- [x] 2026-04-19 — Completed: Unit tests for api.js — 12 passing tests covering listDevices, getParameters, setTemperature/HeatingMode/FanMode validation, and formatStatus; moved formatStatus to api.js (exported); fixed npm test script for Windows

## 🚫 Blocked
- ❌ [docker-monitor:deploy-failed] GitHub Actions deploy failed (run #24920102711) — https://github.com/aldarondo/claude-nirvana/actions/runs/24920102711 — 2026-04-25 08:00 UTC
- ❌ [docker-monitor:no-ghcr-image] Container `claude-nirvana` uses `node:20-alpine` — migrate to `ghcr.io/aldarondo/...` with a GitHub Actions build-push workflow — 2026-04-23 08:00 UTC
- ❌ Phase 1 capture blocked: pump (MAC FC:0F:E7:98:06:0A) is on a separate IoT VLAN — not reachable from NAS subnet 192.168.0.0/24. ARP spoofing requires same L2 segment. **Charles must:** (1) find pump IP/subnet in Cox Panoramic app, (2) determine if NAS can join that VLAN, or use a device already on the IoT network as the capture host.
<!-- log blockers here -->
