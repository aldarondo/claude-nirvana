import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import os from 'os';
import fs from 'fs';
import path from 'path';

// Redirect logs to temp dir to keep test output clean
const tmpLogDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nirvana-int-test-'));
process.env.NIRVANA_LOG_DIR = tmpLogDir;
process.env.NIRVANA_USERNAME = 'test@example.com';
process.env.NIRVANA_PASSWORD = 'test-password';
process.env.NIRVANA_CARD_ID = 'test-card-id';
process.env.MCP_TEST_MODE = '1';

// Mock the API layer — prevents any real network calls
const mockListDevices     = jest.fn();
const mockGetParameters   = jest.fn();
const mockSetTemperature  = jest.fn();
const mockSetHeatingMode  = jest.fn();
const mockSetFanMode      = jest.fn();
const mockGetHistory      = jest.fn();
const mockResetRunningTime = jest.fn();
const mockFormatStatus    = jest.fn();

jest.unstable_mockModule('../../src/api.js', async () => ({
  listDevices: mockListDevices,
  getParameters: mockGetParameters,
  setTemperature: mockSetTemperature,
  setHeatingMode: mockSetHeatingMode,
  setFanMode: mockSetFanMode,
  getHistory: mockGetHistory,
  resetRunningTime: mockResetRunningTime,
  formatStatus: mockFormatStatus,
  PARAMS: {},
  HEAT_MODE: { POOL: 'POOL', SPA: 'SPA', OFF: 'OFF' },
  FAN_MODE: { ECO: 'ECO', QUIET: 'QUIET', SMART: 'SMART', BOOST: 'BOOST' },
}));

jest.unstable_mockModule('../../src/auth.js', async () => ({
  getAccessToken: jest.fn().mockResolvedValue('mock-token'),
  clearSession: jest.fn(),
}));

// Dynamic imports after mocks are registered
const { createServer } = await import('../../src/index.js');
const { Client } = await import('@modelcontextprotocol/sdk/client');
const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');

afterAll(() => fs.rmSync(tmpLogDir, { recursive: true }));

describe('MCP server integration', () => {
  let client;
  let server;

  beforeEach(async () => {
    jest.clearAllMocks();

    server = createServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: 'test-client', version: '1.0.0' }, { capabilities: {} });
    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    await client.close();
  });

  test('list_devices tool returns device list', async () => {
    mockListDevices.mockResolvedValue([
      { card_id: 'FC-0F-E7-98-06-0A', name: 'Pool Heater' },
    ]);

    const result = await client.callTool({ name: 'list_devices', arguments: {} });

    expect(result.isError).not.toBe(true);
    expect(result.content[0].text).toContain('FC-0F-E7-98-06-0A');
  });

  test('get_status tool returns formatted status', async () => {
    mockGetParameters.mockResolvedValue({ WATER_TEMPERATURE: 28, HEAT_MODE: 'POOL' });
    mockFormatStatus.mockReturnValue('Water temp: 28°C\nMode: POOL');

    const result = await client.callTool({ name: 'get_status', arguments: {} });

    expect(result.isError).not.toBe(true);
    expect(result.content[0].text).toContain('28°C');
    expect(mockGetParameters).toHaveBeenCalledWith('test-card-id');
  });

  test('get_status uses card_id argument over env var', async () => {
    mockGetParameters.mockResolvedValue({});
    mockFormatStatus.mockReturnValue('ok');

    await client.callTool({ name: 'get_status', arguments: { card_id: 'explicit-id' } });

    expect(mockGetParameters).toHaveBeenCalledWith('explicit-id');
  });

  test('get_status returns error when no card_id available', async () => {
    delete process.env.NIRVANA_CARD_ID;

    const result = await client.callTool({ name: 'get_status', arguments: {} });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('card_id required');

    process.env.NIRVANA_CARD_ID = 'test-card-id';
  });

  test('set_temperature tool sends correct arguments', async () => {
    mockSetTemperature.mockResolvedValue({ ok: true });

    const result = await client.callTool({
      name: 'set_temperature',
      arguments: { temperature: 30, mode: 'pool' },
    });

    expect(result.isError).not.toBe(true);
    expect(result.content[0].text).toContain('POOL');
    expect(mockSetTemperature).toHaveBeenCalledWith('test-card-id', 'pool', 30);
  });

  test('set_mode tool sets heating mode', async () => {
    mockSetHeatingMode.mockResolvedValue({ ok: true });

    const result = await client.callTool({
      name: 'set_mode',
      arguments: { mode: 'POOL' },
    });

    expect(result.isError).not.toBe(true);
    expect(result.content[0].text).toContain('POOL mode');
    expect(mockSetHeatingMode).toHaveBeenCalledWith('test-card-id', 'POOL');
  });

  test('set_mode OFF shows turn-off label', async () => {
    mockSetHeatingMode.mockResolvedValue({ ok: true });

    const result = await client.callTool({
      name: 'set_mode',
      arguments: { mode: 'OFF' },
    });

    expect(result.content[0].text).toContain('turned OFF');
  });

  test('set_fan_mode tool sets fan mode', async () => {
    mockSetFanMode.mockResolvedValue({ ok: true });

    const result = await client.callTool({
      name: 'set_fan_mode',
      arguments: { mode: 'ECO' },
    });

    expect(result.isError).not.toBe(true);
    expect(result.content[0].text).toContain('ECO');
    expect(mockSetFanMode).toHaveBeenCalledWith('test-card-id', 'ECO');
  });

  test('get_history tool returns history', async () => {
    mockGetHistory.mockResolvedValue([{ code: 'E01', ts: '2026-04-01' }]);

    const result = await client.callTool({ name: 'get_history', arguments: {} });

    expect(result.isError).not.toBe(true);
    expect(result.content[0].text).toContain('E01');
  });

  test('reset_runtime tool confirms reset', async () => {
    mockResetRunningTime.mockResolvedValue({ ok: true });

    const result = await client.callTool({ name: 'reset_runtime', arguments: {} });

    expect(result.isError).not.toBe(true);
    expect(result.content[0].text).toContain('reset');
  });

  test('API error returns isError response with sanitized message', async () => {
    mockListDevices.mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await client.callTool({ name: 'list_devices', arguments: {} });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('ECONNREFUSED');
  });

  test('Cognito error message is sanitized before returning to caller', async () => {
    mockGetParameters.mockRejectedValue(
      new Error('User does not exist in the User Pool')
    );

    const result = await client.callTool({ name: 'get_status', arguments: {} });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).not.toContain('User Pool');
    expect(result.content[0].text).toContain('Authentication failed');
  });

  test('all 7 tools are registered and listed', async () => {
    const { tools } = await client.listTools();
    const names = tools.map(t => t.name);

    expect(names).toContain('list_devices');
    expect(names).toContain('get_status');
    expect(names).toContain('set_temperature');
    expect(names).toContain('set_mode');
    expect(names).toContain('set_fan_mode');
    expect(names).toContain('get_history');
    expect(names).toContain('reset_runtime');
    expect(names).toHaveLength(7);
  });
});
