import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, HostListener, Inject, OnDestroy, ViewChild } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { BehaviorSubject, catchError, combineLatest, debounceTime, distinctUntilChanged, filter, map, of, startWith, Subject, switchMap, takeUntil } from 'rxjs';
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
  private readonly retry$ = new BehaviorSubject(0);
  private dialogTrigger: HTMLElement | null = null;
  private previousBodyOverflow = '';

  @ViewChild('dialog') private dialog?: ElementRef<HTMLElement>;

  readonly state$ = combineLatest([this.url$.pipe(distinctUntilChanged()), this.retry$]).pipe(
    debounceTime(250),
    switchMap(([url]) => {
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

  openAddSearchTerm(suggestion: LcshSuggestion, event?: Event): void {
    this.dialogTrigger = event?.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    this.previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    this.selectedSuggestion = suggestion;
    setTimeout(() => this.dialog?.nativeElement.focus());
  }

  toggleExpanded(): void {
    this.isExpanded = !this.isExpanded;
  }

  closeAddSearchTerm(restoreFocus = true): void {
    const trigger = this.dialogTrigger;
    this.selectedSuggestion = null;
    this.dialogTrigger = null;
    document.body.style.overflow = this.previousBodyOverflow;
    if (restoreFocus) {
      setTimeout(() => trigger?.focus());
    }
  }

  retry(): void {
    this.retry$.next(this.retry$.value + 1);
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

  @HostListener('document:keydown', ['$event'])
  trapDialogFocus(event: KeyboardEvent): void {
    const dialog = this.dialog?.nativeElement;
    if (event.key !== 'Tab' || !this.selectedSuggestion || !dialog) {
      return;
    }

    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
    ));
    if (!focusable.length) {
      event.preventDefault();
      dialog.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const activeElement = document.activeElement;
    if (event.shiftKey && (activeElement === first || !dialog.contains(activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (activeElement === last || !dialog.contains(activeElement))) {
      event.preventDefault();
      first.focus();
    }
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
      mode: 'advanced',
    };
    this.closeAddSearchTerm(false);
    void this.shellRouter.navigateByUrl(urlTree);
  }

  ngOnDestroy(): void {
    document.body.style.overflow = this.previousBodyOverflow;
    this.destroy$.next();
    this.destroy$.complete();
  }
}