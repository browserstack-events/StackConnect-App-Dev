import { inject } from '@angular/core';
import { CanActivateFn } from '@angular/router';
import { SpocAuthService } from '../services/spoc-auth.service';

/**
 * Route guard for the SPOC view only (`/#/event/:id/spoc`).
 *
 * If a valid OAuth session exists → allow navigation.
 * Otherwise → initiate BrowserStack OAuth2 login (redirects the browser)
 * and block navigation. The callback will restore the original destination.
 *
 * Desk, admin-console, walk-in, and public routes are NOT protected by this guard.
 */
export const spocOauthGuard: CanActivateFn = (route) => {
  const spocAuth = inject(SpocAuthService);

  if (spocAuth.isAuthenticated()) return true;

  const eventId   = route.paramMap.get('id') ?? '';
  const returnUrl = `/event/${eventId}/spoc`;
  spocAuth.startLogin(returnUrl);
  return false;
};
