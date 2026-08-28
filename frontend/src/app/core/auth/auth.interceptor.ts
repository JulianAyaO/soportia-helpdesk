import { HttpContextToken, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from './auth.service';

const RETRIED = new HttpContextToken(() => false);

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const token = auth.token();
  const isAuthRequest = /\/auth\/(login|refresh|logout)/.test(request.url);
  const authorized = token && !isAuthRequest
    ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : request;

  return next(authorized).pipe(
    catchError((error: HttpErrorResponse) => {
      const emptyDenied = error.status === 403 && !error.error?.detail && !error.error?.message;
      const canRefresh = !isAuthRequest && !request.context.get(RETRIED) && !!token
        && (error.status === 401 || emptyDenied);
      if (!canRefresh) return throwError(() => error);
      return auth.refresh().pipe(
        switchMap((newToken) => next(request.clone({
          setHeaders: { Authorization: `Bearer ${newToken}` },
          context: request.context.set(RETRIED, true),
        }))),
        catchError((refreshError) => {
          auth.logout();
          return throwError(() => refreshError);
        }),
      );
    }),
  );
};
