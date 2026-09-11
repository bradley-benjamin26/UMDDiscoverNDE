import assert from 'node:assert/strict';
import test from 'node:test';
import { detectTitleLikeQuery, extractCandidateConcepts, extractEvidenceCandidates, normalizeQuery, rankLcshSuggestions } from './concepts.mjs';

test('normalizes Primo syntax and extracts bounded candidate phrases', () => {
  assert.equal(normalizeQuery('Norse mythology AND ritual practices'), 'norse mythology ritual practices');
  assert.deepEqual(
    extractCandidateConcepts('Norse mythology AND ritual practices', 4),
    ['norse mythology ritual', 'mythology ritual practices', 'norse mythology', 'mythology ritual']
  );
});

test('does not return stop words as concepts', () => {
  assert.deepEqual(extractCandidateConcepts('the history of the'), ['history']);
});

test('ranks exact authorized headings and deduplicates URIs', () => {
  const suggestions = rankLcshSuggestions([
    {
      candidate: 'norse mythology',
      hits: [
        { aLabel: 'Mythology, Norse', uri: 'lcsh:1' },
        { aLabel: 'Norse mythology', uri: 'lcsh:2' },
        { aLabel: 'Mythology, Norse', uri: 'lcsh:3' },
      ],
    },
    {
      candidate: 'mythology',
      hits: [{ aLabel: 'Mythology, Norse', uri: 'lcsh:1' }],
    },
  ]);

  assert.deepEqual(suggestions, [
    { label: 'Norse mythology', uri: 'lcsh:2', relationship: 'authorized', explanation: 'Matches your search concepts' },
    { label: 'Mythology, Norse', uri: 'lcsh:1', relationship: 'authorized', explanation: 'Matches your search concepts' },
  ]);
});

test('prefers a multiword concept over a generic single-token exact match', () => {
  const suggestions = rankLcshSuggestions([
    {
      candidate: 'norse mythology',
      hits: [{ aLabel: 'Mythology, Norse', uri: 'lcsh:norse' }],
    },
    {
      candidate: 'norse',
      hits: [],
    },
    {
      candidate: 'mythology',
      hits: [{ aLabel: 'Mythology', uri: 'lcsh:generic' }],
    },
  ]);

  assert.equal(suggestions[0].label, 'Mythology, Norse');
});

test('detects title searches and ranks recurring result subjects first', () => {
  assert.equal(detectTitleLikeQuery('they say I say', ['“They say / I say”: The moves that matter']), true);
  assert.equal(detectTitleLikeQuery('academic writing', ['“They say / I say”: The moves that matter']), false);
  assert.deepEqual(extractEvidenceCandidates(['Report writing', 'English language -- Rhetoric', 'Report writing']), [
    { candidate: 'Report writing', evidenceCount: 2 },
    { candidate: 'English language--Rhetoric', evidenceCount: 1 },
  ]);

  const suggestions = rankLcshSuggestions([{
    candidate: 'Report writing',
    source: 'result-set',
    evidenceCount: 3,
    hits: [{ aLabel: 'Report writing', uri: 'lcsh:report' }],
  }]);
  assert.equal(suggestions[0].relationship, 'result-set');
  assert.equal(suggestions[0].explanation, 'Appears in 3 top results');
});

test('does not attribute loose LOC keyword hits to result evidence', () => {
  const suggestions = rankLcshSuggestions([{
    candidate: 'English language--Rhetoric',
    source: 'result-set',
    evidenceCount: 3,
    hits: [{
      aLabel: 'English language--Rhetoric--Study and teaching--Data processing',
      uri: 'lcsh:loose',
    }],
  }]);

  assert.equal(suggestions[0].relationship, 'authorized');
  assert.equal(suggestions[0].explanation, 'Matches your search concepts');
});

test('explains narrower authority relationships', () => {
  const suggestions = rankLcshSuggestions([{
    candidate: 'Mythology, Norse',
    hits: [{
      aLabel: 'Yggdrasil (Norse mythology)',
      uri: 'lcsh:yggdrasil',
      relationship: 'narrower',
      parentLabel: 'Mythology, Norse',
    }],
  }]);

  assert.deepEqual(suggestions[0], {
    label: 'Yggdrasil (Norse mythology)',
    uri: 'lcsh:yggdrasil',
    relationship: 'narrower',
    explanation: 'Narrower topic under Mythology, Norse',
  });
});