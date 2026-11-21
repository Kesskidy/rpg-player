import type { VttServerMessage } from '@rpg-player/core-types';
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

      try {
        let parsed: unknown;
        try {
          parsed = JSON.parse(rawJson);
        } catch {
          sendJson(socket, {
            type: 'error',
            code: 'BAD_JSON',
            message: 'Requête JSON invalide.',
          });
          return;
        }

        const msgType =
          typeof parsed === 'object' && parsed !== null
            ? (parsed as { type?: unknown }).type
            : undefined;

        // Refuse duplicate create_room / join_room on an already-joined socket (Bug #10)
        if (
          (msgType === 'create_room' || msgType === 'join_room') &&
          session.roomCode !== null &&
          session.participantId !== null
        ) {
          sendJson(socket, {
            type: 'error',
            code: 'ALREADY_IN_ROOM',
            message: 'Cette connexion appartient déjà à un salon actif.',
          });
          return;
        }

        const outcome = roomManager.handleMessage(
          session.roomCode,
          session.participantId,
          parsed,
        );
        if (!outcome.ok) {
          sendJson(socket, {
            type: 'error',
            code: outcome.errorCode ?? 'ERROR',
            message: outcome.errorMessage ?? 'Action refusée.',
          });
          return;
        }

        if (
          (msgType === 'create_room' || msgType === 'join_room') &&
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
              sessionToken: outcome.sessionToken,
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
      } catch (err) {
        sendJson(socket, {
          type: 'error',
          code: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : 'Erreur interne du serveur VTT.',
        });
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
const MAX_WS_PAYLOAD_BYTES = 2 * 1024 * 1024; // 2 MiB max payload to prevent DoS

export function startVttServer(port = 8765, host = '0.0.0.0'): Promise<RunningVttServer> {
  const roomManager = new VttRoomManager();
  const router = createVttProtocolRouter(roomManager);
  const wss = new WebSocketServer({ port, host, maxPayload: MAX_WS_PAYLOAD_BYTES });

  // Periodically prune abandoned rooms where everyone disconnected (Bug #10)
  const pruneTimer = setInterval(() => {
    roomManager.pruneIdleRooms();
  }, 5 * 60 * 1000);
  pruneTimer.unref?.();

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
            clearInterval(pruneTimer);
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
