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
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

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
      description: 'Get current status of the Nirvana heat pump: water temperature, target temperature, heating mode, outdoor temp, running time, alerts.',
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
      description: 'Set the target water temperature for pool or spa mode.',
      inputSchema: {
        type: 'object',
        properties: {
          temperature: { type: 'number', description: 'Target temperature in the unit currently configured on the device (°C or °F)' },
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
        return { content: [{ type: 'text', text: JSON.stringify(devices, null, 2) }] };
      }

      case 'get_status': {
        if (!cardId) throw new Error('card_id required (pass as argument or set NIRVANA_CARD_ID env var)');
        const params = await getParameters(cardId);
        const status = formatStatus(params);
        return { content: [{ type: 'text', text: status }] };
      }

      case 'set_temperature': {
        if (!cardId) throw new Error('card_id required');
        const { temperature, mode } = args;
        if (typeof temperature !== 'number') throw new Error('temperature must be a number');
        const result = await setTemperature(cardId, mode, temperature);
        return { content: [{ type: 'text', text: `✅ ${mode.toUpperCase()} setpoint updated to ${temperature}°\n${JSON.stringify(result)}` }] };
      }

      case 'set_mode': {
        if (!cardId) throw new Error('card_id required');
        const result = await setHeatingMode(cardId, args.mode);
        const label = args.mode === 'OFF' ? '🔴 Heat pump turned OFF' : `🟢 Heat pump set to ${args.mode} mode`;
        return { content: [{ type: 'text', text: `${label}\n${JSON.stringify(result)}` }] };
      }

      case 'set_fan_mode': {
        if (!cardId) throw new Error('card_id required');
        const result = await setFanMode(cardId, args.mode);
        return { content: [{ type: 'text', text: `✅ Fan mode set to ${args.mode}\n${JSON.stringify(result)}` }] };
      }

      case 'get_history': {
        if (!cardId) throw new Error('card_id required');
        const history = await getHistory(cardId);
        return { content: [{ type: 'text', text: JSON.stringify(history, null, 2) }] };
      }

      case 'reset_runtime': {
        if (!cardId) throw new Error('card_id required');
        const result = await resetRunningTime(cardId);
        return { content: [{ type: 'text', text: `✅ Running time reset\n${JSON.stringify(result)}` }] };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (err) {
    return {
      content: [{ type: 'text', text: `❌ Error: ${err.message}` }],
      isError: true,
    };
  }
});

// ─── Start ───────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('claude-nirvana MCP server running');
