import { Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'soportia-theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly dark = signal(false);

  constructor() {
    this.apply(document.documentElement.dataset['theme'] === 'dark' || this.storedDark(), false);
  }

  toggle(): void {
    this.apply(!this.dark(), true);
  }

  private apply(dark: boolean, persist: boolean): void {
    this.dark.set(dark);
    document.documentElement.dataset['theme'] = dark ? 'dark' : 'light';
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    if (!persist) return;
    try {
      localStorage.setItem(STORAGE_KEY, dark ? 'dark' : 'light');
    } catch {
      /* ignore quota / private mode */
    }
  }

  private storedDark(): boolean {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'dark' || localStorage.getItem('sf-theme') === 'dark';
    } catch {
      return false;
    }
  }
}
