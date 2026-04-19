# claude-nirvana

MCP server for managing the Nirvana pool hot water heater setup at home, deployed as a Docker container on Synology NAS.

## Features
- Query current water heater status and temperature
- Turn pool heater on/off via MCP tools
- Schedule heating cycles
- Expose controls to Claude via the Model Context Protocol

## Tech Stack
| Layer | Technology |
|---|---|
| MCP Server | Node.js (MCP SDK) |
| Container | Docker / Docker Compose |
| Host | Synology NAS |
| Protocol | Model Context Protocol (stdio / HTTP SSE) |

## Getting Started

```bash
# Install dependencies
npm install

# Run locally (stdio mode)
npm start

# Build and run via Docker
docker compose up -d

# View logs
docker compose logs -f

# Run tests
npm test
```

## Synology Deployment

Mount the project folder into the container and use Docker Compose via Synology Container Manager or `docker compose` over SSH.

## Project Status
Early development. See [ROADMAP.md](ROADMAP.md) for what's planned.

---
**Publisher:** Xity Software, LLC
