import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { finalize } from 'rxjs';
import { uiLabel } from '../../core/i18n/labels';
import { Category, ManagedUser, Role } from '../../core/models/api.models';
import { HelpdeskService } from '../../core/services/helpdesk.service';

@Component({
  selector: 'app-admin-users',
  imports: [ReactiveFormsModule, MatButtonModule, MatCardModule, MatFormFieldModule, MatIconModule, MatInputModule, MatProgressSpinnerModule, MatSelectModule, MatSlideToggleModule],
  template: `
    <header>
      <div>
        <p>ADMINISTRACIÓN</p>
        <h1>Personas</h1>
        <span>Cuentas de empleados y agentes.</span>
      </div>
    </header>
    <div class="layout">
      <mat-card appearance="outlined" class="form-card">
        <h2>Nueva cuenta</h2>
        <form [formGroup]="form" (ngSubmit)="create()">
          <mat-form-field appearance="outline"><mat-label>Nombre</mat-label><input matInput formControlName="displayName"></mat-form-field>
          <mat-form-field appearance="outline"><mat-label>Correo</mat-label><input matInput formControlName="email"></mat-form-field>
          <mat-form-field appearance="outline"><mat-label>Contraseña temporal</mat-label><input matInput type="password" formControlName="password"></mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Rol</mat-label>
            <mat-select formControlName="role">
              <mat-option value="EMPLOYEE">Empleado</mat-option>
              <mat-option value="SUPPORT_AGENT">Agente</mat-option>
            </mat-select>
          </mat-form-field>
          @if (form.controls.role.value === 'SUPPORT_AGENT') {
            <mat-form-field appearance="outline">
              <mat-label>Categoría que atiende</mat-label>
              <mat-select formControlName="categoryId">
                @for (category of categories(); track category.id) { <mat-option [value]="category.id">{{ category.name }}</mat-option> }
              </mat-select>
            </mat-form-field>
          }
          @if (error()) { <p class="error">{{ error() }}</p> }
          <button mat-flat-button type="submit" [disabled]="form.invalid || saving()">{{ saving() ? 'Creando…' : 'Crear cuenta' }}</button>
        </form>
      </mat-card>
      <mat-card appearance="outlined" class="table-card">
        <h2>Directorio</h2>
        @if (loading()) { <div class="state"><mat-spinner diameter="36"/></div> }
        @else {
          <div class="table-wrap"><table>
            <thead><tr><th>Persona</th><th>Rol</th><th>Categoría</th><th>Estado</th></tr></thead>
            <tbody>
              @for (user of users(); track user.id) {
                <tr [class.off]="!user.active">
                  <td><strong>{{ user.displayName }}</strong><small>{{ user.email }}</small></td>
                  <td>{{ label(user.role) }}</td>
                  <td>{{ user.categoryName || '—' }}</td>
                  <td>
                    @if (user.role !== 'ADMIN') {
                      <mat-slide-toggle [checked]="user.active" (change)="toggle(user, $event.checked)" [attr.aria-label]="'Activar o desactivar '+user.displayName"></mat-slide-toggle>
                    } @else { Activa }
                  </td>
                </tr>
              }
            </tbody>
          </table></div>
        }
      </mat-card>
    </div>
  `,
  styles: [`
    header{margin-bottom:24px}header p{font-size:11px;letter-spacing:.14em;color:var(--sf-teal);font-weight:700;margin:0}header h1{font-size:30px;color:var(--sf-heading);margin:5px 0}header span{color:var(--sf-muted)}
    .layout{display:grid;grid-template-columns:340px minmax(0,1fr);gap:18px}
    mat-card{border-color:var(--sf-border);padding:22px}h2{margin:0 0 16px;color:var(--sf-heading);font-size:16px}
    form{display:flex;flex-direction:column}form mat-form-field{width:100%}form button{background:var(--sf-teal-deep);color:white}
    .error{color:var(--sf-danger);font-size:13px}
    .table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;text-align:left}th{padding:10px 12px;color:var(--sf-muted);font-size:10px;letter-spacing:.08em}td{padding:12px;border-top:1px solid var(--sf-line);color:var(--sf-text);font-size:13px}
    td strong,td small{display:block}td small{color:var(--sf-faint);margin-top:3px}tr.off{opacity:.55}tbody tr{transition:background .16s ease}tbody tr:hover{background:var(--sf-surface-2)}
    .state{min-height:200px;display:grid;place-content:center}
    @media(max-width:900px){.layout{grid-template-columns:1fr}}
  `],
})
export class AdminUsersPage implements OnInit {
  private readonly api = inject(HelpdeskService);
  private readonly fb = inject(FormBuilder);
  readonly users = signal<ManagedUser[]>([]);
  readonly categories = signal<Category[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly form = this.fb.nonNullable.group({
    displayName: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
    role: 'EMPLOYEE' as Role,
    categoryId: '',
  });

  ngOnInit(): void {
    this.reload();
    this.api.categories().subscribe(categories => this.categories.set(categories));
  }

  create(): void {
    if (this.form.invalid) return;
    const value = this.form.getRawValue();
    if (value.role === 'SUPPORT_AGENT' && !value.categoryId) {
      this.error.set('Elige la categoría que va a atender el agente.');
      return;
    }
    this.saving.set(true); this.error.set('');
    this.api.createUser({
      email: value.email, displayName: value.displayName, password: value.password,
      role: value.role, categoryId: value.role === 'SUPPORT_AGENT' ? value.categoryId : undefined,
    }).pipe(finalize(() => this.saving.set(false))).subscribe({
      next: () => { this.form.reset({ displayName: '', email: '', password: '', role: 'EMPLOYEE', categoryId: '' }); this.reload(); },
      error: e => this.error.set(e.error?.detail ?? e.error?.message ?? 'No se pudo crear la cuenta.'),
    });
  }

  toggle(user: ManagedUser, active: boolean): void {
    this.api.updateUser(user.id, { active }).subscribe({ next: () => this.reload() });
  }

  label(value: string): string { return uiLabel(value); }
  private reload(): void {
    this.loading.set(true);
    this.api.adminUsers().subscribe({
      next: users => { this.users.set(users); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }
}
