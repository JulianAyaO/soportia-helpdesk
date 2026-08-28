import { DatePipe } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterLink } from '@angular/router';
import { uiLabel } from '../../core/i18n/labels';
import { AccountProfile, AgentTeam } from '../../core/models/api.models';
import { HelpdeskService } from '../../core/services/helpdesk.service';

@Component({
  selector: 'app-account',
  imports: [DatePipe, RouterLink, MatButtonModule, MatCardModule, MatIconModule, MatProgressSpinnerModule],
  template: `
    <a class="back" routerLink="/dashboard"><mat-icon>arrow_back</mat-icon>Volver al panel</a>
    @if (loading() && !account()) {
      <div class="state"><mat-spinner diameter="38"/><p>Cargando tu cuenta…</p></div>
    } @else if (error() && !account()) {
      <div class="state"><mat-icon>error_outline</mat-icon><h2>No se pudo abrir la cuenta</h2><p>{{ error() }}</p>
        <button mat-stroked-button (click)="load()">Reintentar</button></div>
    } @else if (account(); as me) {
      <header>
        <span class="avatar">{{ initials(me.displayName) }}</span>
        <div>
          <p class="eyebrow">TU CUENTA</p>
          <h1>{{ me.displayName }}</h1>
          <p>{{ uiLabel(me.role) }} · {{ me.email }}</p>
        </div>
      </header>
      <section class="kpis">
        <mat-card appearance="outlined">
          <div class="metric-icon"><mat-icon>confirmation_number</mat-icon></div>
          <div>
            <p>{{ me.role === 'EMPLOYEE' ? 'Tus tickets' : 'Tickets del espacio' }}</p>
            <strong>{{ me.ticketTotal }}</strong>
            <small>Total registrados</small>
          </div>
        </mat-card>
        <mat-card appearance="outlined">
          <div class="metric-icon green"><mat-icon>pending_actions</mat-icon></div>
          <div>
            <p>En curso</p>
            <strong>{{ me.ticketOpen }}</strong>
            <small>Abiertos o en espera</small>
          </div>
        </mat-card>
      </section>
      <div class="grid">
        <mat-card appearance="outlined">
          <h2>Datos generales</h2>
          <dl>
            <div><dt>Nombre</dt><dd>{{ me.displayName }}</dd></div>
            <div><dt>Correo</dt><dd>{{ me.email }}</dd></div>
            <div><dt>Rol</dt><dd>{{ uiLabel(me.role) }}</dd></div>
            <div><dt>Alta</dt><dd>{{ me.createdAt | date:'medium' }}</dd></div>
          </dl>
        </mat-card>
        <mat-card appearance="outlined">
          <h2>{{ me.role === 'SUPPORT_AGENT' ? 'Categoría que atiendes' : me.role === 'ADMIN' ? 'Alcance' : 'Área' }}</h2>
          @if (!me.teams.length) {
            <p class="empty">{{ me.role === 'EMPLOYEE' ? 'Usas los tickets para hablar con los agentes de soporte.' : me.role === 'ADMIN' ? 'Supervisas toda la mesa. Los tickets se asignan a agentes; puedes tomar uno si lo necesitas.' : 'Sin categoría asignada.' }}</p>
            @if (me.role === 'EMPLOYEE') {
              <a mat-stroked-button routerLink="/tickets">Ver mis tickets</a>
            }
          } @else {
            @for (team of me.teams; track team.id) {
              <article>
                <strong>{{ categoriesLine(team) || uiLabel(team.name) }}</strong>
                <small>{{ team.description }}</small>
              </article>
            }
          }
        </mat-card>
      </div>
    }
  `,
  styles: [`
    .back{display:inline-flex;align-items:center;gap:5px;color:var(--sf-link);text-decoration:none;font-size:13px;margin-bottom:22px}
    .back small{opacity:.7;font-size:11px;margin-left:4px}
    header{display:flex;align-items:center;gap:18px;margin-bottom:26px}
    header h1{font-size:30px;margin:3px 0;color:var(--sf-heading)}
    header p{margin:0;color:var(--sf-muted)}
    .eyebrow{font-size:11px!important;letter-spacing:.14em;color:var(--sf-teal)!important;font-weight:700}
    .avatar{display:grid;place-items:center;width:72px;height:72px;border-radius:50%;background:var(--sf-avatar-bg);color:var(--sf-avatar-fg);font-size:24px;font-weight:700}
    .kpis{display:grid;grid-template-columns:repeat(2,minmax(0,280px));gap:16px;margin-bottom:18px}
    .kpis mat-card{padding:20px;display:flex;gap:15px;align-items:center;border-color:var(--sf-border)}
    .metric-icon{display:grid;place-items:center;width:46px;height:46px;border-radius:11px;background:var(--sf-icon-bg);color:var(--sf-icon-fg)}
    .metric-icon.green{background:#e4f5ed;color:#21845b}
    .kpis p,.kpis small{margin:0;color:var(--sf-muted)}
    .kpis strong{display:block;font-size:27px;color:var(--sf-heading)}
    .grid{display:grid;grid-template-columns:1.2fr 1fr;gap:18px}
    .grid mat-card{border-color:var(--sf-border);padding:24px}
    h2{font-size:16px;color:var(--sf-heading);margin:0 0 18px}
    dl{margin:0;display:grid;gap:14px}
    dl>div{display:flex;justify-content:space-between;gap:16px;border-bottom:1px solid var(--sf-line);padding-bottom:12px}
    dt{color:var(--sf-faint);font-size:13px} dd{margin:0;color:var(--sf-text);font-weight:600;text-align:right}
    article{padding:12px 0;border-bottom:1px solid var(--sf-line)}
    article strong{display:block;color:var(--sf-heading)} article small,.empty{color:var(--sf-muted)}
    article p{margin:6px 0 0;font-size:12px;color:var(--sf-muted)}
    .state{min-height:340px;display:grid;place-content:center;text-align:center;color:var(--sf-muted)}
    .state mat-spinner,.state>mat-icon{margin:auto}
    @media(max-width:800px){.kpis,.grid{grid-template-columns:1fr}}
  `],
})
export class AccountPage implements OnInit {
  private readonly api = inject(HelpdeskService);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly account = signal<AccountProfile | null>(null);
  readonly uiLabel = uiLabel;

  ngOnInit(): void { this.load(); }
  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.api.account().subscribe({
      next: profile => { this.account.set(profile); this.loading.set(false); },
      error: e => { this.error.set(e.error?.message ?? 'No se pudo cargar la cuenta.'); this.loading.set(false); },
    });
  }
  initials(name: string): string {
    return name.split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase();
  }
  categoriesLine(team: AgentTeam): string {
    return (team.categories ?? []).map(value => uiLabel(value)).join(', ');
  }
}
