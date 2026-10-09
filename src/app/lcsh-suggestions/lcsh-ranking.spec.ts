import {
  detectTitleLikeQuery,
  extractCandidateConcepts,
  extractEvidenceCandidates,
  rankLcshSuggestions,
} from './lcsh-ranking';

describe('LCSH ranking', () => {
  it('extracts bounded concepts without stop words', () => {
    expect(extractCandidateConcepts('Norse mythology AND ritual practices', 4)).toEqual([
      'norse mythology ritual',
      'mythology ritual practices',
      'norse mythology',
      'mythology ritual',
    ]);
  });

  it('does not query a generic subdivision word on its own', () => {
    expect(extractCandidateConcepts('history of sumo')).toEqual(['history sumo', 'sumo']);
    expect(extractCandidateConcepts('history')).toEqual(['history']);
  });

  it('detects title searches and counts recurring result subjects', () => {
    expect(detectTitleLikeQuery('they say I say', ['They say / I say: the moves that matter'])).toBeTrue();
    expect(extractEvidenceCandidates(['Report writing', 'English language -- Rhetoric', 'Report writing'])).toEqual([
      { candidate: 'Report writing', evidenceCount: 2 },
      { candidate: 'English language--Rhetoric', evidenceCount: 1 },
    ]);
  });

  it('ranks exact result evidence and explains narrower headings', () => {
    const suggestions = rankLcshSuggestions([
      {
        candidate: 'Report writing',
        source: 'result-set',
        evidenceCount: 3,
        hits: [{ aLabel: 'Report writing', uri: 'lcsh:report' }],
      },
      {
        candidate: 'Report writing',
        hits: [{
          aLabel: 'Business report writing',
          uri: 'lcsh:business',
          relationship: 'narrower',
          parentLabel: 'Report writing',
        }],
      },
    ]);

    expect(suggestions).toEqual([
      {
        label: 'Report writing',
        uri: 'lcsh:report',
        relationship: 'result-set',
        explanation: 'Appears in 3 top results',
      },
      {
        label: 'Business report writing',
        uri: 'lcsh:business',
        relationship: 'narrower',
        explanation: 'Narrower topic under Report writing',
      },
    ]);
  });

  it('drops headings that only match part of a multi-word candidate phrase', () => {
    const suggestions = rankLcshSuggestions([
      {
        candidate: 'history sumo',
        hits: [{ aLabel: 'Sports--History', uri: 'lcsh:sports-history' }],
      },
      {
        candidate: 'sumo',
        hits: [{ aLabel: 'Sumo wrestling', uri: 'lcsh:sumo' }],
      },
    ]);

    expect(suggestions.map(suggestion => suggestion.uri)).toEqual(['lcsh:sumo']);
  });

  it('drops headings where a generic candidate word is a small fraction of the label', () => {
    const suggestions = rankLcshSuggestions([
      {
        candidate: 'history',
        hits: [{ aLabel: 'Nuclear warfare--History', uri: 'lcsh:nuclear-history' }],
      },
      {
        candidate: 'sumo',
        hits: [{ aLabel: 'Sumo wrestling', uri: 'lcsh:sumo' }],
      },
    ]);

    expect(suggestions.map(suggestion => suggestion.uri)).toEqual(['lcsh:sumo']);
  });

  it('only describes a genuine alternate term', () => {
    const suggestions = rankLcshSuggestions([
      {
        candidate: 'middle earth',
        hits: [{
          aLabel: 'Middle Earth (Imaginary place)',
          suggestLabel: ' (USE Middle Earth (Imaginary place))',
          uri: 'lcsh:authorized',
        }],
      },
      {
        candidate: 'norse mythology',
        hits: [{
          aLabel: 'Mythology, Norse',
          suggestLabel: 'Norse mythology (USE Mythology, Norse)',
          uri: 'lcsh:alternate',
        }],
      },
    ]);

    expect(suggestions[0].explanation).toBe('Matches your search concepts');
    expect(suggestions[1].explanation).toBe('Authorized heading for "Norse mythology"');
  });
});