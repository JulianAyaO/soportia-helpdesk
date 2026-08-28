import { afterNextRender, Component, effect, ElementRef, HostListener, inject, Injector, signal, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { overlayIsOpen } from '../keyboard';
import { CallService } from './call.service';

@Component({
  selector: 'app-call-overlay',
  imports: [MatButtonModule, MatIconModule],
  template: `
    @if (calls.error() && calls.phase() === 'idle') {
      <div class="sf-call-toast" role="status">
        <span>{{ calls.error() }}</span>
        <button type="button" (click)="calls.clearError()" aria-label="Cerrar">
          <mat-icon>close</mat-icon>
        </button>
      </div>
    }
    @if (calls.phase() === 'ringing-in' || calls.phase() === 'ringing-out') {
      <aside class="sf-call-dock ring" [class.moved]="!!pos()" [class.dragging]="!!drag()" [style.left.px]="pos()?.x" [style.top.px]="pos()?.y" aria-label="Llamada" (pointerdown)="onPointerDown($event)" (pointermove)="onPointerMove($event)" (pointerup)="onPointerUp()" (pointercancel)="onPointerUp()">
        <div class="sf-call-card">
          <p>{{ calls.phase() === 'ringing-in' ? 'Llamada de' : 'Llamando a' }}</p>
          <strong>{{ calls.peerName() }}</strong>
          @if (calls.error()) {
            <p class="sf-call-err">{{ calls.error() }}</p>
          }
          <div class="sf-call-actions">
            @if (calls.phase() === 'ringing-in') {
              <button mat-flat-button type="button" class="join" [disabled]="calls.joining()" (click)="join()">
                <mat-icon>videocam</mat-icon>{{ calls.joining() ? 'Conectando…' : 'Unirse' }}
              </button>
              <button mat-stroked-button type="button" [disabled]="calls.joining()" (click)="calls.reject()">Rechazar</button>
            } @else {
              <button mat-flat-button type="button" class="hang" (click)="calls.hangup()">
                <mat-icon>call_end</mat-icon>Colgar
              </button>
            }
          </div>
        </div>
      </aside>
    }
    @if (calls.phase() === 'active') {
      <aside class="sf-call-dock in-call" [class.mini]="minimized()" [class.moved]="minimized() && !!pos()" [class.dragging]="!!drag()" [style.left.px]="minimized() ? pos()?.x : null" [style.top.px]="minimized() ? pos()?.y : null" aria-label="Llamada en curso" (pointerdown)="onPointerDown($event)" (pointermove)="onPointerMove($event)" (pointerup)="onPointerUp()" (pointercancel)="onPointerUp()">
        <div class="sf-call-stage">
          <div class="sf-call-remote-slot" [class.empty]="!hasRemoteVideo()">
            <video #remote class="sf-call-remote" autoplay playsinline></video>
          </div>
          @if (hasLocalVideo()) {
            <div class="sf-call-local-slot" [class.pip]="hasRemoteVideo()">
              <video #local class="sf-call-local" autoplay playsinline muted></video>
            </div>
          }
          @if (!hasRemoteVideo()) {
            <p class="sf-call-wait">{{ calls.remoteStream() ? calls.peerName() : 'Conectando…' }}</p>
          }
        </div>
        <div class="sf-call-bar">
          <span class="sf-call-who">{{ calls.peerName() }}</span>
          <div class="sf-call-ctrls">
            <button type="button" class="sf-call-ctrl" (click)="minimized.set(!minimized())" [attr.aria-label]="minimized() ? 'Agrandar' : 'Minimizar'">
              <mat-icon>{{ minimized() ? 'open_in_full' : 'close_fullscreen' }}</mat-icon>
            </button>
            <button type="button" class="sf-call-ctrl" [class.off]="!calls.micOn()" (click)="calls.toggleMic()" [attr.aria-label]="calls.micOn() ? 'Silenciar micrófono' : 'Activar micrófono'">
              <mat-icon>{{ calls.micOn() ? 'mic' : 'mic_off' }}</mat-icon>
            </button>
            <button type="button" class="sf-call-ctrl" [class.off]="!calls.camOn()" [disabled]="calls.sharing() || !calls.hasCamera()" (click)="calls.toggleCam()" [attr.aria-label]="calls.camOn() ? 'Apagar cámara' : 'Encender cámara'">
              <mat-icon>{{ calls.camOn() ? 'videocam' : 'videocam_off' }}</mat-icon>
            </button>
            <button type="button" class="sf-call-ctrl" [class.on]="calls.sharing()" (click)="calls.toggleScreen()" [attr.aria-label]="calls.sharing() ? 'Dejar de compartir pantalla' : 'Compartir pantalla'">
              <mat-icon>{{ calls.sharing() ? 'cancel_presentation' : 'screen_share' }}</mat-icon>
            </button>
            <button type="button" class="sf-call-ctrl hang" (click)="calls.hangup()" aria-label="Colgar">
              <mat-icon>call_end</mat-icon>
            </button>
          </div>
        </div>
      </aside>
    }
  `,
  styles: [`:host { display: contents; }`],
})
export class CallOverlayComponent {
  readonly calls = inject(CallService);
  readonly minimized = signal(false);
  readonly pos = signal<{ x: number; y: number } | null>(null);
  readonly drag = signal<{ dx: number; dy: number; w: number; h: number } | null>(null);
  private readonly injector = inject(Injector);
  private readonly remote = viewChild<ElementRef<HTMLVideoElement>>('remote');
  private readonly local = viewChild<ElementRef<HTMLVideoElement>>('local');

  constructor() {
    effect(() => {
      const phase = this.calls.phase();
      if (phase !== 'active') this.minimized.set(false);
      if (phase === 'idle') this.pos.set(null);
    });
    effect(() => {
      const remoteStream = this.calls.remoteStream();
      const localStream = this.calls.localStream();
      this.calls.phase();
      afterNextRender(() => this.bind(remoteStream, localStream), { injector: this.injector });
    });
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (overlayIsOpen() || this.calls.phase() !== 'active' || this.minimized()) return;
    this.minimized.set(true);
  }

  onPointerDown(event: PointerEvent): void {
    if (this.calls.phase() === 'active' && !this.minimized()) return;
    if ((event.target as HTMLElement).closest('button')) return;
    const dock = event.currentTarget as HTMLElement;
    const rect = dock.getBoundingClientRect();
    this.drag.set({ dx: event.clientX - rect.left, dy: event.clientY - rect.top, w: rect.width, h: rect.height });
    dock.setPointerCapture(event.pointerId);
  }

  onPointerMove(event: PointerEvent): void {
    const drag = this.drag();
    if (!drag) return;
    const x = Math.min(window.innerWidth - drag.w - 8, Math.max(8, event.clientX - drag.dx));
    const y = Math.min(window.innerHeight - drag.h - 8, Math.max(8, event.clientY - drag.dy));
    this.pos.set({ x, y });
  }

  onPointerUp(): void {
    this.drag.set(null);
  }

  hasRemoteVideo(): boolean {
    return !!this.calls.remoteStream()?.getVideoTracks().some(track => track.readyState === 'live');
  }

  hasLocalVideo(): boolean {
    return this.calls.camOn() && !!this.calls.localStream()?.getVideoTracks().some(track => track.readyState === 'live');
  }

  async join(): Promise<void> {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    } catch {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      } catch {
        this.calls.error.set('No se pudo acceder al micrófono.');
        return;
      }
    }
    await this.calls.accept(stream);
  }

  private bind(remoteStream: MediaStream | null, localStream: MediaStream | null): void {
    const remote = this.remote()?.nativeElement;
    const local = this.local()?.nativeElement;
    if (remote) {
      remote.playsInline = true;
      remote.autoplay = true;
      if (remote.srcObject !== remoteStream) remote.srcObject = remoteStream;
      void remote.play().catch(() => { /* wait for media */ });
    }
    if (local) {
      local.muted = true;
      local.playsInline = true;
      local.autoplay = true;
      if (local.srcObject !== localStream) local.srcObject = localStream;
      void local.play().catch(() => { /* muted local preview */ });
    }
  }
}
