# claude-nirvana Roadmap
> Tag key: `[Code]` = Claude Code · `[Cowork]` = Claude Cowork · `[Human]` = Charles must act

## 🔄 In Progress

### Monday 2026-04-27 — Phase 3 Decision Check
- [ ] `[Human]` Review proxy logs for the week: `docker logs nirvana-proxy | grep heartbeat`
  - Look for `pump went silent` events and their `silent_sec` durations
  - If drops are frequent (>1/day) or long (>10 min) → prioritize Phase 3
  - If drops are rare/brief → cloud API path is good enough, defer Phase 3
- [ ] `[Human]` Decide: build Phase 3 local control server, or leave on cloud API

## 🔲 Backlog

### Phase 3 — Local Control Server (build if Monday review warrants it)
- [ ] `[Code]` Local command server: handle `findQueuesByCardId` (inject queued cmds) + store state from `SetParameters` POSTs
- [ ] `[Code]` Proxy routing update: intercept those two endpoints locally, forward everything else to cloud
- [ ] `[Code]` MCP server update: add `local` mode that queues commands to local server; cloud API as fallback
- [ ] `[Code]` Phase 2B — AWS IoT direct connection (only if TLS pinning blocks Phase 2A — confirmed not needed)
- [ ] `[Code]` Phase 2C — Modbus/RS485 wired control (check nameplate if interested)

### Track 1 — Local HTTP
- [ ] `[Human]` Probe http://192.168.0.3/ in browser — pump may have a local web UI

### Track 2 — Cloud API (IMPLEMENTED ✅)
- [x] `[Code]` Downloaded + decompiled APK v2.9.6 — extracted full API (2026-04-19)
  - Base URL: https://nirvana.iot-endpoint.com
  - Auth: AWS Cognito us-east-2_zqlraOyU4 / USER_PASSWORD_AUTH
  - Endpoints: /customer/devices, /pump/parameter, /pump/desired/setpoint, /pump/desired/heating-mode, /pump/desired/fan-mode, /pump/desired/reset-running-time, /customer/get-history
- [x] `[Code]` Implemented MCP server: src/index.js, src/api.js, src/auth.js (2026-04-19)

### Build & Infrastructure
- [x] `[Code]` 2026-04-22 — Add SSE transport mode (port 8774) for NAS/coordinator use — `MCP_TRANSPORT=sse` env var
- [x] `[Code]` 2026-04-25 — Add GHCR build-push workflow — test → build → push to `ghcr.io/aldarondo/claude-nirvana:latest` + SHA tag
- [x] `[Code]` 2026-04-25 — Weekly scheduled rebuild — `schedule: cron: "0 8 * * 0"` in build.yml

## ✅ Completed

### 🐛 Logger regression fix (2026-04-25)
- [x] Restored `logToolCall` / `logStatus` / `logError` exports that were dropped by the `tee → native file logging` rewrite (commit 04bf578). `src/index.js` and `tests/unit/logger.test.js` both import them; their loss broke the unit suite and every integration test that imports `src/index.js`. The build job exited 1 (run 24939492066) so no image got pushed. New `src/logger.js` keeps the new console-monkey-patching → `app.log` and adds back the structured NDJSON → `nirvana.log` path (with the original `hashId` + email/user-pool scrubbing). 43 tests pass.

### Local Control — Phase 2A (2026-04-25)
- [x] Pump found at 192.168.0.3 via dnsmasq DHCP (MAC `52:d4:f7:98:06:0a`)
- [x] dnsmasq updated: redirect `ws-edge.nirvanahp.com` + `nirvana.iot-endpoint.com` → NAS
- [x] iptables-legacy REDIRECT: `.3:443 → :8443` — persistent via `/usr/local/etc/rc.d/nirvana-iptables.sh`
- [x] nirvana-proxy deployed: HTTPS/WSS proxy on :8443, `network_mode: host` (avoids DNS loop), forwards to real cloud via 8.8.8.8
- [x] Proxy confirmed intercepting live traffic: `SetParameters` full state + `findQueuesByCardId` polling every ~3s
- [x] Heartbeat monitor added to proxy: logs `pump went silent` / `pump reconnected` events with gap duration
- [x] Phase 2B/2C not needed — no TLS pinning confirmed

### Earlier work
- [x] 2026-04-25 — Integration tests complete — mcp.test.js covers all 7 tools end-to-end
- [x] 2026-04-22 — Deployed to Synology NAS via docker compose; live API connection verified
- [x] 2026-04-22 — Created .env on NAS; credentials + card_id FC-0F-E7-98-06-0A confirmed
- [x] 2026-04-19 — Unit tests for api.js — 12 passing tests
- [x] 2026-04-19 — Implemented MCP server: src/index.js, src/api.js, src/auth.js
- [x] 2026-04-19 — Downloaded + decompiled APK v2.9.6 — extracted full API

## 🚫 Blocked
<!-- no current blockers -->
