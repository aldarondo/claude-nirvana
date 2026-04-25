import https from 'https';
import http from 'http';
import fs from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const express = require('express');
const { createProxyMiddleware, responseInterceptor } = require('http-proxy-middleware');

const TARGET = 'https://nirvana.iot-endpoint.com';
const PORT = process.env.PROXY_PORT ? parseInt(process.env.PROXY_PORT) : 443;
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

// Log every inbound request from the pump
app.use((req, _res, next) => {
  const entry = {
    ts: new Date().toISOString(),
    src: req.socket.remoteAddress,
    method: req.method,
    path: req.url,
    headers: req.headers,
  };
  if (LOG_BODIES && req.rawBody?.length) {
    try { entry.body = JSON.parse(req.rawBody.toString()); }
    catch { entry.body = req.rawBody.toString(); }
  }
  console.log('[pump→proxy]', JSON.stringify(entry));
  next();
});

// Proxy to real cloud, intercept response for logging
app.use(
  '/',
  createProxyMiddleware({
    target: TARGET,
    changeOrigin: true,
    selfHandleResponse: true,
    on: {
      proxyReq: (proxyReq, req) => {
        // Re-inject buffered body since stream was already consumed
        if (req.rawBody?.length) {
          proxyReq.setHeader('content-length', req.rawBody.length);
          proxyReq.write(req.rawBody);
          proxyReq.end();
        }
      },
      proxyRes: responseInterceptor(async (responseBuffer, proxyRes, req, res) => {
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
        console.error('[proxy error]', req.method, req.url, err.message);
        res.status(502).json({ error: 'proxy error', detail: err.message });
      },
    },
  })
);

const certDir = process.env.CERT_DIR || '/certs';
const key = fs.readFileSync(`${certDir}/server.key`);
const cert = fs.readFileSync(`${certDir}/server.crt`);

https.createServer({ key, cert }, app).listen(PORT, '0.0.0.0', () => {
  console.log(`[nirvana-proxy] HTTPS proxy listening on :${PORT}`);
  console.log(`[nirvana-proxy] Forwarding pump traffic to ${TARGET}`);
  console.log(`[nirvana-proxy] LOG_BODIES=${LOG_BODIES}`);
});

// Health check on HTTP :8088 (doesn't need TLS)
http.createServer((_req, res) => res.end('ok')).listen(8088);
