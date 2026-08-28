import { Component, Input, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { uiLabel } from '../../core/i18n/labels';
import { relativeTime } from '../../core/i18n/relative-time';
import { AgentLoad, AttentionTicket, DashboardKpi, DayCount, NamedCount, Priority } from '../../core/models/api.models';

interface KpiCard {
  label: string;
  value: number;
  note: string;
  icon: string;
  tone: string;
  link: string[];
  query?: Record<string, string>;
  delta?: number | null;
}

interface VolumePoint {
  day: string;
  label: string;
  created: number;
  resolved: number;
}

interface Slice {
  key: string;
  label: string;
  count: number;
  color: string;
  dash: string;
  offset: number;
}

@Component({
  selector: 'app-admin-ops',
  imports: [MatIconModule, RouterLink],
  template: `
    <section class="ops">
      <div class="ops-head">
        <div>
          <h2>Actividad de la mesa</h2>
          <p>Entrada de tickets, plazos y carga de cada agente.</p>
        </div>
        <div class="range" role="group" aria-label="Periodo del gráfico">
          <button type="button" [class.on]="range()===7" (click)="range.set(7)">7 días</button>
          <button type="button" [class.on]="range()===14" (click)="range.set(14)">14 días</button>
        </div>
      </div>

      <div class="kpis">
        @for (card of cards(); track card.label; let i = $index) {
          <a class="kpi" [class]="card.tone" [style.animation-delay.ms]="i*60" [routerLink]="card.link" [queryParams]="card.query">
            <div class="kpi-icon"><mat-icon>{{ card.icon }}</mat-icon></div>
            <div class="kpi-copy">
              <span>{{ card.label }}</span>
              <strong>{{ card.value }}</strong>
              <small>
                {{ card.note }}
                @if (card.delta != null) {
                  <em [class.up]="card.delta>0" [class.down]="card.delta<0">{{ card.delta>0 ? '+' : '' }}{{ card.delta }}% vs semana previa</em>
                }
              </small>
            </div>
            <mat-icon class="go">chevron_right</mat-icon>
          </a>
        }
      </div>

      <div class="times">
        <article>
          <mat-icon>timer</mat-icon>
          <div><b>{{ hours(data.avgFirstResponseHours) }}</b><span>Primera respuesta (14 días)</span></div>
        </article>
        <article>
          <mat-icon>task_alt</mat-icon>
          <div><b>{{ hours(data.avgResolutionHours) }}</b><span>Tiempo medio de resolución</span></div>
        </article>
        <article>
          <mat-icon>verified</mat-icon>
          <div><b>{{ slaHealth() }}%</b><span>Tickets dentro de plazo</span></div>
        </article>
      </div>

      <div class="main">
        <article class="card chart-card">
          <header>
            <div>
              <h3>Entrada frente a resolución</h3>
              <p>{{ createdInRange() }} nuevos · {{ resolvedInRange() }} resueltos en {{ range() }} días</p>
            </div>
            <div class="legend">
              <i class="c"></i> Nuevos
              <i class="r"></i> Resueltos
            </div>
          </header>
          <div class="chart" (mouseleave)="hover.set(null)">
            <svg viewBox="0 0 640 210" role="img" aria-label="Tickets creados y resueltos por día">
              @for (line of gridLines(); track line) {
                <line [attr.x1]="36" [attr.x2]="628" [attr.y1]="line" [attr.y2]="line" class="grid"/>
              }
              @for (point of volume(); track point.day; let i = $index) {
                <rect class="bar created" [attr.x]="barX(i)" [attr.y]="barY(point.created)" [attr.width]="barW()"
                  [attr.height]="barH(point.created)" rx="3" (mouseenter)="hover.set(point)"/>
                <rect class="bar resolved" [attr.x]="barX(i)+barW()+3" [attr.y]="barY(point.resolved)" [attr.width]="barW()"
                  [attr.height]="barH(point.resolved)" rx="3" (mouseenter)="hover.set(point)"/>
                @if (i % labelStep() === 0) {
                  <text [attr.x]="barX(i)+barW()" [attr.y]="202" class="tick">{{ point.label }}</text>
                }
              }
            </svg>
            @if (hover(); as point) {
              <div class="tip" [style.left.%]="tipLeft(point)">
                <strong>{{ point.label }}</strong>
                <span>{{ point.created }} nuevos</span>
                <span>{{ point.resolved }} resueltos</span>
              </div>
            }
          </div>
        </article>

        <article class="card donut-card">
          <header>
            <div>
              <h3>Estado de la cola</h3>
              <p>{{ backlog() }} tickets activos</p>
            </div>
          </header>
          <div class="donut-wrap">
            <div class="donut-box">
              <svg viewBox="0 0 140 140" class="donut">
                <circle cx="70" cy="70" r="52" class="track"/>
                @for (slice of slices(); track slice.key) {
                  <circle cx="70" cy="70" r="52" class="seg" [attr.stroke]="slice.color"
                    [attr.stroke-dasharray]="slice.dash" [attr.stroke-dashoffset]="slice.offset"/>
                }
              </svg>
              <div class="donut-center"><strong>{{ backlog() }}</strong><small>activos</small></div>
            </div>
            <div class="slice-list">
              @for (slice of slices(); track slice.key) {
                <a [routerLink]="['/tickets']" [queryParams]="{ status: slice.key }">
                  <i [style.background]="slice.color"></i>
                  <span>{{ slice.label }}</span>
                  <b>{{ slice.count }}</b>
                </a>
              }
            </div>
          </div>
        </article>
      </div>

      <div class="split">
        <article class="card">
          <header>
            <div>
              <h3>Carga de agentes</h3>
              <p>Tickets abiertos por agente</p>
            </div>
          </header>
          @if (!agents().length) {
            <p class="empty">No hay agentes activos.</p>
          } @else {
            <div class="agents">
              @for (agent of agents(); track agent.id) {
                <a class="agent" [routerLink]="['/tickets']" [queryParams]="{ assignee: agent.id, assigneeName: agent.name }">
                  <div class="agent-top">
                    <strong>{{ agent.name }}</strong>
                    <span>{{ agent.openCount }} abiertos · {{ agent.resolvedWeek }} resueltos</span>
                  </div>
                  <div class="track"><i [style.width.%]="loadPct(agent)"></i></div>
                </a>
              }
            </div>
          }
        </article>

        <article class="card">
          <header>
            <div>
              <h3>Por categoría y prioridad</h3>
              <p>Distribución de la cola</p>
            </div>
          </header>
          <div class="mix">
            <div>
              @for (item of data.byCategory ?? []; track item.name) {
                <a class="mix-row" [routerLink]="['/tickets']" [queryParams]="{ query: item.name }">
                  <span>{{ item.name }}</span><b>{{ item.count }}</b>
                </a>
                <div class="track"><i [style.width.%]="pct(data.byCategory, item.count)"></i></div>
              }
            </div>
            <div>
              @for (item of priorities(); track item.name) {
                <a class="mix-row" [routerLink]="['/tickets']" [queryParams]="{ priority: item.key }">
                  <span>{{ item.name }}</span><b>{{ item.count }}</b>
                </a>
                <div class="track"><i [class]="'p-'+item.key" [style.width.%]="pct(priorities(), item.count)"></i></div>
              }
            </div>
          </div>
        </article>
      </div>

      <div class="split">
        <article class="card">
          <header>
            <div>
              <h3>Necesitan atención</h3>
              <p>Vencidos, sin dueño o a punto de incumplir</p>
            </div>
            <a routerLink="/tickets" class="more">Ver todos</a>
          </header>
          @if (!data.attention?.length) {
            <p class="empty">La cola está al día. No hay tickets urgentes.</p>
          } @else {
            <div class="attn">
              @for (ticket of data.attention; track ticket.id) {
                <a [routerLink]="['/tickets', ticket.id]">
                  <span class="num">{{ ticket.number }}</span>
                  <span class="ttl">{{ ticket.title }}</span>
                  <span class="meta">{{ ticket.assigneeName || 'Sin asignar' }}@if (ticket.categoryName) { · {{ ticket.categoryName }} }</span>
                  <em [attr.data-sla]="ticket.slaStatus">{{ slaText(ticket) }}</em>
                </a>
              }
            </div>
          }
        </article>

        <article class="card">
          <header>
            <div>
              <h3>Personas y atajos</h3>
              <p>Cuentas activas y siguientes pasos</p>
            </div>
          </header>
          <div class="roles">
            @for (role of data.usersByRole ?? []; track role.name) {
              <div class="role">
                <strong>{{ role.count }}</strong>
                <span>{{ label(role.name) }}</span>
              </div>
            }
          </div>
          <div class="shortcuts">
            <a routerLink="/admin/inbox"><mat-icon>forum</mat-icon>Mensajes</a>
            <a routerLink="/admin/users"><mat-icon>group</mat-icon>Personas</a>
            <a routerLink="/admin/automations"><mat-icon>bolt</mat-icon>Automatización</a>
            <a routerLink="/admin/audit"><mat-icon>policy</mat-icon>Auditoría</a>
          </div>
        </article>
      </div>
    </section>
  `,
  styles: [`
    .ops{display:flex;flex-direction:column;gap:18px;animation:rise .45s ease}
    @keyframes rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
    .ops-head{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap}
    .ops-head h2{margin:0;font-size:18px;color:var(--sf-heading)}.ops-head p{margin:4px 0 0;color:var(--sf-muted);font-size:13px}
    .range{display:flex;background:var(--sf-chip);border-radius:10px;padding:3px}
    .range button{border:0;background:transparent;color:var(--sf-chip-ink);padding:7px 12px;border-radius:8px;cursor:pointer;font-size:12px;font-weight:700}
    .range button.on{background:var(--sf-surface);color:var(--sf-teal);box-shadow:0 1px 3px rgba(20,40,60,.08)}
    .kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
    .kpi{display:grid;grid-template-columns:46px 1fr 18px;gap:12px;align-items:center;padding:16px 16px 16px 14px;border:1px solid var(--sf-border);border-radius:14px;background:var(--sf-surface);text-decoration:none;color:inherit;animation:rise .45s ease both;transition:transform .18s ease,box-shadow .18s ease}
    .kpi:hover{transform:translateY(-3px);box-shadow:0 10px 24px rgba(23,51,74,.08)}
    .kpi-icon{width:46px;height:46px;border-radius:12px;display:grid;place-items:center;background:var(--sf-icon-bg);color:var(--sf-icon-fg)}
    .kpi.green .kpi-icon{background:#e4f5ed;color:#21845b}.kpi.amber .kpi-icon{background:#fff2d9;color:#ac7413}.kpi.red .kpi-icon{background:#fde8e8;color:#ba4141}.kpi.teal .kpi-icon{background:var(--sf-teal-bg);color:var(--sf-teal)}
    .kpi-copy span{display:block;font-size:11px;color:var(--sf-muted);letter-spacing:.04em;text-transform:uppercase;font-weight:700}
    .kpi-copy strong{display:block;font-size:28px;color:var(--sf-heading);line-height:1.15;margin:2px 0}
    .kpi-copy small{color:var(--sf-muted);font-size:11px;display:flex;flex-direction:column;gap:2px}
    .kpi-copy em{font-style:normal;font-weight:700}.kpi-copy em.up{color:#21845b}.kpi-copy em.down{color:#ba4141}
    .kpi .go{color:var(--sf-faint)}
    .times{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
    .times article{display:flex;gap:12px;align-items:center;padding:14px 16px;border:1px solid var(--sf-border);border-radius:12px;background:var(--sf-surface-2)}
    .times mat-icon{color:var(--sf-teal)}.times b{display:block;color:var(--sf-heading);font-size:18px}.times span{color:var(--sf-muted);font-size:12px}
    .card{border:1px solid var(--sf-border);border-radius:14px;background:var(--sf-surface);padding:18px 20px}
    .card header{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:14px}
    .card h3{margin:0;font-size:16px;color:var(--sf-heading)}.card header p{margin:4px 0 0;color:var(--sf-muted);font-size:12px}
    .more{font-size:12px;color:var(--sf-teal);text-decoration:none;font-weight:700}
    .main,.split{display:grid;grid-template-columns:1.45fr 1fr;gap:16px}
    .legend{display:flex;align-items:center;gap:8px;font-size:11px;color:var(--sf-muted)}
    .legend i{width:9px;height:9px;border-radius:3px;display:inline-block}.legend i.c{background:#20a194}.legend i.r{background:#7ea0b8}
    .chart{position:relative;height:220px}
    .chart svg{width:100%;height:100%}
    .grid{stroke:var(--sf-grid);stroke-width:1}
    .bar{transition:height .45s ease,y .45s ease,opacity .15s}
    .bar.created{fill:#20a194}.bar.resolved{fill:#7ea0b8}
    .bar:hover{opacity:.8}
    .tick{fill:var(--sf-faint);font-size:10px;text-anchor:middle}
    .tip{position:absolute;top:8px;transform:translateX(-50%);background:#102f4d;color:#fff;padding:8px 10px;border-radius:8px;font-size:11px;pointer-events:none;min-width:110px}
    .tip strong,.tip span{display:block}.tip strong{margin-bottom:3px}
    .donut-wrap{display:flex;gap:16px;align-items:center}
    .donut-box{position:relative;width:150px;height:150px}
    .donut{width:150px;height:150px;transform:rotate(-90deg)}
    .donut .track{fill:none;stroke:var(--sf-grid);stroke-width:14}
    .donut .seg{fill:none;stroke-width:14;stroke-linecap:butt;animation:draw .7s ease both}
    @keyframes draw{from{stroke-dashoffset:327}}
    .donut-center{position:absolute;inset:0;display:grid;place-content:center;text-align:center;pointer-events:none}
    .donut-center strong{font-size:22px;color:var(--sf-heading);line-height:1}.donut-center small{color:var(--sf-muted);font-size:10px}
    .slice-list{flex:1;display:flex;flex-direction:column;gap:6px}
    .slice-list a{display:grid;grid-template-columns:10px 1fr auto;gap:8px;align-items:center;text-decoration:none;color:var(--sf-text);font-size:13px;padding:6px 4px;border-radius:8px}
    .slice-list a:hover{background:var(--sf-hover)}.slice-list i{width:10px;height:10px;border-radius:50%}
    .agents{display:flex;flex-direction:column;gap:8px}
    .agent{display:block;text-decoration:none;padding:8px;margin:0 -8px;border-radius:10px}
    .agent:hover{background:var(--sf-hover)}
    .agent-top{display:flex;justify-content:space-between;gap:8px;font-size:13px;color:var(--sf-heading)}
    .agent-top span{color:var(--sf-muted);font-size:12px}
    .track{height:8px;background:var(--sf-grid);border-radius:6px;overflow:hidden;margin-top:6px}
    .track i{display:block;height:100%;background:#20a194;border-radius:6px;transition:width .5s ease}
    .track i.p-CRITICAL{background:#d44545}.track i.p-HIGH{background:#e58a36}.track i.p-MEDIUM{background:#d7b52f}.track i.p-LOW{background:#74a49c}
    .mix{display:grid;grid-template-columns:1fr 1fr;gap:18px}
    .mix-row{display:flex;justify-content:space-between;color:var(--sf-text);font-size:13px;text-decoration:none;margin-top:10px}
    .attn{display:flex;flex-direction:column}
    .attn a{display:grid;grid-template-columns:86px 1fr auto;grid-template-rows:auto auto;gap:2px 10px;padding:11px 4px;border-top:1px solid var(--sf-line);text-decoration:none;color:inherit}
    .attn a:hover{background:var(--sf-surface-2)}.num{color:var(--sf-teal);font-size:11px;font-weight:700}.ttl{color:var(--sf-heading);font-size:13px;font-weight:600}
    .meta{grid-column:2;color:var(--sf-muted);font-size:11px}.attn em{grid-row:1/3;grid-column:3;align-self:center;font-style:normal;font-size:10px;font-weight:700;border-radius:10px;padding:3px 7px;background:var(--sf-chip);color:var(--sf-chip-ink);white-space:nowrap}
    .attn em[data-sla=BREACHED]{background:#fde8e8;color:#ba4141}.attn em[data-sla=AT_RISK]{background:#fff2d9;color:#ac7413}.attn em[data-sla=UNASSIGNED]{background:var(--sf-icon-bg);color:var(--sf-icon-fg)}
    .roles{display:flex;gap:10px;margin-bottom:16px}
    .role{flex:1;background:var(--sf-surface-2);border-radius:10px;padding:12px;text-align:center}.role strong{display:block;font-size:22px;color:var(--sf-heading)}.role span{font-size:11px;color:var(--sf-muted)}
    .shortcuts{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    .shortcuts a{display:flex;align-items:center;gap:8px;padding:10px;border:1px solid var(--sf-border);border-radius:10px;text-decoration:none;color:var(--sf-heading);font-size:13px}
    .shortcuts a:hover{background:var(--sf-teal-bg);border-color:var(--sf-teal-border)}.shortcuts mat-icon{color:var(--sf-teal);font-size:18px;width:18px;height:18px}
    .empty{color:var(--sf-muted);font-size:13px}
    @media(max-width:1100px){.kpis,.main,.split,.times,.mix{grid-template-columns:1fr}}
    @media(max-width:700px){.kpis{grid-template-columns:1fr}.attn a{grid-template-columns:1fr;grid-template-rows:auto}.attn em{grid-column:1;grid-row:auto;justify-self:start;margin-top:4px}}
  `],
})
export class AdminOpsPanel {
  @Input({ required: true }) data!: DashboardKpi;
  readonly range = signal<7 | 14>(14);
  readonly hover = signal<VolumePoint | null>(null);
  private readonly colors: Record<string, string> = {
    OPEN: '#3b82c4', IN_PROGRESS: '#20a194', WAITING_FOR_REQUESTER: '#e0a030',
    RESOLVED: '#5a9a68', CLOSED: 'var(--sf-faint)', CANCELLED: '#c07a7a',
  };

  cards(): KpiCard[] {
    const d = this.data;
    return [
      { label: 'Cola activa', value: this.backlog(), note: 'Abiertos, en curso y en espera', icon: 'inbox', tone: '', link: ['/tickets'], query: { active: '1' } },
      { label: 'Sin asignar', value: d.unassigned, note: 'Siguen en cola de categoría', icon: 'person_off', tone: 'amber', link: ['/tickets'], query: { unassigned: '1' } },
      { label: 'SLA incumplido', value: d.breached, note: 'Ya pasaron la fecha límite', icon: 'warning_amber', tone: 'red', link: ['/tickets'], query: { sla: 'BREACHED' } },
      { label: 'Por vencer', value: d.slaAtRisk ?? 0, note: 'Plazo en las próximas 8 horas', icon: 'hourglass_bottom', tone: 'amber', link: ['/tickets'], query: { sla: 'AT_RISK' } },
      { label: 'Nuevos (7 días)', value: d.createdWeek ?? 0, note: 'Tickets que entraron esta semana', icon: 'south_west', tone: 'teal', link: ['/tickets'], delta: this.delta(d.createdWeek, d.createdPrevWeek) },
      { label: 'Resueltos (7 días)', value: d.resolvedWeek ?? 0, note: 'Cerrados con resolución', icon: 'done_all', tone: 'green', link: ['/tickets'], query: { status: 'RESOLVED' }, delta: this.delta(d.resolvedWeek, d.resolvedPrevWeek) },
    ];
  }

  volume(): VolumePoint[] {
    const created = this.slice(this.data.createdByDay ?? []);
    const resolved = new Map(this.slice(this.data.resolvedByDay ?? []).map(point => [point.day, point.count]));
    return created.map(point => ({
      day: point.day,
      label: this.dayLabel(point.day),
      created: point.count,
      resolved: resolved.get(point.day) ?? 0,
    }));
  }
  createdInRange(): number { return this.volume().reduce((sum, point) => sum + point.created, 0); }
  resolvedInRange(): number { return this.volume().reduce((sum, point) => sum + point.resolved, 0); }
  backlog(): number { return this.data.open + this.data.inProgress + this.data.waiting; }
  slaHealth(): number {
    return Math.max(0, Math.min(100, 100 - Math.round((this.data.breached / Math.max(this.backlog() || this.data.total, 1)) * 100)));
  }
  agents(): AgentLoad[] { return this.data.byAgent ?? []; }
  priorities(): Array<NamedCount & { key: Priority }> {
    return this.data.byPriority.map(item => ({ name: uiLabel(item.priority), count: item.count, key: item.priority }));
  }
  slices(): Slice[] {
    const r = 52;
    const circ = 2 * Math.PI * r;
    const keys = ['OPEN', 'IN_PROGRESS', 'WAITING_FOR_REQUESTER'];
    const items = keys.map(key => ({
      key,
      label: uiLabel(key),
      count: this.statusCount(key),
      color: this.colors[key],
    })).filter(item => item.count > 0);
    const total = items.reduce((sum, item) => sum + item.count, 0) || 1;
    let walked = 0;
    return items.map(item => {
      const len = (item.count / total) * circ;
      const slice = { ...item, dash: `${len} ${circ - len}`, offset: -walked };
      walked += len;
      return slice;
    });
  }
  maxVolume(): number {
    return Math.max(1, ...this.volume().flatMap(point => [point.created, point.resolved]));
  }
  barW(): number { return Math.max(6, (560 / Math.max(this.volume().length, 1) - 10) / 2); }
  barX(i: number): number { return 40 + i * (560 / Math.max(this.volume().length, 1)); }
  barH(count: number): number { return Math.max(count ? 4 : 0, (count / this.maxVolume()) * 150); }
  barY(count: number): number { return 176 - this.barH(count); }
  gridLines(): number[] { return [26, 76, 126, 176]; }
  labelStep(): number { return this.range() === 14 ? 2 : 1; }
  tipLeft(point: VolumePoint): number {
    const i = this.volume().findIndex(item => item.day === point.day);
    return 8 + ((i + 0.5) / Math.max(this.volume().length, 1)) * 84;
  }
  loadPct(agent: AgentLoad): number {
    return this.pct(this.agents().map(item => ({ name: item.name, count: item.openCount })), agent.openCount);
  }
  pct(items: Array<{ count: number }> | undefined, count: number): number {
    const max = Math.max(1, ...(items ?? []).map(item => item.count));
    return Math.round((count / max) * 100);
  }
  hours(value?: number): string {
    if (value == null || Number.isNaN(value) || value <= 0) return '—';
    return value < 1 ? `${Math.round(value * 60)} min` : `${value.toFixed(1)} h`;
  }
  slaText(ticket: AttentionTicket): string {
    if (ticket.slaStatus === 'UNASSIGNED') return 'Sin asignar';
    if (ticket.slaStatus === 'BREACHED') return 'Vencido';
    if (ticket.slaStatus === 'AT_RISK') return 'Por vencer';
    return ticket.dueAt ? relativeTime(ticket.dueAt) : 'En plazo';
  }
  label(value: string): string { return uiLabel(value); }

  private slice(days: DayCount[]): DayCount[] {
    return days.slice(-this.range());
  }
  private dayLabel(day: string): string {
    const iso = day.slice(0, 10);
    const [year, month, date] = iso.split('-').map(Number);
    if (!year || !month || !date) return day;
    const value = new Date(year, month - 1, date);
    const today = new Date();
    if (value.getFullYear() === today.getFullYear() && value.getMonth() === today.getMonth() && value.getDate() === today.getDate()) {
      return 'Hoy';
    }
    return value.toLocaleDateString('es', { day: 'numeric', month: 'short' }).replace('.', '');
  }
  private statusCount(status: string): number {
    return this.data.byStatus?.find(item => item.name === status)?.count
      ?? ({ OPEN: this.data.open, IN_PROGRESS: this.data.inProgress, WAITING_FOR_REQUESTER: this.data.waiting, RESOLVED: this.data.resolved, CLOSED: this.data.closed } as Record<string, number>)[status]
      ?? 0;
  }
  private delta(current?: number, previous?: number): number | null {
    if (current == null || previous == null || previous === 0) return current && !previous ? 100 : null;
    return Math.round(((current - previous) * 100) / previous);
  }
}
