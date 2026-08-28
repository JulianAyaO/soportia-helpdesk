import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, map, Observable, tap, throwError } from 'rxjs';
import { AgentArea, AuthTokens, Role, User } from '../models/api.models';

const STORAGE_KEY = 'helpdesk.session';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly session = signal<AuthTokens | null>(this.readSession());

  readonly user = computed(() => this.session()?.user ?? this.userFromToken());
  readonly isAuthenticated = computed(() => !!this.session()?.accessToken);
  readonly role = computed(() => this.user()?.role);
  readonly area = computed<AgentArea | null>(() => {
    if (this.role() === 'ADMIN') return null;
    const teams = this.user()?.teams ?? [];
    if (!teams.length) return null;
    return {
      team: teams.map(team => team.name).join(' · '),
      description: teams.map(team => team.description).filter(Boolean).join(' · '),
      categories: teams.flatMap(team => team.categories ?? []),
    };
  });

  hydrateProfile(): void {
    if (!this.isAuthenticated()) return;
    this.http.get<User>('/api/v1/auth/me').subscribe({
      next: (user) => {
        const current = this.session();
        if (current) this.store({ ...current, user });
      },
    });
  }

  login(email: string, password: string): Observable<User> {
    return this.http.post<AuthTokens>('/api/v1/auth/login', { email, password }, { withCredentials: true }).pipe(
      tap((tokens) => this.store(tokens)),
      map(() => this.user()!),
    );
  }

  refresh(): Observable<string> {
    return this.http.post<AuthTokens>('/api/v1/auth/refresh', {}, { withCredentials: true }).pipe(
      tap((tokens) => this.store({ ...tokens, user: tokens.user ?? this.user() ?? undefined })),
      map((tokens) => tokens.accessToken),
      catchError((error) => {
        this.clear();
        return throwError(() => error);
      }),
    );
  }

  token(): string | null {
    return this.session()?.accessToken ?? null;
  }

  hasRole(...roles: Role[]): boolean {
    const role = this.role();
    return !!role && roles.includes(role);
  }

  logout(): void {
    this.http.post<void>('/api/v1/auth/logout', {}, { withCredentials: true }).subscribe();
    this.clear();
    void this.router.navigate(['/login']);
  }

  private store(tokens: AuthTokens): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
    this.session.set(tokens);
  }

  private clear(): void {
    localStorage.removeItem(STORAGE_KEY);
    this.session.set(null);
  }

  private readSession(): AuthTokens | null {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as AuthTokens | null;
    } catch {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
  }

  private userFromToken(): User | null {
    const token = this.session()?.accessToken;
    if (!token) return null;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return {
        id: String(payload.sub ?? payload.userId ?? ''),
        email: payload.email ?? payload.sub ?? '',
        displayName: payload.displayName ?? payload.name ?? payload.email ?? 'Usuario',
        role: (payload.role ?? payload.roles?.[0] ?? 'EMPLOYEE').replace('ROLE_', '') as Role,
      };
    } catch {
      return null;
    }
  }
}
