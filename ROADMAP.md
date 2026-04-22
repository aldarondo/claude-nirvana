# claude-nirvana Roadmap
> Tag key: `[Code]` = Claude Code · `[Cowork]` = Claude Cowork · `[Human]` = Charles must act

## 🔄 In Progress
- [ ] `[Human]` Set NIRVANA_USERNAME, NIRVANA_PASSWORD in .env and run `node src/index.js` to verify auth + get card_id via list_devices tool

## 🔲 Backlog

### Track 1 — Local HTTP (still to try)
- [ ] `[Human]` Find module's LAN IP in router DHCP table (MAC: FC:0F:E7:98:06:0A) and probe http://<ip>/ in browser

### Track 2 — Cloud API (IMPLEMENTED ✅)
- [x] `[Code]` Downloaded + decompiled APK v2.9.6 — extracted full API (2026-04-19)
  - Base URL: https://nirvana.iot-endpoint.com
  - Auth: AWS Cognito us-east-2_zqlraOyU4 / USER_PASSWORD_AUTH
  - See apk-research/FINDINGS.md for complete endpoint map
- [x] `[Code]` Implemented MCP server: src/index.js, src/api.js, src/auth.js (2026-04-19)

### Build & Infrastructure
- [ ] `[Code]` Add GHCR build-push workflow — migrate container from `node:20-alpine` to a versioned GHCR image (`ghcr.io/aldarondo/...`) with GitHub Actions auto-deploy
- [ ] `[Code]` Add weekly scheduled rebuild — GitHub Actions `schedule: cron` to repull and push a fresh image every week, picking up base-image security patches

### Next steps
- [ ] `[Human]` Create .env from .env.example, fill in Nirvana credentials
- [ ] `[Human]` Run list_devices to get card_id, add to .env
- [x] `[Code]` 2026-04-19 — Write unit tests (tests/unit/api.test.js stubs in place)
- [ ] `[Code]` Write integration tests once credentials confirmed working
- [ ] `[Code]` Deploy to Synology NAS via docker compose

## ✅ Completed
- [x] 2026-04-19 — Completed: Unit tests for api.js — 12 passing tests covering listDevices, getParameters, setTemperature/HeatingMode/FanMode validation, and formatStatus; moved formatStatus to api.js (exported); fixed npm test script for Windows

## 🚫 Blocked

- ❌ [docker-monitor:no-ghcr-image] Container `claude-nirvana` uses `node:20-alpine` — migrate to `ghcr.io/aldarondo/...` with a GitHub Actions build-push workflow — 2026-04-22 08:00 UTC
<!-- log blockers here -->
