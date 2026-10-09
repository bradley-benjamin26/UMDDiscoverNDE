import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { LcshSuggestionsService } from './lcsh-suggestions.service';

describe('LcshSuggestionsService', () => {
  let service: LcshSuggestionsService;
  let httpController: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    service = TestBed.inject(LcshSuggestionsService);
    httpController = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpController.verify());

  it('returns deduplicated authorized subject headings', () => {
    let actualSuggestions: unknown;
    service.suggest('climate change', 3, {
      titles: ['Climate change and society'],
      subjects: ['Climatic changes'],
    }).subscribe(suggestions => {
      actualSuggestions = suggestions;
    });

    const suggestionRequests = httpController.match(request => request.url ===
      'https://id.loc.gov/authorities/subjects/suggest2/');
    expect(suggestionRequests.length).toBe(4);
    suggestionRequests.forEach(request => {
      expect(request.request.method).toBe('GET');
      expect(request.request.params.get('searchtype')).toBe('keyword');
      request.flush({
        hits: request.request.params.get('q') === 'Climatic changes'
          ? [{ aLabel: 'Climatic changes', uri: 'http://id.loc.gov/authorities/subjects/sh85027037' }]
          : [],
      });
    });

    const authorityRequest = httpController.expectOne(
      'https://id.loc.gov/authorities/subjects/sh85027037.json'
    );
    authorityRequest.flush([]);

    expect(actualSuggestions).toEqual([{
      label: 'Climatic changes',
      uri: 'http://id.loc.gov/authorities/subjects/sh85027037',
      relationship: 'result-set',
      explanation: 'Appears in 1 top result',
    }]);
  });

  it('reports an error when every LOC suggestion request fails', () => {
    let actualError: unknown;
    service.suggest('mythology').subscribe({ error: error => actualError = error });

    const requests = httpController.match(request => request.url ===
      'https://id.loc.gov/authorities/subjects/suggest2/');
    expect(requests.length).toBe(1);
    requests[0].flush('Unavailable', { status: 503, statusText: 'Service Unavailable' });

    expect(actualError).toBeTruthy();
  });
});