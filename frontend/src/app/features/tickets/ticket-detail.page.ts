import { DatePipe } from '@angular/common';
import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize, Subject, switchMap, takeUntil, timer } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { CallService } from '../../core/call/call.service';
import { uiLabel } from '../../core/i18n/labels';
import { sendOnEnter } from '../../core/keyboard';
import { Ticket, TicketAttachment, TicketHistory, TicketStatus, User } from '../../core/models/api.models';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { HelpdeskService } from '../../core/services/helpdesk.service';

@Component({
  selector:'app-ticket-detail',
  imports:[DatePipe,ReactiveFormsModule,RouterLink,MatButtonModule,MatCardModule,MatCheckboxModule,MatFormFieldModule,MatIconModule,MatInputModule,MatProgressSpinnerModule,MatSelectModule],
  template:`
    <a class="back" routerLink="/tickets"><mat-icon>arrow_back</mat-icon>{{ auth.hasRole('SUPPORT_AGENT') ? 'Tu cola de trabajo' : 'Todos los tickets' }}</a>
    @if(loading()&&!ticket()){<div class="state"><mat-spinner diameter="38"/><p>Cargando ticket…</p></div>}
    @else if(error()&&!ticket()){<div class="state"><mat-icon>error_outline</mat-icon><h2>Ticket no disponible</h2><p>{{error()}}</p><button mat-stroked-button (click)="startPolling()">Reintentar</button></div>}
    @else if(ticket();as t){
      <header><div><div class="meta"><span>{{t.number}}</span><span class="badge" [attr.data-status]="t.status">{{label(t.status)}}</span><span class="priority">Prioridad {{label(t.priority).toLowerCase()}}</span></div><h1>{{t.title}}</h1><p>Solicitado por {{t.requester.displayName}}@if(auth.hasRole('SUPPORT_AGENT','ADMIN') && realtime.online(t.requester.id)){ · <span class="live">En línea</span>} · {{t.createdAt|date:'medium'}}</p></div>
        @if(auth.hasRole('SUPPORT_AGENT','ADMIN')){<div class="actions">@if(!t.assignee){<button mat-stroked-button (click)="take()"><mat-icon>person_add</mat-icon>Tomar ticket</button>}<mat-form-field appearance="outline" class="assignee"><mat-label>Asignado</mat-label><mat-select [value]="t.assignee?.id" (selectionChange)="assign($event.value)">@for(agent of agents();track agent.id){<mat-option [value]="agent.id">{{agent.displayName}}@if(agent.id===auth.user()?.id && auth.hasRole('ADMIN')){ (tú)}@else if(agent.teams?.[0]?.name){ · {{label(agent.teams[0].name)}}}</mat-option>}</mat-select></mat-form-field><mat-form-field appearance="outline"><mat-label>Actualizar estado</mat-label><mat-select [value]="t.status" (selectionChange)="transition($event.value)">@for(s of transitions(t.status);track s){<mat-option [value]="s">{{label(s)}}</mat-option>}</mat-select></mat-form-field></div>}
        @else if (transitions(t.status).includes('CANCELLED')) { <button mat-stroked-button (click)="transition('CANCELLED')">Cancelar ticket</button> }
      </header>
      <div class="layout"><main>
        <mat-card appearance="outlined" class="description"><h2>Descripción</h2><p>{{t.description}}</p>
          @if(t.attachments?.length){
            <div class="attachments"><h3>Archivos adjuntos</h3>
              @for(file of t.attachments;track file.id){
                <button type="button" (click)="download(file)"><mat-icon>{{file.contentType.startsWith('image/')?'image':'attach_file'}}</mat-icon><span>{{file.fileName}}</span><small>{{sizeLabel(file.sizeBytes)}}</small></button>
              }
            </div>
          }
        </mat-card>
        <mat-card appearance="outlined" class="conversation"><h2>Conversación <span>{{visibleComments(t).length}}</span></h2>
          @if(!visibleComments(t).length){<div class="empty"><mat-icon>forum</mat-icon><p>Sin respuestas</p></div>}
          @for(c of visibleComments(t);track c.id){<article [class.internal]="c.visibility==='INTERNAL'"><div class="avatar">{{initials(c.author.displayName)}}</div><div><div class="comment-meta"><strong>{{c.author.displayName}}</strong><span>{{c.createdAt|date:'medium'}}</span>@if(c.visibility==='INTERNAL'){<em><mat-icon>lock</mat-icon>Nota interna</em>}</div><p>{{c.body}}</p>
            @if(c.attachments?.length){
              <div class="attachments comment-files">
                @for(file of c.attachments;track file.id){
                  <button type="button" (click)="download(file)"><mat-icon>{{file.contentType.startsWith('image/')?'image':'attach_file'}}</mat-icon><span>{{file.fileName}}</span><small>{{sizeLabel(file.sizeBytes)}}</small></button>
                }
              </div>
            }
          </div></article>}
          @if(canReply(t)){
            <form [formGroup]="commentForm" (ngSubmit)="comment()">
              <mat-form-field appearance="outline"><mat-label>Añadir una respuesta</mat-label><textarea matInput rows="4" formControlName="body" (keydown)="onComposeKey($event)"></textarea></mat-form-field>
              <input #replyFiles type="file" multiple hidden accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt" (change)="onReplyFiles($event)">
              <div class="reply-files">
                <button type="button" mat-stroked-button (click)="replyFiles.click()"><mat-icon>attach_file</mat-icon>Adjuntar archivos</button>
                @if (pendingFiles().length) {
                  <ul>
                    @for (file of pendingFiles(); track file.name + file.size + file.lastModified) {
                      <li><span>{{ file.name }}</span><small>{{ sizeLabel(file.size) }}</small>
                        <button type="button" mat-icon-button (click)="removeReplyFile(file)" aria-label="Quitar archivo"><mat-icon>close</mat-icon></button>
                      </li>
                    }
                  </ul>
                }
              </div>
              @if(auth.hasRole('SUPPORT_AGENT','ADMIN')){<mat-checkbox formControlName="internal">Nota interna — oculta para el empleado</mat-checkbox>}
              <button mat-flat-button [disabled]="commentForm.invalid||saving()">Enviar respuesta <mat-icon>send</mat-icon></button>
            </form>
          }
        </mat-card>
      </main><aside>
        @if (ticketPeer(t); as peer) {
          <mat-card appearance="outlined" class="sf-ticket-peer">
            <h2>{{ auth.hasRole('EMPLOYEE') ? 'Tu técnico' : 'Solicitante' }}</h2>
            <div class="sf-ticket-peer-row">
              <span class="avatar" [class.online]="realtime.online(peer.id)">{{ initials(peer.name) }}</span>
              <div>
                <strong>{{ peer.name }}</strong>
                <small>@if (realtime.online(peer.id)) {<span class="live">En línea</span>} @else {Desconectado}</small>
              </div>
              @if (canCallTicket(t)) {
                <button mat-stroked-button type="button" class="call-now" [disabled]="calls.busy() || !realtime.online(peer.id)" (click)="startTicketCall(t)">
                  <mat-icon>videocam</mat-icon>Llamar
                </button>
              }
            </div>
          </mat-card>
        }
        <mat-card appearance="outlined"><h2>Detalles</h2><dl><dt>Estado</dt><dd>{{label(t.status)}}</dd><dt>Prioridad</dt><dd>{{label(t.priority)}}</dd><dt>Categoría</dt><dd>{{label(t.categoryName??'Sin categoría')}}</dd><dt>Asignado</dt><dd>{{t.assignee?.displayName??'Sin asignar / En cola'}}@if(t.assignee && realtime.online(t.assignee.id)){ · <span class="live">En línea</span>}</dd><dt>Impacto / urgencia</dt><dd>{{t.impact}} / {{t.urgency}}</dd><dt>Última actualización</dt><dd>{{t.updatedAt|date:'medium'}}</dd></dl></mat-card>
        <mat-card appearance="outlined" class="sla" [class.breached]="t.slaStatus==='BREACHED'"><h2><mat-icon>timer</mat-icon>SLA</h2><strong>{{t.slaStatus==='BREACHED'?'Objetivo incumplido':t.slaStatus==='STOPPED'?'SLA detenido':'En plazo'}}</strong><p>@if(t.resolutionDueAt){Objetivo de resolución: {{t.resolutionDueAt|date:'medium' }}}@else{Sin objetivo disponible}</p><small>Horario laboral: lunes a viernes, 8:00–18:00 (Bogotá). Si el plazo cae fuera, pasa al siguiente día hábil.</small></mat-card>
        @if(t.history?.length){<mat-card appearance="outlined" class="history"><h2>Historial</h2>@for(h of t.history;track $index){<div><i></i><p>{{h.summary || historyLine(h)}}<small>{{h.createdAt|date:'short'}}</small></p></div>}</mat-card>}
      </aside></div>
    }
  `,
  styles:[`
    .back{display:inline-flex;align-items:center;gap:5px;color:var(--sf-link);text-decoration:none;font-size:13px;margin-bottom:18px}.back small{opacity:.7;font-size:11px;margin-left:4px}header{display:flex;justify-content:space-between;gap:20px;margin-bottom:22px}header h1{font-size:28px;color:var(--sf-heading);margin:12px 0 6px}header p{color:var(--sf-muted);margin:0;font-size:13px}.meta{display:flex;gap:8px;align-items:center}.meta>span:first-child{color:var(--sf-teal);font-weight:700;font-size:12px}.badge,.priority{padding:5px 9px;border-radius:16px;background:var(--sf-teal-bg);color:var(--sf-teal);font-size:10px;font-weight:700}.priority{background:var(--sf-priority-bg);color:var(--sf-priority-ink)}.actions{display:flex;gap:10px;align-items:flex-start}.actions mat-form-field{width:170px;margin-bottom:-22px}.actions .assignee{width:260px}.layout{display:grid;grid-template-columns:minmax(0,1fr) 310px;gap:18px}.layout mat-card{border-color:var(--sf-border);padding:24px;margin-bottom:18px}.layout h2{font-size:16px;color:var(--sf-heading);margin-top:0}.description p{white-space:pre-line;line-height:1.7;color:var(--sf-text)}.attachments{margin-top:20px;padding-top:16px;border-top:1px solid var(--sf-line)}.attachments h3{font-size:13px;color:var(--sf-text);margin:0 0 10px}.attachments button{display:flex;align-items:center;gap:8px;width:100%;background:var(--sf-surface-2);border:1px solid var(--sf-border);border-radius:8px;padding:10px 12px;margin-bottom:8px;color:var(--sf-text);cursor:pointer;text-align:left}.attachments button span{flex:1}.attachments small{color:var(--sf-muted)}.conversation>h2 span{font-size:10px;background:var(--sf-chip);padding:3px 7px;border-radius:12px;color:var(--sf-chip-ink)}.empty{text-align:center;color:var(--sf-faint);padding:28px}.empty mat-icon{font-size:35px;width:35px;height:35px}article{display:flex;gap:12px;padding:18px 0;border-top:1px solid var(--sf-line)}.avatar{display:grid;place-items:center;width:36px;height:36px;flex:0 0 36px;border-radius:50%;background:var(--sf-icon-bg);color:var(--sf-icon-fg);font-weight:700}.comment-meta{display:flex;align-items:center;gap:10px}.comment-meta span{color:var(--sf-faint);font-size:11px}.comment-meta em{display:flex;align-items:center;color:var(--sf-note-ink);background:var(--sf-note-chip);padding:3px 7px;border-radius:10px;font-size:10px}.comment-meta em mat-icon{font-size:12px;width:12px;height:12px}.internal{background:var(--sf-note-bg);margin:0 -12px;padding:18px 12px}article p{color:var(--sf-text);white-space:pre-line}.conversation form{border-top:1px solid var(--sf-border);padding-top:20px}.conversation form mat-form-field{width:100%}.conversation form button{background:var(--sf-teal-deep);color:white}.conversation form>button[mat-flat-button]{float:right}.conversation form:after{content:"";display:block;clear:both}.reply-files{margin:0 0 14px}.reply-files>button{background:transparent;color:var(--sf-text);border-color:var(--sf-border)}.reply-files ul{list-style:none;padding:0;margin:10px 0 0}.reply-files li{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--sf-text)}.reply-files li span{flex:1}.comment-files{margin-top:12px}dl{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:0}dt{color:var(--sf-faint);font-size:12px}dd{margin:0;text-align:right;color:var(--sf-text);font-size:12px;font-weight:600}.sla h2{display:flex;align-items:center;gap:7px}.sla strong{color:var(--sf-teal)}.sla p{color:var(--sf-muted);font-size:12px;margin-bottom:8px}.sla>small{display:block;color:var(--sf-faint);font-size:11px;line-height:1.45}.sla.breached{border-left:4px solid #d44a4a}.sla.breached strong{color:var(--sf-danger)}.history>div{display:flex;gap:10px}.history i{width:8px;height:8px;border-radius:50%;background:#36a99a;margin-top:5px}.history p{font-size:11px;color:var(--sf-text);margin:0 0 16px}.history small{display:block;color:var(--sf-faint);margin-top:3px}.state{min-height:400px;display:grid;place-content:center;text-align:center;color:var(--sf-muted)}.state mat-spinner,.state>mat-icon{margin:auto}@media(max-width:950px){.layout{grid-template-columns:1fr}}@media(max-width:650px){header{flex-direction:column}.actions{flex-wrap:wrap}.layout mat-card{padding:18px}.comment-meta{flex-wrap:wrap}}
  `]
})
export class TicketDetailPage implements OnInit,OnDestroy{
  readonly auth=inject(AuthService);readonly realtime=inject(RealtimeService);readonly calls=inject(CallService);private readonly api=inject(HelpdeskService);private readonly route=inject(ActivatedRoute);private readonly router=inject(Router);private readonly fb=inject(FormBuilder);private readonly destroy$=new Subject<void>();
  readonly ticket=signal<Ticket|null>(null);readonly agents=signal<User[]>([]);readonly loading=signal(true);readonly saving=signal(false);readonly error=signal('');readonly pendingFiles=signal<File[]>([]);readonly commentForm=this.fb.nonNullable.group({body:['',Validators.required],internal:false});
  ngOnInit():void{
    this.startPolling();
    if(this.auth.hasRole('SUPPORT_AGENT','ADMIN')){
      this.api.agents().subscribe(agents=>{
        const me=this.auth.user();
        if(this.auth.hasRole('ADMIN')&&me&&!agents.some(agent=>agent.id===me.id)) agents=[...agents,me];
        this.agents.set(agents);
      });
    }
  }
  startPolling():void{this.loading.set(true);this.error.set('');timer(0,25_000).pipe(switchMap(()=>this.api.ticket(this.route.snapshot.paramMap.get('id')!)),takeUntil(this.destroy$)).subscribe({next:t=>{this.ticket.set(t);this.loading.set(false)},error:e=>{this.error.set(e.error?.message??'No se pudo cargar este ticket.');this.loading.set(false)}});}
  refresh():void{this.api.ticket(this.route.snapshot.paramMap.get('id')!).subscribe(t=>this.ticket.set(t));}
  comment():void{if(this.commentForm.invalid)return;this.saving.set(true);const v=this.commentForm.getRawValue();this.api.addComment(this.ticket()!.id,v.body,v.internal?'INTERNAL':'PUBLIC',this.pendingFiles()).pipe(finalize(()=>this.saving.set(false))).subscribe({next:()=>{this.commentForm.reset({body:'',internal:false});this.pendingFiles.set([]);this.refresh();}});}
  onComposeKey(event:KeyboardEvent):void{sendOnEnter(event,()=>this.comment());}
  onReplyFiles(event:Event):void{
    const input=event.target as HTMLInputElement;
    const incoming=Array.from(input.files??[]);
    input.value='';
    const next=[...this.pendingFiles()];
    for(const file of incoming){
      if(file.size>10*1024*1024) continue;
      if(next.length>=5) break;
      if(!next.some(existing=>existing.name===file.name&&existing.size===file.size)) next.push(file);
    }
    this.pendingFiles.set(next);
  }
  removeReplyFile(file:File):void{this.pendingFiles.set(this.pendingFiles().filter(item=>item!==file));}
  historyLine(h:TicketHistory):string{return this.label(h.eventType);}
  take():void{this.api.take(this.ticket()!.id).subscribe(()=>this.refresh());}
  assign(assigneeId:string):void{
    this.api.assign(this.ticket()!.id,assigneeId).subscribe({
      next:()=>{
        if(this.auth.hasRole('SUPPORT_AGENT')&&assigneeId!==this.auth.user()?.id){
          void this.router.navigate(['/tickets']);
          return;
        }
        this.refresh();
      },
      error:()=>this.refresh(),
    });
  }
  transition(status:TicketStatus):void{if(status===this.ticket()!.status)return;this.api.transition(this.ticket()!.id,status).subscribe(()=>this.refresh());}
  transitions(s:TicketStatus):TicketStatus[]{const map:Record<TicketStatus,TicketStatus[]>={OPEN:['OPEN','IN_PROGRESS','WAITING_FOR_REQUESTER','CANCELLED'],IN_PROGRESS:['IN_PROGRESS','WAITING_FOR_REQUESTER','RESOLVED','CANCELLED'],WAITING_FOR_REQUESTER:['WAITING_FOR_REQUESTER','IN_PROGRESS','RESOLVED','CANCELLED'],RESOLVED:['RESOLVED','IN_PROGRESS','CLOSED'],CLOSED:['CLOSED'],CANCELLED:['CANCELLED']};return map[s];}
  visibleComments(t:Ticket){return(t.comments??[]).filter(c=>c.visibility==='PUBLIC'||this.auth.hasRole('SUPPORT_AGENT','ADMIN'));}
  hasAgentReply(t:Ticket){return(t.comments??[]).some(c=>c.visibility==='PUBLIC'&&c.author.id!==t.requester.id);}
  canReply(t:Ticket){return this.auth.hasRole('SUPPORT_AGENT','ADMIN')||this.hasAgentReply(t);}
  download(file:TicketAttachment){const t=this.ticket();if(t)this.api.downloadAttachment(t.id,file).subscribe();}
  sizeLabel(bytes:number){return bytes<1024?`${bytes} B`:bytes<1024*1024?`${Math.round(bytes/1024)} KB`:`${(bytes/1024/1024).toFixed(1)} MB`;}
  label(v:string){return uiLabel(v);}initials(n:string){return n.split(' ').map(x=>x[0]).join('').slice(0,2).toUpperCase();}
  ticketPeer(t:Ticket):{id:string;name:string}|null{
    const peer=this.auth.hasRole('EMPLOYEE')
      ?(t.assignee?{id:t.assignee.id,name:t.assignee.displayName}:null)
      :{id:t.requester.id,name:t.requester.displayName};
    return peer && peer.id!==this.auth.user()?.id ? peer : null;
  }
  canCallTicket(t:Ticket):boolean{
    if(this.auth.hasRole('EMPLOYEE')) return false;
    const peer=this.ticketPeer(t);
    return !!peer && peer.id!==this.auth.user()?.id;
  }
  startTicketCall(t:Ticket):void{
    if(this.auth.hasRole('EMPLOYEE')) return;
    const peer=this.ticketPeer(t);
    if(peer && this.realtime.online(peer.id) && !this.calls.busy()) void this.calls.start(peer.id,peer.name);
  }
  ngOnDestroy():void{this.destroy$.next();this.destroy$.complete();}
}
