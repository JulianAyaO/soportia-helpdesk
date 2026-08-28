import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ThemeService } from './core/theme/theme.service';
import { ThemeToggleComponent } from './core/theme/theme-toggle.component';

@Component({
  imports: [RouterOutlet, ThemeToggleComponent],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  constructor() {
    inject(ThemeService);
  }
}
