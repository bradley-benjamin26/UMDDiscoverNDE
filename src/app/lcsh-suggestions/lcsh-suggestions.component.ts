import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, HostListener, Inject, OnDestroy } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { BehaviorSubject, catchError, debounceTime, distinctUntilChanged, filter, map, of, startWith, Subject, switchMap, takeUntil } from 'rxjs';
import { SHELL_ROUTER } from '../injection-tokens';
import { LcshSuggestion, LcshSuggestionsService } from './lcsh-suggestions.service';
import { PrimoResultEvidenceService } from './primo-result-evidence.service';

export type LcshSuggestionsState =
  | { status: 'idle'; query: string; suggestions: LcshSuggestion[] }
  | { status: 'loading'; query: string; suggestions: LcshSuggestion[] }
  | { status: 'ready'; query: string; suggestions: LcshSuggestion[] }
  | { status: 'error'; query: string; suggestions: LcshSuggestion[] };

function getPrimoQuery(url: string): string {
  return new URL(url, 'https://primo.invalid').searchParams.get('query') || '';
}

export function extractPrimoSearchTerm(url: string): string {
  const queryValue = getPrimoQuery(url);
  if (!queryValue) {
    return '';
  }

  return queryValue
    .split(';')
    .map(clause => {
      const parts = clause.split(',');
      const termParts = parts.length >= 3 ? parts.slice(2) : parts;
      if (termParts.at(-1) === 'AND' || termParts.at(-1) === 'OR') {
        termParts.pop();
      }
      return termParts.join(',').trim();
    })
    .filter(Boolean)
    .join(' ');
}

export function createPrimoSubjectQuery(label: string): string {
  return `sub,contains,${label}`;
}

export type BooleanOperator = 'AND' | 'OR';

function normalizeSubjectLabel(label: string): string {
  return label.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
}

export function extractPrimoSubjectLabels(query: string): string[] {
  return query
    .split(';')
    .map(clause => {
      const parts = clause.split(',');
      if (parts[0]?.toLowerCase() !== 'sub' || parts.length < 3) {
        return '';
      }

      const termParts = parts.slice(2);
      if (termParts.at(-1) === 'AND' || termParts.at(-1) === 'OR') {
        termParts.pop();
      }
      return termParts.join(',').trim();
    })
    .filter(Boolean);
}

export function hasPrimoSubjectQuery(query: string, label: string): boolean {
  const normalizedLabel = normalizeSubjectLabel(label);
  return extractPrimoSubjectLabels(query)
    .some(subject => normalizeSubjectLabel(subject) === normalizedLabel);
}

export function appendPrimoSubjectQuery(
  currentQuery: string,
  label: string,
  operator: BooleanOperator
): string {
  if (hasPrimoSubjectQuery(currentQuery, label)) {
    return currentQuery;
  }

  const subjectQuery = createPrimoSubjectQuery(label);
  const hasPrimoSearchSyntax = /^[^,;]+,(?:contains|exact|begins_with),/i.test(currentQuery);
  const existingQuery = currentQuery && !hasPrimoSearchSyntax
    ? `any,contains,${currentQuery}`
    : currentQuery;
  return existingQuery ? `${existingQuery},${operator};${subjectQuery}` : subjectQuery;
}

@Component({
  selector: 'custom-lcsh-suggestions',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './lcsh-suggestions.component.html',
  styleUrl: './lcsh-suggestions.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LcshSuggestionsComponent implements OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly url$ = new BehaviorSubject(this.shellRouter.url);

  readonly state$ = this.url$.pipe(
    distinctUntilChanged(),
    debounceTime(250),
    switchMap(url => {
      const query = extractPrimoSearchTerm(url);
      const currentQuery = getPrimoQuery(url);
      if (query.length < 2) {
        return of<LcshSuggestionsState>({ status: 'idle', query, suggestions: [] });
      }

      return this.resultEvidenceService.load(url).pipe(
        switchMap(evidence => this.suggestionsService.suggest(query, 5, evidence)),
        map(suggestions => ({
            status: 'ready',
            query,
            suggestions: suggestions.filter(suggestion =>
              !hasPrimoSubjectQuery(currentQuery, suggestion.label)
            ),
          }) as LcshSuggestionsState),
        startWith({ status: 'loading', query, suggestions: [] } as LcshSuggestionsState),
        catchError(() => of<LcshSuggestionsState>({ status: 'error', query, suggestions: [] }))
      );
    })
  );
  isExpanded = false;
  selectedSuggestion: LcshSuggestion | null = null;

  constructor(
    @Inject(SHELL_ROUTER) private readonly shellRouter: Router,
    private readonly suggestionsService: LcshSuggestionsService,
    private readonly resultEvidenceService: PrimoResultEvidenceService
  ) {
    this.shellRouter.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      takeUntil(this.destroy$)
    ).subscribe(event => this.url$.next(event.urlAfterRedirects));
  }

  openAddSearchTerm(suggestion: LcshSuggestion): void {
    this.selectedSuggestion = suggestion;
  }

  toggleExpanded(): void {
    this.isExpanded = !this.isExpanded;
  }

  closeAddSearchTerm(): void {
    this.selectedSuggestion = null;
  }

  addSubject(operator: BooleanOperator): void {
    if (!this.selectedSuggestion) {
      return;
    }

    const currentQuery = this.getCurrentQuery();
    const nextQuery = appendPrimoSubjectQuery(currentQuery, this.selectedSuggestion.label, operator);
    if (nextQuery === currentQuery) {
      this.closeAddSearchTerm();
      return;
    }
    this.navigateWithQuery(nextQuery);
  }

  startNewSubjectSearch(): void {
    if (!this.selectedSuggestion) {
      return;
    }

    this.navigateWithQuery(createPrimoSubjectQuery(this.selectedSuggestion.label));
  }

  @HostListener('document:keydown.escape')
  handleEscape(): void {
    this.closeAddSearchTerm();
  }

  private getCurrentQuery(): string {
    const query = this.shellRouter.parseUrl(this.shellRouter.url).queryParams['query'];
    return typeof query === 'string' ? query : '';
  }

  private navigateWithQuery(query: string): void {
    const urlTree = this.shellRouter.parseUrl(this.shellRouter.url);
    urlTree.queryParams = {
      ...urlTree.queryParams,
      query,
    };
    this.closeAddSearchTerm();
    void this.shellRouter.navigateByUrl(urlTree);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}