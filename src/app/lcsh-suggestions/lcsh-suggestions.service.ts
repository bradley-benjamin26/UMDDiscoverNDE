import { HttpClient } from '@angular/common/http';
import { Inject, Injectable, Optional } from '@angular/core';
import { map, Observable } from 'rxjs';
import { PrimoResultEvidence } from './primo-result-evidence.service';

export interface LcshSuggestion {
  label: string;
  uri: string;
  relationship: 'authorized' | 'alternate' | 'result-set' | 'narrower';
  explanation: string;
}

@Injectable({ providedIn: 'root' })
export class LcshSuggestionsService {
  private readonly endpoint: string;

  constructor(
    private readonly http: HttpClient,
    @Optional() @Inject('MODULE_PARAMETERS') moduleParameters: { apiBaseUrl?: string } | null
  ) {
    const apiBaseUrl = moduleParameters?.apiBaseUrl?.replace(/\/$/, '') || 'http://localhost:4300';
    this.endpoint = `${apiBaseUrl}/api/v1/lcsh/suggestions`;
  }

  suggest(query: string, count = 5, evidence?: PrimoResultEvidence): Observable<LcshSuggestion[]> {
    return this.http.post<{ suggestions: LcshSuggestion[] }>(this.endpoint, {
      query,
      limit: count,
      evidence: evidence || { titles: [], subjects: [] },
    }).pipe(
      map(response => response.suggestions.slice(0, count))
    );
  }
}