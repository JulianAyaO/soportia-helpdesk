import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { forkJoin, map, Observable, of, switchMap } from 'rxjs';
import {
  AccountProfile, AuditEvent, AutomationExecution, AutomationRule, Category, CommentVisibility, DashboardKpi, DayCount,
  ManagedUser, NamedCount, NotificationItem, NotificationPage, Page, Priority, Role, StaffInbox, StaffMessage,
  StaffThread, Ticket, TicketAttachment, TicketComment, TicketFilters, TicketHistory, TicketStatus, User,
} from '../models/api.models';

type Row = Record<string, unknown>;

@Injectable({ providedIn: 'root' })
export class HelpdeskService {
  private readonly http = inject(HttpClient);

  dashboard(): Observable<DashboardKpi> {
    return this.http.get<Row>('/api/v1/dashboard').pipe(map(raw => {
      const statuses = this.countMap(raw['byStatus']);
      const byPriority = this.rows(raw['byPriority']).map(row => ({
        priority: String(row['priority']) as Priority,
        count: Number(row['count']),
      }));
      return {
        open: statuses['OPEN'] ?? 0,
        inProgress: statuses['IN_PROGRESS'] ?? 0,
        waiting: statuses['WAITING_FOR_REQUESTER'] ?? 0,
        resolved: statuses['RESOLVED'] ?? 0,
        closed: statuses['CLOSED'] ?? 0,
        breached: Number(raw['slaBreached'] ?? 0),
        unassigned: Number(raw['unassigned'] ?? 0),
        total: Object.values(statuses).reduce((sum, count) => sum + count, 0),
        byPriority,
        byStatus: this.namedCounts(raw['byStatus'], 'status'),
        byTeam: this.namedCounts(raw['byTeam']),
        byCategory: this.namedCounts(raw['byCategory']),
        usersByRole: this.namedCounts(raw['usersByRole'], 'role'),
        createdByDay: this.dayCounts(raw['createdByDay']),
        resolvedByDay: this.dayCounts(raw['resolvedByDay']),
        createdWeek: Number(raw['createdWeek'] ?? 0),
        resolvedWeek: Number(raw['resolvedWeek'] ?? 0),
        createdPrevWeek: Number(raw['createdPrevWeek'] ?? 0),
        resolvedPrevWeek: Number(raw['resolvedPrevWeek'] ?? 0),
        slaAtRisk: Number(raw['slaAtRisk'] ?? 0),
        avgResolutionHours: Number(raw['avgResolutionHours'] ?? 0),
        avgFirstResponseHours: Number(raw['avgFirstResponseHours'] ?? 0),
        byAgent: this.rows(raw['byAgent']).map(row => ({
          id: String(row['id'] ?? ''),
          name: String(row['name'] ?? ''),
          openCount: Number(row['openCount'] ?? 0),
          resolvedWeek: Number(row['resolvedWeek'] ?? 0),
        })),
        attention: this.rows(raw['attention']).map(row => ({
          id: String(row['id']),
          number: String(row['number'] ?? ''),
          title: String(row['title'] ?? ''),
          status: String(row['status'] ?? 'OPEN') as Ticket['status'],
          priority: String(row['priority'] ?? 'MEDIUM') as Ticket['priority'],
          assigneeName: this.optional(row['assigneeName']),
          categoryName: this.optional(row['categoryName']),
          dueAt: this.optional(row['dueAt']),
          slaStatus: String(row['slaStatus'] ?? 'WITHIN_SLA') as NonNullable<DashboardKpi['attention']>[number]['slaStatus'],
        })),
      };
    }));
  }

  tickets(filters: TicketFilters): Observable<Page<Ticket>> {
    let params = new HttpParams()
      .set('page', String(filters.page ?? 0))
      .set('size', String(filters.size ?? 20));
    if (filters.status) params = params.set('status', filters.status);
    if (filters.priority) params = params.set('priority', filters.priority);
    if (filters.query) params = params.set('query', filters.query);
    if (filters.forUser) params = params.set('forUser', filters.forUser);
    if (filters.unassigned) params = params.set('unassigned', 'true');
    if (filters.active) params = params.set('active', 'true');
    if (filters.sla) params = params.set('sla', filters.sla);
    if (filters.assignee) params = params.set('assignee', filters.assignee);
    if (filters.sort) {
      params = params.set('sort', filters.sort);
      if (filters.dir) params = params.set('dir', filters.dir);
    }
    return this.http.get<Row>('/api/v1/tickets', { params }).pipe(map(raw => {
      const content = this.rows(raw['content']).map(row => this.adaptListTicket(row));
      return {
        content,
        page: Number(raw['page'] ?? 0),
        size: Number(raw['size'] ?? 20),
        totalElements: Number(raw['totalElements'] ?? 0),
        totalPages: Number(raw['totalPages'] ?? 0),
      };
    }));
  }

  ticket(id: string): Observable<Ticket> {
    return this.http.get<Row>(`/api/v1/tickets/${id}`).pipe(map(row => this.adaptDetailTicket(row)));
  }

  createTicket(payload: { title: string; description: string; impact: number; urgency: number; categoryId: string }, files: File[] = []): Observable<Ticket> {
    return this.http.post<Row>('/api/v1/tickets', payload).pipe(
      map(row => this.adaptDetailTicket(row)),
      switchMap(ticket => files.length
        ? forkJoin(files.map(file => this.uploadAttachment(ticket.id, file))).pipe(map(() => ticket))
        : of(ticket)),
    );
  }

  uploadAttachment(ticketId: string, file: File, commentId?: string): Observable<TicketAttachment> {
    const body = new FormData();
    body.append('file', file, file.name);
    let params = new HttpParams();
    if (commentId) params = params.set('commentId', commentId);
    return this.http.post<Row>(`/api/v1/tickets/${ticketId}/attachments`, body, { params }).pipe(map(row => this.adaptAttachment(row)));
  }

  downloadAttachment(ticketId: string, attachment: TicketAttachment): Observable<void> {
    return this.http.get(`/api/v1/tickets/${ticketId}/attachments/${attachment.id}`, { responseType: 'blob' }).pipe(
      map(blob => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = attachment.fileName;
        link.click();
        URL.revokeObjectURL(url);
      }),
    );
  }

  addComment(id: string, body: string, visibility: CommentVisibility, files: File[] = []): Observable<Row> {
    return this.http.post<Row>(`/api/v1/tickets/${id}/comments`, { body, visibility }).pipe(
      switchMap(row => files.length
        ? forkJoin(files.map(file => this.uploadAttachment(id, file, String(row['id'])))).pipe(map(() => row))
        : of(row)),
    );
  }

  take(id: string): Observable<void> {
    return this.http.post<void>(`/api/v1/tickets/${id}/take`, {});
  }

  assign(id: string, assigneeId: string): Observable<void> {
    return this.http.post<void>(`/api/v1/tickets/${id}/assign`, { assigneeId });
  }

  transition(id: string, status: TicketStatus): Observable<void> {
    return this.http.post<void>(`/api/v1/tickets/${id}/transition`, { status });
  }

  automationRules(): Observable<AutomationRule[]> {
    return this.http.get<Row[]>('/api/v1/automations').pipe(map(rows => rows.map(row => this.adaptAutomation(row))));
  }

  saveAutomation(rule: Partial<AutomationRule>): Observable<AutomationRule> {
    const payload = {
      name: rule.name,
      eventType: rule.eventType,
      enabled: rule.enabled ?? false,
      conditions: rule.conditions ?? {},
      actions: rule.actions ?? {},
    };
    const request = rule.id
      ? this.http.put<Row>(`/api/v1/automations/${rule.id}`, payload)
      : this.http.post<Row>('/api/v1/automations', payload);
    return request.pipe(map(row => this.adaptAutomation(row)));
  }

  audit(page = 0, size = 25, filters: { action?: string; query?: string } = {}): Observable<Page<AuditEvent>> {
    let params = new HttpParams().set('page', String(page)).set('size', String(size));
    if (filters.action) params = params.set('action', filters.action);
    if (filters.query) params = params.set('query', filters.query);
    return this.http.get<Row>('/api/v1/audit', { params }).pipe(map(raw => ({
      content: this.rows(raw['content']).map(row => ({
        id: String(row['id']),
        action: String(row['action']),
        resourceType: String(row['resourceType']),
        resourceId: row['resourceId'] ? String(row['resourceId']) : undefined,
        actorEmail: row['actorEmail'] ? String(row['actorEmail']) : undefined,
        actorName: this.optional(row['actorName']),
        ticketNumber: this.optional(row['ticketNumber']),
        summary: this.optional(row['summary']),
        details: row['details'] as AuditEvent['details'],
        createdAt: String(row['createdAt']),
      })),
      page: Number(raw['page'] ?? page),
      size: Number(raw['size'] ?? size),
      totalElements: Number(raw['totalElements'] ?? 0),
      totalPages: Math.ceil(Number(raw['totalElements'] ?? 0) / Number(raw['size'] ?? size)),
    })));
  }

  categories(): Observable<Category[]> {
    return this.http.get<Category[]>('/api/v1/catalog/categories');
  }

  teams(): Observable<Array<{ id: string; name: string; description?: string }>> {
    return this.http.get<Row[]>('/api/v1/catalog/teams').pipe(map(rows => rows.map(row => ({
      id: String(row['id']),
      name: String(row['name'] ?? ''),
      description: this.optional(row['description']),
    }))));
  }

  adminUsers(): Observable<ManagedUser[]> {
    return this.http.get<Row[]>('/api/v1/admin/users').pipe(map(rows => rows.map(row => this.adaptManagedUser(row))));
  }

  createUser(payload: { email: string; displayName: string; password: string; role: Role; categoryId?: string }): Observable<ManagedUser> {
    return this.http.post<Row>('/api/v1/admin/users', payload).pipe(map(row => this.adaptManagedUser(row)));
  }

  updateUser(id: string, payload: { active?: boolean; categoryId?: string }): Observable<void> {
    return this.http.patch<void>(`/api/v1/admin/users/${id}`, payload);
  }

  automationExecutions(id: string): Observable<AutomationExecution[]> {
    return this.http.get<Row[]>(`/api/v1/automations/${id}/executions`).pipe(map(rows => rows.map(row => ({
      id: String(row['id']),
      status: String(row['status'] ?? ''),
      result: this.optional(row['result']),
      createdAt: String(row['createdAt'] ?? ''),
      ticketId: this.optional(row['ticketId']),
      ticketNumber: this.optional(row['ticketNumber']),
      ticketTitle: this.optional(row['ticketTitle']),
    }))));
  }

  agents(): Observable<User[]> {
    return this.http.get<Row[]>('/api/v1/catalog/agents').pipe(map(rows => rows.map(row => ({
      id: String(row['id']),
      displayName: String(row['displayName'] ?? ''),
      email: String(row['email'] ?? ''),
      role: String(row['role'] ?? 'SUPPORT_AGENT') as Role,
      teams: row['categoryName'] ? [{ id: '', name: String(row['categoryName']) }] : [],
    }))));
  }

  staffInbox(agentId?: string): Observable<StaffInbox> {
    let params = new HttpParams();
    if (agentId) params = params.set('agentId', agentId);
    return this.http.get<Row>('/api/v1/staff-messages', { params }).pipe(map(raw => ({
      agentId: this.optional(raw['agentId']),
      messages: this.rows(raw['messages']).map(row => this.adaptStaffMessage(row)),
      threads: this.rows(raw['threads']).map(row => ({
        id: String(row['id']),
        displayName: String(row['displayName'] ?? ''),
        role: row['role'] ? String(row['role']) as Role : undefined,
        lastAt: this.optional(row['lastAt']),
        preview: this.optional(row['preview']),
      } as StaffThread)),
    })));
  }

  sendStaffMessage(body: string, agentId?: string, ticketId?: string, files: File[] = []): Observable<void> {
    return this.http.post<Row>('/api/v1/staff-messages', { body, agentId, ticketId }).pipe(
      switchMap(row => files.length
        ? forkJoin(files.map(file => this.uploadStaffAttachment(String(row['id']), file))).pipe(map(() => undefined))
        : of(undefined)),
    );
  }

  uploadStaffAttachment(messageId: string, file: File): Observable<TicketAttachment> {
    const body = new FormData();
    body.append('file', file, file.name);
    return this.http.post<Row>(`/api/v1/staff-messages/${messageId}/attachments`, body).pipe(map(row => this.adaptAttachment(row)));
  }

  downloadStaffAttachment(messageId: string, attachment: TicketAttachment): Observable<void> {
    return this.http.get(`/api/v1/staff-messages/${messageId}/attachments/${attachment.id}`, { responseType: 'blob' }).pipe(
      map(blob => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = attachment.fileName;
        link.click();
        URL.revokeObjectURL(url);
      }),
    );
  }

  account(): Observable<AccountProfile> {
    return this.http.get<Row>('/api/v1/account').pipe(map(row => ({
      id: String(row['id']),
      email: String(row['email'] ?? ''),
      displayName: String(row['displayName'] ?? ''),
      role: String(row['role'] ?? 'EMPLOYEE') as AccountProfile['role'],
      createdAt: String(row['createdAt'] ?? ''),
      teams: this.rows(row['teams']).map(team => ({
        id: String(team['id']),
        name: String(team['name'] ?? ''),
        description: this.optional(team['description']),
        categories: Array.isArray(team['categories']) ? team['categories'].map(value => String(value)) : [],
      })),
      ticketTotal: Number(row['ticketTotal'] ?? 0),
      ticketOpen: Number(row['ticketOpen'] ?? 0),
    })));
  }

  notifications(): Observable<NotificationPage> {
    return this.http.get<Row>('/api/v1/notifications').pipe(map(raw => ({
      unread: Number(raw['unread'] ?? 0),
      content: this.rows(raw['content']).map(row => this.adaptNotification(row)),
    })));
  }

  markNotificationRead(id: string): Observable<void> {
    return this.http.post<void>(`/api/v1/notifications/${id}/read`, {});
  }

  markAllNotificationsRead(): Observable<void> {
    return this.http.post<void>('/api/v1/notifications/read-all', {});
  }

  deleteNotification(id: string): Observable<void> {
    return this.http.delete<void>(`/api/v1/notifications/${id}`);
  }

  private adaptStaffMessage(row: Row): StaffMessage {
    return {
      id: String(row['id']),
      body: String(row['body'] ?? ''),
      createdAt: String(row['createdAt'] ?? ''),
      authorId: String(row['authorId'] ?? ''),
      authorName: String(row['authorName'] ?? 'Usuario'),
      authorRole: String(row['authorRole'] ?? 'SUPPORT_AGENT') as Role,
      ticketId: this.optional(row['ticketId']),
      ticketNumber: this.optional(row['ticketNumber']),
      ticketTitle: this.optional(row['ticketTitle']),
      attachments: this.rows(row['attachments']).map(item => this.adaptAttachment(item)),
    };
  }

  private adaptManagedUser(row: Row): ManagedUser {
    return {
      id: String(row['id']),
      email: String(row['email'] ?? ''),
      displayName: String(row['displayName'] ?? ''),
      role: String(row['role'] ?? 'EMPLOYEE') as Role,
      active: row['active'] !== false,
      createdAt: this.optional(row['createdAt']),
      teamName: this.optional(row['teamName']),
      teamId: this.optional(row['teamId']),
      categoryName: this.optional(row['categoryName']),
      categoryId: this.optional(row['categoryId']),
    };
  }

  private adaptNotification(row: Row): NotificationItem {
    return {
      id: String(row['id']),
      type: String(row['type'] ?? ''),
      title: String(row['title'] ?? ''),
      body: this.optional(row['body']),
      ticketId: this.optional(row['ticketId']),
      ticketNumber: this.optional(row['ticketNumber']),
      readAt: row['readAt'] == null ? null : String(row['readAt']),
      createdAt: String(row['createdAt'] ?? ''),
    };
  }

  private adaptListTicket(row: Row): Ticket {
    return {
      id: String(row['id']),
      number: String(row['number']),
      title: String(row['title']),
      description: '',
      status: String(row['status']) as TicketStatus,
      priority: String(row['priority']) as Priority,
      requester: this.user('', row['requesterName']),
      assignee: row['assigneeName'] ? this.user(this.optional(row['assigneeId']) ?? '', row['assigneeName']) : null,
      categoryName: this.optional(row['categoryName']),
      createdAt: String(row['createdAt']),
      updatedAt: String(row['updatedAt']),
      slaStatus: String(row['slaStatus']) as Ticket['slaStatus'],
    };
  }

  private adaptDetailTicket(row: Row): Ticket {
    const ticket: Ticket = {
      id: String(row['id']),
      number: String(row['number']),
      title: String(row['title']),
      description: String(row['description']),
      status: String(row['status']) as TicketStatus,
      priority: String(row['priority']) as Priority,
      impact: Number(row['impact']),
      urgency: Number(row['urgency']),
      categoryId: this.optional(row['category_id']),
      categoryName: this.optional(row['category_name']),
      requester: this.user(this.optional(row['requester_id']) ?? '', row['requester_name']),
      assignee: row['assignee_name'] ? this.user(this.optional(row['assignee_id']) ?? '', row['assignee_name']) : null,
      createdAt: String(row['created_at']),
      updatedAt: String(row['updated_at']),
      responseDueAt: this.optional(row['response_due_at']),
      resolutionDueAt: this.optional(row['resolution_due_at']),
      slaStatus: String(row['slaStatus']) as Ticket['slaStatus'],
      comments: this.rows(row['comments']).map(comment => this.adaptComment(comment)),
      history: this.rows(row['history']).map(history => this.adaptHistory(history)),
      attachments: this.rows(row['attachments']).map(item => this.adaptAttachment(item)),
    };
    const files = ticket.attachments ?? [];
    ticket.comments = (ticket.comments ?? []).map(comment => ({
      ...comment,
      attachments: files.filter(file => file.commentId === comment.id),
    }));
    ticket.attachments = files.filter(file => !file.commentId);
    return ticket;
  }

  private adaptAttachment(row: Row): TicketAttachment {
    return {
      id: String(row['id']),
      fileName: String(row['fileName'] ?? 'archivo'),
      contentType: String(row['contentType'] ?? 'application/octet-stream'),
      sizeBytes: Number(row['sizeBytes'] ?? 0),
      commentId: this.optional(row['commentId']),
      createdAt: this.optional(row['createdAt']),
    };
  }

  private adaptComment(row: Row): TicketComment {
    return {
      id: String(row['id']),
      body: String(row['body']),
      visibility: String(row['visibility']) as CommentVisibility,
      author: this.user(String(row['authorId'] ?? ''), row['authorName']),
      createdAt: String(row['createdAt']),
    };
  }

  private adaptHistory(row: Row): TicketHistory {
    return {
      eventType: String(row['eventType']),
      oldValue: this.optional(row['oldValue']),
      newValue: this.optional(row['newValue']),
      summary: this.optional(row['summary']),
      createdAt: String(row['createdAt']),
    };
  }

  private adaptAutomation(row: Row): AutomationRule {
    return {
      id: String(row['id']),
      name: String(row['name']),
      eventType: String(row['eventType'] ?? row['event_type']),
      enabled: Boolean(row['enabled']),
      conditions: this.json(row['conditions'] ?? row['conditions_json']),
      actions: this.json(row['actions'] ?? row['actions_json']),
      createdAt: this.optional(row['createdAt'] ?? row['created_at']),
      executions: Number(row['executions'] ?? 0),
      successCount: Number(row['successCount'] ?? 0),
      errorCount: Number(row['errorCount'] ?? 0),
      averageDurationMs: Number(row['averageDurationMs'] ?? 0),
      lastExecution: this.optional(row['lastExecution']),
    };
  }

  private user(id: string, name: unknown): User {
    return { id, displayName: String(name ?? 'Usuario desconocido'), email: '', role: 'EMPLOYEE' };
  }

  private rows(value: unknown): Row[] {
    return Array.isArray(value) ? value as Row[] : [];
  }

  private countMap(value: unknown): Record<string, number> {
    return Object.fromEntries(this.rows(value).map(row => [String(row['status']), Number(row['count'])]));
  }

  private dayCounts(value: unknown): DayCount[] {
    return this.rows(value).map(row => ({
      day: String(row['day']),
      count: Number(row['count'] ?? 0),
    }));
  }

  private namedCounts(value: unknown, nameKey = 'name'): NamedCount[] {
    return this.rows(value).map(row => ({
      name: String(row[nameKey] ?? row['name'] ?? ''),
      count: Number(row['count'] ?? 0),
    }));
  }

  private optional(value: unknown): string | undefined {
    return value === null || value === undefined ? undefined : String(value);
  }

  private json(value: unknown): Record<string, unknown> {
    if (typeof value === 'object' && value !== null) return value as Record<string, unknown>;
    try { return JSON.parse(String(value ?? '{}')) as Record<string, unknown>; } catch { return {}; }
  }
}
