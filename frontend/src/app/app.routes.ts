import { Routes } from '@angular/router';
import { authGuard, roleGuard } from './core/auth/auth.guard';
import { ShellComponent } from './core/layout/shell.component';

export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./features/auth/login.page').then(m => m.LoginPage) },
  {
    path: '',
    component: ShellComponent,
    canActivate: [authGuard],
    children: [
      { path: 'dashboard', loadComponent: () => import('./features/dashboard/dashboard.page').then(m => m.DashboardPage) },
      { path: 'tickets', loadComponent: () => import('./features/tickets/ticket-list.page').then(m => m.TicketListPage) },
      { path: 'tickets/new', canActivate: [roleGuard(['EMPLOYEE'])], loadComponent: () => import('./features/tickets/ticket-create.page').then(m => m.TicketCreatePage) },
      { path: 'tickets/:id', loadComponent: () => import('./features/tickets/ticket-detail.page').then(m => m.TicketDetailPage) },
      { path: 'account', loadComponent: () => import('./features/account/account.page').then(m => m.AccountPage) },
      { path: 'support', canActivate: [roleGuard(['EMPLOYEE', 'SUPPORT_AGENT'])], loadComponent: () => import('./features/support/staff-inbox.page').then(m => m.StaffInboxPage) },
      { path: 'admin/inbox', canActivate: [roleGuard(['ADMIN'])], loadComponent: () => import('./features/support/staff-inbox.page').then(m => m.StaffInboxPage) },
      { path: 'admin/users', canActivate: [roleGuard(['ADMIN'])], loadComponent: () => import('./features/admin/admin-users.page').then(m => m.AdminUsersPage) },
      { path: 'admin/automations', canActivate: [roleGuard(['ADMIN'])], loadComponent: () => import('./features/admin/admin.pages').then(m => m.AutomationPage) },
      { path: 'admin/audit', canActivate: [roleGuard(['ADMIN'])], loadComponent: () => import('./features/admin/admin.pages').then(m => m.AuditPage) },
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
    ],
  },
  { path: '**', redirectTo: 'dashboard' },
];
