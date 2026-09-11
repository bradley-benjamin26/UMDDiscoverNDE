import { createApp } from './app.mjs';

const port = Number.parseInt(process.env.PORT || '4300', 10);
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:4201')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

const app = createApp({
  allowedOrigins,
  cacheMax: Number.parseInt(process.env.CACHE_MAX || '1000', 10),
  cacheTtlMs: Number.parseInt(process.env.CACHE_TTL_MS || '3600000', 10),
  rateLimitMax: Number.parseInt(process.env.RATE_LIMIT_MAX || '30', 10),
  rateLimitWindowMs: Number.parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
  upstreamTimeoutMs: Number.parseInt(process.env.UPSTREAM_TIMEOUT_MS || '3000', 10),
  trustProxy: process.env.TRUST_PROXY === 'false' ? false : 1,
});

const server = app.listen(port, () => {
  console.info(JSON.stringify({ event: 'server_started', port, allowedOrigins }));
});

function shutdown(signal) {
  console.info(JSON.stringify({ event: 'server_stopping', signal }));
  server.close(() => process.exit(0));
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));