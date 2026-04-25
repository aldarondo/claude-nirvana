# claude-nirvana

MCP server for managing the Nirvana pool heat pump at home, deployed as a Docker container on Synology NAS. Controls the heater via the reverse-engineered Nirvana cloud API.

## Features
- Get current water temperature, outdoor temp, heating state, and runtime stats
- Turn the heat pump on (pool or spa mode) or off
- Set target pool or spa temperature
- Set fan mode (ECO / QUIET / SMART / BOOST)
- Retrieve alert and error history
- Reset running time counter

## Tech Stack
| Layer | Technology |
|---|---|
| MCP Server | Node.js 22, MCP SDK |
| Auth | AWS Cognito (`amazon-cognito-identity-js`) |
| HTTP Client | Axios |
| API | Nirvana cloud (`https://nirvana.iot-endpoint.com`) |
| Container | Docker / Docker Compose |
| Host | Synology NAS |

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Configure credentials
```bash
cp .env.example .env
# Edit .env with your Nirvana app email + password
```

### 3. Get your card_id
Run the server and call the `list_devices` tool to find your device's `card_id`, then add it to `.env`:
```bash
npm start
# In Claude: call list_devices → copy card_id → add to .env as NIRVANA_CARD_ID
```

### 4. Run locally (stdio — Claude Desktop subprocess)
```bash
npm start
```

### 5. Run on NAS (SSE — persistent Docker container)
Set `MCP_TRANSPORT=sse` in `.env`, then:
```bash
docker compose up -d
docker compose logs -f
```
The server listens on port **8774** (`http://nas:8774/mcp`).

### Environment variables

| Variable | Description |
|---|---|
| `NIRVANA_USERNAME` | Nirvana app account email |
| `NIRVANA_PASSWORD` | Nirvana app account password |
| `NIRVANA_CARD_ID` | Device card_id (from `list_devices`) |
| `MCP_TRANSPORT` | `stdio` (default) or `sse` |
| `MCP_HOST` | SSE bind address (default `0.0.0.0`) |
| `MCP_PORT` | SSE port (default `8774`) |
| `MCP_API_KEY` | Optional API key for SSE endpoint — set to require `X-API-Key` or `Authorization: Bearer` header on all `/mcp` requests |

## MCP Tools

| Tool | Description |
|------|-------------|
| `list_devices` | List enrolled devices and get `card_id` |
| `get_status` | Water temp, target temp, mode, outdoor temp, runtime, alerts |
| `set_temperature` | Set pool or spa target temperature |
| `set_mode` | Turn on (`POOL`/`SPA`) or `OFF` |
| `set_fan_mode` | `ECO` / `QUIET` / `SMART` / `BOOST` |
| `get_history` | Alert and error history |
| `reset_runtime` | Reset the running time counter |

### Tool Reference

#### `list_devices`
**Input:** `{}` (no arguments required)
**Output:** JSON array of device objects, each containing `card_id` and device metadata.
**Errors:** Auth failure if credentials are wrong.

#### `get_status`
**Input:** `{ card_id?: string }`
**Output:** Multi-line status string, e.g.:
```
📶  Device status:    ✅ ONLINE (2m ago)
🌡️  Water temp:       27.5°C
🎯  Target (pool):    30°C
⚡  Mode:             POOL
🔥  Heating active:   YES
```
**Errors:** `card_id required` if not provided and `NIRVANA_CARD_ID` not set.

#### `set_temperature`
**Input:** `{ temperature: number, mode: "pool"|"spa", card_id?: string }`
- `temperature` must be finite, range 1–110 (°C: 1–50, °F: 34–110 — use the unit shown in `get_status`)
**Output:** `✅ POOL setpoint updated to 30°` followed by raw API response.
**Errors:** `temperature must be a finite number`, `temperature out of valid range`.

#### `set_mode`
**Input:** `{ mode: "POOL"|"SPA"|"OFF", card_id?: string }`
**Output:** `🟢 Heat pump set to POOL mode` or `🔴 Heat pump turned OFF`.

#### `set_fan_mode`
**Input:** `{ mode: "ECO"|"QUIET"|"SMART"|"BOOST", card_id?: string }`
**Output:** `✅ Fan mode set to ECO`.

#### `get_history`
**Input:** `{ card_id?: string }`
**Output:** JSON array of alert/error history entries.

#### `reset_runtime`
**Input:** `{ card_id?: string }`
**Output:** `✅ Running time reset` followed by raw API response.

## MCP Config (Claude Desktop / claude-synology)
```json
{
  "mcpServers": {
    "nirvana": {
      "command": "node",
      "args": ["/volume1/docker/claude-nirvana/src/index.js"],
      "env": {
        "NIRVANA_USERNAME": "your@email.com",
        "NIRVANA_PASSWORD": "yourpassword",
        "NIRVANA_CARD_ID": "your_card_id"
      }
    }
  }
}
```

## Temperature ranges

The `set_temperature` tool accepts values in whichever unit the device is configured to use. Call `get_status` first — the status output shows the active unit (°C or °F).

| Unit | Valid range |
|------|-------------|
| °C   | 1 – 50      |
| °F   | 34 – 110    |

## Troubleshooting

**`list_devices` returns an empty array**
The Nirvana account has no enrolled devices. Log in to the Nirvana app and confirm the heat pump is paired to the account.

**Authentication errors**
Verify `NIRVANA_USERNAME` and `NIRVANA_PASSWORD` in `.env` match the Nirvana mobile app credentials. Passwords are case-sensitive.

**`get_status` shows `⚠️ OFFLINE`**
The device hasn't checked in for more than 10 minutes. Check that the heat pump has internet connectivity. The device communicates via Nirvana's cloud API — local network access is not required.

**Docker: expected log output on healthy start**
```
claude-nirvana MCP server running (StreamableHTTP) on 0.0.0.0:8774
```
If you see a crash instead, run `docker compose logs claude-nirvana` and check for missing env vars.

## Security notes

- `.env` contains plaintext credentials — never commit it. Use `.env.example` as a template and keep `.env` on the NAS only.
- Set `MCP_API_KEY` in `.env` to require authentication on the SSE endpoint. Without it, anyone on the local network can call all tools (firewall the port if `MCP_API_KEY` is not set).
- SSE endpoint is HTTP-only by default; for internet-facing deployments, terminate TLS at a reverse proxy (e.g. Nginx or Cloudflare Tunnel).
- Log files in `/app/data/nirvana.log` are rotated at 500 KB. Logs do not contain credentials or plaintext device IDs — device identifiers are stored as one-way hashes.
- Rotate Nirvana credentials periodically via the Nirvana mobile app; update `.env` on the NAS after rotation.

## Tests
```bash
npm test
```

## Project Status
MCP server live on Synology NAS. See [ROADMAP.md](ROADMAP.md).

---
**Publisher:** Xity Software, LLC
