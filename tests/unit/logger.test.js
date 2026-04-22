import fs from 'fs';
import path from 'path';
import os from 'os';

// Point logger at a temp dir for tests
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nirvana-log-test-'));
process.env.NIRVANA_LOG_DIR = tmpDir;

const { logToolCall, logStatus, logError } = await import('../../src/logger.js');

const logFile = path.join(tmpDir, 'nirvana.log');

function readLines() {
  return fs.readFileSync(logFile, 'utf8').trim().split('\n').map(JSON.parse);
}

beforeEach(() => {
  if (fs.existsSync(logFile)) fs.unlinkSync(logFile);
  // Remove any rotated files too
  for (let i = 1; i <= 4; i++) {
    const rotated = `${logFile}.${i}`;
    if (fs.existsSync(rotated)) fs.unlinkSync(rotated);
  }
});

afterAll(() => fs.rmSync(tmpDir, { recursive: true }));

describe('logger', () => {
  test('logToolCall writes a parseable NDJSON line', () => {
    logToolCall('set_mode', { card_id: 'ABC', mode: 'POOL' }, { ok: true });
    const [entry] = readLines();
    expect(entry.event).toBe('tool_call');
    expect(entry.tool).toBe('set_mode');
    expect(entry.args.mode).toBe('POOL');
    expect(entry.ts).toBeTruthy();
  });

  test('logStatus writes a status_snapshot entry', () => {
    logStatus('ABC', {
      WATER_TEMPERATURE: 87, OUTDOOR_TEMP: 83, HEAT_MODE: 'POOL',
      HEATING: 'OFF', FAN_MODE: 'ECO', DESIRED_POOL_TEMPERATURE: 86,
      DESIRED_SPA_TEMPERATURE: 96, TEMPERATURE_UNIT: 'F',
      CARD_LAST_CONNECT: new Date().toISOString(), ALERT_LIST: [], ERROR_LIST: [],
    });
    const lines = readLines();
    const snap = lines.find(l => l.event === 'status_snapshot');
    expect(snap.water_temp).toBe(87);
    expect(snap.heat_mode).toBe('POOL');
  });

  test('logError writes an error entry', () => {
    logError('get_status', 'card_id required');
    const lines = readLines();
    const err = lines.find(l => l.event === 'error');
    expect(err.tool).toBe('get_status');
    expect(err.message).toBe('card_id required');
  });

  test('rotates log when size exceeds MAX_BYTES', () => {
    // Fill the log past the 500 KB threshold
    const bigLine = JSON.stringify({ event: 'tool_call', tool: 'pad', args: {}, outcome: { data: 'x'.repeat(1000) } }) + '\n';
    const iterations = Math.ceil((500 * 1024) / bigLine.length) + 1;
    for (let i = 0; i < iterations; i++) {
      fs.appendFileSync(logFile, bigLine);
    }
    // Next write should trigger rotation
    logToolCall('after_rotate', {}, {});
    expect(fs.existsSync(`${logFile}.1`)).toBe(true);
    // Current log should only contain the post-rotation entry
    const lines = readLines();
    expect(lines[lines.length - 1].tool).toBe('after_rotate');
  });
});
