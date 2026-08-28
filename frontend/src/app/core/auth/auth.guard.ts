import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Role } from '../models/api.models';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = (_, state) => {
  const auth = inject(AuthService);
  return auth.isAuthenticated()
    ? true
    : inject(Router).createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

export const roleGuard = (roles: Role[]): CanActivateFn => () => {
  const auth = inject(AuthService);
  return auth.hasRole(...roles) ? true : inject(Router).createUrlTree(['/dashboard']);
};
