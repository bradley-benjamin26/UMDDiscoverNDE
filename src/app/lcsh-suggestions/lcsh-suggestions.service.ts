import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { catchError, forkJoin, map, Observable, of, shareReplay, switchMap, throwError, timeout } from 'rxjs';
import {
  CandidateLookup,
  detectTitleLikeQuery,
  extractCandidateConcepts,
  extractEvidenceCandidates,
  LcshHit,
  LcshSuggestion,
  rankLcshSuggestions,
} from './lcsh-ranking';
import { PrimoResultEvidence } from './primo-result-evidence.service';

export { LcshSuggestion } from './lcsh-ranking';

const LCSH_ENDPOINT = 'https://id.loc.gov/authorities/subjects/suggest2/';
const NARROWER_PREDICATE = 'http://www.loc.gov/mads/rdf/v1#hasNarrowerAuthority';
const LABEL_PREDICATE = 'http://www.loc.gov/mads/rdf/v1#authoritativeLabel';

interface LcshSuggestResponse {
  hits?: LcshHit[];
}

interface JsonLdValue {
  '@id'?: string;
  '@value'?: string;
}

interface AuthorityNode {
  '@id'?: string;
  [NARROWER_PREDICATE]?: JsonLdValue[];
  [LABEL_PREDICATE]?: JsonLdValue[];
}

@Injectable({ providedIn: 'root' })
export class LcshSuggestionsService {
  private readonly suggestionCache = new Map<string, Observable<LcshHit[]>>();
  private readonly narrowerCache = new Map<string, Observable<LcshHit[]>>();

  constructor(private readonly http: HttpClient) {}

  suggest(query: string, count = 5, evidence?: PrimoResultEvidence): Observable<LcshSuggestion[]> {
    const boundedCount = Math.min(Math.max(count, 1), 10);
    const resultEvidence = evidence || { titles: [], subjects: [] };
    const evidenceCandidates = detectTitleLikeQuery(query, resultEvidence.titles)
      ? extractEvidenceCandidates(resultEvidence.subjects)
      : [];
    const queryCandidates = extractCandidateConcepts(query)
      .map(candidate => ({ candidate, source: 'query' as const, evidenceCount: 0 }));
    const candidates = [
      ...evidenceCandidates.map(candidate => ({ ...candidate, source: 'result-set' as const })),
      ...queryCandidates,
    ]
      .filter((item, index, items) =>
        items.findIndex(other => other.candidate.toLowerCase() === item.candidate.toLowerCase()) === index
      )
      .slice(0, 10);

    if (!candidates.length) {
      return of([]);
    }

    return forkJoin(candidates.map(candidateInfo => this.lookup(candidateInfo.candidate).pipe(
      map(hits => ({ ...candidateInfo, hits, failed: false })),
      catchError(() => of({ ...candidateInfo, hits: [], failed: true }))
    ))).pipe(
      switchMap(hitsByCandidate => {
        if (hitsByCandidate.every(result => result.failed)) {
          return throwError(() => new Error('Library of Congress suggestions are unavailable.'));
        }

        const initialSuggestions = rankLcshSuggestions(hitsByCandidate, boundedCount);
        const parents = initialSuggestions.slice(0, 2);
        if (!parents.length) {
          return of(initialSuggestions);
        }

        return forkJoin(parents.map(parent => this.lookupNarrower(parent).pipe(
          catchError(() => of([])),
          map(hits => ({ candidate: parent.label, source: 'query' as const, hits }))
        ))).pipe(
          map(narrowerGroups => rankLcshSuggestions([...hitsByCandidate, ...narrowerGroups], boundedCount))
        );
      })
    );
  }

  private lookup(candidate: string): Observable<LcshHit[]> {
    const cached = this.suggestionCache.get(candidate);
    if (cached) {
      return cached;
    }

    const params = new HttpParams()
      .set('q', candidate)
      .set('count', 8)
      .set('searchtype', 'keyword');
    const request = this.http.get<LcshSuggestResponse>(LCSH_ENDPOINT, { params }).pipe(
      timeout(3000),
      map(response => Array.isArray(response.hits) ? response.hits : []),
      shareReplay({ bufferSize: 1, refCount: true })
    );
    this.cache(this.suggestionCache, candidate, request);
    return request;
  }

  private lookupNarrower(parent: LcshSuggestion): Observable<LcshHit[]> {
    const cached = this.narrowerCache.get(parent.uri);
    if (cached) {
      return cached;
    }

    if (!parent.uri.startsWith('http://id.loc.gov/authorities/subjects/')) {
      return of([]);
    }

    const endpoint = `${parent.uri.replace('http://', 'https://')}.json`;
    const request = this.http.get<AuthorityNode[]>(endpoint).pipe(
      timeout(3000),
      map(graph => {
        const authority = graph.find(node => node['@id'] === parent.uri);
        const narrowerUris = (authority?.[NARROWER_PREDICATE] || [])
          .map(value => value['@id'])
          .filter((uri): uri is string => Boolean(uri));
        const nodesByUri = new Map(graph.map(node => [node['@id'], node]));
        return narrowerUris
          .flatMap(uri => {
            const aLabel = nodesByUri.get(uri)?.[LABEL_PREDICATE]?.[0]?.['@value'];
            return aLabel && uri.startsWith('http://id.loc.gov/authorities/subjects/')
              ? [{ uri, aLabel, relationship: 'narrower' as const, parentLabel: parent.label }]
              : [];
          })
          .slice(0, 3);
      }),
      shareReplay({ bufferSize: 1, refCount: true })
    );
    this.cache(this.narrowerCache, parent.uri, request);
    return request;
  }

  private cache(cache: Map<string, Observable<LcshHit[]>>, key: string, request: Observable<LcshHit[]>): void {
    if (cache.size >= 50) {
      cache.delete(cache.keys().next().value as string);
    }
    cache.set(key, request);
  }
}