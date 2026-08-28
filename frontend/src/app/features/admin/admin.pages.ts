import { DatePipe } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { RouterLink } from '@angular/router';
import { automationActionText, automationConditionText, automationWhen } from '../../core/i18n/automation-copy';
import { uiLabel } from '../../core/i18n/labels';
import { AuditEvent, AutomationExecution, AutomationRule, Page } from '../../core/models/api.models';
import { HelpdeskService } from '../../core/services/helpdesk.service';

@Component({
  selector:'app-automation',imports:[DatePipe,RouterLink,MatCardModule,MatIconModule,MatProgressSpinnerModule,MatSlideToggleModule],
  template:`
    <header><div><p>ADMINISTRACIÓN</p><h1>Centro de automatización</h1><span>Reglas de enrutado y actualización de tickets.</span></div></header>
    <section class="summary"><mat-card appearance="outlined"><mat-icon>bolt</mat-icon><strong>{{enabledCount()}}</strong><span>Reglas activas</span></mat-card><mat-card appearance="outlined"><mat-icon>automation</mat-icon><strong>{{rules().length}}</strong><span>Reglas totales</span></mat-card></section>
    <mat-card appearance="outlined" class="rules"><div class="title"><div><h2>Reglas de automatización</h2><p>Orden de ejecución y registro de corridas.</p></div></div>
      @if(loading()){<div class="state"><mat-spinner diameter="36"/></div>}@else if(!rules().length){<div class="state"><mat-icon>bolt</mat-icon><h3>No hay reglas de automatización</h3></div>}
      @for(rule of rules();track rule.id){
        <article>
          <div class="row">
            <div class="rule-icon"><mat-icon>account_tree</mat-icon></div>
            <div class="rule">
              <strong>{{plainName(rule)}}</strong>
              <p>{{when(rule)}}</p>
              <small>{{condition(rule)}} {{action(rule)}}</small>
              <div class="metrics">
                <button type="button" class="metric" [class.open]="expanded()===rule.id" [disabled]="!rule.executions" (click)="toggleRuns(rule)">
                  {{rule.executions}} veces ejecutada
                  @if(rule.executions){<mat-icon>{{expanded()===rule.id?'expand_less':'expand_more'}}</mat-icon>}
                </button>
                <span>{{successRate(rule)}}% de éxito</span>
                @if(rule.errorCount){<span class="errors">{{rule.errorCount}} errores</span>}
              </div>
            </div>
            <span class="updated">{{rule.lastExecution?(rule.lastExecution|date:'medium'):'Aún no ejecutada'}}</span>
            <mat-slide-toggle [checked]="rule.enabled" (change)="toggle(rule,$event.checked)" [attr.aria-label]="'Activar o desactivar '+rule.name"/>
          </div>
          @if(expanded()===rule.id){
            <div class="runs">
              @if(loadingExec()===rule.id){<div class="run-state"><mat-spinner diameter="24"/></div>}
              @else if(!(executions()[rule.id]??[]).length){<p class="empty-runs">No hay ejecuciones registradas.</p>}
              @else {
                @for(run of executions()[rule.id];track run.id){
                  <div class="run">
                    <span class="stamp">{{run.createdAt|date:'medium'}}</span>
                    @if(run.ticketId){<a [routerLink]="['/tickets',run.ticketId]"><b>{{run.ticketNumber}}</b> {{run.ticketTitle}}</a>}
                    @else {<span class="muted">Sin ticket asociado</span>}
                    <em [class.ok]="run.status==='SUCCESS'">{{label(run.status)}}</em>
                  </div>
                }
              }
            </div>
          }
        </article>
      }
    </mat-card>`,
  styles:[`
    header{display:flex;justify-content:space-between;margin-bottom:24px}header p{font-size:11px;letter-spacing:.14em;color:var(--sf-teal);font-weight:700;margin:0}header h1{font-size:30px;color:var(--sf-heading);margin:5px 0}header span{color:var(--sf-muted)}.summary{display:flex;gap:15px;margin-bottom:18px}.summary mat-card{padding:18px 22px;min-width:170px;display:grid;grid-template-columns:35px 1fr;align-items:center}.summary mat-icon{grid-row:1/3;color:var(--sf-teal)}.summary strong{font-size:23px;color:var(--sf-heading)}.summary span{font-size:11px;color:var(--sf-muted)}.rules{border-color:var(--sf-border)}.title{padding:21px 24px;border-bottom:1px solid var(--sf-border)}.title h2{margin:0;color:var(--sf-heading)}.title p{margin:5px 0 0;color:var(--sf-muted);font-size:12px}article{padding:18px 24px;border-bottom:1px solid var(--sf-line)}.row{display:flex;align-items:center;gap:16px}.rule-icon{display:grid;place-items:center;width:40px;height:40px;border-radius:9px;background:var(--sf-teal-bg);color:var(--sf-teal)}.rule{flex:1}.rule strong{color:var(--sf-heading)}.rule p{margin:5px 0;color:var(--sf-muted);font-size:12px}.rule small{color:var(--sf-faint)}.metrics{display:flex;gap:8px;flex-wrap:wrap;margin-top:9px}.metrics span,.metric{font-size:10px;background:var(--sf-chip);color:var(--sf-chip-ink);border-radius:10px;padding:3px 7px;border:0}.metric{display:inline-flex;align-items:center;gap:2px;cursor:pointer}.metric:disabled{cursor:default;opacity:.85}.metric.open{background:var(--sf-teal-bg);color:var(--sf-teal)}.metric mat-icon{font-size:16px;width:16px;height:16px}.metrics .errors{background:#fbe9e9;color:#a33}.updated{font-size:11px;color:var(--sf-faint);max-width:125px}.runs{margin:14px 0 0 56px;border:1px solid var(--sf-border);border-radius:10px;overflow:hidden}.run{display:grid;grid-template-columns:170px minmax(0,1fr) 70px;gap:10px;align-items:center;padding:10px 12px;border-top:1px solid var(--sf-line);font-size:12px;color:var(--sf-text)}.run:first-child{border-top:0}.run a{color:var(--sf-teal);text-decoration:none}.run em{font-style:normal;text-align:right;color:#a33;font-weight:700}.run em.ok{color:var(--sf-teal)}.stamp,.muted{color:var(--sf-faint)}.empty-runs,.run-state{padding:16px;text-align:center;color:var(--sf-faint)}.run-state mat-spinner{margin:auto}.state{min-height:260px;display:grid;place-content:center;text-align:center;color:var(--sf-muted)}.state mat-spinner{margin:auto}@media(max-width:750px){article{padding:15px}.updated{display:none}.row{flex-wrap:wrap}.runs{margin-left:0}.run{grid-template-columns:1fr;gap:4px}.summary mat-card{min-width:0;flex:1}}
  `]
})
export class AutomationPage implements OnInit{
  private readonly api=inject(HelpdeskService);readonly rules=signal<AutomationRule[]>([]);readonly loading=signal(true);readonly enabledCount=()=>this.rules().filter(x=>x.enabled).length;
  readonly expanded=signal<string|null>(null);readonly executions=signal<Record<string,AutomationExecution[]>>({});readonly loadingExec=signal<string|null>(null);
  ngOnInit(){this.api.automationRules().subscribe({next:r=>{this.rules.set(r);this.loading.set(false)},error:()=>this.loading.set(false)});}
  toggle(rule:AutomationRule,enabled:boolean){this.api.saveAutomation({...rule,enabled}).subscribe(r=>this.rules.update(all=>all.map(x=>x.id===r.id?{...x,...r,conditions:x.conditions,actions:x.actions}:x)));}
  toggleRuns(rule:AutomationRule){
    if(!rule.executions) return;
    if(this.expanded()===rule.id){this.expanded.set(null);return;}
    this.expanded.set(rule.id);
    if(this.executions()[rule.id]) return;
    this.loadingExec.set(rule.id);
    this.api.automationExecutions(rule.id).subscribe({
      next:rows=>{this.executions.update(map=>({...map,[rule.id]:rows}));this.loadingExec.set(null);},
      error:()=>this.loadingExec.set(null),
    });
  }
  plainName(rule:AutomationRule){return rule.name==='Auto route ticket'?'Enviar el ticket a la categoría correcta':rule.name==='SLA risk alert'?'Avisar cuando un ticket se retrasa':rule.name;}
  when(rule:AutomationRule){return automationWhen(rule.eventType);}
  condition(rule:AutomationRule){return automationConditionText(rule.conditions);}
  action(rule:AutomationRule){return automationActionText(rule.actions);}
  successRate(rule:AutomationRule){return rule.executions?Math.round(rule.successCount*1000/rule.executions)/10:100;}
  label(value:string){return uiLabel(value);}
}

@Component({
  selector:'app-audit',imports:[DatePipe,ReactiveFormsModule,MatCardModule,MatFormFieldModule,MatIconModule,MatInputModule,MatPaginatorModule,MatProgressSpinnerModule,MatSelectModule],
  template:`
    <header><p>ADMINISTRACIÓN</p><h1>Registro de auditoría</h1><span>Accesos, cambios de tickets y altas de cuentas.</span></header>
    <mat-card appearance="outlined" class="filters" [formGroup]="filters">
      <mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>Buscar</mat-label><input matInput formControlName="query" placeholder="Persona o ticket"></mat-form-field>
      <mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>Tipo de actividad</mat-label>
        <mat-select formControlName="action">
          <mat-option value="">Todas</mat-option>
          @for (item of actions; track item) { <mat-option [value]="item">{{label(item)}}</mat-option> }
        </mat-select>
      </mat-form-field>
    </mat-card>
    <mat-card appearance="outlined"><div class="table-wrap"><table><thead><tr><th>Fecha y hora</th><th>Quién</th><th>Qué ocurrió</th><th>Recurso</th></tr></thead><tbody>
      @for(event of page()?.content??[];track event.id){<tr><td>{{event.createdAt|date:'medium'}}</td><td><strong>{{event.actorName||event.actorEmail||'Sistema'}}</strong><small>{{event.actorEmail}}</small></td><td>{{event.summary||label(event.action)}}</td><td>{{event.ticketNumber||label(event.resourceType)}}</td></tr>}
    </tbody></table></div>
    @if(loading()){<div class="state"><mat-spinner diameter="36"/></div>}@else if(!page()?.content?.length){<div class="state"><mat-icon>policy</mat-icon><h2>Sin actividad de auditoría</h2></div>}
    @if(page();as p){<mat-paginator [length]="p.totalElements" [pageIndex]="p.page" [pageSize]="p.size" [pageSizeOptions]="[25,50,100]" (page)="change($event)"/>}</mat-card>`,
  styles:[`
    header{margin-bottom:24px}header p{font-size:11px;letter-spacing:.14em;color:var(--sf-teal);font-weight:700;margin:0}header h1{font-size:30px;color:var(--sf-heading);margin:5px 0}header span{color:var(--sf-muted)}
    .filters{display:grid;grid-template-columns:1fr 240px;gap:12px;padding:16px;margin-bottom:16px;border-color:var(--sf-border)}
    mat-card{overflow:hidden;border-color:var(--sf-border)}.table-wrap{overflow:auto}table{width:100%;min-width:850px;border-collapse:collapse;text-align:left}th{padding:14px 18px;background:var(--sf-surface-2);color:var(--sf-muted);font-size:10px;letter-spacing:.08em}td{padding:15px 18px;border-top:1px solid var(--sf-line);color:var(--sf-text);font-size:12px}td strong,td small{display:block}td small{color:var(--sf-faint);margin-top:3px}.state{min-height:300px;display:grid;place-content:center;text-align:center;color:var(--sf-muted)}.state mat-spinner,.state>mat-icon{margin:auto}
    @media(max-width:700px){.filters{grid-template-columns:1fr}}
  `]
})
export class AuditPage implements OnInit{
  private readonly api=inject(HelpdeskService);private readonly fb=inject(FormBuilder);
  readonly page=signal<Page<AuditEvent>|null>(null);readonly loading=signal(true);
  readonly filters=this.fb.nonNullable.group({query:'',action:''});
  readonly actions=['LOGIN','LOGOUT','TICKET_CREATED','TICKET_ASSIGNED','TICKET_TRANSITIONED','TICKET_COMMENTED','STAFF_MESSAGE','USER_CREATED','AUTOMATION_UPDATED','AUTOMATION_ROUTED','AUTOMATION_ASSIGNED','AUTOMATION_ESCALATED'];
  ngOnInit(){
    this.filters.valueChanges.subscribe(()=>this.load(0,this.page()?.size??25));
    this.load(0,25);
  }
  load(page:number,size:number){this.loading.set(true);this.api.audit(page,size,this.filters.getRawValue()).subscribe({next:p=>{this.page.set(p);this.loading.set(false)},error:()=>this.loading.set(false)})}
  change(e:PageEvent){this.load(e.pageIndex,e.pageSize)}
  label(value:string){return uiLabel(value);}
}
