import https from 'https';
import http from 'http';
import fs from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const express = require('express');
const { createProxyMiddleware, responseInterceptor } = require('http-proxy-middleware');

const REST_TARGET = 'https://nirvana.iot-endpoint.com';
const WS_TARGET   = 'wss://ws-edge.nirvanahp.com';
const PORT = process.env.PROXY_PORT ? parseInt(process.env.PROXY_PORT) : 8443;
const LOG_BODIES = process.env.LOG_BODIES !== 'false';

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
  const target = isWs || req.headers.host?.includes('nirvanahp') ? 'ws-edge' : 'iot-endpoint';
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
  next();
});

// WebSocket proxy for ws-edge.nirvanahp.com
const wsProxy = createProxyMiddleware({
  target: WS_TARGET,
  changeOrigin: true,
  ws: true,
  on: {
    open: (proxySocket) => {
      console.log('[ws] connection opened to', WS_TARGET);
    },
    message: (data, req) => {
      try {
        const msg = data.toString();
        console.log('[ws→pump]', JSON.stringify({ ts: new Date().toISOString(), data: msg.slice(0, 500) }));
      } catch {}
    },
    error: (err) => console.error('[ws error]', err.message),
    close: () => console.log('[ws] connection closed'),
  },
});

// REST proxy for nirvana.iot-endpoint.com
const restProxy = createProxyMiddleware({
  target: REST_TARGET,
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

// Route by Host header: ws-edge.nirvanahp.com → WS proxy, everything else → REST
app.use((req, res, next) => {
  if (req.headers.host?.includes('nirvanahp')) {
    return wsProxy(req, res, next);
  }
  restProxy(req, res, next);
});

const certDir = process.env.CERT_DIR || '/certs';
const key = fs.readFileSync(`${certDir}/server.key`);
const cert = fs.readFileSync(`${certDir}/server.crt`);

const server = https.createServer({ key, cert }, app);

// Upgrade WebSocket connections
server.on('upgrade', (req, socket, head) => {
  console.log('[ws upgrade]', req.headers.host, req.url);
  wsProxy.upgrade(req, socket, head);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[nirvana-proxy] HTTPS/WSS proxy listening on :${PORT}`);
  console.log(`[nirvana-proxy] REST → ${REST_TARGET}`);
  console.log(`[nirvana-proxy] WS   → ${WS_TARGET}`);
  console.log(`[nirvana-proxy] LOG_BODIES=${LOG_BODIES}`);
});

// Health check
http.createServer((_req, res) => res.end('ok')).listen(8088);
