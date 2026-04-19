# claude-nirvana

## Project Purpose
MCP server deployed on Synology NAS via Docker to manage the Nirvana pool hot water heater — exposes heater controls (on/off, temp query, schedule) as MCP tools callable by Claude.

## Key Commands
```bash
npm install          # install dependencies
npm start            # run locally (stdio mode)
npm test             # run all tests
docker compose up -d # deploy via Docker
docker compose logs -f
```

## Testing Requirements (mandatory)
- Every feature or bug fix must include unit tests covering the core logic
- Every user-facing flow must have at least one integration test
- Tests live in `tests/unit/` and `tests/integration/`
- Run all tests before marking any task complete: `npm test`

## After Every Completed Task (mandatory)
- Move the task to ✅ Completed in ROADMAP.md with today's date
- Update README.md if any feature, command, setup step, or interface changed

## Git Rules
- Never create pull requests. Push directly to main.
- solo/auto-push OK

## Skills
Before implementing any custom solution, check available skills first — prefer `/skill-name` over writing new code. The full list is visible in the Claude Code session context.

@~/Documents/GitHub/CLAUDE.md
