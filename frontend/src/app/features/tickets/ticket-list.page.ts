import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged, finalize, interval, skip, startWith } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { uiLabel } from '../../core/i18n/labels';
import { relativeTime } from '../../core/i18n/relative-time';
import { AgentArea, Page, Ticket, TicketFilters } from '../../core/models/api.models';
import { HelpdeskService } from '../../core/services/helpdesk.service';

type SortColumn = 'number' | 'status' | 'priority' | 'requester' | 'assignee' | 'updated';

@Component({
  selector: 'app-ticket-list',
  imports: [ReactiveFormsModule, RouterLink, MatButtonModule, MatCardModule, MatFormFieldModule, MatIconModule, MatInputModule, MatPaginatorModule, MatProgressSpinnerModule, MatSelectModule],
  template: `
    <header class="page-header"><div><p class="eyebrow">SOLICITUDES DE SERVICIO</p><h1>{{ auth.hasRole('SUPPORT_AGENT') ? 'Tu cola de trabajo' : 'Tickets' }}</h1><p>{{ subtitle() }}</p></div>
      @if (auth.hasRole('EMPLOYEE')) {
        <a mat-flat-button routerLink="/tickets/new"><mat-icon>add</mat-icon>Nuevo ticket</a>
      }
    </header>
    @if (auth.hasRole('SUPPORT_AGENT') && auth.area(); as area) {
      <mat-card appearance="outlined" class="area-card">
        <mat-icon>badge</mat-icon>
        <div>
          <p>Tu categoría</p>
          <strong>{{ areaTitle(area) }}</strong>
          <small>{{ scopeLine(area) }}</small>
        </div>
      </mat-card>
    }
    @if (extraFilter()) {
      <div class="focus">
        <mat-icon>filter_alt</mat-icon>
        <span>{{ extraFilter() }}</span>
        <button type="button" mat-stroked-button (click)="clearExtra()">Quitar filtro</button>
      </div>
    }
    <mat-card appearance="outlined" class="filters" [formGroup]="filters">
      <mat-form-field appearance="outline" class="search" subscriptSizing="dynamic">
        <mat-label>Buscar tickets</mat-label>
        <mat-icon matPrefix>search</mat-icon>
        <input matInput formControlName="query" placeholder="Asunto o ID del ticket">
      </mat-form-field>
      <div class="filter-row">
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Estado</mat-label>
          <mat-select formControlName="status">
            <mat-option value="">Todos los estados</mat-option>
            @for (s of statuses; track s) { <mat-option [value]="s">{{ label(s) }}</mat-option> }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Prioridad</mat-label>
          <mat-select formControlName="priority">
            <mat-option value="">Todas las prioridades</mat-option>
            @for (p of priorities; track p) { <mat-option [value]="p">{{ label(p) }}</mat-option> }
          </mat-select>
        </mat-form-field>
        <button mat-stroked-button type="button" (click)="clear()"><mat-icon>filter_alt_off</mat-icon>Limpiar</button>
      </div>
    </mat-card>
    <mat-card appearance="outlined" class="table-card">
      @if (loading() && !page()) { <div class="state"><mat-spinner diameter="36"/><p>Cargando tickets…</p></div> }
      @else if (error() && !page()) { <div class="state error"><mat-icon>error_outline</mat-icon><h2>No se pudieron cargar los tickets</h2><p>{{error()}}</p><button mat-stroked-button (click)="load(true)">Reintentar</button></div> }
      @else if (!page()?.content?.length) {
        <div class="state"><mat-icon>inbox</mat-icon>
          <h2>{{ auth.hasRole('SUPPORT_AGENT') ? 'No hay tickets en tu cola' : 'No se encontraron tickets' }}</h2>
          <p>{{ auth.hasRole('SUPPORT_AGENT') ? 'No hay tickets pendientes en este momento.' : 'No hay resultados con los filtros actuales.' }}</p>
          @if (auth.hasRole('EMPLOYEE')) { <a mat-stroked-button routerLink="/tickets/new">Crear ticket</a> }
        </div>
      }
      @else {
        <div class="table-wrap"><table>
          <thead>
            <tr>
              @for (col of columns; track col.key) {
                <th [attr.aria-sort]="ariaSort(col.key)">
                  <button type="button" class="sort" [class.active]="filters.controls.sort.value === col.key" (click)="sortBy(col.key)">
                    {{ col.label }}
                    <mat-icon>{{ sortIcon(col.key) }}</mat-icon>
                  </button>
                </th>
              }
            </tr>
          </thead>
          <tbody>
          @for (ticket of page()!.content; track ticket.id) {
            <tr [class.assigned]="isMine(ticket)" [routerLink]="['/tickets',ticket.id]" tabindex="0">
              <td><strong>{{ticket.number}}</strong><span>{{ticket.title}}</span></td>
              <td><span class="badge status" [attr.data-status]="ticket.status">{{label(ticket.status)}}</span></td>
              <td><span class="badge priority" [attr.data-priority]="ticket.priority"><i></i>{{label(ticket.priority)}}</span></td>
              <td>{{ticket.requester.displayName}}</td>
              <td>{{ticket.assignee?.displayName ?? 'Sin asignar / En cola'}}</td>
              <td>{{relative(ticket.updatedAt)}}</td>
            </tr>
          }
        </tbody></table></div>
        <div class="table-footer">
          <mat-paginator [length]="page()!.totalElements" [pageIndex]="page()!.page" [pageSize]="page()!.size" [pageSizeOptions]="[10,20,50]" (page)="paginate($event)"/>
        </div>
      }
    </mat-card>
  `,
  styles: [`
    .page-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:25px}.page-header h1{font-size:30px;margin:3px 0;color:var(--sf-heading)}.page-header p{margin:0;color:var(--sf-muted)}.eyebrow{font-size:11px!important;letter-spacing:.14em;color:var(--sf-teal)!important;font-weight:700}.page-header a{background:var(--sf-teal-deep);color:white}.area-card{display:flex;gap:14px;align-items:center;padding:16px 18px;margin-bottom:16px;border-color:var(--sf-teal-border)}.area-card>mat-icon{color:var(--sf-teal)}.area-card p{margin:0;font-size:11px;letter-spacing:.12em;color:var(--sf-teal);font-weight:700}.area-card strong{display:block;color:var(--sf-heading);margin:2px 0 3px}.area-card small{color:var(--sf-muted)}
    .focus{display:flex;align-items:center;gap:10px;margin-bottom:12px;padding:10px 14px;border-radius:10px;background:var(--sf-teal-bg);color:var(--sf-heading);font-size:13px}
    .focus span{flex:1}.focus mat-icon{color:var(--sf-teal)}
    .filters{padding:18px 18px 14px;margin-bottom:16px;border-color:var(--sf-border);display:flex;flex-direction:column;gap:12px}
    .filters .search{width:100%}
    .filter-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) auto;gap:12px;align-items:center}
    .filter-row mat-form-field{width:100%}
    .filter-row button{height:48px;color:var(--sf-text);border-color:var(--sf-border)}
    .table-card{overflow:hidden;border-color:var(--sf-border)}.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;text-align:left;min-width:850px}
    th{font-size:11px;letter-spacing:.08em;color:var(--sf-muted);background:var(--sf-surface-2);padding:8px 10px;border-bottom:1px solid var(--sf-border)}
    th .sort{display:inline-flex;align-items:center;gap:4px;background:none;border:0;padding:6px 8px;border-radius:6px;color:var(--sf-muted);font:inherit;letter-spacing:.08em;text-transform:uppercase;cursor:pointer}
    th .sort:hover{background:var(--sf-hover);color:var(--sf-heading)}
    th .sort mat-icon{font-size:16px;width:16px;height:16px;opacity:.45}
    th .sort.active mat-icon,th[aria-sort=ascending] mat-icon,th[aria-sort=descending] mat-icon{opacity:1;color:var(--sf-teal)}
    td{padding:16px 18px;border-bottom:1px solid var(--sf-line);color:var(--sf-text);font-size:13px}tr{cursor:pointer}tbody tr:hover{background:var(--sf-surface-2)}
    tbody tr.assigned{background:color-mix(in srgb,var(--sf-teal-bg) 70%,var(--sf-surface))}
    tbody tr.assigned td:first-child{box-shadow:inset 3px 0 0 var(--sf-teal)}
    tbody tr.assigned:hover{background:var(--sf-hover)}
    td:first-child strong,td:first-child span{display:block}td:first-child strong{font-size:11px;color:var(--sf-teal);margin-bottom:5px}.badge{display:inline-flex;align-items:center;padding:5px 9px;border-radius:20px;font-size:11px;font-weight:700;background:var(--sf-chip);color:var(--sf-chip-ink)}.status[data-status=OPEN]{background:#e4f0fa;color:#286d9e}.status[data-status=IN_PROGRESS]{background:#e7f4f0;color:#147565}.status[data-status=WAITING_FOR_REQUESTER],.status[data-status=PENDING]{background:#fff0d3;color:#986612}.status[data-status=RESOLVED],.status[data-status=CLOSED]{background:#e5f3e8;color:#347541}.status[data-status=CANCELLED]{background:#f3e8e8;color:#8a4545}.priority{background:transparent}.priority i{width:7px;height:7px;border-radius:50%;margin-right:7px;background:#74a49c}.priority[data-priority=CRITICAL] i,.priority[data-priority=URGENT] i{background:#d44545}.priority[data-priority=HIGH] i{background:#e58a36}.priority[data-priority=MEDIUM] i{background:#d7b52f}
    .table-footer{display:flex;align-items:center;justify-content:flex-end;gap:12px;padding-left:18px}
    .state{min-height:340px;display:grid;place-content:center;text-align:center;color:var(--sf-muted)}.state>mat-icon{font-size:42px;width:42px;height:42px;margin:auto}.state mat-spinner{margin:auto}.state h2{margin-bottom:0;color:var(--sf-heading)}
    @media(max-width:750px){.filter-row{grid-template-columns:1fr}.filter-row button{justify-self:start}.page-header a{font-size:0}.page-header a mat-icon{margin:0}.table-footer{flex-direction:column;align-items:flex-start;padding:8px 12px 0}}
  `],
})
export class TicketListPage implements OnInit {
  readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(HelpdeskService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  readonly sla = signal('');
  readonly unassignedOnly = signal(false);
  readonly activeOnly = signal(false);
  readonly assigneeId = signal('');
  readonly assigneeName = signal('');
  readonly loading = signal(true);
  readonly error = signal('');
  readonly page = signal<Page<Ticket> | null>(null);
  readonly now = signal(Date.now());
  readonly statuses = ['OPEN','IN_PROGRESS','WAITING_FOR_REQUESTER','RESOLVED','CLOSED','CANCELLED'];
  readonly priorities = ['LOW','MEDIUM','HIGH','CRITICAL'];
  readonly columns: { key: SortColumn; label: string }[] = [
    { key: 'number', label: 'Ticket' },
    { key: 'status', label: 'Estado' },
    { key: 'priority', label: 'Prioridad' },
    { key: 'requester', label: 'Solicitante' },
    { key: 'assignee', label: 'Asignado' },
    { key: 'updated', label: 'Actualizado' },
  ];
  readonly filters = this.fb.nonNullable.group({
    query: '', status: '', priority: '', page: 0, size: 20, sort: '', dir: '',
  });

  ngOnInit(): void {
    const q = this.route.snapshot.queryParamMap;
    this.filters.patchValue({
      query: q.get('query') ?? '',
      status: q.get('status') ?? '',
      priority: q.get('priority') ?? '',
    }, { emitEvent: false });
    this.sla.set(q.get('sla') ?? '');
    this.unassignedOnly.set(q.get('unassigned') === '1');
    this.activeOnly.set(q.get('active') === '1');
    this.assigneeId.set(q.get('assignee') ?? '');
    this.assigneeName.set(q.get('assigneeName') ?? '');
    this.filters.valueChanges.pipe(
      debounceTime(250),
      distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(() => this.load(true));
    this.load(true);
    interval(15_000).pipe(startWith(0), takeUntilDestroyed(this.destroyRef)).subscribe(() => this.now.set(Date.now()));
    interval(25_000).pipe(skip(1), takeUntilDestroyed(this.destroyRef)).subscribe(() => this.load(false));
  }

  load(showSpinner = false): void {
    if (showSpinner || !this.page()) this.loading.set(true);
    this.error.set('');
    this.api.tickets({
      ...this.filters.getRawValue() as TicketFilters,
      sla: this.sla() || undefined,
      unassigned: this.unassignedOnly() || undefined,
      active: this.activeOnly() || undefined,
      assignee: this.assigneeId() || undefined,
    }).pipe(
      finalize(() => this.loading.set(false)),
    ).subscribe({
      next: page => this.page.set(page),
      error: e => this.error.set(e.error?.message ?? 'La API de la mesa de ayuda no está disponible.'),
    });
  }

  paginate(e: PageEvent): void { this.filters.patchValue({ page: e.pageIndex, size: e.pageSize }); }

  clear(): void {
    this.sla.set('');
    this.unassignedOnly.set(false);
    this.activeOnly.set(false);
    this.assigneeId.set('');
    this.assigneeName.set('');
    this.filters.reset({ query: '', status: '', priority: '', page: 0, size: 20, sort: '', dir: '' });
  }
  extraFilter(): string {
    if (this.assigneeId()) return `Tickets abiertos de ${this.assigneeName() || 'este agente'}`;
    if (this.unassignedOnly()) return 'Mostrando solo tickets sin asignar';
    if (this.activeOnly()) return 'Mostrando la cola activa';
    if (this.sla() === 'BREACHED') return 'Mostrando tickets con SLA incumplido';
    if (this.sla() === 'AT_RISK') return 'Mostrando tickets que vencen en las próximas 8 horas';
    return '';
  }
  clearExtra(): void {
    this.sla.set('');
    this.unassignedOnly.set(false);
    this.activeOnly.set(false);
    this.assigneeId.set('');
    this.assigneeName.set('');
    this.load(true);
  }

  sortBy(column: SortColumn): void {
    const current = this.filters.controls.sort.value;
    const dir = this.filters.controls.dir.value;
    if (current !== column) this.filters.patchValue({ sort: column, dir: 'asc', page: 0 });
    else if (dir === 'asc') this.filters.patchValue({ sort: column, dir: 'desc', page: 0 });
    else this.filters.patchValue({ sort: '', dir: '', page: 0 });
  }

  sortIcon(column: SortColumn): string {
    if (this.filters.controls.sort.value !== column) return 'unfold_more';
    return this.filters.controls.dir.value === 'asc' ? 'arrow_upward' : 'arrow_downward';
  }

  ariaSort(column: SortColumn): 'ascending' | 'descending' | 'none' {
    if (this.filters.controls.sort.value !== column) return 'none';
    return this.filters.controls.dir.value === 'asc' ? 'ascending' : 'descending';
  }

  isMine(ticket: Ticket): boolean {
    return this.auth.hasRole('SUPPORT_AGENT') && ticket.assignee?.id === this.auth.user()?.id;
  }
  label(v: string): string { return uiLabel(v); }
  areaTitle(area: AgentArea): string {
    return area.categories.length ? area.categories.map(value => uiLabel(value)).join(', ') : area.team;
  }
  scopeLine(area: AgentArea): string {
    return area.description || 'Atendiendo los tickets de tu categoría.';
  }
  subtitle(): string {
    if (this.auth.hasRole('SUPPORT_AGENT')) return 'Tu cola y el estado de las solicitudes de tu categoría.';
    if (this.auth.hasRole('ADMIN')) return 'Cola de solicitudes de la mesa.';
    return 'Tus solicitudes de soporte.';
  }
  relative(value: string): string {
    this.now();
    return relativeTime(value, this.now());
  }
}
