import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { Subject } from 'rxjs';
import { AuthService } from '../auth/auth.service';

export interface RealtimeEvent {
  type: 'presence' | 'typing' | 'message' | 'hello' | 'pong' | 'call';
  userId?: string;
  role?: string;
  online?: boolean;
  threadId?: string;
  typing?: boolean;
  action?: 'invite' | 'accept' | 'reject' | 'hangup' | 'signal' | 'busy' | 'unavailable';
  callId?: string;
  from?: string;
  fromName?: string;
  fromRole?: string;
  to?: string;
  payload?: { kind?: string; sdp?: string; candidate?: RTCIceCandidateInit };
  onlineList?: Array<{ userId: string; role: string }>;
}

@Injectable({ providedIn: 'root' })
export class RealtimeService {
  private readonly auth = inject(AuthService);
  private socket?: WebSocket;
  private ping?: ReturnType<typeof setInterval>;
  private typingTimer?: ReturnType<typeof setTimeout>;
  private lastTyping = false;
  private lastThread?: string;
  private reconnect?: ReturnType<typeof setTimeout>;

  private readonly onlineIds = signal<Set<string>>(new Set());
  private readonly onlineAdmins = signal<Set<string>>(new Set());
  private readonly typingThreads = signal<Set<string>>(new Set());
  readonly events = new Subject<RealtimeEvent>();

  constructor() {
    effect(() => {
      const token = this.auth.token();
      untracked(() => {
        if (token) this.open(token);
        else this.close();
      });
    });
  }

  online(userId?: string | null): boolean {
    return !!userId && this.onlineIds().has(userId);
  }

  anyAdminOnline(): boolean {
    return this.onlineAdmins().size > 0;
  }

  firstAdminId(): string | undefined {
    return this.onlineAdmins().values().next().value;
  }

  sendCall(payload: Record<string, unknown>): void {
    this.send({ type: 'call', ...payload });
  }

  typing(threadId?: string | null): boolean {
    return !!threadId && this.typingThreads().has(threadId);
  }

  setTyping(threadId: string | undefined, typing: boolean): void {
    if (!threadId) return;
    if (this.typingTimer) clearTimeout(this.typingTimer);
    if (typing) {
      this.sendTyping(threadId, true);
      this.typingTimer = setTimeout(() => this.sendTyping(threadId, false), 2000);
      return;
    }
    this.sendTyping(threadId, false);
  }

  private sendTyping(threadId: string, typing: boolean): void {
    if (this.lastThread === threadId && this.lastTyping === typing) return;
    this.lastThread = threadId;
    this.lastTyping = typing;
    this.send({ type: 'typing', threadId, typing });
  }

  private open(token: string): void {
    this.close();
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    const socket = new WebSocket(`${protocol}://${location.host}/ws/realtime?access_token=${encodeURIComponent(token)}`);
    this.socket = socket;
    socket.onmessage = event => this.onMessage(String(event.data));
    socket.onopen = () => {
      this.ping = setInterval(() => this.send({ type: 'ping' }), 25_000);
    };
    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.socket = undefined;
      this.clearPing();
      if (this.auth.token()) {
        this.reconnect = setTimeout(() => {
          const next = this.auth.token();
          if (next) this.open(next);
        }, 2500);
      }
    };
  }

  private onMessage(raw: string): void {
    try {
      const data = JSON.parse(raw) as RealtimeEvent & { online?: boolean | Array<{ userId: string; role: string }> };
      if (data.type === 'hello' && Array.isArray(data.online)) {
        const peers = data.online as Array<{ userId: string; role: string }>;
        this.onlineIds.set(new Set(peers.map(peer => peer.userId)));
        this.onlineAdmins.set(new Set(peers.filter(peer => peer.role === 'ADMIN').map(peer => peer.userId)));
        this.events.next({ type: 'hello', onlineList: peers });
        return;
      }
      if (data.type === 'presence' && data.userId) {
        this.onlineIds.update(ids => this.toggle(ids, data.userId!, !!data.online));
        if (data.role === 'ADMIN') this.onlineAdmins.update(ids => this.toggle(ids, data.userId!, !!data.online));
        this.events.next(data);
        return;
      }
      if (data.type === 'typing' && data.threadId) {
        this.typingThreads.update(ids => this.toggle(ids, data.threadId!, !!data.typing));
        this.events.next(data);
        return;
      }
      if (data.type === 'message') this.events.next(data);
      if (data.type === 'call') this.events.next(data as RealtimeEvent);
    } catch {
      /* ignore malformed frames */
    }
  }

  private toggle(source: Set<string>, id: string, on: boolean): Set<string> {
    const next = new Set(source);
    if (on) next.add(id);
    else next.delete(id);
    return next;
  }

  private send(payload: Record<string, unknown>): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(payload));
  }

  private close(): void {
    if (this.reconnect) clearTimeout(this.reconnect);
    this.reconnect = undefined;
    this.clearPing();
    if (this.typingTimer) clearTimeout(this.typingTimer);
    if (this.lastTyping && this.lastThread) this.send({ type: 'typing', threadId: this.lastThread, typing: false });
    this.lastTyping = false;
    const socket = this.socket;
    this.socket = undefined;
    this.onlineIds.set(new Set());
    this.onlineAdmins.set(new Set());
    this.typingThreads.set(new Set());
    try { socket?.close(); } catch { /* already closed */ }
  }

  private clearPing(): void {
    if (this.ping) clearInterval(this.ping);
    this.ping = undefined;
  }
}
