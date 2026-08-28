import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { uiLabel } from '../../core/i18n/labels';
import { Category } from '../../core/models/api.models';
import { HelpdeskService } from '../../core/services/helpdesk.service';

@Component({
  selector:'app-ticket-create',
  imports:[ReactiveFormsModule,RouterLink,MatButtonModule,MatCardModule,MatFormFieldModule,MatIconModule,MatInputModule,MatProgressSpinnerModule,MatSelectModule],
  template:`
    <a class="back" routerLink="/tickets"><mat-icon>arrow_back</mat-icon>Volver a tickets</a>
    <header><p>NUEVA SOLICITUD DE SERVICIO</p><h1>Nueva solicitud</h1></header>
    <div class="layout"><mat-card appearance="outlined"><form [formGroup]="form" (ngSubmit)="submit()">
      <section><div class="step">1</div><div class="fields"><h2>Detalles de la solicitud</h2>
        <mat-form-field appearance="outline"><mat-label>Título</mat-label><input matInput formControlName="title" maxlength="200"><mat-hint align="end">{{form.controls.title.value.length}} / 200</mat-hint></mat-form-field>
        <mat-form-field appearance="outline"><mat-label>Descripción</mat-label><textarea matInput formControlName="description" rows="7" placeholder="Describe el incidente y el resultado esperado."></textarea><mat-hint>No incluyas contraseñas ni información sensible.</mat-hint></mat-form-field>
      </div></section>
      <section><div class="step">2</div><div class="fields"><h2>Clasificación</h2><div class="row">
        <mat-form-field appearance="outline"><mat-label>Categoría</mat-label><mat-select formControlName="categoryId">@for(c of categories();track c.id){<mat-option [value]="c.id">{{label(c.name)}}</mat-option>}</mat-select></mat-form-field>
        <mat-form-field appearance="outline"><mat-label>Impacto</mat-label><mat-select formControlName="impact">@for(level of levels;track level.value){<mat-option [value]="level.value">{{level.label}}</mat-option>}</mat-select></mat-form-field>
        <mat-form-field appearance="outline"><mat-label>Urgencia</mat-label><mat-select formControlName="urgency">@for(level of levels;track level.value){<mat-option [value]="level.value">{{level.label}}</mat-option>}</mat-select></mat-form-field>
      </div></div></section>
      <section class="files-section"><div class="step">3</div><div class="fields"><h2>Archivos (opcional)</h2>
        <input #picker type="file" multiple hidden accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt" (change)="onFiles($event)">
        <button type="button" mat-stroked-button (click)="picker.click()"><mat-icon>attach_file</mat-icon>Adjuntar archivos</button>
        @if (files().length) {
          <ul class="files">
            @for (file of files(); track file.name + file.size + file.lastModified) {
              <li>
                <mat-icon>{{ isImage(file) ? 'image' : 'description' }}</mat-icon>
                <span>{{ file.name }}</span>
                <small>{{ sizeLabel(file.size) }}</small>
                <button type="button" mat-icon-button (click)="removeFile(file)" aria-label="Quitar archivo"><mat-icon>close</mat-icon></button>
              </li>
            }
          </ul>
        }
        <p class="hint">Hasta 5 archivos, 10 MB cada uno. Imágenes, PDF u Office.</p>
      </div></section>
      @if(error()){<div class="error" role="alert"><mat-icon>error_outline</mat-icon>{{error()}}</div>}
      <footer><a mat-button routerLink="/tickets">Cancelar</a><button mat-flat-button [disabled]="form.invalid||loading()">@if(loading()){<mat-spinner diameter="20"/>}@else{Enviar solicitud}</button></footer>
    </form></mat-card>
    <aside><mat-icon>tips_and_updates</mat-icon><h3>Recomendaciones</h3><ul><li>Pasos que provocaron el problema.</li><li>Dispositivo o servicio afectado.</li><li>Urgente: trabajo bloqueado.</li></ul><div><mat-icon>schedule</mat-icon><span><strong>Tiempo de respuesta habitual</strong><small>En un plazo de 2 horas laborables</small></span></div></aside></div>
  `,
  styles:[`
    .back{display:inline-flex;align-items:center;gap:6px;color:var(--sf-link);text-decoration:none;font-size:13px;margin-bottom:24px}.back small{opacity:.7;font-size:11px;margin-left:4px}header{text-align:center;margin-bottom:28px}header p{font-size:11px;letter-spacing:.14em;color:var(--sf-teal);font-weight:700}header h1{font-size:32px;color:var(--sf-heading);margin:5px}header span{color:var(--sf-muted)}.layout{display:grid;grid-template-columns:minmax(0,760px) 270px;gap:22px;justify-content:center}.layout>mat-card{padding:28px;border-color:var(--sf-border)}section{display:flex;gap:18px;padding:4px 0 28px;margin-bottom:25px;border-bottom:1px solid var(--sf-line)}.step{display:grid;place-items:center;flex:0 0 32px;height:32px;border-radius:50%;background:var(--sf-step-bg);color:var(--sf-step-fg);font-weight:700}.fields{flex:1}.fields h2{font-size:18px;color:var(--sf-heading);margin:4px 0}.fields>p{font-size:13px;color:var(--sf-muted);margin:0 0 20px}.fields>mat-form-field{display:block;width:100%;margin-bottom:8px}.row{display:grid;grid-template-columns:1fr 1fr;gap:14px}.row mat-form-field{width:100%}.files-section{border-bottom:0;margin-bottom:8px}.files{list-style:none;padding:0;margin:16px 0 0}.files li{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--sf-line);color:var(--sf-text);font-size:13px}.files li span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.files small{color:var(--sf-muted)}.files mat-icon{color:var(--sf-teal)}.hint{margin:10px 0 0;font-size:12px;color:var(--sf-muted)}footer{display:flex;justify-content:flex-end;gap:10px}footer button{background:var(--sf-teal-deep);color:#fff;min-width:155px}footer mat-spinner{margin:auto}.error{display:flex;align-items:center;gap:8px;color:var(--sf-danger);background:var(--sf-danger-bg);padding:12px;border-radius:8px;margin-bottom:16px}aside{background:var(--sf-teal-bg-2);border:1px solid var(--sf-teal-border);border-radius:12px;padding:24px;height:max-content;color:var(--sf-teal-body)}aside>mat-icon{color:var(--sf-teal)}aside h3{color:var(--sf-teal-ink)}aside li{font-size:13px;margin:11px 0;line-height:1.5}aside>div{display:flex;gap:10px;border-top:1px solid var(--sf-teal-border);margin-top:20px;padding-top:18px}aside>div span{display:flex;flex-direction:column}aside small{color:var(--sf-teal-muted)}aside strong{color:var(--sf-teal-ink)}@media(max-width:900px){.layout{grid-template-columns:1fr}aside{display:none}}@media(max-width:550px){.layout>mat-card{padding:18px}.row{grid-template-columns:1fr}section{gap:10px}}
  `]
})
export class TicketCreatePage implements OnInit{
  private readonly fb=inject(FormBuilder);private readonly api=inject(HelpdeskService);private readonly router=inject(Router);
  readonly loading=signal(false);readonly error=signal('');readonly categories=signal<Category[]>([]);readonly files=signal<File[]>([]);
  readonly levels=[{value:1,label:'Baja'},{value:2,label:'Media'},{value:3,label:'Alta'}];
  readonly form=this.fb.nonNullable.group({title:['',[Validators.required,Validators.maxLength(200)]],description:['',[Validators.required,Validators.minLength(10)]],categoryId:['',Validators.required],impact:[2,Validators.required],urgency:[2,Validators.required]});
  ngOnInit():void{this.api.categories().subscribe({next:categories=>this.categories.set(categories),error:()=>this.error.set('No se pudieron cargar las categorías.')});}
  submit():void{if(this.form.invalid)return;this.loading.set(true);this.error.set('');this.api.createTicket(this.form.getRawValue(),this.files()).pipe(finalize(()=>this.loading.set(false))).subscribe({next:t=>void this.router.navigate(['/tickets',t.id]),error:e=>this.error.set(e.error?.message??'No se pudo crear la solicitud.')});}
  label(value:string):string{return uiLabel(value);}
  onFiles(event:Event):void{
    const input=event.target as HTMLInputElement;
    const incoming=Array.from(input.files??[]);
    input.value='';
    const next=[...this.files()];
    for(const file of incoming){
      if(file.size>10*1024*1024){this.error.set(`"${file.name}" supera los 10 MB.`);continue;}
      if(next.length>=5){this.error.set('Puedes adjuntar como máximo 5 archivos.');break;}
      if(!next.some(existing=>existing.name===file.name&&existing.size===file.size)) next.push(file);
    }
    this.files.set(next);
  }
  removeFile(file:File):void{this.files.set(this.files().filter(item=>item!==file));}
  isImage(file:File):boolean{return file.type.startsWith('image/');}
  sizeLabel(bytes:number):string{return bytes<1024?`${bytes} B`:bytes<1024*1024?`${Math.round(bytes/1024)} KB`:`${(bytes/1024/1024).toFixed(1)} MB`;}
}
