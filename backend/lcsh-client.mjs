const LCSH_ENDPOINT = 'https://id.loc.gov/authorities/subjects/suggest2/';
const NARROWER_PREDICATE = 'http://www.loc.gov/mads/rdf/v1#hasNarrowerAuthority';
const LABEL_PREDICATE = 'http://www.loc.gov/mads/rdf/v1#authoritativeLabel';

export function createLcshClient({ fetchImpl = fetch, timeoutMs = 3000 } = {}) {
  return {
    async suggest(candidate, count = 8) {
      const url = new URL(LCSH_ENDPOINT);
      url.searchParams.set('q', candidate);
      url.searchParams.set('count', String(count));
      url.searchParams.set('searchtype', 'keyword');

      const response = await fetchImpl(url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) {
        throw new Error(`LCSH upstream responded with ${response.status}`);
      }

      const body = await response.json();
      return Array.isArray(body.hits) ? body.hits : [];
    },

    async narrower(uri, count = 3) {
      if (!uri?.startsWith('http://id.loc.gov/authorities/subjects/')) {
        return [];
      }

      const response = await fetchImpl(`${uri}.json`, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        throw new Error(`LCSH authority upstream responded with ${response.status}`);
      }

      const graph = await response.json();
      const authority = graph.find(node => node['@id'] === uri);
      const narrowerUris = (authority?.[NARROWER_PREDICATE] || []).map(value => value['@id']);
      const nodesByUri = new Map(graph.map(node => [node['@id'], node]));
      return narrowerUris
        .map(narrowerUri => ({
          uri: narrowerUri,
          aLabel: nodesByUri.get(narrowerUri)?.[LABEL_PREDICATE]?.[0]?.['@value'],
        }))
        .filter(hit => hit.aLabel && hit.uri.startsWith('http://id.loc.gov/authorities/subjects/'))
        .slice(0, count);
    },
  };
}