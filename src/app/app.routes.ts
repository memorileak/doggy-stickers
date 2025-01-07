import {Routes} from '@angular/router';
import {authenticationRequiredGuard, signedOutRequiredGuard} from '@modules/auth';

import {StickersComponent} from './stickers/stickers.component';
import {SignInComponent} from './sign-in/sign-in.component';
import {ManageStickersComponent} from './manage-stickers/manage-stickers.component';

export const routes: Routes = [
  {
    path: 'stickers',
    component: StickersComponent,
  },
  {
    path: 'sign-in',
    component: SignInComponent,
    canActivate: [signedOutRequiredGuard],
  },
  {
    path: 'manage-stickers',
    component: ManageStickersComponent,
    canActivate: [authenticationRequiredGuard],
  },
  {
    path: '',
    redirectTo: 'stickers',
    pathMatch: 'full',
  },
  {
    path: '**',
    redirectTo: 'stickers',
  },
];
