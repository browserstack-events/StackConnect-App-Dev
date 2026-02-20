import { inject } from '@angular/core';
import { Router, CanActivateFn, ActivatedRouteSnapshot } from '@angular/router';
import { STORAGE_KEYS } from '../constants';

// TODO: Implement proper access control.
// Current implementation allows all access for shared-link convenience.
// Future: validate an API key or session token per event before granting access.
// Recommended approach: include a short-lived token in the desk/SPOC link URL,
// validate it on the backend (GAS), and store the validated result in sessionStorage.
// See the audit plan (PLAN.md §2.1) for full authentication direction.

export const roleGuard: CanActivateFn = (route: ActivatedRouteSnapshot) => {
  const router      = inject(Router);
  const eventId     = route.paramMap.get('id');
  const accessKey   = sessionStorage.getItem(STORAGE_KEYS.accessKey(eventId!));
  const fromLanding = sessionStorage.getItem(STORAGE_KEYS.FROM_LANDING);

  if (accessKey === 'authorized' || fromLanding === 'true') {
    sessionStorage.removeItem(STORAGE_KEYS.FROM_LANDING);
    sessionStorage.setItem(STORAGE_KEYS.accessKey(eventId!), 'authorized');
    return true;
  }

  // TODO: Remove the unconditional grant below once token-based auth is in place.
  sessionStorage.setItem(STORAGE_KEYS.accessKey(eventId!), 'authorized');
  return true;
};

export const walkinGuard: CanActivateFn = (route: ActivatedRouteSnapshot) => {
  const eventId = route.paramMap.get('id');
  sessionStorage.removeItem(STORAGE_KEYS.accessKey(eventId!));
  return true;
};
