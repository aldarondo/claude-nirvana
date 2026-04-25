#!/usr/bin/env node
/**
 * claude-nirvana MCP Server
 * Controls the Nirvana pool heat pump via the Nirvana cloud API.
 *
 * Env vars required:
 *   NIRVANA_USERNAME  - Nirvana app account email
 *   NIRVANA_PASSWORD  - Nirvana app account password
 *   NIRVANA_CARD_ID   - Device card_id (get from list_devices if unknown)
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import express from 'express';

import {
  listDevices,
  getParameters,
  setTemperature,
  setHeatingMode,
  setFanMode,
  getHistory,
  resetRunningTime,
  formatStatus,
} from './api.js';
import { logToolCall, logStatus, logError } from './logger.js';

// Cognito and internal error patterns that should not be exposed to callers
const SENSITIVE_ERROR_PATTERNS = [
  /user.*does not exist/i,
  /password.*incorrect/i,
  /not authorized/i,
  /cognito/i,
  /user pool/i,
];

function safeErrorMessage(message) {
  if (SENSITIVE_ERROR_PATTERNS.some(p => p.test(message))) {
    return 'Authentication failed — check server credentials';
  }
  return message;
}

function validateCardId(cardId) {
  if (!cardId || typeof cardId !== 'string' || cardId.trim().length === 0) {
    throw new Error('card_id required (pass as argument or set NIRVANA_CARD_ID env var)');
  }
}

// ─── Server factory ──────────────────────────────────────────────────────────

export function createServer() {
  const server = new Server(
    { name: 'claude-nirvana', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  // ─── Tool definitions ───────────────────────────────────────────────────────

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'list_devices',
        description: 'List all Nirvana heat pump devices enrolled in the account. Returns card_id values needed for other tools.',
        inputSchema: { type: 'object', properties: {}, required: [] },
      },
      {
        name: 'get_status',
        description: 'Get current status of the Nirvana heat pump: water temperature, target temperature, heating mode, outdoor temp, running time, alerts. Also shows the temperature unit (°C or °F) configured on the device.',
        inputSchema: {
          type: 'object',
          properties: {
            card_id: { type: 'string', description: 'Device card_id (from list_devices or NIRVANA_CARD_ID env var)' },
          },
          required: [],
        },
      },
      {
        name: 'set_temperature',
        description: 'Set the target water temperature for pool or spa mode. Call get_status first to determine which temperature unit (°C or °F) the device is configured to use — the value must be in that unit.',
        inputSchema: {
          type: 'object',
          properties: {
            temperature: { type: 'number', description: 'Target temperature in the unit shown by get_status (°C: 1–50, °F: 34–110)' },
            mode: { type: 'string', enum: ['pool', 'spa'], description: 'Which setpoint to change: pool or spa' },
            card_id: { type: 'string', description: 'Device card_id (optional if NIRVANA_CARD_ID env var is set)' },
          },
          required: ['temperature', 'mode'],
        },
      },
      {
        name: 'set_mode',
        description: 'Turn the heat pump on (POOL or SPA mode) or off. Use POOL for pool heating, SPA for spa, OFF to turn off.',
        inputSchema: {
          type: 'object',
          properties: {
            mode: { type: 'string', enum: ['POOL', 'SPA', 'OFF'], description: 'POOL = pool heating on, SPA = spa heating on, OFF = turn off' },
            card_id: { type: 'string', description: 'Device card_id (optional if NIRVANA_CARD_ID env var is set)' },
          },
          required: ['mode'],
        },
      },
      {
        name: 'set_fan_mode',
        description: 'Set the fan/compressor mode: ECO (quiet/efficient), QUIET, SMART (auto), or BOOST (max power).',
        inputSchema: {
          type: 'object',
          properties: {
            mode: { type: 'string', enum: ['ECO', 'QUIET', 'SMART', 'BOOST'] },
            card_id: { type: 'string', description: 'Device card_id (optional if NIRVANA_CARD_ID env var is set)' },
          },
          required: ['mode'],
        },
      },
      {
        name: 'get_history',
        description: 'Get the alert and error history for the heat pump.',
        inputSchema: {
          type: 'object',
          properties: {
            card_id: { type: 'string', description: 'Device card_id (optional if NIRVANA_CARD_ID env var is set)' },
          },
          required: [],
        },
      },
      {
        name: 'reset_runtime',
        description: 'Reset the running time counter on the heat pump.',
        inputSchema: {
          type: 'object',
          properties: {
            card_id: { type: 'string', description: 'Device card_id (optional if NIRVANA_CARD_ID env var is set)' },
          },
          required: [],
        },
      },
    ],
  }));

  // ─── Tool handlers ───────────────────────────────────────────────────────────

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const cardId = args?.card_id || process.env.NIRVANA_CARD_ID;

    try {
      switch (name) {
        case 'list_devices': {
          const devices = await listDevices();
          logToolCall('list_devices', {}, { count: devices.length });
          return { content: [{ type: 'text', text: JSON.stringify(devices, null, 2) }] };
        }

        case 'get_status': {
          validateCardId(cardId);
          const params = await getParameters(cardId);
          logStatus(cardId, params);
          const status = formatStatus(params);
          return { content: [{ type: 'text', text: status }] };
        }

        case 'set_temperature': {
          validateCardId(cardId);
          const { temperature, mode } = args;
          if (!Number.isFinite(temperature)) throw new Error('temperature must be a finite number');
          if (temperature < 1 || temperature > 110) throw new Error('temperature out of valid range (°C: 1–50, °F: 34–110)');
          const result = await setTemperature(cardId, mode, temperature);
          logToolCall('set_temperature', { card_id: cardId, mode, temperature }, result);
          return { content: [{ type: 'text', text: `✅ ${mode.toUpperCase()} setpoint updated to ${temperature}°\n${JSON.stringify(result)}` }] };
        }

        case 'set_mode': {
          validateCardId(cardId);
          const result = await setHeatingMode(cardId, args.mode);
          logToolCall('set_mode', { card_id: cardId, mode: args.mode }, result);
          const label = args.mode === 'OFF' ? '🔴 Heat pump turned OFF' : `🟢 Heat pump set to ${args.mode} mode`;
          return { content: [{ type: 'text', text: `${label}\n${JSON.stringify(result)}` }] };
        }

        case 'set_fan_mode': {
          validateCardId(cardId);
          const result = await setFanMode(cardId, args.mode);
          logToolCall('set_fan_mode', { card_id: cardId, mode: args.mode }, result);
          return { content: [{ type: 'text', text: `✅ Fan mode set to ${args.mode}\n${JSON.stringify(result)}` }] };
        }

        case 'get_history': {
          validateCardId(cardId);
          const history = await getHistory(cardId);
          logToolCall('get_history', { card_id: cardId }, { entries: history?.length ?? 0 });
          return { content: [{ type: 'text', text: JSON.stringify(history, null, 2) }] };
        }

        case 'reset_runtime': {
          validateCardId(cardId);
          const result = await resetRunningTime(cardId);
          logToolCall('reset_runtime', { card_id: cardId }, result);
          return { content: [{ type: 'text', text: `✅ Running time reset\n${JSON.stringify(result)}` }] };
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (err) {
      logError(name, err.message);
      return {
        content: [{ type: 'text', text: `❌ Error: ${safeErrorMessage(err.message)}` }],
        isError: true,
      };
    }
  });

  return server;
}

// ─── Start ───────────────────────────────────────────────────────────────────

if (!process.env.MCP_TEST_MODE) {
  const MCP_TRANSPORT = process.env.MCP_TRANSPORT || 'stdio';
  const MCP_HOST = process.env.MCP_HOST || '0.0.0.0';
  const MCP_PORT = parseInt(process.env.MCP_PORT || '8774', 10);

  if (MCP_TRANSPORT === 'sse') {
    const MCP_API_KEY = process.env.MCP_API_KEY;
    if (!MCP_API_KEY) {
      console.error('WARNING: MCP_API_KEY is not set — SSE endpoint has no authentication');
    }

    const app = express();
    app.use(express.json({ limit: '1mb' }));

    app.use('/mcp', (req, res, next) => {
      if (!MCP_API_KEY) return next();
      const provided = req.headers['x-api-key'] || req.headers['authorization']?.replace(/^Bearer\s+/i, '');
      if (provided !== MCP_API_KEY) return res.status(401).json({ error: 'Unauthorized' });
      next();
    });

    app.post('/mcp', async (req, res) => {
      const server = createServer();
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      res.on('close', () => {
        transport.close();
        server.close();
      });
    });

    app.get('/mcp', (req, res) => res.status(405).end());
    app.delete('/mcp', (req, res) => res.status(405).end());

    app.listen(MCP_PORT, MCP_HOST, () => {
      console.error(`claude-nirvana MCP server running (StreamableHTTP) on ${MCP_HOST}:${MCP_PORT}`);
    });
  } else {
    const server = createServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('claude-nirvana MCP server running (stdio)');
  }
}
