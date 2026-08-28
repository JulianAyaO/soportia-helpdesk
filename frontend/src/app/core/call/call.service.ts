import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { RealtimeEvent, RealtimeService } from '../realtime/realtime.service';

export type CallPhase = 'idle' | 'ringing-out' | 'ringing-in' | 'active';

const ICE: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

@Injectable({ providedIn: 'root' })
export class CallService {
  private readonly realtime = inject(RealtimeService);
  private readonly auth = inject(AuthService);
  private pc?: RTCPeerConnection;
  private camera?: MediaStream;
  private screen?: MediaStream;
  private pendingIce: RTCIceCandidateInit[] = [];
  private makingOffer = false;

  readonly phase = signal<CallPhase>('idle');
  readonly callId = signal<string | null>(null);
  readonly peerId = signal<string | null>(null);
  readonly peerName = signal('');
  readonly error = signal('');
  readonly micOn = signal(true);
  readonly camOn = signal(false);
  readonly sharing = signal(false);
  readonly hasCamera = signal(false);
  readonly joining = signal(false);
  readonly localStream = signal<MediaStream | null>(null);
  readonly remoteStream = signal<MediaStream | null>(null);
  readonly busy = computed(() => this.phase() !== 'idle');

  constructor() {
    this.realtime.events.subscribe(event => this.onEvent(event));
  }

  async start(peerId: string, peerName: string): Promise<void> {
    if (this.busy() || !peerId) return;
    this.error.set('');
    try {
      await this.ensureCamera();
    } catch {
      this.error.set('No se pudo acceder al micrófono.');
      return;
    }
    const callId = crypto.randomUUID();
    this.callId.set(callId);
    this.peerId.set(peerId);
    this.peerName.set(peerName);
    this.phase.set('ringing-out');
    this.realtime.sendCall({
      action: 'invite',
      callId,
      to: peerId,
      fromName: this.auth.user()?.displayName ?? '',
    });
  }

  async accept(stream?: MediaStream): Promise<void> {
    if (this.phase() !== 'ringing-in' || !this.callId() || this.joining()) return;
    this.joining.set(true);
    this.error.set('');
    try {
      if (stream) {
        this.useCamera(await this.pickWorkingCamera(stream));
      } else {
        await this.ensureCamera();
      }
      this.openPeer();
      this.phase.set('active');
      this.realtime.sendCall({ action: 'accept', callId: this.callId()! });
    } catch {
      this.error.set('No se pudo acceder al micrófono.');
    } finally {
      this.joining.set(false);
    }
  }

  reject(): void {
    const id = this.callId();
    if (id) this.realtime.sendCall({ action: 'reject', callId: id });
    this.reset();
  }

  hangup(): void {
    const id = this.callId();
    if (id && this.phase() !== 'idle') this.realtime.sendCall({ action: 'hangup', callId: id });
    this.reset();
  }

  clearError(): void {
    this.error.set('');
  }

  toggleMic(): void {
    const on = !this.micOn();
    this.micOn.set(on);
    this.camera?.getAudioTracks().forEach(track => { track.enabled = on; });
  }

  toggleCam(): void {
    if (this.sharing() || !this.hasCamera()) return;
    const on = !this.camOn();
    this.camOn.set(on);
    this.camera?.getVideoTracks().forEach(track => { track.enabled = on; });
  }

  async toggleScreen(): Promise<void> {
    if (this.phase() !== 'active') return;
    if (this.sharing()) {
      this.stopScreen();
      return;
    }
    try {
      const screen = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const track = screen.getVideoTracks()[0];
      if (!track) return;
      this.screen = screen;
      this.sharing.set(true);
      await this.replaceVideo(track);
      this.localStream.set(this.mixedLocal());
      track.onended = () => this.stopScreen();
    } catch {
      /* user cancelled the picker */
    }
  }

  private async onEvent(event: RealtimeEvent): Promise<void> {
    if (event.type === 'presence' && event.userId === this.peerId() && event.online === false) {
      this.reset();
      return;
    }
    if (event.type !== 'call' || !event.action) return;
    if (event.action === 'invite') {
      if (this.busy()) {
        if (event.callId) this.realtime.sendCall({ action: 'reject', callId: event.callId });
        return;
      }
      this.callId.set(event.callId ?? null);
      this.peerId.set(event.from ?? null);
      this.peerName.set(event.fromName || 'Llamada');
      this.phase.set('ringing-in');
      return;
    }
    if (event.callId && this.callId() && event.callId !== this.callId()) return;
    if (event.action === 'unavailable' || event.action === 'busy' || event.action === 'reject' || event.action === 'hangup') {
      if (event.action === 'unavailable') this.error.set('No está disponible.');
      if (event.action === 'busy') this.error.set('Ocupado en otra llamada.');
      if (event.action === 'reject') this.error.set('La llamada fue rechazada.');
      this.reset(event.action !== 'hangup');
      return;
    }
    if (event.action === 'accept' && this.phase() === 'ringing-out') {
      this.phase.set('active');
      this.openPeer();
      await this.sendOffer();
      return;
    }
    if (event.action === 'signal' && event.payload) await this.onSignal(event.payload);
  }

  private async onSignal(payload: { kind?: string; sdp?: string; candidate?: RTCIceCandidateInit }): Promise<void> {
    if (!this.pc) this.openPeer();
    const pc = this.pc!;
    if (payload.kind === 'offer' && payload.sdp) {
      await pc.setRemoteDescription({ type: 'offer', sdp: payload.sdp });
      await this.flushIce();
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this.sendSignal({ kind: 'answer', sdp: answer.sdp });
      return;
    }
    if (payload.kind === 'answer' && payload.sdp) {
      await pc.setRemoteDescription({ type: 'answer', sdp: payload.sdp });
      await this.flushIce();
      return;
    }
    if (payload.kind === 'ice' && payload.candidate) {
      if (!pc.remoteDescription) this.pendingIce.push(payload.candidate);
      else await pc.addIceCandidate(payload.candidate);
    }
  }

  private async sendOffer(): Promise<void> {
    if (!this.pc || this.makingOffer) return;
    this.makingOffer = true;
    try {
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);
      this.sendSignal({ kind: 'offer', sdp: offer.sdp });
    } finally {
      this.makingOffer = false;
    }
  }

  private openPeer(): void {
    if (this.pc) return;
    const pc = new RTCPeerConnection(ICE);
    this.pc = pc;
    this.camera?.getTracks().forEach(track => pc.addTrack(track, this.camera!));
    if (!this.camera?.getVideoTracks().length) {
      pc.addTransceiver('video', { direction: 'recvonly' });
    }
    pc.onicecandidate = event => {
      if (event.candidate) this.sendSignal({ kind: 'ice', candidate: event.candidate.toJSON() });
    };
    pc.ontrack = event => {
      const tracks = this.remoteStream()?.getTracks() ?? [];
      if (!tracks.includes(event.track)) tracks.push(event.track);
      this.remoteStream.set(new MediaStream(tracks));
    };
    pc.onconnectionstatechange = () => {
      if (this.phase() === 'idle') return;
      if (pc.connectionState === 'failed') this.hangup();
    };
  }

  private useCamera(stream: MediaStream): void {
    this.camera = stream;
    const video = stream.getVideoTracks().some(track => track.readyState === 'live' && track.enabled);
    this.hasCamera.set(video);
    this.camOn.set(video);
    this.micOn.set(stream.getAudioTracks().some(track => track.enabled));
    this.localStream.set(stream);
    stream.getVideoTracks().forEach(track => {
      track.onunmute = () => this.localStream.set(new MediaStream(stream.getTracks()));
    });
  }

  private async ensureCamera(): Promise<void> {
    if (this.camera) return;
    this.useCamera(await this.acquireMedia());
  }

  /** First call after the click: this is what shows the browser permission dialog. */
  private async acquireMedia(): Promise<MediaStream> {
    let granted: MediaStream;
    try {
      granted = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    } catch (first) {
      try {
        granted = await navigator.mediaDevices.getUserMedia({ audio: true, video: { facingMode: 'user' } });
      } catch {
        granted = await navigator.mediaDevices.getUserMedia({ audio: true, video: false }).catch(() => {
          throw first;
        });
      }
    }
    return this.pickWorkingCamera(granted);
  }

  /** Camera is optional. Never keep Phone Link / the Windows “no camera” placeholder track. */
  private async pickWorkingCamera(stream: MediaStream): Promise<MediaStream> {
    const audio = stream.getAudioTracks();
    let current: MediaStreamTrack | undefined = stream.getVideoTracks()[0];
    const devices = (await navigator.mediaDevices.enumerateDevices())
      .filter(device =>
        device.kind === 'videoinput'
        && device.deviceId
        && device.deviceId !== 'communications'
        && !this.isVirtualCamera(device.label),
      )
      .sort((a, b) => this.cameraScore(b) - this.cameraScore(a));

    const assemble = (video?: MediaStreamTrack) => {
      const next = new MediaStream(audio);
      if (video) next.addTrack(video);
      return next;
    };

    const dropVideo = () => {
      current?.stop();
      stream.getVideoTracks().forEach(track => {
        track.stop();
        stream.removeTrack(track);
      });
      return assemble();
    };

    if (!devices.length) return dropVideo();

    if (current && !this.isVirtualCamera(current.label) && await this.videoHasPicture(current)) {
      return assemble(current);
    }

    for (const device of devices) {
      if (current && current.getSettings().deviceId === device.deviceId) {
        if (await this.videoHasPicture(current)) return assemble(current);
        continue;
      }
      try {
        current?.stop();
        current = undefined;
        const probe = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { deviceId: { exact: device.deviceId } },
        });
        const track = probe.getVideoTracks()[0];
        if (track && !this.isVirtualCamera(track.label) && await this.videoHasPicture(track)) {
          return assemble(track);
        }
        probe.getTracks().forEach(track => track.stop());
      } catch {
        /* try the next camera */
      }
    }

    return dropVideo();
  }

  private cameraScore(device: MediaDeviceInfo): number {
    const label = device.label.toLowerCase();
    if (this.isVirtualCamera(label)) return -20;
    if (device.deviceId === 'default') return 1;
    if (/integrated|internal|built-?in|usb|webcam|logitech|realtek|intel|hd camera|life[ck]am/.test(label)) return 40;
    return label ? 10 : 0;
  }

  private isVirtualCamera(label: string): boolean {
    return /phone link|your phone|mi tel[eé]fono|c[aá]mara conectada|connected camera|obs virtual|manycam|snap camera|iriun|droidcam|epoccam|ivcam/.test(label.toLowerCase());
  }

  private videoHasPicture(track: MediaStreamTrack): Promise<boolean> {
    if (track.readyState !== 'live') return Promise.resolve(false);
    const settings = track.getSettings();
    if (!this.isVirtualCamera(track.label) && (settings.width ?? 0) >= 16 && (settings.height ?? 0) >= 16) {
      return Promise.resolve(true);
    }
    return new Promise(resolve => {
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.srcObject = new MediaStream([track]);
      let done = false;
      const finish = (ok: boolean) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        video.onloadeddata = null;
        video.srcObject = null;
        video.remove();
        resolve(ok);
      };
      const timer = setTimeout(() => finish(video.videoWidth >= 16 && video.videoHeight >= 16), 1500);
      video.onloadeddata = () => {
        if (video.videoWidth >= 16 && video.videoHeight >= 16) finish(true);
      };
      void video.play().catch(() => { /* wait for the timeout */ });
    });
  }

  private async replaceVideo(track: MediaStreamTrack): Promise<void> {
    const sender = this.pc?.getSenders().find(item => item.track?.kind === 'video');
    if (sender) {
      await sender.replaceTrack(track);
      return;
    }
    this.pc?.addTrack(track);
    await this.sendOffer();
  }

  private stopScreen(): void {
    this.screen?.getTracks().forEach(track => track.stop());
    this.screen = undefined;
    this.sharing.set(false);
    const cam = this.camera?.getVideoTracks()[0];
    if (cam) void this.replaceVideo(cam);
    this.localStream.set(this.camera ?? null);
  }

  private mixedLocal(): MediaStream {
    const mix = new MediaStream();
    this.camera?.getAudioTracks().forEach(track => mix.addTrack(track));
    (this.screen?.getVideoTracks()[0] ? this.screen : this.camera)?.getVideoTracks().forEach(track => mix.addTrack(track));
    return mix;
  }

  private async flushIce(): Promise<void> {
    const queued = this.pendingIce.splice(0);
    for (const candidate of queued) {
      try { await this.pc?.addIceCandidate(candidate); } catch { /* ignore */ }
    }
  }

  private sendSignal(payload: { kind: string; sdp?: string; candidate?: RTCIceCandidateInit }): void {
    const callId = this.callId();
    if (!callId) return;
    this.realtime.sendCall({ action: 'signal', callId, payload });
  }

  private reset(keepError = false): void {
    this.phase.set('idle');
    this.pc?.close();
    this.pc = undefined;
    this.camera?.getTracks().forEach(track => track.stop());
    this.screen?.getTracks().forEach(track => track.stop());
    this.camera = undefined;
    this.screen = undefined;
    this.pendingIce = [];
    this.makingOffer = false;
    this.callId.set(null);
    this.peerId.set(null);
    this.peerName.set('');
    this.micOn.set(true);
    this.camOn.set(false);
    this.hasCamera.set(false);
    this.sharing.set(false);
    this.joining.set(false);
    this.localStream.set(null);
    this.remoteStream.set(null);
    if (!keepError) this.error.set('');
  }
}
