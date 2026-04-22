import fs from 'fs';
import path from 'path';

const LOG_DIR = process.env.NIRVANA_LOG_DIR ?? '/app/data';
const LOG_FILE = path.join(LOG_DIR, 'nirvana.log');
const MAX_BYTES = 500 * 1024; // 500 KB
const MAX_ROTATIONS = 3;

function ensureDir() {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
}

function rotate() {
  try {
    for (let i = MAX_ROTATIONS - 1; i >= 1; i--) {
      const from = `${LOG_FILE}.${i}`;
      const to = `${LOG_FILE}.${i + 1}`;
      if (fs.existsSync(from)) {
        if (i === MAX_ROTATIONS - 1) fs.unlinkSync(from); // drop oldest
        else fs.renameSync(from, to);
      }
    }
    fs.renameSync(LOG_FILE, `${LOG_FILE}.1`);
  } catch (err) {
    process.stderr.write(`[logger] rotation failed: ${err.message}\n`);
  }
}

function write(entry) {
  try {
    ensureDir();
    const line = JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n';
    if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size >= MAX_BYTES) rotate();
    fs.appendFileSync(LOG_FILE, line, 'utf8');
  } catch (err) {
    // never crash the server over a logging failure
    process.stderr.write(`[logger] write failed: ${err.message}\n`);
  }
}

export function logToolCall(tool, args, outcome) {
  write({ event: 'tool_call', tool, args, outcome });
}

export function logStatus(cardId, params) {
  write({
    event: 'status_snapshot',
    card_id: cardId,
    water_temp: params.WATER_TEMPERATURE,
    outdoor_temp: params.OUTDOOR_TEMP,
    heat_mode: params.HEAT_MODE,
    heating: params.HEATING,
    fan_mode: params.FAN_MODE,
    target_pool: params.DESIRED_POOL_TEMPERATURE,
    target_spa: params.DESIRED_SPA_TEMPERATURE,
    temp_unit: params.TEMPERATURE_UNIT,
    last_connect: params.CARD_LAST_CONNECT,
    alerts: params.ALERT_LIST ?? [],
    errors: params.ERROR_LIST ?? [],
  });
}

// Scrub patterns that might contain account details from Cognito error messages
const SCRUB_PATTERNS = [
  { pattern: /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, replacement: '[email]' },
  { pattern: /(User Pool|UserPool|user pool)/gi, replacement: '[auth service]' },
];

function scrubMessage(message) {
  let scrubbed = message;
  for (const { pattern, replacement } of SCRUB_PATTERNS) {
    scrubbed = scrubbed.replace(pattern, replacement);
  }
  return scrubbed;
}

export function logError(tool, message) {
  write({ event: 'error', tool, message: scrubMessage(message) });
}
