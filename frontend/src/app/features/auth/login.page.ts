import { Component, inject, OnDestroy, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, MatButtonModule, MatCardModule, MatFormFieldModule, MatIconModule, MatInputModule, MatProgressSpinnerModule],
  template: `
    <main class="login-shell">
      <section class="brand-panel" (pointermove)="nudgeOrbs($event)" (pointerleave)="restOrbs()">
        <div class="orbs" aria-hidden="true">
          @for (shift of orbShift(); track $index) {
            <span class="orb" [style.transform]="'scale(' + shift.scale + ')'" [style.transform-origin]="shift.ox + '% ' + shift.oy + '%'">
              <i></i>
            </span>
          }
        </div>
        <div class="brand"><span class="brand-mark"><mat-icon>support_agent</mat-icon></span><span>Soportia</span></div>
        <div class="hero">
          <p class="eyebrow">Sistema de Gestión de Soporte Técnico</p>
          <h1>La ayuda está más cerca de lo que crees.</h1>
          <p class="lead">Un solo lugar para solicitar soporte, seguir el avance y mantener a tu equipo en marcha.</p>
        </div>
      </section>

      <section class="form-panel">
        <mat-card appearance="outlined" class="login-card">
          <div class="card-mark" aria-hidden="true"><mat-icon>lock_open</mat-icon></div>
          <mat-card-header>
            <mat-card-title>Bienvenido de nuevo</mat-card-title>
            <mat-card-subtitle>Inicia sesión en Soportia</mat-card-subtitle>
          </mat-card-header>
          <mat-card-content>
            <form [formGroup]="form" (ngSubmit)="submit()">
              <mat-form-field appearance="outline">
                <mat-label>Correo electrónico</mat-label>
                <mat-icon matPrefix>mail</mat-icon>
                <input matInput type="email" autocomplete="username" formControlName="email">
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Contraseña</mat-label>
                <mat-icon matPrefix>lock</mat-icon>
                <input matInput [type]="showPassword() ? 'text' : 'password'" autocomplete="current-password" formControlName="password">
                <button mat-icon-button matSuffix type="button" (click)="showPassword.set(!showPassword())" [attr.aria-label]="showPassword() ? 'Ocultar contraseña' : 'Mostrar contraseña'">
                  <mat-icon>{{ showPassword() ? 'visibility_off' : 'visibility' }}</mat-icon>
                </button>
              </mat-form-field>
              @if (error()) {
                <div class="error" role="alert"><mat-icon>error_outline</mat-icon><span>{{ error() }}</span></div>
              }
              <button mat-flat-button class="submit" [disabled]="form.invalid || loading()">
                @if (loading()) {
                  <mat-spinner diameter="20"/>
                } @else {
                  Iniciar sesión
                }
                @if (!loading()) {
                  <mat-icon>arrow_forward</mat-icon>
                }
              </button>
            </form>

            <div class="divider"><span>CUENTAS DE DEMOSTRACIÓN</span></div>
            <div class="demos">
              @for (demo of demos; track demo.email) {
                <button type="button" class="demo" [attr.data-tone]="demo.tone" (click)="quickLogin(demo.email)">
                  <span class="demo-icon"><mat-icon>{{demo.icon}}</mat-icon></span>
                  <span class="demo-copy">
                    <strong>{{demo.label}}</strong>
                    <small>{{demo.hint}}</small>
                  </span>
                  <span class="demo-email">{{demo.email}}</span>
                  <mat-icon class="demo-go">chevron_right</mat-icon>
                </button>
              }
            </div>
          </mat-card-content>
        </mat-card>
      </section>
    </main>
  `,
  styles: [`
    :host { display: block; min-height: 100dvh; }
    .login-shell {
      display: grid;
      grid-template-columns: 1.08fr .92fr;
      min-height: 100dvh;
      background: var(--sf-page);
    }

    .brand-panel {
      position: relative;
      overflow: hidden;
      padding: 44px clamp(36px, 6vw, 88px) 40px;
      color: white;
      display: flex;
      flex-direction: column;
      background: linear-gradient(155deg, #0b2744 0%, #16456f 48%, #126c68 100%);
      background-size: 160% 160%;
      animation: wash 18s ease-in-out infinite;
    }
    .orb {
      position: absolute;
      display: block;
      pointer-events: none;
      will-change: transform;
      transform-origin: 50% 50%;
      transition: transform .55s cubic-bezier(.22, 1, .36, 1), transform-origin .45s ease;
    }
    .orb:nth-child(1) { top: -80px; right: -90px; }
    .orb:nth-child(2) { left: -70px; bottom: 80px; }
    .orb:nth-child(3) { right: 18%; bottom: 18%; }
    .orbs i {
      display: block;
      border-radius: 50%;
      filter: blur(2px);
      animation: drift 16s ease-in-out infinite;
    }
    .orb:nth-child(1) i { width: 340px; height: 340px; background: #2bb8a828; }
    .orb:nth-child(2) i { width: 220px; height: 220px; background: #7ad7ff1c; animation-delay: -5s; }
    .orb:nth-child(3) i { width: 140px; height: 140px; background: #ffffff14; animation-delay: -9s; }
    .brand, .hero { position: relative; z-index: 1; }
    .brand { display: flex; align-items: center; gap: 12px; font-weight: 700; font-size: 20px; animation: rise .7s ease both; }
    .hero { flex: 1; display: flex; flex-direction: column; justify-content: center; }
    .brand-mark {
      display: grid;
      place-items: center;
      width: 40px;
      height: 40px;
      border-radius: 12px;
      background: #1aa399;
      box-shadow: 0 8px 20px #0b2a2833;
      animation: pulse 4.5s 1s ease-in-out infinite;
    }
    .brand-mark mat-icon { color: white; }
    .eyebrow { color: #7ee0d0; font-weight: 700; letter-spacing: .08em; font-size: 12px; text-transform: uppercase; margin: 0 0 10px; animation: reveal .8s .1s both; }
    .brand-panel h1 {
      font-size: clamp(40px, 4.8vw, 64px);
      line-height: 1.04;
      letter-spacing: -.04em;
      max-width: 620px;
      margin: 0 0 16px;
      animation: reveal .9s .22s both;
    }
    .lead { font-size: 17px; line-height: 1.65; color: #d3e0ec; max-width: 520px; margin: 0; animation: reveal .8s .38s both; }

    .form-panel { display: grid; place-items: center; padding: 32px 24px; position: relative; }
    .form-panel:before {
      content: "";
      position: absolute;
      width: 280px;
      height: 280px;
      border-radius: 50%;
      background: #2bb8a81a;
      filter: blur(42px);
      top: 10%;
      right: 6%;
      animation: glow 9s ease-in-out infinite;
    }
    .login-card {
      position: relative;
      width: min(460px, 100%);
      padding: 28px 26px 24px;
      border-radius: 22px;
      border-color: var(--sf-border);
      background: var(--sf-surface);
      box-shadow: 0 24px 70px #18334f16;
      animation: rise .75s .12s ease both;
    }
    .card-mark {
      width: 46px;
      height: 46px;
      display: grid;
      place-items: center;
      margin: 4px 0 8px 14px;
      border-radius: 14px;
      background: var(--sf-teal-bg);
      color: var(--sf-teal-deep);
      animation: rise .55s .22s both;
    }
    .login-card mat-card-header { animation: rise .55s .3s both; }
    .login-card form { animation: rise .55s .38s both; }
    .mat-mdc-card-title { font-size: 28px; letter-spacing: -.03em; color: var(--sf-heading); }
    .mat-mdc-card-subtitle { margin: 6px 0 22px; color: var(--sf-muted); }
    form, mat-form-field { display: block; width: 100%; }
    .submit {
      width: 100%;
      height: 50px;
      gap: 8px;
      background: linear-gradient(90deg, #126c68, #1a8a84) !important;
      box-shadow: 0 10px 22px #126c6830;
      transition: transform .18s ease, box-shadow .18s ease;
    }
    .submit mat-icon { transition: transform .18s ease; }
    .submit:not(:disabled):hover {
      transform: translateY(-1px);
      box-shadow: 0 14px 28px #126c6840;
    }
    .submit:not(:disabled):hover mat-icon { transform: translateX(4px); }
    .submit mat-spinner { margin: auto; }
    .error {
      display: flex;
      gap: 8px;
      align-items: flex-start;
      background: var(--sf-danger-bg);
      color: var(--sf-danger);
      padding: 10px 12px;
      border-radius: 10px;
      margin-bottom: 14px;
      font-size: 13px;
    }
    .divider {
      display: flex;
      align-items: center;
      gap: 12px;
      color: var(--sf-muted);
      font-size: 11px;
      letter-spacing: .12em;
      margin: 26px 0 14px;
      animation: rise .5s .48s both;
    }
    .divider:before, .divider:after { content: ""; height: 1px; background: var(--sf-line); flex: 1; }

    .demos { display: grid; gap: 10px; }
    .demo {
      display: grid;
      grid-template-columns: 42px 1fr auto 18px;
      align-items: center;
      gap: 10px;
      width: 100%;
      min-height: 64px;
      padding: 10px 12px;
      border: 1px solid var(--sf-border);
      border-radius: 14px;
      background: var(--sf-surface);
      text-align: left;
      cursor: pointer;
      transition: transform .18s ease, border-color .18s ease, box-shadow .18s ease;
    }
    .demo:nth-child(1) { animation: rise .5s .56s both; }
    .demo:nth-child(2) { animation: rise .5s .64s both; }
    .demo:nth-child(3) { animation: rise .5s .72s both; }
    .demo:nth-child(4) { animation: rise .5s .8s both; }
    .demo:hover {
      transform: translateY(-2px);
      border-color: var(--sf-teal-border);
      box-shadow: 0 10px 22px #17324a10;
    }
    .demo:hover .demo-go { transform: translateX(3px); }
    .demo-icon {
      display: grid;
      place-items: center;
      width: 42px;
      height: 42px;
      border-radius: 12px;
      background: #e8f1f6;
      color: #2a5d7a;
    }
    .demo[data-tone=agent] .demo-icon { background: #e7f6f1; color: #147565; }
    .demo[data-tone=ops] .demo-icon { background: #ece8f8; color: #5b4aa8; }
    .demo[data-tone=admin] .demo-icon { background: #fff1e6; color: #b45d18; }
    .demo-copy { display: flex; flex-direction: column; min-width: 0; }
    .demo-copy strong { font-size: 14px; color: var(--sf-heading); }
    .demo-copy small { color: var(--sf-muted); }
    .demo-email { color: var(--sf-faint); font-size: 11px; }
    .demo-go { color: var(--sf-faint); transition: transform .18s ease; }

    @keyframes drift {
      0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
      50% { transform: translate3d(18px, -16px, 0) scale(1.06); }
    }
    @keyframes rise {
      from { opacity: 0; transform: translateY(18px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes reveal {
      from { opacity: 0; transform: translateY(22px); filter: blur(8px); }
      to { opacity: 1; transform: none; filter: none; }
    }
    @keyframes wash {
      0%, 100% { background-position: 0% 40%; }
      50% { background-position: 80% 70%; }
    }
    @keyframes pulse {
      0%, 100% { box-shadow: 0 8px 20px #0b2a2833; }
      50% { box-shadow: 0 8px 28px #2bb8a866; }
    }
    @keyframes glow {
      0%, 100% { transform: translate(0, 0) scale(1); opacity: .65; }
      50% { transform: translate(-36px, 24px) scale(1.12); opacity: 1; }
    }

    @media (max-width: 900px) {
      .login-shell { grid-template-columns: 1fr; }
      .brand-panel { min-height: 320px; padding: 28px 24px 56px; }
      .brand-panel h1 { font-size: 36px; }
      .form-panel { margin-top: -36px; padding-top: 0; z-index: 1; }
    }
    @media (max-width: 520px) {
      .demo { grid-template-columns: 42px 1fr 18px; }
      .demo-email { display: none; }
    }
    @media (prefers-reduced-motion: reduce) {
      .brand-panel, .orbs i, .brand, .brand-mark, .eyebrow, .hero h1, .lead,
      .form-panel:before, .login-card, .card-mark, .login-card mat-card-header,
      .login-card form, .divider, .demo { animation: none !important; }
      .demo, .demo-go, .submit, .submit mat-icon, .orb { transition: none; }
    }
  `],
})
export class LoginPage implements OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly showPassword = signal(false);
  readonly orbShift = signal([
    { scale: 1, ox: 50, oy: 50 },
    { scale: 1, ox: 50, oy: 50 },
    { scale: 1, ox: 50, oy: 50 },
  ]);
  private orbFrame = 0;
  private orbRest: DOMRect[] | null = null;
  readonly form = this.fb.nonNullable.group({ email: ['', [Validators.required, Validators.email]], password: ['', Validators.required] });
  readonly demos = [
    { label: 'Camila Restrepo', email: 'employee@soportia.local', icon: 'person', hint: 'Tesorería · crea y sigue solicitudes', tone: 'employee' },
    { label: 'Andrés Molina', email: 'agent@soportia.local', icon: 'headset_mic', hint: 'Accesos, cuentas y solicitudes generales', tone: 'agent' },
    { label: 'Juliana Pérez', email: 'it-agent@soportia.local', icon: 'memory', hint: 'Equipos e infraestructura', tone: 'ops' },
    { label: 'Marta Suárez', email: 'admin@soportia.local', icon: 'admin_panel_settings', hint: 'Supervisa la mesa y la auditoría', tone: 'admin' },
  ];

  nudgeOrbs(event: PointerEvent): void {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const panel = event.currentTarget as HTMLElement;
    cancelAnimationFrame(this.orbFrame);
    this.orbFrame = requestAnimationFrame(() => {
      const orbs = Array.from(panel.querySelectorAll<HTMLElement>('.orb'));
      this.orbRest ??= orbs.map(orb => orb.getBoundingClientRect());
      const next = orbs.map((_, index) => {
        const box = this.orbRest?.[index];
        if (!box) return { scale: 1, ox: 50, oy: 50 };
        const dx = event.clientX - (box.left + box.width / 2);
        const dy = event.clientY - (box.top + box.height / 2);
        const distance = Math.hypot(dx, dy) || 1;
        const reach = Math.max(box.width, box.height) * 0.72;
        if (distance > reach) return { scale: 1, ox: 50, oy: 50 };
        const pressure = (1 - distance / reach) ** 2;
        const nx = dx / distance;
        const ny = dy / distance;
        return {
          scale: 1 - pressure * 0.18,
          ox: 50 - nx * 50,
          oy: 50 - ny * 50,
        };
      });
      this.orbShift.set(next);
    });
  }

  restOrbs(): void {
    cancelAnimationFrame(this.orbFrame);
    this.orbRest = null;
    this.orbShift.set([
      { scale: 1, ox: 50, oy: 50 },
      { scale: 1, ox: 50, oy: 50 },
      { scale: 1, ox: 50, oy: 50 },
    ]);
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.orbFrame);
  }

  private loginError(message?: string): string {
    if (message === 'Invalid credentials') return 'Credenciales no válidas. Comprueba tus datos e inténtalo de nuevo.';
    if (message === 'Too many login attempts. Try again later.') return 'Demasiados intentos de inicio de sesión. Inténtalo más tarde.';
    return message ?? 'No se pudo iniciar sesión. Comprueba tus credenciales e inténtalo de nuevo.';
  }

  quickLogin(email: string): void {
    this.form.setValue({ email, password: 'Demo123!' });
    this.submit();
  }

  submit(): void {
    if (this.form.invalid) return;
    this.loading.set(true); this.error.set('');
    this.auth.login(this.form.value.email!, this.form.value.password!).pipe(finalize(() => this.loading.set(false))).subscribe({
      next: () => void this.router.navigateByUrl(this.route.snapshot.queryParamMap.get('returnUrl') ?? '/dashboard'),
      error: (e) => this.error.set(this.loginError(e.error?.message)),
    });
  }
}
