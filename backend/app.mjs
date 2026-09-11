import { createHash, randomUUID } from 'node:crypto';
import cors from 'cors';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { LRUCache } from 'lru-cache';
import { detectTitleLikeQuery, extractCandidateConcepts, extractEvidenceCandidates, rankLcshSuggestions } from './concepts.mjs';
import { createLcshClient } from './lcsh-client.mjs';
import { createMetrics } from './metrics.mjs';

const DEFAULT_ALLOWED_ORIGINS = ['http://localhost:4201'];

function queryHash(query) {
  return createHash('sha256').update(query).digest('hex').slice(0, 12);
}

export function createApp(options = {}) {
  const app = express();
  const metrics = options.metrics ?? createMetrics();
  const lcshClient = options.lcshClient ?? createLcshClient({ timeoutMs: options.upstreamTimeoutMs });
  const allowedOrigins = options.allowedOrigins ?? DEFAULT_ALLOWED_ORIGINS;
  const cache = options.cache ?? new LRUCache({
    max: options.cacheMax ?? 1000,
    ttl: options.cacheTtlMs ?? 60 * 60 * 1000,
  });

  app.disable('x-powered-by');
  app.set('trust proxy', options.trustProxy ?? 1);
  app.use(helmet());
  app.use(express.json({ limit: '16kb' }));
  app.use(cors({
    origin(origin, callback) {
      callback(null, !origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin));
    },
  }));
  app.use((request, response, next) => {
    response.setHeader('x-request-id', request.get('x-request-id') || randomUUID());
    next();
  });

  const suggestionLimiter = rateLimit({
    windowMs: options.rateLimitWindowMs ?? 60 * 1000,
    limit: options.rateLimitMax ?? 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler(request, response) {
      metrics.requests.inc({ route: 'suggestions', status: '429' });
      response.status(429).json({ error: 'Too many suggestion requests. Please try again shortly.' });
    },
  });

  app.get('/health', (request, response) => {
    metrics.requests.inc({ route: 'health', status: '200' });
    response.json({ status: 'ok' });
  });

  app.get('/metrics', async (request, response, next) => {
    try {
      response.setHeader('content-type', metrics.registry.contentType);
      response.send(await metrics.registry.metrics());
    } catch (error) {
      next(error);
    }
  });

  async function handleSuggestions(request, response) {
    const startedAt = process.hrtime.bigint();
    const input = request.method === 'POST' ? request.body : request.query;
    const queryValue = request.method === 'POST' ? input?.query : input?.q;
    const query = typeof queryValue === 'string' ? queryValue.trim() : '';
    const requestedLimit = Number.parseInt(String(input?.limit ?? '5'), 10);
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 10) : 5;
    const titles = Array.isArray(input?.evidence?.titles)
      ? input.evidence.titles.filter(value => typeof value === 'string').slice(0, 10)
      : [];
    const subjects = Array.isArray(input?.evidence?.subjects)
      ? input.evidence.subjects.filter(value => typeof value === 'string' && value.length <= 300).slice(0, 30)
      : [];

    if (query.length < 2 || query.length > 300) {
      metrics.requests.inc({ route: 'suggestions', status: '400' });
      response.status(400).json({ error: 'Query must contain between 2 and 300 characters.' });
      return;
    }

    const titleLike = detectTitleLikeQuery(query, titles);
    const evidenceCandidates = titleLike ? extractEvidenceCandidates(subjects) : [];
    const hash = queryHash(`${query}\0${evidenceCandidates.map(item => `${item.candidate}:${item.evidenceCount}`).join('|')}`);
    const cacheKey = `${hash}:${limit}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      metrics.cache.inc({ result: 'hit' });
      metrics.requests.inc({ route: 'suggestions', status: '200' });
      metrics.duration.observe({ cache: 'hit' }, Number(process.hrtime.bigint() - startedAt) / 1e9);
      response.setHeader('x-cache', 'HIT');
      response.json(cached);
      return;
    }

    metrics.cache.inc({ result: 'miss' });
    const candidates = extractCandidateConcepts(query).map(candidate => ({ candidate, source: 'query', evidenceCount: 0 }));
    const lookupCandidates = [...evidenceCandidates.map(candidate => ({ ...candidate, source: 'result-set' })), ...candidates]
      .filter((item, index, items) => items.findIndex(other => other.candidate.toLowerCase() === item.candidate.toLowerCase()) === index)
      .slice(0, 10);

    try {
      const hitsByCandidate = await Promise.all(lookupCandidates.map(async candidateInfo => {
        try {
          const hits = await lcshClient.suggest(candidateInfo.candidate);
          metrics.upstream.inc({ status: 'success' });
          return { ...candidateInfo, hits };
        } catch (error) {
          metrics.upstream.inc({ status: 'error' });
          return { ...candidateInfo, hits: [] };
        }
      }));
      const initialSuggestions = rankLcshSuggestions(hitsByCandidate, limit);
      const narrowerGroups = await Promise.all(initialSuggestions.slice(0, 2).map(async suggestion => {
        try {
          const hits = await lcshClient.narrower(suggestion.uri);
          return {
            candidate: suggestion.label,
            source: 'query',
            hits: hits.map(hit => ({ ...hit, relationship: 'narrower', parentLabel: suggestion.label })),
          };
        } catch {
          return { candidate: suggestion.label, source: 'query', hits: [] };
        }
      }));
      const payload = {
        suggestions: rankLcshSuggestions([...hitsByCandidate, ...narrowerGroups], limit),
        meta: { candidateCount: lookupCandidates.length, titleLike, evidenceSubjectCount: subjects.length },
      };

      cache.set(cacheKey, payload);
      metrics.requests.inc({ route: 'suggestions', status: '200' });
      metrics.duration.observe({ cache: 'miss' }, Number(process.hrtime.bigint() - startedAt) / 1e9);
      response.setHeader('x-cache', 'MISS');
      response.json(payload);
      console.info(JSON.stringify({ event: 'lcsh_suggestions', queryHash: hash, candidateCount: candidates.length, resultCount: payload.suggestions.length }));
    } catch (error) {
      metrics.requests.inc({ route: 'suggestions', status: '502' });
      response.status(502).json({ error: 'Subject suggestions are temporarily unavailable.' });
    }
  }

  app.get('/api/v1/lcsh/suggestions', suggestionLimiter, handleSuggestions);
  app.post('/api/v1/lcsh/suggestions', suggestionLimiter, handleSuggestions);

  app.use((error, request, response, next) => {
    console.error(JSON.stringify({ event: 'backend_error', requestId: response.getHeader('x-request-id'), message: error.message }));
    if (!response.headersSent) {
      response.status(500).json({ error: 'Unexpected server error.' });
    }
  });

  return app;
}