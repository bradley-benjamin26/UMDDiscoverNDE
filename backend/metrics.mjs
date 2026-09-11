import {
  Counter,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from '@prometheus-io/client';

export function createMetrics() {
  const registry = new Registry();
  collectDefaultMetrics({ register: registry, prefix: 'lcsh_addon_' });

  const requests = new Counter({
    name: 'lcsh_addon_http_requests_total',
    help: 'LCSH add-on backend HTTP requests',
    labelNames: ['route', 'status'],
    registers: [registry],
  });
  const cache = new Counter({
    name: 'lcsh_addon_cache_total',
    help: 'LCSH suggestion cache outcomes',
    labelNames: ['result'],
    registers: [registry],
  });
  const upstream = new Counter({
    name: 'lcsh_addon_upstream_requests_total',
    help: 'Requests made to id.loc.gov',
    labelNames: ['status'],
    registers: [registry],
  });
  const duration = new Histogram({
    name: 'lcsh_addon_request_duration_seconds',
    help: 'Suggestion request duration in seconds',
    labelNames: ['cache'],
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
    registers: [registry],
  });

  return { registry, requests, cache, upstream, duration };
}