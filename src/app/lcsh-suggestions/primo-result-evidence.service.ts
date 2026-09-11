import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { catchError, map, Observable, of } from 'rxjs';

interface PrimoPnxDocument {
  pnx?: {
    display?: {
      title?: string[];
      subject?: string[];
    };
  };
}

interface PrimoPnxResponse {
  docs?: PrimoPnxDocument[];
}

export interface PrimoResultEvidence {
  titles: string[];
  subjects: string[];
}

@Injectable({ providedIn: 'root' })
export class PrimoResultEvidenceService {
  constructor(private readonly http: HttpClient) {}

  load(routeUrl: string): Observable<PrimoResultEvidence> {
    const url = new URL(routeUrl, window.location.origin);
    const query = url.searchParams.get('query')?.trim();
    if (!query) {
      return of({ titles: [], subjects: [] });
    }

    const vid = url.searchParams.get('vid') || '';
    const params = new HttpParams()
      .set('limit', 10)
      .set('offset', 0)
      .set('scope', url.searchParams.get('search_scope') || 'DN_and_CI')
      .set('tab', url.searchParams.get('tab') || 'Everything')
      .set('inst', vid.split(':')[0])
      .set('q', query.includes(',') ? query : `any,contains,${query}`)
      .set('skipDelivery', 'Y')
      .set('lang', url.searchParams.get('lang') || 'en')
      .set('vid', vid);

    return this.http.get<PrimoPnxResponse>('/primaws/rest/pub/pnxs', { params }).pipe(
      map(response => this.extractEvidence(response.docs || [])),
      catchError(() => of({ titles: [], subjects: [] }))
    );
  }

  private extractEvidence(documents: PrimoPnxDocument[]): PrimoResultEvidence {
    const titles = documents
      .flatMap(document => document.pnx?.display?.title || [])
      .map(title => title.trim())
      .filter(Boolean)
      .slice(0, 10);
    const subjects = documents
      .flatMap(document => document.pnx?.display?.subject || [])
      .flatMap(subject => subject.split('$$Q'))
      .map(subject => subject.replace(/\s+--\s+/g, '--').trim())
      .filter(Boolean)
      .slice(0, 30);

    return { titles, subjects };
  }
}