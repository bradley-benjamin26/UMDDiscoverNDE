import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from './app.mjs';

async function startTestServer(options = {}) {
  const app = createApp({
    allowedOrigins: ['http://localhost:4201'],
    rateLimitMax: 100,
    ...options,
  });
  const server = await new Promise(resolve => {
    const listeningServer = app.listen(0, () => resolve(listeningServer));
  });
  const address = server.address();
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise(resolve => server.close(resolve)),
  };
}

test('returns ranked suggestions and caches repeated queries', async () => {
  const upstreamCandidates = [];
  const lcshClient = {
    async suggest(candidate) {
      upstreamCandidates.push(candidate);
      return [{ aLabel: candidate === 'norse mythology' ? 'Mythology, Norse' : candidate, uri: `lcsh:${candidate}` }];
    },
    async narrower() {
      return [];
    },
  };
  const server = await startTestServer({ lcshClient });

  try {
    const url = `${server.baseUrl}/api/v1/lcsh/suggestions?q=${encodeURIComponent('Norse mythology AND ritual practices')}&limit=3`;
    const first = await fetch(url);
    const second = await fetch(url);
    const body = await first.json();

    assert.equal(first.status, 200);
    assert.equal(first.headers.get('x-cache'), 'MISS');
    assert.equal(second.headers.get('x-cache'), 'HIT');
    assert.equal(body.suggestions.length, 3);
    assert.ok(upstreamCandidates.length > 0);
    assert.ok(upstreamCandidates.every(candidate => candidate !== 'Norse mythology AND ritual practices'));
    assert.equal(upstreamCandidates.length, body.meta.candidateCount);
  } finally {
    await server.close();
  }
});

test('uses bounded result evidence for a title-like query', async () => {
  const candidates = [];
  const server = await startTestServer({
    lcshClient: {
      async suggest(candidate) {
        candidates.push(candidate);
        return [{ aLabel: candidate, uri: `http://id.loc.gov/authorities/subjects/${encodeURIComponent(candidate)}` }];
      },
      async narrower() {
        return [];
      },
    },
  });

  try {
    const response = await fetch(`${server.baseUrl}/api/v1/lcsh/suggestions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        query: 'they say I say',
        limit: 5,
        evidence: {
          titles: ['They say / I say: the moves that matter'],
          subjects: ['Report writing', 'Report writing', 'English language -- Rhetoric'],
        },
      }),
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.meta.titleLike, true);
    assert.equal(body.meta.evidenceSubjectCount, 3);
    assert.ok(candidates.includes('Report writing'));
    assert.equal(body.suggestions[0].relationship, 'result-set');
  } finally {
    await server.close();
  }
});

test('validates query length and exposes health and metrics', async () => {
  const server = await startTestServer({ lcshClient: { suggest: async () => [] } });

  try {
    const invalid = await fetch(`${server.baseUrl}/api/v1/lcsh/suggestions?q=x`);
    const health = await fetch(`${server.baseUrl}/health`);
    const metrics = await fetch(`${server.baseUrl}/metrics`);

    assert.equal(invalid.status, 400);
    assert.deepEqual(await health.json(), { status: 'ok' });
    assert.match(await metrics.text(), /lcsh_addon_http_requests_total/);
  } finally {
    await server.close();
  }
});

test('rate limits suggestion requests', async () => {
  const server = await startTestServer({
    lcshClient: { suggest: async () => [] },
    rateLimitMax: 1,
    rateLimitWindowMs: 60_000,
  });

  try {
    const first = await fetch(`${server.baseUrl}/api/v1/lcsh/suggestions?q=mythology`);
    const second = await fetch(`${server.baseUrl}/api/v1/lcsh/suggestions?q=history`);

    assert.equal(first.status, 200);
    assert.equal(second.status, 429);
  } finally {
    await server.close();
  }
});