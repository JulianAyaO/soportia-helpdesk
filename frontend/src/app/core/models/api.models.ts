export type Role = 'EMPLOYEE' | 'SUPPORT_AGENT' | 'ADMIN';
export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'WAITING_FOR_REQUESTER' | 'RESOLVED' | 'CLOSED' | 'CANCELLED';
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type CommentVisibility = 'PUBLIC' | 'INTERNAL';

export interface AgentTeam {
  id: string;
  name: string;
  description?: string;
  categories?: string[];
}

export interface User {
  id: string;
  displayName: string;
  email: string;
  role: Role;
  teams?: AgentTeam[];
}

export interface AgentArea {
  team: string;
  description: string;
  categories: string[];
}

export interface AuthTokens {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user?: User;
}

export interface Page<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface Ticket {
  id: string;
  number: string;
  title: string;
  description: string;
  status: TicketStatus;
  priority: Priority;
  categoryId?: string;
  categoryName?: string;
  impact?: number;
  urgency?: number;
  requester: User;
  assignee?: User | null;
  createdAt: string;
  updatedAt: string;
  resolutionDueAt?: string;
  responseDueAt?: string;
  slaStatus?: 'WITHIN_SLA' | 'BREACHED' | 'STOPPED';
  comments?: TicketComment[];
  history?: TicketHistory[];
  attachments?: TicketAttachment[];
}

export interface TicketAttachment {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  commentId?: string;
  createdAt?: string;
}

export interface TicketComment {
  id: string;
  body: string;
  visibility: CommentVisibility;
  author: User;
  createdAt: string;
  attachments?: TicketAttachment[];
}

export interface TicketHistory {
  id?: string;
  eventType: string;
  oldValue?: string;
  newValue?: string;
  summary?: string;
  actor?: User;
  createdAt: string;
}

export interface TicketFilters {
  query?: string;
  status?: TicketStatus | '';
  priority?: Priority | '';
  assignee?: string;
  forUser?: string;
  unassigned?: boolean;
  sla?: string;
  active?: boolean;
  page?: number;
  size?: number;
  sort?: string;
  dir?: 'asc' | 'desc' | '';
}

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body?: string;
  ticketId?: string;
  ticketNumber?: string;
  readAt?: string | null;
  createdAt: string;
}

export interface NotificationPage {
  content: NotificationItem[];
  unread: number;
}

export interface AccountProfile {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  createdAt: string;
  teams: AgentTeam[];
  ticketTotal: number;
  ticketOpen: number;
}

export interface NamedCount {
  name: string;
  count: number;
}

export interface DayCount {
  day: string;
  count: number;
}

export interface AgentLoad {
  id: string;
  name: string;
  openCount: number;
  resolvedWeek: number;
}

export interface AttentionTicket {
  id: string;
  number: string;
  title: string;
  status: TicketStatus;
  priority: Priority;
  assigneeName?: string;
  categoryName?: string;
  dueAt?: string;
  slaStatus: 'BREACHED' | 'AT_RISK' | 'UNASSIGNED' | 'WITHIN_SLA';
}

export interface DashboardKpi {
  open: number;
  inProgress: number;
  waiting: number;
  breached: number;
  unassigned: number;
  total: number;
  resolved: number;
  closed: number;
  byPriority: Array<{ priority: Priority; count: number }>;
  byStatus?: NamedCount[];
  byTeam?: NamedCount[];
  byCategory?: NamedCount[];
  usersByRole?: NamedCount[];
  createdByDay?: DayCount[];
  resolvedByDay?: DayCount[];
  createdWeek?: number;
  resolvedWeek?: number;
  createdPrevWeek?: number;
  resolvedPrevWeek?: number;
  slaAtRisk?: number;
  avgResolutionHours?: number;
  avgFirstResponseHours?: number;
  byAgent?: AgentLoad[];
  attention?: AttentionTicket[];
}

export interface AutomationRule {
  id: string;
  name: string;
  enabled: boolean;
  eventType: string;
  conditions: Record<string, unknown>;
  actions: Record<string, unknown>;
  createdAt?: string;
  executions: number;
  successCount: number;
  errorCount: number;
  averageDurationMs: number;
  lastExecution?: string;
}

export interface AutomationExecution {
  id: string;
  status: string;
  result?: string;
  createdAt: string;
  ticketId?: string;
  ticketNumber?: string;
  ticketTitle?: string;
}

export interface AuditEvent {
  id: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  actorEmail?: string;
  actorName?: string;
  ticketNumber?: string;
  summary?: string;
  details?: Record<string, unknown> | string;
  createdAt: string;
}

export interface Category {
  id: string;
  name: string;
  description?: string;
  defaultTeamId?: string;
}

export interface StaffMessage {
  id: string;
  body: string;
  createdAt: string;
  authorId: string;
  authorName: string;
  authorRole: Role;
  ticketId?: string;
  ticketNumber?: string;
  ticketTitle?: string;
  attachments?: TicketAttachment[];
}

export interface StaffThread {
  id: string;
  displayName: string;
  role?: Role;
  lastAt?: string;
  preview?: string;
}

export interface ManagedUser {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  active: boolean;
  createdAt?: string;
  teamName?: string;
  teamId?: string;
  categoryName?: string;
  categoryId?: string;
}

export interface StaffInbox {
  agentId?: string;
  messages: StaffMessage[];
  threads?: StaffThread[];
}
