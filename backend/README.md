# LCSH suggestion backend

The backend accepts Primo search text, extracts candidate concepts, queries and ranks Library of Congress Subject Headings, and returns a compact suggestion list. Raw queries are not logged; logs and cache keys use a truncated SHA-256 hash.

## Run locally

```sh
npm run start:backend
```

The service listens on `http://localhost:4300` by default.

## Endpoints

- `GET /api/v1/lcsh/suggestions?q=norse%20mythology&limit=5`
- `GET /health`
- `GET /metrics`

## Configuration

| Environment variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `4300` | HTTP listening port |
| `ALLOWED_ORIGINS` | `http://localhost:4201` | Comma-separated Primo origins |
| `CACHE_MAX` | `1000` | Maximum in-memory cache entries |
| `CACHE_TTL_MS` | `3600000` | Cache lifetime in milliseconds |
| `RATE_LIMIT_MAX` | `30` | Requests permitted per client/window |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate-limit window in milliseconds |
| `UPSTREAM_TIMEOUT_MS` | `3000` | LOC request timeout in milliseconds |
| `TRUST_PROXY` | `true` | Set to `false` when not behind one trusted proxy |

Deploy behind HTTPS and restrict `/metrics` to the monitoring network at the ingress or reverse proxy. For multiple service replicas, replace the in-memory cache and default rate-limit store with shared Redis-backed stores.