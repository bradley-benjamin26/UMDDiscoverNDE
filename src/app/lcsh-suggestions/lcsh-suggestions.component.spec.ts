import {
  appendPrimoSubjectQuery,
  createPrimoSubjectQuery,
  extractPrimoSearchTerm,
  extractPrimoSubjectLabels,
  hasPrimoSubjectQuery,
} from './lcsh-suggestions.component';

describe('extractPrimoSearchTerm', () => {
  it('extracts the term from a Primo query parameter', () => {
    const url = '/nde/search?vid=01USMAI_UMCP:NDE&query=any,contains,climate%20change';

    expect(extractPrimoSearchTerm(url)).toBe('climate change');
  });

  it('preserves commas within the search term', () => {
    const url = '/nde/search?query=any,contains,Chesapeake%20Bay,%20Maryland';

    expect(extractPrimoSearchTerm(url)).toBe('Chesapeake Bay, Maryland');
  });

  it('returns an empty string when no query is present', () => {
    expect(extractPrimoSearchTerm('/nde/home?vid=01USMAI_UMCP:NDE')).toBe('');
  });

  it('extracts terms from a compound query without Primo syntax', () => {
    const url = '/nde/search?query=any,contains,norse%20mythology,OR;' +
      'sub,contains,Valkyries%20(Norse%20mythology)';

    expect(extractPrimoSearchTerm(url))
      .toBe('norse mythology Valkyries (Norse mythology)');
  });
});

describe('createPrimoSubjectQuery', () => {
  it('creates a Subject contains query', () => {
    expect(createPrimoSubjectQuery('Valkyries (Norse mythology)'))
      .toBe('sub,contains,Valkyries (Norse mythology)');
  });
});

describe('appendPrimoSubjectQuery', () => {
  it('changes a general search to Any field contains before adding a subject', () => {
    expect(appendPrimoSubjectQuery(
      'the economy and climate change',
      'Climate change mitigation',
      'AND'
    )).toBe(
      'any,contains,the economy and climate change,AND;' +
      'sub,contains,Climate change mitigation'
    );
  });

  it('preserves commas when changing a general search to Any field contains', () => {
    expect(appendPrimoSubjectQuery(
      'Chesapeake Bay, Maryland',
      'Estuaries',
      'AND'
    )).toBe('any,contains,Chesapeake Bay, Maryland,AND;sub,contains,Estuaries');
  });

  it('adds a subject to an existing search with AND', () => {
    expect(appendPrimoSubjectQuery(
      'any,contains,norse mythology',
      'Valkyries (Norse mythology)',
      'AND'
    )).toBe('any,contains,norse mythology,AND;sub,contains,Valkyries (Norse mythology)');
  });

  it('adds a subject to a compound search with OR', () => {
    expect(appendPrimoSubjectQuery(
      'any,contains,norse mythology,AND;sub,contains,Mythology, Norse',
      'Valkyries (Norse mythology)',
      'OR'
    )).toBe(
      'any,contains,norse mythology,AND;sub,contains,Mythology, Norse,OR;' +
      'sub,contains,Valkyries (Norse mythology)'
    );
  });

  it('does not add a duplicate subject', () => {
    const query = 'sub,contains,Mythology, Norse, in literature,AND;' +
      'sub,contains,Mythology, Norse--Juvenile literature';

    expect(appendPrimoSubjectQuery(query, 'Mythology, Norse, in literature', 'OR'))
      .toBe(query);
  });
});

describe('Primo subject query detection', () => {
  const query = 'sub,contains,Mythology, Norse, in literature,AND;' +
    'sub,contains,Mythology, Norse, in literature,AND;' +
    'sub,contains,Mythology, Norse--Juvenile literature';

  it('extracts complete subject labels containing commas', () => {
    expect(extractPrimoSubjectLabels(query)).toEqual([
      'Mythology, Norse, in literature',
      'Mythology, Norse, in literature',
      'Mythology, Norse--Juvenile literature',
    ]);
  });

  it('matches existing subjects without case or whitespace sensitivity', () => {
    expect(hasPrimoSubjectQuery(query, ' mythology,  NORSE, in literature ')).toBeTrue();
    expect(hasPrimoSubjectQuery(query, 'Mythology, Norse, in art')).toBeFalse();
  });
});