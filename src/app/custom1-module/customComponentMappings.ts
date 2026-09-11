import { SkipToMainMenuComponent } from '../skip-to-main-menu/skip-to-main-menu.component';
import { LcshSuggestionsComponent } from '../lcsh-suggestions/lcsh-suggestions.component';

export const selectorComponentMap = new Map<string, any>([
  ['nde-header-before', SkipToMainMenuComponent],
  ['nde-search-results-top', LcshSuggestionsComponent],
]);