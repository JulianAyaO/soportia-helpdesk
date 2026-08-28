import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let auth: AuthService;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  it('reads displayName and sends credentials on login', () => {
    let name = '';
    auth.login('employee@soportia.local', 'Demo123!').subscribe(user => name = user.displayName);

    const request = http.expectOne('/api/v1/auth/login');
    expect(request.request.withCredentials).toBe(true);
    request.flush({
      accessToken: 'access-token',
      tokenType: 'Bearer',
      expiresIn: 900,
      user: {
        id: 'user-1',
        email: 'employee@soportia.local',
        displayName: 'Demo Employee',
        role: 'EMPLOYEE',
      },
    });
    expect(name).toBe('Demo Employee');
  });

  it('refreshes with the HttpOnly cookie and an empty body', () => {
    auth.refresh().subscribe();
    const request = http.expectOne('/api/v1/auth/refresh');
    expect(request.request.withCredentials).toBe(true);
    expect(request.request.body).toEqual({});
    request.flush({
      accessToken: 'new-access-token',
      tokenType: 'Bearer',
      expiresIn: 900,
      user: {
        id: 'user-1',
        email: 'employee@soportia.local',
        displayName: 'Demo Employee',
        role: 'EMPLOYEE',
      },
    });
  });
});
