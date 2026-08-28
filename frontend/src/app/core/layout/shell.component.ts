import { BreakpointObserver } from '@angular/cdk/layout';
import { Component, computed, DestroyRef, effect, HostListener, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { MatBadgeModule } from '@angular/material/badge';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { map, switchMap, timer } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { uiLabel } from '../i18n/labels';
import { overlayIsOpen, parentRoute } from '../keyboard';
import { relativeTime } from '../i18n/relative-time';
import { NotificationItem } from '../models/api.models';
import { HelpdeskService } from '../services/helpdesk.service';
import { CallOverlayComponent } from '../call/call-overlay.component';
import { RealtimeService } from '../realtime/realtime.service';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatBadgeModule, MatButtonModule, MatIconModule, MatMenuModule, MatSidenavModule, MatToolbarModule, CallOverlayComponent],
  template: `
    <mat-sidenav-container>
      <mat-sidenav
        class="nav"
        [mode]="mobile() ? 'over' : 'side'"
        [opened]="navOpen()"
        [disableClose]="!mobile()"
        (openedChange)="navOpen.set($event)">
        <div class="logo-row">
          <a class="logo" routerLink="/dashboard"><span><mat-icon>support_agent</mat-icon></span><strong>Soportia</strong></a>
          <button mat-icon-button type="button" class="nav-hide" (click)="navOpen.set(false)" aria-label="Ocultar menú">
            <mat-icon>chevron_left</mat-icon>
          </button>
        </div>
        <p class="nav-label">ESPACIO DE TRABAJO</p>
        <nav aria-label="Navegación principal">
          <a routerLink="/dashboard" routerLinkActive="active" (click)="onNavLink()"><mat-icon>space_dashboard</mat-icon>Panel</a>
          <a routerLink="/tickets" routerLinkActive="active" (click)="onNavLink()"><mat-icon>confirmation_number</mat-icon>Tickets</a>
          @if (auth.hasRole('EMPLOYEE')) {
            <a routerLink="/tickets/new" routerLinkActive="active" (click)="onNavLink()"><mat-icon>add_circle</mat-icon>Nueva solicitud</a>
          }
          @if (auth.hasRole('SUPPORT_AGENT')) {
            <a routerLink="/support" routerLinkActive="active" (click)="onNavLink()"><mat-icon>forum</mat-icon>Hablar con administración</a>
          }
          @if (auth.hasRole('ADMIN')) {
            <p class="nav-label">ADMINISTRACIÓN</p>
            <a routerLink="/admin/inbox" routerLinkActive="active" (click)="onNavLink()"><mat-icon>forum</mat-icon>Mensajes</a>
            <a routerLink="/admin/users" routerLinkActive="active" (click)="onNavLink()"><mat-icon>group</mat-icon>Personas</a>
            <a routerLink="/admin/automations" routerLinkActive="active" (click)="onNavLink()"><mat-icon>bolt</mat-icon>Centro de automatización</a>
            <a routerLink="/admin/audit" routerLinkActive="active" (click)="onNavLink()"><mat-icon>policy</mat-icon>Registro de auditoría</a>
          }
        </nav>
        <div class="nav-footer"><div class="status"><span></span> Todos los sistemas en funcionamiento</div></div>
      </mat-sidenav>
      <mat-sidenav-content>
        <mat-toolbar>
          <span class="spacer"></span>
          <button mat-icon-button class="bell" [class.has-unread]="unread()" [matMenuTriggerFor]="inbox"
            [matBadge]="unread() || null" matBadgeSize="small" aria-label="Notificaciones">
            <mat-icon>{{ unread() ? 'notifications' : 'notifications_none' }}</mat-icon>
          </button>
          <mat-menu #inbox="matMenu" class="sf-notif-menu" xPosition="before">
            <div class="notif-head" (click)="$event.stopPropagation()">
              <div class="notif-brand">
                <span class="notif-mark"><mat-icon>notifications</mat-icon></span>
                <div>
                  <strong>Notificaciones</strong>
                  <small>{{ unread() ? unread() + ' sin leer' : 'Al día' }}</small>
                </div>
              </div>
              @if (unread()) {
                <button type="button" class="notif-mark-all" (click)="markAll($event)">Marcar leídas</button>
              }
            </div>
            <div class="notif-list">
              @if (!notifications().length) {
                <div class="notif-empty">
                  <span class="blob"><mat-icon>notifications_off</mat-icon></span>
                  <strong>Sin notificaciones</strong>
                </div>
              }
              @for (item of notifications(); track item.id) {
                <div class="notif-item" [class.unread]="!item.readAt">
                  <button type="button" class="notif-open" (click)="openNotification(item)">
                    <span class="notif-icon" [attr.data-type]="item.type"><mat-icon>{{ notifIcon(item.type) }}</mat-icon></span>
                    <span class="notif-copy">
                      <strong>{{ item.title }}</strong>
                      @if (item.body) { <small>{{ item.body }}</small> }
                      <span class="notif-meta">
                        @if (item.ticketNumber) { <em>{{ item.ticketNumber }}</em> }
                        <time>{{ relativeTime(item.createdAt) }}</time>
                      </span>
                    </span>
                  </button>
                  <button type="button" class="notif-del" (click)="deleteNotification($event, item)" aria-label="Borrar notificación">
                    <mat-icon>close</mat-icon>
                  </button>
                </div>
              }
            </div>
          </mat-menu>
          <a class="profile" routerLink="/account" aria-label="Abrir cuenta">
            <span class="avatar">{{ initials() }}</span>
            <span><strong>{{ auth.user()?.displayName }}</strong><small>{{ profileLine() }}</small></span>
          </a>
          <button mat-icon-button (click)="auth.logout()" aria-label="Cerrar sesión"><mat-icon>logout</mat-icon></button>
        </mat-toolbar>
        <main class="content"><router-outlet /></main>
      </mat-sidenav-content>
    </mat-sidenav-container>
    @if (!navOpen()) {
      <button type="button" class="nav-notch" (click)="navOpen.set(true)" aria-label="Mostrar menú">
        <mat-icon>chevron_right</mat-icon>
      </button>
    }
    <app-call-overlay />
  `,
  styles: [`
    :host,mat-sidenav-container{display:block;height:100dvh}
    .nav{width:252px;background:#102f4d;color:#d5e1ec;border:0;padding-bottom:148px}
    .logo-row{display:flex;align-items:center;border-bottom:1px solid #ffffff12}
    .logo{flex:1;height:74px;display:flex;align-items:center;gap:12px;padding:0 8px 0 24px;color:white;text-decoration:none;font-size:18px;min-width:0}
    .logo span{display:grid;place-items:center;background:#1aa399;border-radius:9px;width:36px;height:36px;flex:0 0 36px}
    .nav-hide{color:#9fb3c5!important;margin-right:6px}
    .nav-hide:hover{color:white!important}
    .nav-label{font-size:10px;letter-spacing:.15em;color:#7f9ab2;margin:28px 25px 10px;font-weight:700}
    nav a{display:flex;align-items:center;gap:14px;margin:4px 12px;padding:12px;border-radius:8px;color:#c4d2df;text-decoration:none;font-size:14px;font-weight:500;transition:background .18s ease,color .16s ease,box-shadow .18s ease}
    nav a:hover{background:#ffffff0b}nav a.active{background:#1a496e;color:white;box-shadow:inset 3px 0 #4dd0bf}
    nav mat-icon{font-size:21px;width:21px;height:21px;line-height:21px}
    .nav-footer{position:absolute;bottom:0;width:100%;padding:16px 22px 68px;box-sizing:border-box;border-top:1px solid #ffffff12}
    .status{font-size:11px;color:#9fb3c5}
    .status span{display:inline-block;width:8px;height:8px;background:#4dd0a8;border-radius:50%;margin-right:8px;box-shadow:0 0 0 0 rgba(77,208,168,.5);animation:sf-live 2.6s ease-in-out infinite}
    mat-toolbar{height:74px;background:var(--sf-toolbar);border-bottom:1px solid var(--sf-border);padding:0 28px}
    .spacer{flex:1}
    .profile{display:flex;align-items:center;gap:10px;margin:0 8px 0 14px;padding:6px 0 6px 18px;border-left:1px solid var(--sf-border);color:inherit;text-decoration:none;border-radius:8px;transition:background .16s ease}
    .profile:hover{background:var(--sf-hover)}
    .profile>span:not(.avatar){display:flex;flex-direction:column;font-size:13px}
    .profile small{color:var(--sf-muted)}
    .avatar{display:grid;place-items:center;width:36px;height:36px;border-radius:50%;background:var(--sf-avatar-bg);color:var(--sf-avatar-fg);font-weight:700}
    .content{padding:32px;max-width:1500px;margin:auto;box-sizing:border-box}
    .nav-notch{
      position:fixed;left:0;top:50%;transform:translateY(-50%);z-index:35;
      display:grid;place-items:center;width:22px;height:64px;padding:0;border:0;
      border-radius:0 12px 12px 0;background:#102f4d;color:#7ee0d0;cursor:pointer;
      box-shadow:4px 0 16px rgba(10,24,36,.25);
    }
    .nav-notch:hover{width:28px;color:white;background:#163a5a}
    .nav-notch mat-icon{font-size:20px;width:20px;height:20px}
    @media(max-width:700px){.content{padding:20px 14px}.profile>span:not(.avatar){display:none}mat-toolbar{padding:0 10px}}
    @keyframes sf-live{0%,100%{box-shadow:0 0 0 0 rgba(77,208,168,.45)}70%{box-shadow:0 0 0 6px rgba(77,208,168,0)}}
    @keyframes sf-bell-glow{0%{box-shadow:0 0 0 0 rgba(26,163,153,.32)}70%{box-shadow:0 0 0 8px rgba(26,163,153,0)}}
    .bell{color:var(--sf-heading);border-radius:11px}
    .bell.has-unread{background:var(--sf-teal-bg);color:var(--sf-teal);animation:sf-bell-glow 2.4s ease-out infinite}
  `],
})
export class ShellComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly api = inject(HelpdeskService);
  private readonly realtime = inject(RealtimeService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly breakpoint = inject(BreakpointObserver);
  readonly mobile = toSignal(this.breakpoint.observe('(max-width: 800px)').pipe(map(x => x.matches)), { initialValue: false });
  readonly navOpen = signal(true);
  readonly initials = computed(() => (this.auth.user()?.displayName ?? 'U').split(' ').map(x => x[0]).join('').slice(0, 2).toUpperCase());
  readonly roleLabel = computed(() => ({ EMPLOYEE: 'Empleado', SUPPORT_AGENT: 'Agente de soporte', ADMIN: 'Administrador' })[this.auth.role() ?? 'EMPLOYEE']);
  readonly profileLine = computed(() => {
    if (this.auth.role() === 'ADMIN') return this.roleLabel();
    const area = this.auth.area();
    if (!area) return this.roleLabel();
    const category = area.categories[0] ? uiLabel(area.categories[0]) : area.team;
    return category ? `${this.roleLabel()} · ${category}` : this.roleLabel();
  });
  readonly notifications = signal<NotificationItem[]>([]);
  readonly unread = signal(0);
  readonly relativeTime = relativeTime;

  constructor() {
    effect(() => {
      this.navOpen.set(!this.mobile());
    });
  }

  ngOnInit(): void {
    this.auth.hydrateProfile();
    timer(0, 25_000).pipe(
      switchMap(() => this.api.notifications()),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: page => {
        this.notifications.set(page.content);
        this.unread.set(page.unread);
      },
    });
  }

  onNavLink(): void {
    if (this.mobile()) this.navOpen.set(false);
  }

  openNotification(item: NotificationItem): void {
    if (!item.readAt) {
      this.api.markNotificationRead(item.id).subscribe(() => {
        this.notifications.update(list => list.map(n => n.id === item.id ? { ...n, readAt: new Date().toISOString() } : n));
        this.unread.update(count => Math.max(0, count - 1));
      });
    }
    if (item.type === 'STAFF_MESSAGE') {
      void this.router.navigate(this.auth.hasRole('ADMIN') ? ['/admin/inbox'] : ['/support']);
      return;
    }
    if (item.ticketId) void this.router.navigate(['/tickets', item.ticketId]);
  }

  deleteNotification(event: Event, item: NotificationItem): void {
    event.stopPropagation();
    this.api.deleteNotification(item.id).subscribe(() => {
      this.notifications.update(list => list.filter(n => n.id !== item.id));
      if (!item.readAt) this.unread.update(count => Math.max(0, count - 1));
    });
  }

  markAll(event: Event): void {
    event.stopPropagation();
    this.api.markAllNotificationsRead().subscribe(() => {
      this.notifications.update(list => list.map(n => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
      this.unread.set(0);
    });
  }

  notifIcon(type: string): string {
    return ({
      TICKET_CREATED: 'inbox',
      TICKET_REPLY: 'chat_bubble',
      TICKET_ASSIGNED: 'person_add',
      TICKET_STATUS: 'sync_alt',
      STAFF_MESSAGE: 'forum',
    } as Record<string, string>)[type] ?? 'notifications';
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscape(event: Event): void {
    const keyEvent = event as KeyboardEvent;
    if (keyEvent.defaultPrevented || overlayIsOpen()) return;
    if (this.mobile() && this.navOpen()) {
      this.navOpen.set(false);
      keyEvent.preventDefault();
      return;
    }
    const target = parentRoute(this.router.url);
    if (!target) return;
    keyEvent.preventDefault();
    void this.router.navigateByUrl(target);
  }
}
