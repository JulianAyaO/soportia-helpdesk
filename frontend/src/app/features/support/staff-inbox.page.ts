import { DatePipe } from '@angular/common';
import { afterNextRender, Component, computed, DestroyRef, effect, ElementRef, inject, Injector, OnInit, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged, filter, finalize, fromEvent, interval, skip } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { uiLabel } from '../../core/i18n/labels';
import { relativeTime } from '../../core/i18n/relative-time';
import { ManagedUser, StaffInbox, StaffMessage, StaffThread, Ticket, TicketAttachment } from '../../core/models/api.models';
import { HelpdeskService } from '../../core/services/helpdesk.service';
import { CallService } from '../../core/call/call.service';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { overlayIsOpen, sendOnEnter } from '../../core/keyboard';

type PeopleFilter = 'all' | 'agents' | 'employees' | 'chats';

@Component({
  selector: 'app-staff-inbox',
  imports: [DatePipe, ReactiveFormsModule, RouterLink, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, MatProgressSpinnerModule],
  template: `
    <header class="page-header">
      <div>
        <p class="eyebrow">{{ auth.hasRole('ADMIN') ? 'ADMINISTRACIÓN' : auth.hasRole('EMPLOYEE') ? 'NOTIFICACIONES' : 'SOPORTE INTERNO' }}</p>
        <h1>{{ pageTitle() }}</h1>
        @if (pageSubtitle(); as subtitle) {
          <p>{{ subtitle }}</p>
        }
      </div>
      @if (auth.hasRole('ADMIN')) {
        <div class="stats">
          <span><b>{{ threads().length }}</b> conversaciones</span>
          <span><b>{{ people().length }}</b> personas</span>
        </div>
      }
    </header>
    <div class="layout" [class.admin]="auth.hasRole('ADMIN')">
      @if (auth.hasRole('ADMIN')) {
        <aside class="people">
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Buscar persona</mat-label>
            <input matInput [formControl]="peopleQuery" placeholder="Nombre o correo">
          </mat-form-field>
          <div class="chips">
            @for (chip of peopleChips; track chip.id) {
              <button type="button" [class.on]="peopleFilter()===chip.id" (click)="peopleFilter.set(chip.id)">{{ chip.label }}</button>
            }
          </div>
          <div class="list">
            @for (person of visiblePeople(); track person.id) {
              <button type="button" class="person" [class.active]="selected()===person.id" [class.hot]="!!threadOf(person.id)" (click)="open(person.id)">
                <span class="avatar" [class.online]="realtime.online(person.id)" [attr.data-role]="person.role">{{ initials(person.displayName) }}</span>
                <span class="who">
                  <strong>{{ person.displayName }}</strong>
                  <small>{{ personLine(person) }}</small>
                  @if (realtime.typing(person.id)) {
                    <em class="sf-typing">escribiendo<i></i><i></i><i></i></em>
                  } @else if (threadOf(person.id)?.preview; as preview) {
                    <em>{{ preview }}</em>
                  }
                </span>
                @if (threadOf(person.id)?.lastAt; as last) {
                  <time>{{ when(last) }}</time>
                }
              </button>
            } @empty {
              <p class="empty-list">Nadie coincide con ese filtro.</p>
            }
          </div>
        </aside>
      }
      <section class="thread">
        @if (auth.hasRole('ADMIN') && selectedPartner(); as person) {
          <div class="thread-head">
            <span class="avatar lg" [class.online]="realtime.online(person.id)" [attr.data-role]="person.role">{{ initials(person.displayName) }}</span>
            <div>
              <strong>{{ person.displayName }}</strong>
              <small>@if (realtime.online(person.id)) {<span class="live">En línea</span> · }{{ label(person.role) }}@if (person.categoryName) { · {{ person.categoryName }} } · {{ person.email }}</small>
            </div>
            @if (canCall()) {
              <button mat-stroked-button type="button" class="call-now" [disabled]="calls.busy()" (click)="startCall()">
                <mat-icon>videocam</mat-icon>Llamar
              </button>
            }
          </div>
        } @else if (!auth.hasRole('ADMIN')) {
          <div class="thread-head">
            <span class="avatar lg" [class.online]="realtime.anyAdminOnline()" data-role="ADMIN">AD</span>
            <div>
              <strong>Administración</strong>
              <small>@if (realtime.anyAdminOnline()) {En línea}</small>
            </div>
            @if (canCall()) {
              <button mat-stroked-button type="button" class="call-now" [disabled]="calls.busy()" (click)="startCall()">
                <mat-icon>videocam</mat-icon>Llamar
              </button>
            }
          </div>
        }
        @if (auth.hasRole('ADMIN') && !selected()) {
          <div class="state welcome">
            <span class="blob"><mat-icon>forum</mat-icon></span>
            <h2>Selecciona una conversación</h2>
            @if (threads().length) {
              <div class="recents">
                @for (item of threads().slice(0, 3); track item.id) {
                  <button type="button" (click)="open(item.id)">
                    <strong>{{ item.displayName }}</strong>
                    <small>{{ item.preview || 'Conversación' }}</small>
                  </button>
                }
              </div>
            }
          </div>
        } @else if (loading() && !messages().length) {
          <div class="state"><mat-spinner diameter="36"/><p>Cargando conversación…</p></div>
        } @else {
          <div class="messages" #scroller>
            @if (!messages().length && !partnerTyping()) {
              <div class="state">
                <span class="blob"><mat-icon>chat_bubble_outline</mat-icon></span>
                <h2>Sin mensajes</h2>
              </div>
            }
            @for (item of messages(); track item.id) {
              <article [class.mine]="item.authorId===auth.user()?.id">
                <span class="avatar sm" [attr.data-role]="item.authorRole">{{ initials(item.authorName) }}</span>
                <div class="bubble">
                  <div class="meta">
                    <strong>{{ item.authorName }}</strong>
                    <small>{{ item.createdAt | date:'short' }}</small>
                  </div>
                  @if (item.body) { <p>{{ item.body }}</p> }
                  @if (item.ticketId && item.ticketNumber) {
                    <a class="ticket" [routerLink]="['/tickets', item.ticketId]">
                      <mat-icon>confirmation_number</mat-icon>
                      <span><b>{{ item.ticketNumber }}</b>{{ item.ticketTitle }}</span>
                    </a>
                  }
                  @if (item.attachments?.length) {
                    <div class="files">
                      @for (file of item.attachments; track file.id) {
                        <button type="button" (click)="download(item.id, file)">
                          <mat-icon>{{ file.contentType.startsWith('image/') ? 'image' : 'attach_file' }}</mat-icon>
                          <span>{{ file.fileName }}</span>
                          <small>{{ sizeLabel(file.sizeBytes) }}</small>
                        </button>
                      }
                    </div>
                  }
                </div>
              </article>
            }
            @if (partnerTyping()) {
              <article class="typing-row" aria-label="Escribiendo">
                <span class="avatar sm" [attr.data-role]="typingAvatar().role">{{ typingAvatar().initials }}</span>
                <div class="bubble typing-bubble"><span class="dots"><i></i><i></i><i></i></span></div>
              </article>
            }
          </div>
          @if (canCompose()) {
            <form [formGroup]="form" (ngSubmit)="send()">
              @if (attached(); as ticket) {
                <div class="chip">
                  <mat-icon>confirmation_number</mat-icon>
                  <span>{{ ticket.number }} · {{ ticket.title }} · {{ label(ticket.status) }} · {{ ticket.assignee?.displayName || 'Sin asignar' }}</span>
                  <button type="button" mat-icon-button (click)="attached.set(null)" aria-label="Quitar ticket"><mat-icon>close</mat-icon></button>
                </div>
              }
              <div class="compose">
                <mat-form-field appearance="outline" subscriptSizing="dynamic">
                  <mat-label>{{ composeLabel() }}</mat-label>
                  <textarea matInput rows="3" formControlName="body" maxlength="4000" (input)="onTyping()" (blur)="stopTyping()" (keydown)="onComposeKey($event)"></textarea>
                </mat-form-field>
                <input #msgFiles type="file" multiple hidden accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt" (change)="onFiles($event)">
                @if (pendingFiles().length) {
                  <ul class="pending">
                    @for (file of pendingFiles(); track file.name + file.size + file.lastModified) {
                      <li>
                        <span>{{ file.name }}</span>
                        <small>{{ sizeLabel(file.size) }}</small>
                        <button type="button" mat-icon-button (click)="removeFile(file)" aria-label="Quitar archivo"><mat-icon>close</mat-icon></button>
                      </li>
                    }
                  </ul>
                }
                <div class="compose-actions">
                  <div class="attach-btns">
                    <button mat-stroked-button type="button" (click)="msgFiles.click()"><mat-icon>attach_file</mat-icon>Archivo</button>
                    <button mat-stroked-button type="button" [class.on]="showSearch()" (click)="toggleSearch()"><mat-icon>confirmation_number</mat-icon>Ticket</button>
                  </div>
                  <button mat-flat-button type="submit" [disabled]="!canSend() || sending()">
                    <mat-icon>send</mat-icon>{{ sending() ? 'Enviando…' : 'Enviar' }}
                  </button>
                </div>
              </div>
              @if (showSearch()) {
                <div class="picker">
                  <p class="picker-hint">{{ pickerHint() }}</p>
                  <mat-form-field appearance="outline" subscriptSizing="dynamic">
                    <mat-label>Buscar por número, asunto o persona</mat-label>
                    <input matInput [formControl]="ticketQuery" placeholder="SUP-1018 o parte del asunto">
                  </mat-form-field>
                  @if (ticketLoading()) {
                    <div class="picker-state"><mat-spinner diameter="24"/></div>
                  } @else if (!ticketHits().length) {
                    <p class="picker-empty">{{ ticketQuery.value.trim() ? 'Ningún ticket coincide con esa búsqueda.' : 'No hay tickets para mostrar en esta conversación.' }}</p>
                  } @else {
                    @for (section of pickerSections(); track section.title) {
                      @if (section.title) { <p class="group">{{ section.title }}</p> }
                      @for (ticket of section.tickets; track ticket.id) {
                        <button type="button" class="hit" (click)="attach(ticket)">
                          <span class="hit-top">
                            <strong>{{ ticket.number }}</strong>
                            <span class="badge" [attr.data-status]="ticket.status">{{ label(ticket.status) }}</span>
                            <span class="prio">{{ label(ticket.priority) }}</span>
                          </span>
                          <span class="hit-title">{{ ticket.title }}</span>
                          <small>
                            {{ ticket.requester.displayName }}
                            · {{ ticket.assignee?.displayName || 'Sin asignar' }}
                            @if (ticket.categoryName) { · {{ ticket.categoryName }} }
                          </small>
                        </button>
                      }
                    }
                  }
                </div>
              }
            </form>
          }
        }
      </section>
    </div>
  `,
  styles: [`
    .page-header{display:flex;justify-content:space-between;gap:16px;align-items:flex-end;margin-bottom:20px;flex-wrap:wrap}
    .page-header h1{font-size:30px;margin:4px 0;color:var(--sf-heading)}.page-header p{margin:0;color:var(--sf-muted)}
    .eyebrow{font-size:11px;letter-spacing:.14em;color:var(--sf-teal);font-weight:700}
    .stats{display:flex;gap:10px}.stats span{background:var(--sf-teal-bg);border-radius:10px;padding:8px 12px;color:var(--sf-chip-ink);font-size:12px}
    .stats b{color:var(--sf-heading);margin-right:4px}
    .layout{display:grid;gap:16px;min-height:620px}.layout.admin{grid-template-columns:300px minmax(0,1fr)}
    .people,.thread{border:1px solid var(--sf-border);border-radius:16px;background:var(--sf-surface);min-height:620px;display:flex;flex-direction:column;overflow:hidden}
    .people{padding:14px}
    .people mat-form-field{width:100%}
    .chips{display:flex;flex-wrap:wrap;gap:6px;margin:2px 0 10px}
    .chips button{border:0;background:var(--sf-chip);color:var(--sf-chip-ink);border-radius:16px;padding:5px 10px;font-size:11px;font-weight:700;cursor:pointer}
    .chips button.on{background:var(--sf-teal-deep);color:#fff}
    .list{overflow:auto;flex:1}
    .person{display:grid;grid-template-columns:40px 1fr auto;gap:10px;width:100%;text-align:left;background:transparent;border:0;border-radius:12px;padding:10px;cursor:pointer;margin-bottom:4px;align-items:center}
    .person:hover{background:var(--sf-hover)}.person.active{background:var(--sf-teal-bg);box-shadow:inset 3px 0 #20a194}
    .person.hot strong{color:var(--sf-teal)}
    .who{min-width:0} .who strong,.who small,.who em{display:block}
    .who strong{color:var(--sf-heading);font-size:13px}.who small{color:var(--sf-muted);font-size:11px;margin-top:2px}
    .who em{color:var(--sf-muted);font-style:normal;font-size:12px;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .who em.sf-typing{color:var(--sf-teal);font-style:italic;white-space:normal;overflow:visible}
    .person time{color:var(--sf-faint);font-size:10px;align-self:start;padding-top:2px}
    .empty-list{color:var(--sf-faint);font-size:12px;padding:18px 8px;text-align:center}
    .avatar{display:grid;place-items:center;width:40px;height:40px;border-radius:50%;background:var(--sf-avatar-bg);color:var(--sf-avatar-fg);font-size:12px;font-weight:700}
    .avatar[data-role=EMPLOYEE]{background:var(--sf-icon-bg);color:var(--sf-icon-fg)}
    .avatar[data-role=ADMIN]{background:#f3e8d8;color:#8a5a1a}
    .avatar.lg{width:44px;height:44px}.avatar.sm{width:28px;height:28px;font-size:10px;flex:0 0 28px}
    .thread-head{display:flex;align-items:center;gap:12px;padding:14px 18px;border-bottom:1px solid var(--sf-line);background:var(--sf-surface)}
    .thread-head>div{min-width:0;flex:1}
    .thread-head strong{display:block;color:var(--sf-heading)}.thread-head small{color:var(--sf-muted);font-size:12px}
    .messages{flex:1;padding:18px 20px;overflow:auto;background:var(--sf-page)}
    article{display:flex;gap:8px;max-width:78%;margin-bottom:14px;align-items:flex-end}
    article.mine{margin-left:auto;flex-direction:row-reverse}
    .bubble{background:var(--sf-surface);border:1px solid var(--sf-border);border-radius:14px 14px 14px 4px;padding:10px 12px;box-shadow:0 4px 12px rgba(23,51,74,.04)}
    article.mine .bubble{background:var(--sf-teal-bg);border-color:var(--sf-teal-border);border-radius:14px 14px 4px 14px}
    .meta{display:flex;justify-content:space-between;gap:12px;margin-bottom:4px}
    .meta strong{font-size:12px;color:var(--sf-teal)}.meta small{color:var(--sf-faint);font-size:10px}
    article p{margin:0;color:var(--sf-text);white-space:pre-line;line-height:1.45}
    .ticket{display:flex;align-items:center;gap:8px;margin:8px 0 0;padding:8px 10px;border-radius:8px;background:var(--sf-surface);border:1px solid var(--sf-teal-border);color:var(--sf-heading);text-decoration:none}
    .ticket span{display:flex;flex-direction:column;font-size:12px}.ticket b{color:var(--sf-teal)}
    .files{display:flex;flex-direction:column;gap:6px;margin:8px 0 0}
    .files button{display:flex;align-items:center;gap:8px;background:var(--sf-surface);border:1px solid var(--sf-teal-border);border-radius:8px;padding:7px 10px;cursor:pointer;text-align:left;color:var(--sf-heading)}
    .files button span{flex:1;font-size:12px}.files small{color:var(--sf-faint);font-size:11px}
    form{padding:14px 16px;border-top:1px solid var(--sf-line);background:var(--sf-surface-2)}
    .compose{display:flex;flex-direction:column;gap:8px}.compose mat-form-field{width:100%}
    .compose-actions{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap}
    .compose-actions button[mat-flat-button]{background:var(--sf-teal-deep);color:#fff}
    .attach-btns{display:flex;gap:8px;flex-wrap:wrap}.attach-btns .on{border-color:#20a194;color:var(--sf-teal)}
    .pending{list-style:none;margin:0;padding:0}.pending li{display:flex;align-items:center;gap:8px;background:var(--sf-teal-bg);border-radius:8px;padding:4px 8px;margin-bottom:6px;font-size:13px}
    .pending span{flex:1}.pending small{color:var(--sf-faint)}
    .chip{display:flex;align-items:center;gap:8px;background:var(--sf-teal-bg);border-radius:8px;padding:6px 8px;margin-bottom:8px;color:var(--sf-heading);font-size:13px}.chip span{flex:1}
    .picker{margin-top:8px;border-top:1px solid var(--sf-line);padding-top:10px}.picker mat-form-field{width:100%}
    .picker-hint{margin:0 0 10px;font-size:12px;color:var(--sf-muted)}
    .picker-empty,.picker-state{padding:16px;text-align:center;color:var(--sf-faint)}.picker-state mat-spinner{margin:auto}
    .group{margin:12px 0 6px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--sf-muted);font-weight:700}
    .hit{display:block;width:100%;text-align:left;background:var(--sf-surface-2);border:1px solid var(--sf-border);border-radius:8px;padding:10px 12px;margin-bottom:6px;cursor:pointer}
    .hit:hover{background:var(--sf-teal-bg);border-color:var(--sf-teal-border)}
    .hit-top{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.hit strong{color:var(--sf-teal);font-size:12px}
    .hit-title{display:block;color:var(--sf-heading);font-size:13px;margin:4px 0 3px}.hit small{display:block;color:var(--sf-muted);font-size:11px}
    .badge{font-size:10px;font-weight:700;border-radius:10px;padding:2px 7px;background:var(--sf-teal-bg);color:var(--sf-teal)}
    .badge[data-status=IN_PROGRESS]{background:var(--sf-icon-bg);color:var(--sf-icon-fg)}
    .badge[data-status=WAITING_FOR_REQUESTER]{background:#fff2d9;color:#ac7413}
    .badge[data-status=RESOLVED],.badge[data-status=CLOSED]{background:var(--sf-chip);color:var(--sf-chip-ink)}
    .badge[data-status=CANCELLED]{background:#fbe9e9;color:#a33}
    .prio{font-size:10px;color:var(--sf-muted)}
    .state{min-height:360px;display:grid;place-content:center;text-align:center;color:var(--sf-muted);padding:24px}
    .state mat-spinner,.state .blob{margin:auto}.state h2{margin:12px 0 0;color:var(--sf-heading)}
    .blob{display:grid;place-items:center;width:64px;height:64px;border-radius:20px;background:var(--sf-teal-bg);color:var(--sf-teal)}
    .recents{display:flex;flex-direction:column;gap:8px;margin-top:16px;text-align:left}
    .recents button{background:var(--sf-surface);border:1px solid var(--sf-border);border-radius:10px;padding:10px 12px;cursor:pointer;text-align:left}
    .recents button:hover{border-color:var(--sf-teal-border);background:var(--sf-surface-2)}
    .recents strong,.recents small{display:block}.recents small{color:var(--sf-muted);margin-top:3px}
    @media(max-width:850px){.layout.admin{grid-template-columns:1fr}}
  `],
})
export class StaffInboxPage implements OnInit {
  readonly auth = inject(AuthService);
  readonly realtime = inject(RealtimeService);
  readonly calls = inject(CallService);
  private readonly api = inject(HelpdeskService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');
  readonly loading = signal(true);
  readonly sending = signal(false);
  readonly messages = signal<StaffMessage[]>([]);
  readonly people = signal<ManagedUser[]>([]);
  readonly threads = signal<StaffThread[]>([]);
  readonly selected = signal<string | undefined>(undefined);
  readonly peopleFilter = signal<PeopleFilter>('all');
  readonly now = signal(Date.now());
  readonly attached = signal<Ticket | null>(null);
  readonly pendingFiles = signal<File[]>([]);
  readonly showSearch = signal(false);
  readonly ticketHits = signal<Ticket[]>([]);
  readonly ticketLoading = signal(false);
  readonly form = this.fb.nonNullable.group({ body: [''] });
  readonly peopleQuery = this.fb.nonNullable.control('');
  readonly ticketQuery = this.fb.nonNullable.control('');
  readonly peopleChips: Array<{ id: PeopleFilter; label: string }> = [
    { id: 'all', label: 'Todos' },
    { id: 'chats', label: 'Recientes' },
    { id: 'agents', label: 'Agentes' },
    { id: 'employees', label: 'Empleados' },
  ];
  readonly partnerTyping = computed(() => this.realtime.typing(this.auth.hasRole('ADMIN') ? this.selected() : this.auth.user()?.id));
  readonly typingAvatar = computed(() => {
    if (this.auth.hasRole('ADMIN')) {
      const person = this.people().find(item => item.id === this.selected());
      return { role: person?.role ?? 'SUPPORT_AGENT', initials: person ? this.initials(person.displayName) : '?' };
    }
    return { role: 'ADMIN', initials: 'AD' };
  });

  constructor() {
    effect(() => {
      if (!this.partnerTyping()) return;
      afterNextRender(() => {
        const el = this.scroller()?.nativeElement;
        if (el) el.scrollTop = el.scrollHeight;
      }, { injector: this.injector });
    });
  }

  ngOnInit(): void {
    if (this.auth.hasRole('ADMIN')) this.api.adminUsers().subscribe(users => this.people.set(users.filter(user => user.id !== this.auth.user()?.id && user.active)));
    this.load(true);
    interval(15_000).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.now.set(Date.now()));
    interval(25_000).pipe(skip(1), takeUntilDestroyed(this.destroyRef)).subscribe(() => this.load(false));
    this.ticketQuery.valueChanges.pipe(debounceTime(250), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      if (this.showSearch()) this.loadPicker();
    });
    fromEvent<KeyboardEvent>(document, 'keydown', { capture: true }).pipe(
      filter(event => event.key === 'Escape'),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(event => this.onEscape(event));
    this.realtime.events.pipe(
      filter(event => event.type === 'message'),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(event => this.onLiveMessage(event.threadId));
  }

  canCompose(): boolean { return this.auth.hasRole('SUPPORT_AGENT', 'ADMIN'); }
  canCall(): boolean {
    if (this.auth.hasRole('EMPLOYEE')) return false;
    if (this.auth.hasRole('ADMIN')) {
      const person = this.selectedPartner();
      return !!person && (this.realtime.online(person.id) || this.calls.busy());
    }
    return this.auth.hasRole('SUPPORT_AGENT') && (this.realtime.anyAdminOnline() || this.calls.busy());
  }
  startCall(): void {
    if (this.auth.hasRole('ADMIN')) {
      const person = this.selectedPartner();
      if (person) void this.calls.start(person.id, person.displayName);
      return;
    }
    const adminId = this.realtime.firstAdminId();
    if (adminId) void this.calls.start(adminId, 'Administración');
  }
  pageTitle(): string {
    if (this.auth.hasRole('ADMIN')) return 'Mensajes';
    if (this.auth.hasRole('EMPLOYEE')) return 'Mensajes de administración';
    return 'Hablar con administración';
  }
  pageSubtitle(): string {
    if (this.auth.hasRole('ADMIN')) return '';
    if (this.auth.hasRole('EMPLOYEE')) return 'Mensajes de administración.';
    return 'Conversación con administración.';
  }
  composeLabel(): string {
    const person = this.selectedPartner();
    return person ? `Mensaje para ${person.displayName}` : 'Mensaje';
  }
  canSend(): boolean {
    return !!(this.form.controls.body.value.trim() || this.attached() || this.pendingFiles().length);
  }
  selectedPartner(): ManagedUser | undefined {
    return this.people().find(person => person.id === this.selected());
  }
  threadOf(id: string): StaffThread | undefined {
    return this.threads().find(thread => thread.id === id);
  }
  visiblePeople(): ManagedUser[] {
    const q = this.peopleQuery.value.trim().toLowerCase();
    const filter = this.peopleFilter();
    return this.people()
      .filter(person => !q || person.displayName.toLowerCase().includes(q) || person.email.toLowerCase().includes(q))
      .filter(person => filter === 'all'
        || (filter === 'agents' && person.role === 'SUPPORT_AGENT')
        || (filter === 'employees' && person.role === 'EMPLOYEE')
        || (filter === 'chats' && !!this.threadOf(person.id)))
      .sort((a, b) => {
        const ta = this.threadOf(a.id)?.lastAt ?? '';
        const tb = this.threadOf(b.id)?.lastAt ?? '';
        if (ta !== tb) return tb.localeCompare(ta);
        return a.displayName.localeCompare(b.displayName);
      });
  }
  personLine(person: ManagedUser): string {
    const role = this.label(person.role);
    return person.categoryName ? `${role} · ${person.categoryName}` : role;
  }
  initials(name: string): string {
    return name.split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase();
  }
  when(value?: string): string {
    this.now();
    return relativeTime(value, this.now());
  }

  open(userId: string): void {
    this.stopTyping();
    this.selected.set(userId);
    this.attached.set(null);
    this.pendingFiles.set([]);
    this.ticketQuery.setValue('', { emitEvent: false });
    if (this.showSearch()) this.loadPicker();
    this.load(true);
  }

  load(showSpinner: boolean): void {
    if (this.auth.hasRole('ADMIN')) {
      this.api.staffInbox().subscribe(inbox => this.threads.set(inbox.threads ?? []));
      if (!this.selected()) { this.loading.set(false); return; }
    }
    if (showSpinner) this.loading.set(true);
    this.api.staffInbox(this.selected()).pipe(finalize(() => this.loading.set(false))).subscribe({
      next: inbox => this.apply(inbox),
    });
  }

  send(): void {
    if (!this.canCompose() || !this.canSend()) return;
    if (this.auth.hasRole('ADMIN') && !this.selected()) return;
    this.sending.set(true);
    this.api.sendStaffMessage(this.form.controls.body.value.trim(), this.selected(), this.attached()?.id, this.pendingFiles()).pipe(
      finalize(() => this.sending.set(false)),
    ).subscribe({
      next: () => {
        this.stopTyping();
        this.form.reset({ body: '' });
        this.attached.set(null);
        this.pendingFiles.set([]);
        this.showSearch.set(false);
        this.load(false);
      },
    });
  }

  onComposeKey(event: KeyboardEvent): void {
    sendOnEnter(event, () => this.send());
  }

  onTyping(): void {
    this.realtime.setTyping(this.threadKey(), !!this.form.controls.body.value.trim());
  }

  stopTyping(): void {
    this.realtime.setTyping(this.threadKey(), false);
  }

  onEscape(event: KeyboardEvent): void {
    if (overlayIsOpen()) return;
    if (this.showSearch()) {
      this.showSearch.set(false);
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (this.auth.hasRole('ADMIN') && this.selected()) {
      this.selected.set(undefined);
      this.messages.set([]);
      this.attached.set(null);
      this.pendingFiles.set([]);
      this.showSearch.set(false);
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }

  onFiles(event: Event): void {
    const input = event.target as HTMLInputElement;
    const incoming = Array.from(input.files ?? []);
    input.value = '';
    const next = [...this.pendingFiles()];
    for (const file of incoming) {
      if (file.size > 10 * 1024 * 1024) continue;
      if (next.length >= 5) break;
      if (!next.some(existing => existing.name === file.name && existing.size === file.size)) next.push(file);
    }
    this.pendingFiles.set(next);
  }
  removeFile(file: File): void { this.pendingFiles.set(this.pendingFiles().filter(item => item !== file)); }
  download(messageId: string, file: TicketAttachment): void { this.api.downloadStaffAttachment(messageId, file).subscribe(); }
  sizeLabel(bytes: number): string {
    return bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }
  toggleSearch(): void {
    this.showSearch.update(value => !value);
    if (this.showSearch()) this.loadPicker();
  }
  attach(ticket: Ticket): void {
    this.attached.set(ticket);
    this.showSearch.set(false);
    this.ticketHits.set([]);
    this.ticketQuery.setValue('', { emitEvent: false });
  }
  pickerHint(): string {
    const person = this.selectedPartner();
    if (this.auth.hasRole('ADMIN') && person?.role === 'SUPPORT_AGENT') {
      return `Tickets de ${person.displayName}${person.categoryName ? ' · ' + person.categoryName : ''}.`;
    }
    if (this.auth.hasRole('ADMIN') && person?.role === 'EMPLOYEE') {
      return `Tickets de ${person.displayName}.`;
    }
    return 'Tickets de tu cola.';
  }
  pickerSections(): Array<{ title: string; tickets: Ticket[] }> {
    const tickets = this.ticketHits();
    if (this.ticketQuery.value.trim() || !this.shouldGroup()) return [{ title: '', tickets }];
    const scope = this.scopeUserId();
    const assigned = tickets.filter(ticket => ticket.assignee?.id && ticket.assignee.id === scope);
    const queue = tickets.filter(ticket => !ticket.assignee);
    const others = tickets.filter(ticket => ticket.assignee && ticket.assignee.id !== scope);
    return [
      { title: this.auth.hasRole('ADMIN') && this.selectedPartner() ? `Asignados a ${this.selectedPartner()!.displayName}` : 'Asignados a ti', tickets: assigned },
      { title: this.auth.hasRole('ADMIN') ? 'Sin asignar en su categoría' : 'Sin asignar en tu categoría', tickets: queue },
      { title: 'Otros de su categoría', tickets: others },
    ].filter(section => section.tickets.length);
  }
  label(value?: string): string { return value ? uiLabel(value) : ''; }

  private shouldGroup(): boolean {
    return this.auth.hasRole('SUPPORT_AGENT') || this.selectedPartner()?.role === 'SUPPORT_AGENT';
  }
  private scopeUserId(): string | undefined {
    return this.auth.hasRole('ADMIN') ? this.selected() : this.auth.user()?.id;
  }
  private threadKey(): string | undefined {
    return this.auth.hasRole('ADMIN') ? this.selected() : this.auth.user()?.id;
  }
  private onLiveMessage(threadId?: string): void {
    if (this.auth.hasRole('ADMIN')) {
      this.api.staffInbox().subscribe(inbox => this.threads.set(inbox.threads ?? []));
      if (this.selected() && threadId === this.selected()) this.load(false);
      return;
    }
    this.load(false);
  }
  private apply(inbox: StaffInbox): void {
    this.messages.set(inbox.messages);
    if (inbox.threads?.length) this.threads.set(inbox.threads);
    if (!this.auth.hasRole('ADMIN') && inbox.agentId) this.selected.set(inbox.agentId);
    afterNextRender(() => {
      const el = this.scroller()?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    }, { injector: this.injector });
  }
  private loadPicker(): void {
    const query = this.ticketQuery.value.trim();
    this.ticketLoading.set(true);
    this.api.tickets({
      query: query || undefined,
      forUser: !query && this.auth.hasRole('ADMIN') ? this.selected() : undefined,
      page: 0,
      size: query ? 8 : 20,
      sort: 'updated',
      dir: 'desc',
    }).pipe(finalize(() => this.ticketLoading.set(false))).subscribe({
      next: page => this.ticketHits.set(page.content),
      error: () => this.ticketHits.set([]),
    });
  }
}
