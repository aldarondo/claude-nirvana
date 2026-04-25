import https from 'https';
import http from 'http';
import fs from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const express = require('express');
const { createProxyMiddleware, responseInterceptor } = require('http-proxy-middleware');

const REST_TARGET    = 'https://nirvana.iot-endpoint.com';
const WS_EDGE_TARGET = 'https://ws-edge.nirvanahp.com';   // REST calls to ws-edge
const WS_TARGET      = 'wss://ws-edge.nirvanahp.com';     // WebSocket upgrades only
const PORT = process.env.PROXY_PORT ? parseInt(process.env.PROXY_PORT) : 8443;
const LOG_BODIES = process.env.LOG_BODIES !== 'false';

// ─── Connection heartbeat tracker ───────────────────────────────────────────
// The pump polls findQueuesByCardId every ~3s when healthy.
// If we see no poll for SILENCE_MS we log a "pump went silent" event.
// When polling resumes we log a "pump reconnected" event with the gap duration.
const SILENCE_MS = 2 * 60 * 1000; // 2 minutes
let lastPollAt = null;
let silentLogged = false;

function recordPoll() {
  const now = Date.now();
  if (silentLogged) {
    const gapSec = lastPollAt ? Math.round((now - lastPollAt) / 1000) : null;
    console.log('[heartbeat] pump reconnected', JSON.stringify({ ts: new Date().toISOString(), gap_sec: gapSec }));
    silentLogged = false;
  }
  lastPollAt = now;
}

setInterval(() => {
  if (!lastPollAt) return;
  const silentSec = Math.round((Date.now() - lastPollAt) / 1000);
  if (silentSec * 1000 >= SILENCE_MS && !silentLogged) {
    console.log('[heartbeat] pump went silent', JSON.stringify({ ts: new Date().toISOString(), last_poll: new Date(lastPollAt).toISOString(), silent_sec: silentSec }));
    silentLogged = true;
  }
}, 30_000); // check every 30s

const app = express();

// Buffer request body for logging, then restore it for the proxy
app.use((req, res, next) => {
  const chunks = [];
  req.on('data', chunk => chunks.push(chunk));
  req.on('end', () => {
    req.rawBody = Buffer.concat(chunks);
    next();
  });
});

// Log every inbound request
app.use((req, _res, next) => {
  const isWs = req.headers.upgrade?.toLowerCase() === 'websocket';
  const target = req.headers.host?.includes('nirvanahp') ? 'ws-edge' : 'iot-endpoint';
  const entry = {
    ts: new Date().toISOString(),
    src: req.socket.remoteAddress,
    target,
    method: req.method,
    path: req.url,
    host: req.headers.host,
  };
  if (LOG_BODIES && req.rawBody?.length && !isWs) {
    try { entry.body = JSON.parse(req.rawBody.toString()); }
    catch { entry.body = req.rawBody.toString().slice(0, 500); }
  }
  console.log('[pump→proxy]', JSON.stringify(entry));
  // Track heartbeat: any request from the pump counts as a poll
  if (req.url.includes('findQueuesByCardId')) recordPoll();
  next();
});

// WebSocket proxy — used ONLY for upgrade events, not regular HTTP
const wsProxy = createProxyMiddleware({
  target: WS_TARGET,
  changeOrigin: true,
  ws: true,
  on: {
    open: () => console.log('[ws] connection opened to', WS_TARGET),
    message: (data) => {
      try {
        const msg = data.toString();
        console.log('[ws→pump]', JSON.stringify({ ts: new Date().toISOString(), data: msg.slice(0, 500) }));
      } catch {}
    },
    error: (err) => console.error('[ws error]', err.message),
    close: () => console.log('[ws] connection closed'),
  },
});

// REST proxy — handles ALL regular HTTP requests (both hostnames)
// router() picks the correct upstream based on the Host header
const restProxy = createProxyMiddleware({
  router: (req) => req.headers.host?.includes('nirvanahp') ? WS_EDGE_TARGET : REST_TARGET,
  changeOrigin: true,
  selfHandleResponse: true,
  on: {
    proxyReq: (proxyReq, req) => {
      if (req.rawBody?.length) {
        proxyReq.setHeader('content-length', req.rawBody.length);
        proxyReq.write(req.rawBody);
        proxyReq.end();
      }
    },
    proxyRes: responseInterceptor(async (responseBuffer, proxyRes, req) => {
      const entry = {
        ts: new Date().toISOString(),
        method: req.method,
        path: req.url,
        status: proxyRes.statusCode,
        host: req.headers.host,
      };
      if (LOG_BODIES && responseBuffer.length) {
        try { entry.body = JSON.parse(responseBuffer.toString()); }
        catch { entry.body = responseBuffer.toString().slice(0, 500); }
      }
      console.log('[proxy→pump]', JSON.stringify(entry));
      return responseBuffer;
    }),
    error: (err, req, res) => {
      console.error('[rest error]', req.method, req.url, err.message);
      res.status(502).json({ error: 'proxy error', detail: err.message });
    },
  },
});

// All regular HTTP requests go through restProxy (correct target picked by router)
// WebSocket upgrades are handled by the server 'upgrade' event below
app.use((req, res, next) => restProxy(req, res, next));

const certDir = process.env.CERT_DIR || '/certs';
const key = fs.readFileSync(`${certDir}/server.key`);
const cert = fs.readFileSync(`${certDir}/server.crt`);

const server = https.createServer({ key, cert }, app);

// WebSocket upgrade — only real WS handshakes reach here
server.on('upgrade', (req, socket, head) => {
  console.log('[ws upgrade]', req.headers.host, req.url);
  wsProxy.upgrade(req, socket, head);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[nirvana-proxy] HTTPS/WSS proxy listening on :${PORT}`);
  console.log(`[nirvana-proxy] REST (iot-endpoint) → ${REST_TARGET}`);
  console.log(`[nirvana-proxy] REST (ws-edge)       → ${WS_EDGE_TARGET}`);
  console.log(`[nirvana-proxy] WS   (ws-edge)       → ${WS_TARGET}`);
  console.log(`[nirvana-proxy] LOG_BODIES=${LOG_BODIES}`);
});

// Health check
http.createServer((_req, res) => res.end('ok')).listen(8088);
