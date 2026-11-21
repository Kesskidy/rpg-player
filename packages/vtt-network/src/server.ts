import type { VttClientMessage, VttServerMessage } from '@rpg-player/core-types';
import { WebSocketServer, type WebSocket } from 'ws';
import { VttRoomManager } from './room-manager.js';

export interface VttSocketLike {
  readonly readyState: number;
  send(data: string): void;
}

const SOCKET_OPEN = 1;

interface ClientSession {
  socket: VttSocketLike;
  roomCode: string | null;
  participantId: string | null;
}

export interface VttProtocolRouter {
  register(socket: VttSocketLike): void;
  handleRawMessage(socket: VttSocketLike, rawJson: string): void;
  unregister(socket: VttSocketLike): void;
}

/**
 * Transport-agnostic WebSocket protocol router connecting any VttSocketLike
 * (Node `ws` sockets or in-memory test sockets) to the authoritative VttRoomManager.
 */
export function createVttProtocolRouter(roomManager: VttRoomManager): VttProtocolRouter {
  const sessions = new Map<VttSocketLike, ClientSession>();

  function sendJson(socket: VttSocketLike, payload: VttServerMessage): void {
    if (socket.readyState === SOCKET_OPEN) {
      socket.send(JSON.stringify(payload));
    }
  }

  function broadcastRoomState(roomCode: string): void {
    for (const session of sessions.values()) {
      if (session.roomCode !== roomCode || !session.participantId) continue;
      const projected = roomManager.projectStateFor(roomCode, session.participantId);
      if (projected) {
        sendJson(session.socket, { type: 'state_sync', state: projected });
      }
    }
  }

  function broadcastChat(
    roomCode: string,
    message: Extract<VttServerMessage, { type: 'chat_message' }>['message'],
  ): void {
    for (const session of sessions.values()) {
      if (session.roomCode !== roomCode) continue;
      sendJson(session.socket, { type: 'chat_message', message });
    }
  }

  return {
    register(socket: VttSocketLike): void {
      sessions.set(socket, {
        socket,
        roomCode: null,
        participantId: null,
      });
    },

    handleRawMessage(socket: VttSocketLike, rawJson: string): void {
      const session = sessions.get(socket);
      if (!session) return;

      let parsed: VttClientMessage;
      try {
        parsed = JSON.parse(rawJson) as VttClientMessage;
      } catch {
        sendJson(socket, {
          type: 'error',
          code: 'BAD_JSON',
          message: 'Requête JSON invalide.',
        });
        return;
      }

      const outcome = roomManager.handleMessage(session.roomCode, session.participantId, parsed);
      if (!outcome.ok) {
        sendJson(socket, {
          type: 'error',
          code: outcome.errorCode ?? 'ERROR',
          message: outcome.errorMessage ?? 'Action refusée.',
        });
        return;
      }

      if (
        (parsed.type === 'create_room' || parsed.type === 'join_room') &&
        outcome.roomCode &&
        outcome.participantId &&
        outcome.role
      ) {
        session.roomCode = outcome.roomCode;
        session.participantId = outcome.participantId;
        const projected = roomManager.projectStateFor(outcome.roomCode, outcome.participantId);
        if (projected) {
          sendJson(socket, {
            type: 'room_joined',
            roomCode: outcome.roomCode,
            participantId: outcome.participantId,
            role: outcome.role,
            state: projected,
          });
        }
        broadcastRoomState(outcome.roomCode);
        return;
      }

      if (outcome.chatMessage && session.roomCode) {
        broadcastChat(session.roomCode, outcome.chatMessage);
      }

      if (outcome.broadcastState && session.roomCode) {
        broadcastRoomState(session.roomCode);
      }
    },

    unregister(socket: VttSocketLike): void {
      const session = sessions.get(socket);
      sessions.delete(socket);
      if (session?.roomCode && session.participantId) {
        if (roomManager.markDisconnected(session.roomCode, session.participantId)) {
          broadcastRoomState(session.roomCode);
        }
      }
    },
  };
}

export interface RunningVttServer {
  port: number;
  close: () => Promise<void>;
  roomManager: VttRoomManager;
}

/**
 * Authoritative Node.js WebSocket server hosting VTT Rooms.
 * Can run standalone (`npm.cmd run vtt:server`) or embedded inside Electron's main process.
 */
export function startVttServer(port = 8765, host = '0.0.0.0'): Promise<RunningVttServer> {
  const roomManager = new VttRoomManager();
  const router = createVttProtocolRouter(roomManager);
  const wss = new WebSocketServer({ port, host });

  wss.on('connection', (socket: WebSocket) => {
    router.register(socket);
    socket.on('message', (raw) => {
      router.handleRawMessage(socket, raw.toString('utf-8'));
    });
    socket.on('close', () => {
      router.unregister(socket);
    });
  });

  return new Promise((resolve, reject) => {
    wss.once('listening', () => {
      const address = wss.address();
      const actualPort = typeof address === 'object' && address ? address.port : port;
      resolve({
        port: actualPort,
        roomManager,
        close: () =>
          new Promise<void>((res, rej) => {
            for (const client of wss.clients) {
              client.close();
            }
            wss.close((err) => (err ? rej(err) : res()));
          }),
      });
    });
    wss.once('error', reject);
  });
}
