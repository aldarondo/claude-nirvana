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
| MCP Server | Node.js 20, MCP SDK |
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
The server listens on port **8773** (`http://nas:8773/sse`).

### Environment variables

| Variable | Description |
|---|---|
| `NIRVANA_USERNAME` | Nirvana app account email |
| `NIRVANA_PASSWORD` | Nirvana app account password |
| `NIRVANA_CARD_ID` | Device card_id (from `list_devices`) |
| `MCP_TRANSPORT` | `stdio` (default) or `sse` |
| `MCP_HOST` | SSE bind address (default `0.0.0.0`) |
| `MCP_PORT` | SSE port (default `8773`) |

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
claude-nirvana MCP server running (SSE) on 0.0.0.0:8773
```
If you see a crash instead, run `docker compose logs claude-nirvana` and check for missing env vars.

## Security notes

- `.env` contains plaintext credentials — do not commit it or expose it outside the NAS
- The SSE endpoint (`http://nas:8773/sse`) has no authentication while in active development; restrict network access or firewall the port when not in use
- Log files in `/app/data/nirvana.log` are rotated at 500 KB; they do not contain passwords but do contain device identifiers

## Tests
```bash
npm test
```

## Project Status
MCP server live on Synology NAS. See [ROADMAP.md](ROADMAP.md).

---
**Publisher:** Xity Software, LLC
