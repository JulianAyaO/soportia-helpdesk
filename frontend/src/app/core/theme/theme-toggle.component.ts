import { Component, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { ThemeService } from './theme.service';

@Component({
  selector: 'app-theme-toggle',
  imports: [MatIconModule],
  template: `
    <button type="button" class="theme-toggle" (click)="theme.toggle()" [attr.aria-pressed]="theme.dark()"
      [attr.aria-label]="theme.dark() ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'">
      <mat-icon>{{ theme.dark() ? 'light_mode' : 'dark_mode' }}</mat-icon>
      <span>{{ theme.dark() ? 'Modo claro' : 'Modo oscuro' }}</span>
    </button>
  `,
  styles: [`
    .theme-toggle {
      position: fixed;
      left: 16px;
      bottom: 16px;
      z-index: 40;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      height: 42px;
      padding: 0 14px 0 12px;
      border: 1px solid #ffffff22;
      border-radius: 999px;
      background: #102f4d;
      color: #e7eef5;
      font: 600 13px/1 Inter, Roboto, sans-serif;
      cursor: pointer;
      box-shadow: 0 8px 22px rgba(10, 24, 36, .28);
    }
    .theme-toggle:hover { background: #163a5a; }
    .theme-toggle mat-icon { font-size: 20px; width: 20px; height: 20px; }
    :host-context([data-theme="dark"]) .theme-toggle {
      background: #1e3a52;
      color: #f2f6f9;
    }
    :host-context([data-theme="dark"]) .theme-toggle:hover { background: #275a78; }
  `],
})
export class ThemeToggleComponent {
  readonly theme = inject(ThemeService);
}
