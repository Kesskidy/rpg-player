import type { VttClientMessage, VttServerMessage } from '@rpg-player/core-types';

export type VttConnectionStatus = 'disconnected' | 'connecting' | 'connected';

export interface VttClientListeners {
  onStatusChange?: (status: VttConnectionStatus) => void;
  onMessage?: (message: VttServerMessage) => void;
  onError?: (reason: string) => void;
}

/**
 * Browser / Electron WebSocket client for connecting to a VTT host server.
 */
export class VttClient {
  private ws: WebSocket | null = null;
  private status: VttConnectionStatus = 'disconnected';
  private listeners: VttClientListeners;

  constructor(listeners: VttClientListeners = {}) {
    this.listeners = listeners;
  }

  getStatus(): VttConnectionStatus {
    return this.status;
  }

  private setStatus(next: VttConnectionStatus): void {
    this.status = next;
    this.listeners.onStatusChange?.(next);
  }

  connect(url: string): Promise<void> {
    this.disconnect();
    this.setStatus('connecting');

    return new Promise((resolve, reject) => {
      try {
        const socket = new WebSocket(url);
        this.ws = socket;
        let settled = false;

        socket.addEventListener('open', () => {
          settled = true;
          this.setStatus('connected');
          resolve();
        });

        socket.addEventListener('message', (event) => {
          try {
            const parsed = JSON.parse(String(event.data)) as VttServerMessage;
            this.listeners.onMessage?.(parsed);
          } catch {
            this.listeners.onError?.('Message serveur VTT illisible.');
          }
        });

        socket.addEventListener('error', () => {
          const errMsg = `Impossible de joindre le serveur VTT (${url}).`;
          this.listeners.onError?.(errMsg);
          if (!settled) {
            settled = true;
            this.setStatus('disconnected');
            reject(new Error(errMsg));
          }
        });

        socket.addEventListener('close', () => {
          if (this.ws === socket) {
            this.ws = null;
            this.setStatus('disconnected');
          }
        });
      } catch (error) {
        this.setStatus('disconnected');
        reject(error);
      }
    });
  }

  send(message: VttClientMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Connexion WebSocket VTT non ouverte.');
    }
    this.ws.send(JSON.stringify(message));
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.setStatus('disconnected');
  }
}
