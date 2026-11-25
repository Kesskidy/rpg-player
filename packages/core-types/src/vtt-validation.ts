import type { TileMapData, VttClientMessage, VttServerMessage } from './index.js';

const MAX_VTT_MAP_DIM = 256;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isValidVttMapPayload(raw: unknown): raw is TileMapData {
  if (!isPlainObject(raw)) return false;
  const w = raw['width'];
  const h = raw['height'];
  const ts = raw['tileSize'];
  if (
    typeof raw['id'] !== 'string' ||
    typeof raw['name'] !== 'string' ||
    typeof w !== 'number' ||
    !Number.isInteger(w) ||
    w < 1 ||
    w > MAX_VTT_MAP_DIM ||
    typeof h !== 'number' ||
    !Number.isInteger(h) ||
    h < 1 ||
    h > MAX_VTT_MAP_DIM ||
    typeof ts !== 'number' ||
    !Number.isFinite(ts) ||
    ts < 4 ||
    ts > 256
  ) {
    return false;
  }
  const col = raw['collisionLayer'];
  if (!isPlainObject(col) || !Array.isArray(col['cells'])) return false;
  const spawn = raw['playerSpawn'];
  if (!isPlainObject(spawn) || typeof spawn['x'] !== 'number' || typeof spawn['y'] !== 'number') {
    return false;
  }
  return Array.isArray(raw['layers']);
}

export type VttValidationResult<T> =
  | { ok: true; msg: T }
  | { ok: false; errorCode: string; errorMessage: string };

/**
 * Shared client-to-server VTT message validator (used by VttRoomManager & protocol router).
 */
export function validateVttClientMessage(raw: unknown): VttValidationResult<VttClientMessage> {
  if (!isPlainObject(raw) || typeof raw['type'] !== 'string') {
    return {
      ok: false,
      errorCode: 'INVALID_MESSAGE',
      errorMessage: 'Message invalide : un objet avec un champ "type" est requis.',
    };
  }

  switch (raw['type']) {
    case 'create_room':
      if (
        typeof raw['roomName'] !== 'string' ||
        typeof raw['gmName'] !== 'string' ||
        !isValidVttMapPayload(raw['initialMap'])
      ) {
        return {
          ok: false,
          errorCode: 'INVALID_PAYLOAD',
          errorMessage: 'create_room exige roomName, gmName et une initialMap valide.',
        };
      }
      return { ok: true, msg: raw as unknown as VttClientMessage };

    case 'join_room':
      if (
        typeof raw['roomCode'] !== 'string' ||
        typeof raw['playerName'] !== 'string' ||
        (raw['sessionToken'] !== undefined && typeof raw['sessionToken'] !== 'string')
      ) {
        return {
          ok: false,
          errorCode: 'INVALID_PAYLOAD',
          errorMessage: 'join_room exige roomCode et playerName.',
        };
      }
      return { ok: true, msg: raw as unknown as VttClientMessage };

    case 'move_token':
      if (
        typeof raw['tokenId'] !== 'string' ||
        typeof raw['x'] !== 'number' ||
        !Number.isFinite(raw['x']) ||
        typeof raw['y'] !== 'number' ||
        !Number.isFinite(raw['y'])
      ) {
        return {
          ok: false,
          errorCode: 'INVALID_PAYLOAD',
          errorMessage: 'move_token exige tokenId, x et y numériques.',
        };
      }
      return { ok: true, msg: raw as unknown as VttClientMessage };

    case 'spawn_token':
      if (
        !isPlainObject(raw['token']) ||
        typeof raw['token']['name'] !== 'string' ||
        typeof raw['token']['x'] !== 'number' ||
        typeof raw['token']['y'] !== 'number'
      ) {
        return {
          ok: false,
          errorCode: 'INVALID_PAYLOAD',
          errorMessage: 'spawn_token exige un objet token valide.',
        };
      }
      return { ok: true, msg: raw as unknown as VttClientMessage };

    case 'update_token':
      if (typeof raw['tokenId'] !== 'string' || !isPlainObject(raw['patch'])) {
        return {
          ok: false,
          errorCode: 'INVALID_PAYLOAD',
          errorMessage: 'update_token exige tokenId et patch.',
        };
      }
      return { ok: true, msg: raw as unknown as VttClientMessage };

    case 'remove_token':
      if (typeof raw['tokenId'] !== 'string') {
        return {
          ok: false,
          errorCode: 'INVALID_PAYLOAD',
          errorMessage: 'remove_token exige tokenId.',
        };
      }
      return { ok: true, msg: raw as unknown as VttClientMessage };

    case 'change_map':
      if (!isValidVttMapPayload(raw['map'])) {
        return {
          ok: false,
          errorCode: 'INVALID_PAYLOAD',
          errorMessage: 'change_map exige une map valide.',
        };
      }
      return { ok: true, msg: raw as unknown as VttClientMessage };

    case 'update_fog':
      return { ok: true, msg: raw as unknown as VttClientMessage };

    case 'update_sheet':
      if (typeof raw['participantId'] !== 'string' || !isPlainObject(raw['patch'])) {
        return {
          ok: false,
          errorCode: 'INVALID_PAYLOAD',
          errorMessage: 'update_sheet exige participantId et patch.',
        };
      }
      return { ok: true, msg: raw as unknown as VttClientMessage };

    case 'send_chat':
      if (
        (raw['channel'] !== 'rp' && raw['channel'] !== 'hrp') ||
        typeof raw['text'] !== 'string'
      ) {
        return {
          ok: false,
          errorCode: 'INVALID_PAYLOAD',
          errorMessage: 'send_chat exige channel ("rp"|"hrp") et text.',
        };
      }
      return { ok: true, msg: raw as unknown as VttClientMessage };

    case 'roll_dice':
      if (typeof raw['formula'] !== 'string') {
        return {
          ok: false,
          errorCode: 'INVALID_PAYLOAD',
          errorMessage: 'roll_dice exige une formule de dés.',
        };
      }
      return { ok: true, msg: raw as unknown as VttClientMessage };

    case 'gm_trigger_event':
      if (
        (raw['kind'] !== 'event' && raw['kind'] !== 'music') ||
        typeof raw['title'] !== 'string' ||
        typeof raw['message'] !== 'string'
      ) {
        return {
          ok: false,
          errorCode: 'INVALID_PAYLOAD',
          errorMessage: 'gm_trigger_event exige kind, title et message.',
        };
      }
      return { ok: true, msg: raw as unknown as VttClientMessage };

    default:
      return {
        ok: false,
        errorCode: 'UNKNOWN_MESSAGE',
        errorMessage: `Type de message inconnu : "${raw['type']}"`,
      };
  }
}

function isValidRoomStatePayload(raw: unknown): boolean {
  if (!isPlainObject(raw)) return false;
  return (
    typeof raw['roomCode'] === 'string' &&
    typeof raw['roomName'] === 'string' &&
    Array.isArray(raw['participants']) &&
    Array.isArray(raw['tokens']) &&
    Array.isArray(raw['fogOfWar']) &&
    isValidVttMapPayload(raw['activeMap']) &&
    isPlainObject(raw['sheets'])
  );
}

/**
 * Shared server-to-client VTT message validator (used by VttClient before applying updates).
 */
export function validateVttServerMessage(raw: unknown): VttValidationResult<VttServerMessage> {
  if (!isPlainObject(raw) || typeof raw['type'] !== 'string') {
    return {
      ok: false,
      errorCode: 'INVALID_SERVER_MESSAGE',
      errorMessage: 'Message serveur VTT invalide.',
    };
  }

  switch (raw['type']) {
    case 'room_joined':
      if (
        typeof raw['roomCode'] !== 'string' ||
        typeof raw['participantId'] !== 'string' ||
        (raw['role'] !== 'gm' && raw['role'] !== 'player') ||
        !isValidRoomStatePayload(raw['state'])
      ) {
        return {
          ok: false,
          errorCode: 'INVALID_SERVER_PAYLOAD',
          errorMessage: 'Message room_joined malformé.',
        };
      }
      return { ok: true, msg: raw as unknown as VttServerMessage };

    case 'state_sync':
      if (!isValidRoomStatePayload(raw['state'])) {
        return {
          ok: false,
          errorCode: 'INVALID_SERVER_PAYLOAD',
          errorMessage: 'Message state_sync malformé.',
        };
      }
      return { ok: true, msg: raw as unknown as VttServerMessage };

    case 'chat_message':
      if (
        !isPlainObject(raw['message']) ||
        typeof raw['message']['id'] !== 'string' ||
        typeof raw['message']['text'] !== 'string'
      ) {
        return {
          ok: false,
          errorCode: 'INVALID_SERVER_PAYLOAD',
          errorMessage: 'Message chat_message malformé.',
        };
      }
      return { ok: true, msg: raw as unknown as VttServerMessage };

    case 'error':
      if (typeof raw['code'] !== 'string' || typeof raw['message'] !== 'string') {
        return {
          ok: false,
          errorCode: 'INVALID_SERVER_PAYLOAD',
          errorMessage: 'Message error malformé.',
        };
      }
      return { ok: true, msg: raw as unknown as VttServerMessage };

    default:
      return {
        ok: false,
        errorCode: 'UNKNOWN_SERVER_MESSAGE',
        errorMessage: `Message serveur inconnu : "${raw['type']}"`,
      };
  }
}
