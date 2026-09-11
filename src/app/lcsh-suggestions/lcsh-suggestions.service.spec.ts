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
    service.suggest('climate change', 3, {
      titles: ['Climate change and society'],
      subjects: ['Climatic changes'],
    }).subscribe(suggestions => {
      expect(suggestions).toEqual([
        {
          label: 'Climatic changes',
          uri: 'http://id.loc.gov/authorities/subjects/sh85027037',
          relationship: 'result-set',
          explanation: 'Appears in the top results',
        },
      ]);
    });

    const request = httpController.expectOne('http://localhost:4300/api/v1/lcsh/suggestions');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      query: 'climate change',
      limit: 3,
      evidence: {
        titles: ['Climate change and society'],
        subjects: ['Climatic changes'],
      },
    });

    request.flush({
      suggestions: [
        {
          label: 'Climatic changes',
          uri: 'http://id.loc.gov/authorities/subjects/sh85027037',
          relationship: 'result-set',
          explanation: 'Appears in the top results',
        },
      ],
    });
  });
});