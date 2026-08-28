import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

async function start(): Promise<void> {
  const privateLan = location.protocol === 'http:'
    && /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(location.hostname);
  if (privateLan) {
    try {
      await fetch(`http://127.0.0.1:${location.port || '80'}/`, { mode: 'no-cors', cache: 'no-store' });
      location.replace(`http://localhost:${location.port}${location.pathname}${location.search}${location.hash}`);
      return;
    } catch {
      /* this machine is not hosting the app */
    }
  }
  await bootstrapApplication(App, appConfig);
}

void start().catch(err => console.error(err));
