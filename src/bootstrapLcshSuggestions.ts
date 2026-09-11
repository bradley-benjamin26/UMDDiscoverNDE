import '@angular/compiler';
import { bootstrap } from '@angular-architects/module-federation-tools';
import { AppModule } from './app/app.module';
import { LcshSuggestionsComponent } from './app/lcsh-suggestions/lcsh-suggestions.component';

const lcshComponentMappings = new Map<string, any>([
  ['nde-search-results-top', LcshSuggestionsComponent],
]);

export const bootstrapRemoteApp = (bootstrapOptions: any) => {
  return bootstrap(AppModule(bootstrapOptions, lcshComponentMappings), {
    production: true,
    appType: 'microfrontend',
  });
};