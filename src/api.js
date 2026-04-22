/**
 * Nirvana HP REST API client
 * Base URL: https://nirvana.iot-endpoint.com
 */

import axios from 'axios';
import { getAccessToken } from './auth.js';

const BASE_URL = 'https://nirvana.iot-endpoint.com';

// All known parameter keys returned by /pump/parameter
export const PARAMS = {
  WATER_TEMPERATURE: 'WATER_TEMPERATURE',
  OUTDOOR_TEMP: 'OUTDOOR_TEMP',
  WATER_OUT_TEMP: 'WATER_OUT_TEMP',
  DELTA_TEMP: 'DELTA_TEMP',
  HEAT_MODE: 'HEAT_MODE',       // "POOL" | "SPA" | "OFF"
  PUMP_MODE: 'PUMP_MODE',       // "HEAT" | "COOL"
  FAN_MODE: 'FAN_MODE',         // "ECO" | "QUIET" | "SMART" | "BOOST"
  HEATING: 'HEATING',           // "ON" | "OFF"
  DESIRED_POOL_TEMPERATURE: 'DESIRED_POOL_TEMPERATURE',
  DESIRED_SPA_TEMPERATURE: 'DESIRED_SPA_TEMPERATURE',
  RUNNING_TIME: 'RUNNING_TIME',
  TEMPERATURE_UNIT: 'TEMPERATURE_UNIT', // "C" | "F"
  WATER_PUMP: 'WATER_PUMP',
  WATER_PUMP_DISABLE: 'WATER_PUMP_DISABLE',
  HEATING_TIMER: 'HEATING_TIMER',
  ALERT_LIST: 'ALERT_LIST',
  ERROR_LIST: 'ERROR_LIST',
  LAST_UPDATE: 'CARD_LAST_UPDATE',
  LAST_CONNECT: 'CARD_LAST_CONNECT',
  HP_MODEL: 'HP_MODEL',
  VERSION: 'VERSION',
};

// Valid HEAT_MODE values
export const HEAT_MODE = { POOL: 'POOL', SPA: 'SPA', OFF: 'OFF' };

// Valid FAN_MODE values
export const FAN_MODE = { ECO: 'ECO', QUIET: 'QUIET', SMART: 'SMART', BOOST: 'BOOST' };

function makeClient(token) {
  return axios.create({
    baseURL: BASE_URL,
    headers: { Authorization: `Bearer ${token}` },
    timeout: 15000,
  });
}

/**
 * Get a fresh authenticated axios client.
 * Credentials come from env vars: NIRVANA_USERNAME, NIRVANA_PASSWORD
 */
async function client() {
  const username = process.env.NIRVANA_USERNAME;
  const password = process.env.NIRVANA_PASSWORD;
  if (!username || !password) {
    throw new Error('NIRVANA_USERNAME and NIRVANA_PASSWORD env vars must be set');
  }
  const token = await getAccessToken(username, password);
  return makeClient(token);
}

/**
 * List enrolled devices. Returns array of {card_id, ...}.
 */
export async function listDevices() {
  const c = await client();
  const { data } = await c.get('/customer/devices');
  return data;
}

/**
 * Get device status / parameters.
 * @param {string} cardId
 * @param {string[]} params - subset of PARAMS values to request (default: all status params)
 */
export async function getParameters(cardId, params = null) {
  const c = await client();
  const requestParams = params ?? [
    PARAMS.WATER_TEMPERATURE,
    PARAMS.OUTDOOR_TEMP,
    PARAMS.WATER_OUT_TEMP,
    PARAMS.DELTA_TEMP,
    PARAMS.HEAT_MODE,
    PARAMS.PUMP_MODE,
    PARAMS.FAN_MODE,
    PARAMS.HEATING,
    PARAMS.DESIRED_POOL_TEMPERATURE,
    PARAMS.DESIRED_SPA_TEMPERATURE,
    PARAMS.RUNNING_TIME,
    PARAMS.TEMPERATURE_UNIT,
    PARAMS.WATER_PUMP,
    PARAMS.WATER_PUMP_DISABLE,
    PARAMS.HEATING_TIMER,
    PARAMS.ALERT_LIST,
    PARAMS.ERROR_LIST,
    PARAMS.LAST_UPDATE,
    PARAMS.LAST_CONNECT,
  ];
  const { data } = await c.post('/pump/parameter', { card_id: cardId, params: requestParams });
  return data.reported ?? data;
}

/**
 * Set pool or spa target temperature.
 * @param {string} cardId
 * @param {'pool'|'spa'} mode
 * @param {number} value - temperature in device's configured unit
 */
export async function setTemperature(cardId, mode, value) {
  if (!['pool', 'spa'].includes(mode)) throw new Error('mode must be "pool" or "spa"');
  const c = await client();
  const { data } = await c.post('/pump/desired/setpoint', { card_id: cardId, mode, value });
  return data;
}

/**
 * Set heating mode (turn on/off).
 * @param {string} cardId
 * @param {'POOL'|'SPA'|'OFF'} mode
 */
export async function setHeatingMode(cardId, mode) {
  const valid = Object.values(HEAT_MODE);
  if (!valid.includes(mode.toUpperCase())) {
    throw new Error(`mode must be one of: ${valid.join(', ')}`);
  }
  const c = await client();
  const { data } = await c.post('/pump/desired/heating-mode', {
    card_id: cardId,
    value: mode.toLowerCase(),
  });
  return data;
}

/**
 * Set fan mode.
 * @param {string} cardId
 * @param {'ECO'|'QUIET'|'SMART'|'BOOST'} mode
 */
export async function setFanMode(cardId, mode) {
  const valid = Object.values(FAN_MODE);
  if (!valid.includes(mode.toUpperCase())) {
    throw new Error(`mode must be one of: ${valid.join(', ')}`);
  }
  const c = await client();
  const { data } = await c.post('/pump/desired/fan-mode', {
    card_id: cardId,
    value: mode,
  });
  return data;
}

/**
 * Get alert and error history.
 * @param {string} cardId
 */
export async function getHistory(cardId) {
  const c = await client();
  const { data } = await c.get('/customer/get-history', { params: { card_id: cardId } });
  return data;
}

/**
 * Reset the running time counter.
 * @param {string} cardId
 */
export async function resetRunningTime(cardId) {
  const c = await client();
  const { data } = await c.post('/pump/desired/reset-running-time', { card_id: cardId });
  return data;
}

/**
 * Format raw parameter response into a human-readable status string.
 * @param {Object} params - response from getParameters()
 * @returns {string}
 */
export function formatStatus(params) {
  const unit = params.TEMPERATURE_UNIT || 'C';
  const mode = params.HEAT_MODE || 'UNKNOWN';
  const heating = params.HEATING === 'ON';
  const lines = [
    `🌡️  Water temp:       ${params.WATER_TEMPERATURE ?? 'N/A'}°${unit}`,
    `🌡️  Water out temp:   ${params.WATER_OUT_TEMP ?? 'N/A'}°${unit}`,
    `🌡️  Outdoor temp:     ${params.OUTDOOR_TEMP ?? 'N/A'}°${unit}`,
    `🎯  Target (pool):    ${params.DESIRED_POOL_TEMPERATURE ?? 'N/A'}°${unit}`,
    `🎯  Target (spa):     ${params.DESIRED_SPA_TEMPERATURE ?? 'N/A'}°${unit}`,
    `⚡  Mode:             ${mode}`,
    `🔥  Heating active:   ${heating ? 'YES' : 'NO'}`,
    `💨  Fan mode:         ${params.FAN_MODE ?? 'N/A'}`,
    `⏱️  Running time:     ${params.RUNNING_TIME ? `${params.RUNNING_TIME.TOTAL}h total (${params.RUNNING_TIME.MONTH}h this month)` : 'N/A'}`,
    `📶  Last connect:     ${params.CARD_LAST_CONNECT ?? 'N/A'}`,
    `🔔  Alerts:           ${params.ALERT_LIST?.length ? params.ALERT_LIST.join(', ') : 'None'}`,
    `🚨  Errors:           ${params.ERROR_LIST?.length ? params.ERROR_LIST.join(', ') : 'None'}`,
  ];
  return lines.join('\n');
}
