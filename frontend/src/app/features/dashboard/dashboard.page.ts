import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterLink } from '@angular/router';
import { Subject, switchMap, takeUntil, timer } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { uiLabel } from '../../core/i18n/labels';
import { AgentArea, DashboardKpi } from '../../core/models/api.models';
import { HelpdeskService } from '../../core/services/helpdesk.service';
import { AdminOpsPanel } from './admin-ops.panel';

@Component({
  selector: 'app-dashboard',
  imports: [MatButtonModule, MatCardModule, MatIconModule, MatProgressSpinnerModule, RouterLink, AdminOpsPanel],
  template: `
    <header class="page-header"><div><h1>{{ greeting() }}</h1><p>{{ subtitle() }}</p></div>
      @if (auth.hasRole('EMPLOYEE')) {
        <a mat-flat-button routerLink="/tickets/new"><mat-icon>add</mat-icon>Nueva solicitud</a>
      } @else if (auth.hasRole('SUPPORT_AGENT')) {
        <a mat-flat-button routerLink="/support"><mat-icon>forum</mat-icon>Hablar con administración</a>
      } @else if (auth.hasRole('ADMIN')) {
        <a mat-flat-button routerLink="/tickets"><mat-icon>confirmation_number</mat-icon>Ver cola completa</a>
      }
    </header>
    @if (auth.hasRole('SUPPORT_AGENT') && auth.area(); as area) {
      <mat-card appearance="outlined" class="area-card">
        <div class="metric-icon green"><mat-icon>badge</mat-icon></div>
        <div>
          <p>TU CATEGORÍA</p>
          <strong>{{ areaTitle(area) }}</strong>
          <small>{{ scopeLine(area) }}</small>
        </div>
      </mat-card>
    }
    @if (loading() && !kpi()) { <div class="state"><mat-spinner diameter="38"/><p>Cargando indicadores del espacio de trabajo…</p></div> }
    @else if (error()) { <div class="state error"><mat-icon>cloud_off</mat-icon><h2>Panel no disponible</h2><p>{{error()}}</p><button mat-stroked-button (click)="load()">Reintentar</button></div> }
    @else if (kpi(); as data) {
      @if (!auth.hasRole('ADMIN')) {
        <section class="kpis">
          @for (item of cards(data); track item.label) {
            <a class="kpi-card" [routerLink]="['/tickets']" [queryParams]="item.query">
              <div class="metric-icon" [class]="item.tone"><mat-icon>{{item.icon}}</mat-icon></div>
              <div>
                <p>{{item.label}}</p>
                <strong>{{item.value}}</strong>
                <small>{{item.note}}</small>
              </div>
              <mat-icon class="go">chevron_right</mat-icon>
            </a>
          }
        </section>
      }
      @if (auth.hasRole('ADMIN')) {
        <app-admin-ops [data]="data"/>
      } @else {
        <section class="grid">
          <mat-card appearance="outlined" class="activity"><mat-card-header><mat-card-title>Pulso del equipo</mat-card-title></mat-card-header><mat-card-content>
            <div class="big-stat"><strong>{{data.total}}</strong><span>{{ auth.hasRole('SUPPORT_AGENT') ? 'Tickets en tu cola' : 'Tickets totales en este espacio' }}</span></div>
            <div class="bar"><span [style.width.%]="resolutionScore(data)"></span></div>
            <p>{{resolutionScore(data)}}% de los tickets dentro del SLA</p>
            @if (auth.hasRole('SUPPORT_AGENT')) {
              <p>{{ data.unassigned }} sin asignar en tu cola</p>
            }
          </mat-card-content></mat-card>
          <mat-card appearance="outlined" class="quick"><mat-card-header><mat-card-title>Acciones rápidas</mat-card-title></mat-card-header><mat-card-content>
            <a routerLink="/tickets"><mat-icon>list_alt</mat-icon><span><strong>{{ auth.hasRole('SUPPORT_AGENT') ? 'Ver tu cola' : 'Ver tickets' }}</strong><small>{{ auth.hasRole('SUPPORT_AGENT') ? 'Cola de trabajo' : 'Listado de tickets' }}</small></span><mat-icon>chevron_right</mat-icon></a>
            @if (auth.hasRole('EMPLOYEE')) {
              <a routerLink="/tickets/new"><mat-icon>add_circle_outline</mat-icon><span><strong>Crear solicitud</strong><small>Abrir ticket</small></span><mat-icon>chevron_right</mat-icon></a>
            } @else {
              <a routerLink="/support"><mat-icon>forum</mat-icon><span><strong>Hablar con administración</strong><small>Canal interno</small></span><mat-icon>chevron_right</mat-icon></a>
            }
          </mat-card-content></mat-card>
        </section>
      }
    }
  `,
  styles: [`
    .page-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px}.page-header h1{font-size:30px;margin:4px 0;color:var(--sf-heading)}.page-header p{margin:0;color:var(--sf-muted)}.page-header a{background:var(--sf-teal-deep);color:white}.area-card{display:flex;gap:15px;align-items:center;padding:18px 20px;margin-bottom:18px;border-color:var(--sf-teal-border)}.area-card p{margin:0;font-size:11px;letter-spacing:.12em;color:var(--sf-teal);font-weight:700}.area-card strong{display:block;font-size:20px;color:var(--sf-heading);margin:2px 0 4px}.area-card small{color:var(--sf-muted)}.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}.kpi-card{padding:20px;display:grid;grid-template-columns:46px 1fr 18px;gap:15px;align-items:center;border:1px solid var(--sf-border);border-radius:12px;background:var(--sf-surface);text-decoration:none;color:inherit;cursor:pointer;transition:transform .18s ease,box-shadow .18s ease}.kpi-card:hover{transform:translateY(-2px);box-shadow:0 8px 18px rgba(23,51,74,.08)}.kpi-card .go{color:var(--sf-faint)}.metric-icon{display:grid;place-items:center;width:46px;height:46px;border-radius:11px;background:var(--sf-icon-bg);color:var(--sf-icon-fg)}.metric-icon.green{background:#e4f5ed;color:#21845b}.metric-icon.amber{background:#fff2d9;color:#ac7413}.metric-icon.red{background:#fde8e8;color:#ba4141}.kpis p,.kpis small{margin:0;color:var(--sf-muted)}.kpis strong{display:block;font-size:27px;color:var(--sf-heading)}.kpis small{font-size:11px}.grid{display:grid;grid-template-columns:1.4fr 1fr;gap:18px;margin-top:18px}.grid mat-card{border-color:var(--sf-border);padding:8px}.big-stat{margin:28px 0 18px}.big-stat strong{font-size:38px;color:var(--sf-heading);display:block}.big-stat span,.activity p{color:var(--sf-muted)}.bar{height:8px;border-radius:5px;background:var(--sf-grid);margin:22px 0 8px;overflow:hidden}.bar span{display:block;height:100%;background:#20a194;border-radius:5px}.quick a{display:flex;align-items:center;gap:12px;text-decoration:none;color:var(--sf-heading);padding:18px 8px;border-bottom:1px solid var(--sf-line)}.quick a:last-child{border:0}.quick a>span{display:flex;flex-direction:column;flex:1}.quick small{color:var(--sf-muted)}.quick a>mat-icon:first-child{color:var(--sf-teal)}.insights{display:grid;grid-template-columns:repeat(2,1fr);gap:18px;margin-top:18px}.insights mat-card{border-color:var(--sf-border);padding:20px}.insights h2{margin:0 0 6px;font-size:16px;color:var(--sf-heading)}.insights p{margin:0 0 16px;color:var(--sf-muted);font-size:13px}.spark{display:flex;align-items:flex-end;gap:4px;height:120px}.spark span{flex:1;background:#20a194;border-radius:4px 4px 0 0;min-height:4px}.row{display:flex;justify-content:space-between;color:var(--sf-text);font-size:13px;margin-top:10px}.track{height:7px;background:var(--sf-grid);border-radius:5px;margin:5px 0 2px;overflow:hidden}.track i{display:block;height:100%;background:#20a194}.state{min-height:380px;display:grid;place-content:center;text-align:center;color:var(--sf-muted)}.state mat-spinner{margin:auto}.state>mat-icon{font-size:40px;width:40px;height:40px;margin:auto}.updated{display:flex;align-items:center;justify-content:flex-end;gap:5px;font-size:11px;color:var(--sf-faint)}.updated mat-icon{font-size:15px;width:15px;height:15px}@media(max-width:1050px){.kpis,.insights{grid-template-columns:repeat(2,1fr)}}@media(max-width:700px){.page-header{gap:18px}.page-header a{font-size:0}.page-header a mat-icon{margin:0}.kpis,.grid,.insights{grid-template-columns:1fr}}
  `],
})
export class DashboardPage implements OnInit, OnDestroy {
  readonly auth = inject(AuthService);
  private readonly api = inject(HelpdeskService);
  private readonly destroy$ = new Subject<void>();
  readonly kpi = signal<DashboardKpi | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly greeting = signal(new Date().getHours() < 12 ? 'Buenos días' : new Date().getHours() < 18 ? 'Buenas tardes' : 'Buenas noches');
  subtitle(): string {
    if (this.auth.hasRole('SUPPORT_AGENT')) return 'Tu cola y el estado de las solicitudes de tu categoría.';
    if (this.auth.hasRole('ADMIN')) return 'Estado actual de la mesa de soporte.';
    return 'Estado de tus solicitudes.';
  }

  ngOnInit(): void { this.load(); }
  load(): void {
    this.loading.set(true); this.error.set('');
    timer(0, 25_000).pipe(switchMap(() => this.api.dashboard()), takeUntil(this.destroy$)).subscribe({
      next: (data) => { this.kpi.set(data); this.loading.set(false); },
      error: (e) => { this.error.set(e.error?.detail ?? e.error?.message ?? 'No se pudo conectar con la API de la mesa de ayuda.'); this.loading.set(false); },
    });
  }
  cards(k: DashboardKpi) { return [
    { label: 'Tickets abiertos', value: k.open, icon: 'inbox', tone: '', note: this.auth.hasRole('SUPPORT_AGENT') ? `${k.unassigned} sin asignar en tu cola` : 'Pendientes de acción', query: { status: 'OPEN' } },
    { label: 'En progreso', value: k.inProgress, icon: 'person_pin', tone: 'green', note: 'En atención', query: { status: 'IN_PROGRESS' } },
    { label: 'En espera', value: k.waiting, icon: 'schedule', tone: 'amber', note: 'Esperando al solicitante', query: { status: 'WAITING_FOR_REQUESTER' } },
    { label: 'SLA en riesgo', value: k.breached, icon: 'warning_amber', tone: 'red', note: 'Requiere atención', query: { sla: 'BREACHED' } },
  ]; }
  areaTitle(area: AgentArea): string {
    return area.categories.length ? area.categories.map(value => uiLabel(value)).join(', ') : area.team;
  }
  scopeLine(area: AgentArea): string {
    return area.description || 'Atendiendo los tickets de tu categoría.';
  }
  resolutionScore(k: DashboardKpi): number { return Math.max(0, Math.min(100, 100 - Math.round((k.breached / Math.max(k.total, 1)) * 100))); }
  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }
}
