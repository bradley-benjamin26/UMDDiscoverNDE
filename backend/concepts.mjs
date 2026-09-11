const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'how', 'in',
  'is', 'it', 'of', 'on', 'or', 'that', 'the', 'this', 'to', 'was', 'what',
  'when', 'where', 'which', 'who', 'why', 'with',
]);

export function normalizeQuery(query) {
  return query
    .normalize('NFKC')
    .replace(/\b(?:AND|OR|NOT)\b/gi, ' ')
    .replace(/[^\p{L}\p{N}'’-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function extractCandidateConcepts(query, maxCandidates = 5) {
  const normalized = normalizeQuery(query);
  const tokens = normalized
    .split(' ')
    .filter(token => token.length > 1 && !STOP_WORDS.has(token));

  if (!tokens.length) {
    return [];
  }

  const candidates = [];
  const addCandidate = candidate => {
    if (candidate && !candidates.includes(candidate)) {
      candidates.push(candidate);
    }
  };

  for (let size = Math.min(3, tokens.length); size >= 2; size -= 1) {
    for (let index = 0; index <= tokens.length - size; index += 1) {
      addCandidate(tokens.slice(index, index + size).join(' '));
    }
  }

  tokens.forEach(addCandidate);
  return candidates.slice(0, maxCandidates);
}

export function detectTitleLikeQuery(query, titles = []) {
  const normalizedQuery = normalizeQuery(query);
  if (normalizedQuery.length < 4) {
    return false;
  }

  const queryTokens = normalizedQuery.split(' ');
  return titles.some(title => {
    const normalizedTitle = normalizeQuery(title);
    if (normalizedTitle === normalizedQuery || normalizedTitle.startsWith(`${normalizedQuery} `)) {
      return true;
    }

    const titleTokens = new Set(normalizedTitle.split(' '));
    const overlap = queryTokens.filter(token => titleTokens.has(token)).length;
    return overlap / queryTokens.length >= 0.8 && overlap / titleTokens.size >= 0.5;
  });
}

export function extractEvidenceCandidates(subjects = [], maxCandidates = 6) {
  const counts = new Map();
  subjects.forEach(subject => {
    const label = subject.replace(/\s*--\s*/g, '--').trim();
    const normalized = normalizeQuery(label);
    if (normalized.length >= 2) {
      const current = counts.get(normalized) || { candidate: label, evidenceCount: 0 };
      current.evidenceCount += 1;
      counts.set(normalized, current);
    }
  });

  return [...counts.values()]
    .sort((left, right) => right.evidenceCount - left.evidenceCount || left.candidate.localeCompare(right.candidate))
    .slice(0, maxCandidates);
}

export function rankLcshSuggestions(hitsByCandidate, limit = 5) {
  const rankedByUri = new Map();

  hitsByCandidate.forEach(({ candidate, hits, source = 'query', evidenceCount = 0 }, candidateIndex) => {
    const normalizedCandidate = normalizeQuery(candidate);
    const candidateTokens = new Set(normalizedCandidate.split(' '));

    hits.forEach((hit, hitIndex) => {
      const label = (hit.aLabel || hit.suggestLabel || '').trim();
      if (!label || !hit.uri) {
        return;
      }

      const normalizedLabel = normalizeQuery(label);
      const labelTokens = new Set(normalizedLabel.split(' '));
      const overlap = [...candidateTokens].filter(token => labelTokens.has(token)).length;
      const evidenceMatch = source === 'result-set' && (
        normalizedLabel === normalizedCandidate ||
        normalizedLabel.startsWith(`${normalizedCandidate} `) && labelTokens.size <= candidateTokens.size + 1
      );
      const exactBonus = normalizedLabel === normalizedCandidate ? 100 : 0;
      const prefixBonus = normalizedLabel.startsWith(normalizedCandidate) ? 30 : 0;
      const authorizedBonus = hit.aLabel ? 10 : 0;
      const specificityBonus = candidateTokens.size * 50;
      const evidenceBonus = evidenceMatch ? 180 + Math.min(evidenceCount, 5) * 35 : 0;
      const relationshipBonus = hit.relationship === 'narrower' ? 40 : 0;
      const candidatePenalty = hit.relationship === 'narrower' ? 0 : candidateIndex * 40;
      const score = exactBonus + prefixBonus + authorizedBonus + specificityBonus + overlap * 20 + evidenceBonus + relationshipBonus - candidatePenalty - hitIndex;
      const existing = rankedByUri.get(hit.uri);

      if (!existing || existing.score < score) {
        const alternateMatch = hit.suggestLabel && normalizeQuery(hit.suggestLabel) !== normalizeQuery(hit.aLabel || '');
        const relationship = hit.relationship || (evidenceMatch ? 'result-set' : alternateMatch ? 'alternate' : 'authorized');
        const explanation = relationship === 'result-set'
          ? `Appears in ${evidenceCount} top ${evidenceCount === 1 ? 'result' : 'results'}`
          : relationship === 'narrower'
            ? `Narrower topic under ${hit.parentLabel}`
            : relationship === 'alternate'
              ? `Authorized heading for “${hit.suggestLabel}”`
              : 'Matches your search concepts';
        rankedByUri.set(hit.uri, { label, normalizedLabel, uri: hit.uri, score, relationship, explanation });
      }
    });
  });

  const rankedByLabel = new Map();
  [...rankedByUri.values()].forEach(suggestion => {
    const existing = rankedByLabel.get(suggestion.normalizedLabel);
    if (!existing || existing.score < suggestion.score) {
      rankedByLabel.set(suggestion.normalizedLabel, suggestion);
    }
  });

  return [...rankedByLabel.values()]
    .sort((left, right) => right.score - left.score || left.label.localeCompare(right.label))
    .slice(0, limit)
    .map(({ label, uri, relationship, explanation }) => ({ label, uri, relationship, explanation }));
}