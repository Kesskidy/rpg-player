import {
  validateVttServerMessage,
  type VttClientMessage,
  type VttServerMessage,
} from '@rpg-player/core-types';

export type VttConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface VttClientListeners {
  onStatusChange?: (status: VttConnectionStatus) => void;
  onMessage?: (message: VttServerMessage) => void;
  onError?: (reason: string) => void;
  onReconnecting?: (attempt: number, delayMs: number) => void;
}

export interface VttReconnectSession {
  roomCode: string;
  playerName: string;
  password?: string;
  sessionToken: string;
}

export interface VttClientOptions {
  autoReconnect?: boolean;
  reconnectBaseDelayMs?: number;
  reconnectMaxDelayMs?: number;
  maxReconnectAttempts?: number;
  WebSocketImpl?: typeof WebSocket;
}

/**
 * Browser / Electron WebSocket client for connecting to a VTT host server.
 * Validates incoming server payloads with `@rpg-player/core-types` and supports
 * automatic exponential-backoff reconnection using `sessionToken`.
 */
export class VttClient {
  private ws: WebSocket | null = null;
  private status: VttConnectionStatus = 'disconnected';
  private listeners: VttClientListeners;
  private readonly options: Required<Omit<VttClientOptions, 'WebSocketImpl'>> & {
    WebSocketImpl?: typeof WebSocket;
  };

  private currentUrl: string | null = null;
  private manualDisconnect = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private sessionToReclaim: VttReconnectSession | null = null;
  private pendingPlayerName: string | null = null;
  private pendingPassword: string | undefined = undefined;

  constructor(listeners: VttClientListeners = {}, options: VttClientOptions = {}) {
    this.listeners = listeners;
    this.options = {
      autoReconnect: options.autoReconnect ?? true,
      reconnectBaseDelayMs: options.reconnectBaseDelayMs ?? 1000,
      reconnectMaxDelayMs: options.reconnectMaxDelayMs ?? 30_000,
      maxReconnectAttempts: options.maxReconnectAttempts ?? 12,
      WebSocketImpl: options.WebSocketImpl,
    };
  }

  getStatus(): VttConnectionStatus {
    return this.status;
  }

  getSessionToken(): string | null {
    return this.sessionToReclaim?.sessionToken ?? null;
  }

  rememberSession(session: VttReconnectSession | null): void {
    this.sessionToReclaim = session ? { ...session } : null;
  }

  private setStatus(next: VttConnectionStatus): void {
    this.status = next;
    this.listeners.onStatusChange?.(next);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private openSocket(url: string, isReconnect: boolean): Promise<void> {
    const WsCtor = this.options.WebSocketImpl ?? WebSocket;
    this.setStatus(isReconnect ? 'reconnecting' : 'connecting');

    return new Promise((resolve, reject) => {
      try {
        const socket = new WsCtor(url);
        this.ws = socket;
        let settled = false;

        socket.addEventListener('open', () => {
          settled = true;
          this.reconnectAttempt = 0;
          this.setStatus('connected');

          if (isReconnect && this.sessionToReclaim) {
            try {
              this.send({
                type: 'join_room',
                roomCode: this.sessionToReclaim.roomCode,
                playerName: this.sessionToReclaim.playerName,
                password: this.sessionToReclaim.password,
                sessionToken: this.sessionToReclaim.sessionToken,
              });
            } catch {
              // Ignore transient send error; close listener will retry
            }
          }
          resolve();
        });

        socket.addEventListener('message', (event) => {
          try {
            const raw: unknown = JSON.parse(String(event.data));
            const validated = validateVttServerMessage(raw);
            if (!validated.ok) {
              this.listeners.onError?.(validated.errorMessage);
              return;
            }
            const msg = validated.msg;
            if (msg.type === 'room_joined' && msg.sessionToken) {
              const participant = msg.state.participants.find((p) => p.id === msg.participantId);
              this.sessionToReclaim = {
                roomCode: msg.roomCode,
                playerName:
                  participant?.name ?? this.pendingPlayerName ?? this.sessionToReclaim?.playerName ?? 'Joueur',
                password: this.pendingPassword ?? this.sessionToReclaim?.password,
                sessionToken: msg.sessionToken,
              };
            }
            this.listeners.onMessage?.(msg);
          } catch {
            this.listeners.onError?.('Message serveur VTT illisible.');
          }
        });

        socket.addEventListener('error', () => {
          const errMsg = `Impossible de joindre le serveur VTT (${url}).`;
          if (!isReconnect) {
            this.listeners.onError?.(errMsg);
          }
          if (!settled) {
            settled = true;
            if (!isReconnect) {
              this.setStatus('disconnected');
            }
            reject(new Error(errMsg));
          }
        });

        socket.addEventListener('close', () => {
          if (this.ws === socket) {
            this.ws = null;
            if (
              !this.manualDisconnect &&
              this.options.autoReconnect &&
              this.currentUrl &&
              this.sessionToReclaim &&
              this.reconnectAttempt < this.options.maxReconnectAttempts
            ) {
              this.scheduleReconnect();
            } else {
              this.setStatus('disconnected');
            }
          }
        });
      } catch (error) {
        this.setStatus('disconnected');
        reject(error);
      }
    });
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimer();
    const attempt = this.reconnectAttempt + 1;
    const delayMs = Math.min(
      this.options.reconnectMaxDelayMs,
      this.options.reconnectBaseDelayMs * Math.pow(2, this.reconnectAttempt),
    );
    this.reconnectAttempt = attempt;
    this.setStatus('reconnecting');
    this.listeners.onReconnecting?.(attempt, delayMs);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.manualDisconnect || !this.currentUrl) return;
      void this.openSocket(this.currentUrl, true).catch(() => {
        if (
          !this.manualDisconnect &&
          this.options.autoReconnect &&
          this.sessionToReclaim &&
          this.reconnectAttempt < this.options.maxReconnectAttempts
        ) {
          this.scheduleReconnect();
        } else {
          this.setStatus('disconnected');
        }
      });
    }, delayMs);
  }

  connect(url: string): Promise<void> {
    this.disconnect();
    this.manualDisconnect = false;
    this.currentUrl = url;
    this.reconnectAttempt = 0;
    return this.openSocket(url, false);
  }

  send(message: VttClientMessage): void {
    if (!this.ws || this.ws.readyState !== 1) {
      throw new Error('Connexion WebSocket VTT non ouverte.');
    }
    if (message.type === 'create_room') {
      this.pendingPlayerName = message.gmName;
      this.pendingPassword = message.password;
    } else if (message.type === 'join_room') {
      this.pendingPlayerName = message.playerName;
      this.pendingPassword = message.password;
    }
    this.ws.send(JSON.stringify(message));
  }

  disconnect(): void {
    this.manualDisconnect = true;
    this.clearReconnectTimer();
    this.currentUrl = null;
    this.sessionToReclaim = null;
    if (this.ws) {
      const sock = this.ws;
      this.ws = null;
      sock.close();
    }
    this.setStatus('disconnected');
  }
}
