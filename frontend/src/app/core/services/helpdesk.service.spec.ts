import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { HelpdeskService } from './helpdesk.service';

describe('HelpdeskService', () => {
  let service: HelpdeskService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(HelpdeskService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('uses backend pagination fields and adapts flat ticket rows', () => {
    let resultTitle = '';
    service.tickets({ query: 'printer', status: 'OPEN', priority: '', page: 2, size: 20 })
      .subscribe(page => resultTitle = page.content[0].title);

    const request = http.expectOne(req =>
      req.url === '/api/v1/tickets' &&
      req.params.get('status') === 'OPEN' &&
      req.params.get('page') === '2' &&
      req.params.get('query') === 'printer' &&
      !req.params.has('priority'),
    );
    expect(request.request.method).toBe('GET');
    request.flush({
      content: [{
        id: '42', number: 'SUP-42', title: 'Printer offline', status: 'OPEN',
        priority: 'HIGH', requesterName: 'Demo Employee', assigneeName: null,
        createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', slaStatus: 'WITHIN_SLA',
      }],
      page: 2, size: 20, totalElements: 41, totalPages: 3,
    });
    expect(resultTitle).toBe('Printer offline');
  });

  it('posts transitions to the backend transition command', () => {
    service.transition('42', 'RESOLVED').subscribe();
    const request = http.expectOne('/api/v1/tickets/42/transition');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ status: 'RESOLVED' });
    request.flush(null);
  });

  it('sends the impact/urgency create contract', () => {
    service.createTicket({
      title: 'VPN unavailable',
      description: 'The VPN client cannot connect.',
      impact: 2,
      urgency: 3,
      categoryId: 'category-1',
    }).subscribe();

    const request = http.expectOne('/api/v1/tickets');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      title: 'VPN unavailable',
      description: 'The VPN client cannot connect.',
      impact: 2,
      urgency: 3,
      categoryId: 'category-1',
    });
    request.flush({
      id: '42', number: 'SUP-42', title: 'VPN unavailable', description: 'The VPN client cannot connect.',
      status: 'OPEN', priority: 'HIGH', impact: 2, urgency: 3, requester_id: 'user-1',
      requester_name: 'Demo Employee', created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z', comments: [], history: [], slaStatus: 'WITHIN_SLA',
    });
  });

  it('adapts dashboard grouped rows into KPI values', () => {
    let open = 0;
    service.dashboard().subscribe(kpi => open = kpi.open);
    const request = http.expectOne('/api/v1/dashboard');
    request.flush({
      byStatus: [{ status: 'OPEN', count: 3 }, { status: 'IN_PROGRESS', count: 2 }],
      byPriority: [{ priority: 'HIGH', count: 2 }],
      slaBreached: 1,
      unassigned: 2,
    });
    expect(open).toBe(3);
  });
});
