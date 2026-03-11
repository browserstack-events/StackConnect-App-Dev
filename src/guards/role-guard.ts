import { inject } from '@angular/core';
import { Router, CanActivateFn, ActivatedRouteSnapshot } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const deskGuard: CanActivateFn = (route: ActivatedRouteSnapshot) => {
  const router = inject(Router);
  const auth = inject(AuthService);
  const eventId = route.paramMap.get('id')!;
  if (auth.hasValidSession('desk')) return true;
  return router.createUrlTree(['/event', eventId]);
};

export const spocGuard: CanActivateFn = (route: ActivatedRouteSnapshot) => {
  const router = inject(Router);
  const auth = inject(AuthService);
  const eventId = route.paramMap.get('id')!;
  if (auth.hasValidSession('spoc')) return true;
  return router.createUrlTree(['/event', eventId]);
};

// Walk-in registration is public — no auth required
export const walkinGuard: CanActivateFn = () => true;
