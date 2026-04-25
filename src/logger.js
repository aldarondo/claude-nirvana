import { appendFileSync, createWriteStream, existsSync, mkdirSync, renameSync, statSync, unlinkSync } from 'fs';
import { join } from 'path';

// ── Console capture → app.log ───────────────────────────────────────────
// Mirrors stdout/stderr to a rolling app.log so `docker logs` parity is
// preserved without a bash `tee` in entrypoint.sh.

const LOG_DIR       = process.env.LOG_DIR      || '/app/logs';
const LOG_MAX_BYTES = parseInt(process.env.LOG_MAX_MB    || '10', 10) * 1024 * 1024;
const LOG_MAX_FILES = parseInt(process.env.LOG_MAX_FILES || '5', 10);
const APP_LOG_FILE  = join(LOG_DIR, 'app.log');

let _stream = null;
let _bytes  = 0;

function ensureAppStream() {
  if (_stream) return _stream;
  try {
    if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
    _stream = createWriteStream(APP_LOG_FILE, { flags: 'a' });
    _bytes  = existsSync(APP_LOG_FILE) ? statSync(APP_LOG_FILE).size : 0;
  } catch {
    // No-op stream so console capture never crashes the server / tests
    _stream = { write() {}, end() {} };
  }
  return _stream;
}

function rotateApp() {
  if (_stream) _stream.end();
  try {
    for (let i = LOG_MAX_FILES - 1; i >= 1; i--) {
      const src = `${APP_LOG_FILE}.${i}`;
      if (existsSync(src)) renameSync(src, `${APP_LOG_FILE}.${i + 1}`);
    }
    if (existsSync(`${APP_LOG_FILE}.${LOG_MAX_FILES + 1}`)) unlinkSync(`${APP_LOG_FILE}.${LOG_MAX_FILES + 1}`);
    renameSync(APP_LOG_FILE, `${APP_LOG_FILE}.1`);
  } catch { /* best-effort */ }
  _stream = null;
  _bytes  = 0;
  ensureAppStream();
}

['log', 'info', 'warn', 'error'].forEach(level => {
  const orig = console[level].bind(console);
  console[level] = (...args) => {
    orig(...args);
    const line = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
    const entry = `${new Date().toISOString()} [${level.toUpperCase()}] ${line}\n`;
    const stream = ensureAppStream();
    if (_bytes + entry.length > LOG_MAX_BYTES) rotateApp();
    stream.write(entry);
    _bytes += entry.length;
  };
});

// ── Structured tool-call log → nirvana.log ──────────────────────────────
// NDJSON entries consumed by ops tooling. Separate file from app.log so
// stdout-mirrored noise can't drown out structured events.

const STRUCT_LOG_DIR  = process.env.NIRVANA_LOG_DIR ?? '/app/data';
const STRUCT_LOG_FILE = join(STRUCT_LOG_DIR, 'nirvana.log');
const STRUCT_MAX_BYTES = 500 * 1024;
const STRUCT_MAX_ROT   = 3;

function ensureStructDir() {
  if (!existsSync(STRUCT_LOG_DIR)) mkdirSync(STRUCT_LOG_DIR, { recursive: true });
}

function rotateStruct() {
  try {
    for (let i = STRUCT_MAX_ROT - 1; i >= 1; i--) {
      const from = `${STRUCT_LOG_FILE}.${i}`;
      const to   = `${STRUCT_LOG_FILE}.${i + 1}`;
      if (existsSync(from)) {
        if (i === STRUCT_MAX_ROT - 1) unlinkSync(from);
        else renameSync(from, to);
      }
    }
    renameSync(STRUCT_LOG_FILE, `${STRUCT_LOG_FILE}.1`);
  } catch (err) {
    process.stderr.write(`[logger] rotation failed: ${err.message}\n`);
  }
}

function writeStruct(entry) {
  try {
    ensureStructDir();
    const line = JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n';
    if (existsSync(STRUCT_LOG_FILE) && statSync(STRUCT_LOG_FILE).size >= STRUCT_MAX_BYTES) rotateStruct();
    appendFileSync(STRUCT_LOG_FILE, line, 'utf8');
  } catch (err) {
    process.stderr.write(`[logger] write failed: ${err.message}\n`);
  }
}

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

function hashId(id) {
  if (!id) return null;
  let h = 0;
  for (let i = 0; i < id.length; i++) { h = (Math.imul(31, h) + id.charCodeAt(i)) | 0; }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function logToolCall(tool, args, outcome) {
  const safeArgs = args?.card_id ? { ...args, card_id: hashId(args.card_id) } : args;
  writeStruct({ event: 'tool_call', tool, args: safeArgs, outcome });
}

export function logStatus(cardId, params) {
  writeStruct({
    event: 'status_snapshot',
    card_id: hashId(cardId),
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

export function logError(tool, message) {
  writeStruct({ event: 'error', tool, message: scrubMessage(message) });
}
