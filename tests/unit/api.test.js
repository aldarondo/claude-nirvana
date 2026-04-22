// All features require unit + integration tests before a task is marked complete.
// ESM project — uses jest.unstable_mockModule + dynamic imports

import { describe, test, expect, jest, beforeEach } from '@jest/globals';

// Set env vars before any module import so client() doesn't throw on missing credentials
process.env.NIRVANA_USERNAME = 'test@example.com';
process.env.NIRVANA_PASSWORD = 'test-password';

// Define mock functions at module scope so tests can inspect them after import
const mockGet  = jest.fn();
const mockPost = jest.fn();
jest.unstable_mockModule('axios', async () => ({
  default: { create: jest.fn(() => ({ get: mockGet, post: mockPost })) },
}));

jest.unstable_mockModule('../../src/auth.js', async () => ({
  getAccessToken: jest.fn().mockResolvedValue('mock-jwt-token'),
}));

// Dynamic import after mocks are registered
const {
  listDevices,
  getParameters,
  setTemperature,
  setHeatingMode,
  setFanMode,
  formatStatus,
} = await import('../../src/api.js');

beforeEach(() => {
  mockGet.mockReset();
  mockPost.mockReset();
});

describe('Nirvana API client', () => {
  test('listDevices returns array of devices', async () => {
    const devices = [{ card_id: 'abc123', name: 'Pool Heater' }];
    mockGet.mockResolvedValue({ data: devices });

    const result = await listDevices();

    expect(mockGet).toHaveBeenCalledWith('/customer/devices');
    expect(result).toEqual(devices);
  });

  test('getParameters requests correct default param set', async () => {
    const params = { WATER_TEMPERATURE: 28, HEAT_MODE: 'POOL' };
    mockPost.mockResolvedValue({ data: params });

    const result = await getParameters('card-1');

    expect(mockPost).toHaveBeenCalledWith(
      '/pump/parameter',
      expect.objectContaining({
        card_id: 'card-1',
        params: expect.arrayContaining(['WATER_TEMPERATURE']),
      })
    );
    expect(result).toEqual(params);
  });

  test('setTemperature throws if mode is not pool or spa', async () => {
    await expect(setTemperature('card-1', 'hot_tub', 38)).rejects.toThrow('mode must be "pool" or "spa"');
    expect(mockPost).not.toHaveBeenCalled();
  });

  test('setTemperature sends correct request for pool', async () => {
    mockPost.mockResolvedValue({ data: { ok: true } });

    await setTemperature('card-1', 'pool', 30);

    expect(mockPost).toHaveBeenCalledWith(
      '/pump/desired/setpoint',
      { card_id: 'card-1', mode: 'pool', value: 30 }
    );
  });

  test('setHeatingMode throws if mode is not POOL, SPA, or OFF', async () => {
    await expect(setHeatingMode('card-1', 'WARM')).rejects.toThrow(/must be one of/);
    expect(mockPost).not.toHaveBeenCalled();
  });

  test('setHeatingMode sends correct request for valid mode', async () => {
    mockPost.mockResolvedValue({ data: { ok: true } });

    await setHeatingMode('card-1', 'SPA');

    expect(mockPost).toHaveBeenCalledWith(
      '/pump/desired/heating-mode',
      { card_id: 'card-1', value: 'spa' }
    );
  });

  test('setFanMode throws if mode is not ECO, QUIET, SMART, or BOOST', async () => {
    await expect(setFanMode('card-1', 'TURBO')).rejects.toThrow(/must be one of/);
    expect(mockPost).not.toHaveBeenCalled();
  });

  test('setFanMode sends correct request for valid mode', async () => {
    mockPost.mockResolvedValue({ data: { ok: true } });

    await setFanMode('card-1', 'BOOST');

    expect(mockPost).toHaveBeenCalledWith(
      '/pump/desired/fan-mode',
      { card_id: 'card-1', value: 'BOOST' }
    );
  });
});

describe('formatStatus', () => {
  const fullParams = {
    TEMPERATURE_UNIT: 'C',
    HEAT_MODE: 'POOL',
    HEATING: 'ON',
    WATER_TEMPERATURE: 27.5,
    WATER_OUT_TEMP: 29.0,
    OUTDOOR_TEMP: 18,
    DESIRED_POOL_TEMPERATURE: 30,
    DESIRED_SPA_TEMPERATURE: 38,
    FAN_MODE: 'SMART',
    RUNNING_TIME: { TOTAL: 1234, MONTH: 26, DAY: 0, WEEK: 0 },
    CARD_LAST_CONNECT: new Date(Date.now() - 60000).toISOString(),
    ALERT_LIST: [],
    ERROR_LIST: [],
  };

  test('formats status output with all fields present', () => {
    const result = formatStatus(fullParams);

    expect(result).toContain('27.5°C');
    expect(result).toContain('POOL');
    expect(result).toContain('YES');   // heating active
    expect(result).toContain('SMART');
    expect(result).toContain('1234h total');
    expect(result).toContain('ONLINE');
    expect(result).toContain('None'); // no alerts/errors
  });

  test('handles missing optional fields gracefully', () => {
    const result = formatStatus({});

    expect(result).toContain('N/A');      // all temps missing
    expect(result).toContain('UNKNOWN'); // no HEAT_MODE
    expect(result).toContain('NO');      // HEATING not 'ON'
    expect(result).toContain('None');    // ALERT_LIST/ERROR_LIST absent
    expect(result).not.toContain('undefined');
  });

  test('shows alerts when present', () => {
    const result = formatStatus({ ...fullParams, ALERT_LIST: ['E01', 'E02'] });
    expect(result).toContain('E01, E02');
  });

  test('respects Fahrenheit unit', () => {
    const result = formatStatus({ ...fullParams, TEMPERATURE_UNIT: 'F', WATER_TEMPERATURE: 82 });
    expect(result).toContain('82°F');
  });
});
