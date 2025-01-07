import {ApplicationConfig, importProvidersFrom, provideZoneChangeDetection} from '@angular/core';
import {provideRouter} from '@angular/router';

import {AuthModule} from '@modules/auth';
import {StickersModule} from '@modules/stickers';
import {UiModule} from '@modules/ui';

import {routes} from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({eventCoalescing: true}),
    provideRouter(routes),
    importProvidersFrom(AuthModule, StickersModule, UiModule),
  ],
};
