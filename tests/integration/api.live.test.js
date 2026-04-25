/**
 * Live integration tests for the Nirvana API client.
 *
 * These tests make real HTTP calls to nirvana.iot-endpoint.com.
 * They are skipped automatically if credentials are not present in the environment.
 *
 * Run with real credentials:
 *   NIRVANA_USERNAME=... NIRVANA_PASSWORD=... NIRVANA_CARD_ID=... npm test
 *
 * These tests are read-only — they never mutate pool settings.
 */

import { describe, test, expect, beforeAll } from '@jest/globals';

const HAS_CREDS =
  process.env.NIRVANA_USERNAME &&
  process.env.NIRVANA_PASSWORD &&
  process.env.NIRVANA_CARD_ID;

const describeOrSkip = HAS_CREDS ? describe : describe.skip;

const { listDevices, getParameters, getHistory, PARAMS } = await import('../../src/api.js');

describeOrSkip('Nirvana API — live read-only tests', () => {
  const cardId = process.env.NIRVANA_CARD_ID;

  beforeAll(() => {
    if (!HAS_CREDS) {
      console.log('Skipping live API tests: NIRVANA_USERNAME / NIRVANA_PASSWORD / NIRVANA_CARD_ID not set');
    }
  });

  test('listDevices returns at least one device', async () => {
    const devices = await listDevices();

    expect(Array.isArray(devices)).toBe(true);
    expect(devices.length).toBeGreaterThan(0);
    expect(devices[0]).toHaveProperty('card_id');
  }, 20000);

  test('listDevices response includes the configured card_id', async () => {
    const devices = await listDevices();
    const ids = devices.map(d => d.card_id);

    expect(ids).toContain(cardId);
  }, 20000);

  test('getParameters returns an object with known parameter keys', async () => {
    const params = await getParameters(cardId);

    expect(typeof params).toBe('object');
    expect(params).not.toBeNull();

    // These fields are always present in the API response
    expect(params).toHaveProperty(PARAMS.HEAT_MODE);
    expect(params).toHaveProperty(PARAMS.WATER_TEMPERATURE);
  }, 20000);

  test('getParameters HEAT_MODE is a valid value', async () => {
    const params = await getParameters(cardId);
    const validModes = ['POOL', 'SPA', 'OFF'];

    expect(validModes).toContain(params[PARAMS.HEAT_MODE]);
  }, 20000);

  test('getParameters WATER_TEMPERATURE is a number', async () => {
    const params = await getParameters(cardId);
    const temp = params[PARAMS.WATER_TEMPERATURE];

    expect(typeof temp).toBe('number');
    expect(temp).toBeGreaterThan(0);
    expect(temp).toBeLessThan(60);
  }, 20000);

  test('getHistory returns without throwing', async () => {
    const history = await getHistory(cardId);

    // History can be empty or populated — just verify it returns
    expect(history !== undefined).toBe(true);
  }, 20000);
});
