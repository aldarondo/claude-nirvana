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

### 4. Run locally
```bash
npm start
```

### 5. Deploy to Synology NAS
```bash
docker compose up -d
docker compose logs -f
```

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

## Tests
```bash
npm test
```

## Project Status
MCP server implemented. Pending: credential verification + Synology deployment. See [ROADMAP.md](ROADMAP.md).

---
**Publisher:** Xity Software, LLC
