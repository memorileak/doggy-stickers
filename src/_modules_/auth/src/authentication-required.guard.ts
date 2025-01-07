import {catchError, map, of} from 'rxjs';
import {inject} from '@angular/core';
import {CanActivateFn, Router} from '@angular/router';

import {AuthService} from './auth.service';

export const authenticationRequiredGuard: CanActivateFn = (_route, _state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService.isAuthenticated().pipe(
    map((isSignedIn) => {
      if (!isSignedIn) {
        throw new Error('Unauthenticated');
      }
      return true;
    }),
    catchError((err) => {
      console.error(err);
      return of(router.createUrlTree(['/sign-in']));
    }),
  );
};
