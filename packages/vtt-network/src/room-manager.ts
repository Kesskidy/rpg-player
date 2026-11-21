import {
  VTT_PROTOCOL_VERSION,
  type TileMapData,
  type VttCharacterSheet,
  type VttChatMessage,
  type VttClientMessage,
  type VttParticipant,
  type VttRole,
  type VttRoomState,
  type VttToken,
} from '@rpg-player/core-types';
import { rollDiceFormula } from './dice.js';
import { validateVttClientMessage } from './validation.js';

const MAX_PLAYER_MOVE_DISTANCE = 6;

interface InternalRoom {
  state: VttRoomState;
  password: string | null;
  sessionTokens: Map<string, string>;
  lastActivityMs: number;
}

export interface RoomActionOutcome {
  ok: boolean;
  errorCode?: string;
  errorMessage?: string;
  roomCode?: string;
  participantId?: string;
  role?: VttRole;
  sessionToken?: string;
  chatMessage?: VttChatMessage;
  broadcastState?: boolean;
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateRoomCode(existing: Set<string>): string {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    let code = '';
    for (let i = 0; i < 6; i += 1) {
      code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]!;
    }
    if (!existing.has(code)) return code;
  }
  return `R${Date.now().toString(36).toUpperCase().slice(-5)}`;
}

let seq = 0;
function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}_${Date.now().toString(36)}_${seq.toString(36)}`;
}

const TOKEN_COLORS = ['#38bdf8', '#34d399', '#f472b6', '#fbbf24', '#a78bfa', '#fb7185'];

function createInitialFog(map: TileMapData, hidden: boolean): number[] {
  return Array<number>(map.width * map.height).fill(hidden ? 1 : 0);
}

function revealAround(fog: number[], width: number, height: number, cx: number, cy: number, radius: number): void {
  const rSq = radius * radius;
  for (let ty = Math.max(0, cy - radius); ty <= Math.min(height - 1, cy + radius); ty += 1) {
    for (let tx = Math.max(0, cx - radius); tx <= Math.min(width - 1, cx + radius); tx += 1) {
      const dx = tx - cx;
      const dy = ty - cy;
      if (dx * dx + dy * dy <= rSq) {
        fog[ty * width + tx] = 0;
      }
    }
  }
}

/**
 * Authoritative VTT room & permission state machine (pure TypeScript, zero network dependency).
 * Enforces GM vs Player roles, tile collision checks, and server-side Fog-of-War token filtering.
 */
export class VttRoomManager {
  private readonly rooms = new Map<string, InternalRoom>();
  private readonly rng: () => number;

  constructor(rng: () => number = Math.random) {
    this.rng = rng;
  }

  getRoomCodes(): string[] {
    return Array.from(this.rooms.keys());
  }

  /**
   * Projects a room state for a specific participant:
   * - GM receives the complete unfiltered state.
   * - Players NEVER receive tokens hidden by `visibleToPlayers === false`
   *   or standing inside an unrevealed Fog of War cell (anti-cheat).
   */
  projectStateFor(roomCode: string, participantId: string): VttRoomState | null {
    const room = this.rooms.get(roomCode.toUpperCase());
    if (!room) return null;

    const participant = room.state.participants.find((p) => p.id === participantId);
    const isGm = participant?.role === 'gm';

    const state = room.state;
    const mapW = state.activeMap.width;

    // Precompute dynamic light visibility from player-owned tokens
    const playerTokens = isGm
      ? []
      : state.tokens.filter((tok) => tok.ownerIds.includes(participantId));

    const isTileLitByPlayer = (x: number, y: number): boolean => {
      for (const pt of playerTokens) {
        if (pt.lightRadius <= 0) continue;
        const dx = pt.x - x;
        const dy = pt.y - y;
        if (dx * dx + dy * dy <= pt.lightRadius * pt.lightRadius) {
          return true;
        }
      }
      return false;
    };

    const visibleTokens = isGm
      ? state.tokens.map((t) => ({ ...t, ownerIds: [...t.ownerIds] }))
      : state.tokens
          .filter((token) => {
            if (token.ownerIds.includes(participantId)) return true;
            if (!token.visibleToPlayers) return false;
            if (!state.fogEnabled) return true;
            const fogVal = state.fogOfWar[token.y * mapW + token.x] ?? 0;
            if (fogVal === 0) return true;
            return isTileLitByPlayer(token.x, token.y);
          })
          .map((t) => ({ ...t, ownerIds: [...t.ownerIds] }));

    // Anti-cheat (Bug #9): hide map events located in unrevealed fog cells from non-GM clients
    const projectedMap = isGm
      ? state.activeMap
      : {
          ...state.activeMap,
          events: (state.activeMap.events ?? []).filter((ev) => {
            if (!state.fogEnabled) return true;
            const fogVal = state.fogOfWar[ev.y * mapW + ev.x] ?? 0;
            if (fogVal === 0) return true;
            return isTileLitByPlayer(ev.x, ev.y);
          }),
        };

    return {
      ...state,
      activeMap: projectedMap,
      participants: state.participants.map((p) => ({ ...p })),
      fogOfWar: [...state.fogOfWar],
      tokens: visibleTokens,
      sheets: Object.fromEntries(
        Object.entries(state.sheets).map(([id, sheet]) => [
          id,
          { ...sheet, inventory: sheet.inventory.map((it) => ({ ...it })) },
        ]),
      ),
      chat: state.chat.slice(-100),
      activeAnnouncement: state.activeAnnouncement ? { ...state.activeAnnouncement } : null,
    };
  }

  handleMessage(
    roomCode: string | null,
    participantId: string | null,
    rawMsg: VttClientMessage | unknown,
  ): RoomActionOutcome {
    const validated = validateVttClientMessage(rawMsg);
    if (!validated.ok) {
      return {
        ok: false,
        errorCode: validated.errorCode,
        errorMessage: validated.errorMessage,
      };
    }
    const msg = validated.msg;

    if (msg.type === 'create_room') {
      return this.createRoom(msg);
    }
    if (msg.type === 'join_room') {
      return this.joinRoom(msg);
    }

    if (!roomCode || !participantId) {
      return {
        ok: false,
        errorCode: 'NOT_IN_ROOM',
        errorMessage: 'Vous devez rejoindre ou créer un salon VTT.',
      };
    }

    const room = this.rooms.get(roomCode.toUpperCase());
    if (!room) {
      return { ok: false, errorCode: 'ROOM_NOT_FOUND', errorMessage: 'Salon introuvable.' };
    }

    const participant = room.state.participants.find((p) => p.id === participantId);
    if (!participant) {
      return { ok: false, errorCode: 'UNAUTHORIZED', errorMessage: 'Participant inconnu.' };
    }
    room.lastActivityMs = Date.now();

    switch (msg.type) {
      case 'move_token':
        return this.moveToken(room, participant, msg.tokenId, msg.x, msg.y);
      case 'spawn_token':
        return this.spawnToken(room, participant, msg.token);
      case 'update_token':
        return this.updateToken(room, participant, msg.tokenId, msg.patch);
      case 'remove_token':
        return this.removeToken(room, participant, msg.tokenId);
      case 'change_map':
        return this.changeMap(room, participant, msg.map, msg.hideAllFog ?? true);
      case 'update_fog':
        return this.updateFog(room, participant, msg);
      case 'update_sheet':
        return this.updateSheet(room, participant, msg.participantId, msg.patch);
      case 'send_chat':
        return this.sendChat(room, participant, msg.channel, msg.text);
      case 'roll_dice':
        return this.rollDice(room, participant, msg.formula, msg.label);
      case 'gm_trigger_event':
        return this.triggerEvent(room, participant, msg.kind, msg.title, msg.message);
      default:
        return {
          ok: false,
          errorCode: 'UNKNOWN_MESSAGE',
          errorMessage: 'Type de message inconnu.',
        };
    }
  }

  markDisconnected(roomCode: string, participantId: string): boolean {
    const room = this.rooms.get(roomCode.toUpperCase());
    if (!room) return false;
    const participant = room.state.participants.find((p) => p.id === participantId);
    if (!participant) return false;
    participant.connected = false;
    room.lastActivityMs = Date.now();
    return true;
  }

  /**
   * Removes empty/abandoned rooms where all participants are disconnected for at least `maxIdleMs`.
   */
  pruneIdleRooms(maxIdleMs = 30 * 60 * 1000, nowMs = Date.now()): string[] {
    const removed: string[] = [];
    for (const [code, room] of this.rooms.entries()) {
      const anyoneConnected = room.state.participants.some((p) => p.connected);
      if (!anyoneConnected && nowMs - room.lastActivityMs >= maxIdleMs) {
        this.rooms.delete(code);
        removed.push(code);
      }
    }
    return removed;
  }

  private pushSystemChat(room: InternalRoom, text: string): VttChatMessage {
    const message: VttChatMessage = {
      id: nextId('msg'),
      timestamp: new Date().toISOString(),
      senderId: 'system',
      senderName: 'Système',
      senderRole: 'system',
      channel: 'system',
      text,
    };
    room.state.chat.push(message);
    if (room.state.chat.length > 200) {
      room.state.chat.shift();
    }
    return message;
  }

  private createRoom(
    msg: Extract<VttClientMessage, { type: 'create_room' }>,
  ): RoomActionOutcome {
    const roomCode = generateRoomCode(new Set(this.rooms.keys()));
    const gmId = nextId('gm');
    const gmName = msg.gmName.trim() || 'Maître du Jeu';
    const map = msg.initialMap;

    const fog = createInitialFog(map, true);
    revealAround(fog, map.width, map.height, map.playerSpawn.x, map.playerSpawn.y, 4);

    // Seed tokens from map events (NPCs) if present
    const initialTokens: VttToken[] = (map.events ?? [])
      .filter((ev) => ev.kind === 'npc')
      .map((ev) => ({
        id: nextId('tok'),
        name: ev.name,
        kind: 'npc' as const,
        x: ev.x,
        y: ev.y,
        color: '#06b6d4',
        spriteAssetId: ev.spriteAssetId,
        ownerIds: [gmId],
        hp: 30,
        maxHp: 30,
        mp: 10,
        maxMp: 10,
        lightRadius: 0,
        visibleToPlayers: true,
        isSolid: ev.isSolid,
        collider: ev.collider ? { ...ev.collider } : undefined,
      }));

    const state: VttRoomState = {
      protocolVersion: VTT_PROTOCOL_VERSION,
      roomCode,
      roomName: msg.roomName.trim() || `Table de ${gmName}`,
      hasPassword: Boolean(msg.password && msg.password.trim().length > 0),
      gmParticipantId: gmId,
      participants: [{ id: gmId, name: gmName, role: 'gm', connected: true }],
      activeMap: map,
      fogOfWar: fog,
      fogEnabled: true,
      tokens: initialTokens,
      sheets: {},
      chat: [],
      activeAnnouncement: null,
    };

    const sessionToken = nextId('ses');
    const room: InternalRoom = {
      state,
      password: msg.password?.trim() || null,
      sessionTokens: new Map([[sessionToken, gmId]]),
      lastActivityMs: Date.now(),
    };

    this.pushSystemChat(room, `Salon « ${state.roomName} » ouvert par ${gmName} (Code : ${roomCode}).`);
    this.rooms.set(roomCode, room);

    return {
      ok: true,
      roomCode,
      participantId: gmId,
      role: 'gm',
      sessionToken,
      broadcastState: true,
    };
  }

  private joinRoom(
    msg: Extract<VttClientMessage, { type: 'join_room' }>,
  ): RoomActionOutcome {
    const code = msg.roomCode.trim().toUpperCase();
    const room = this.rooms.get(code);
    if (!room) {
      return {
        ok: false,
        errorCode: 'ROOM_NOT_FOUND',
        errorMessage: `Aucun salon trouvé pour le code "${code}".`,
      };
    }
    if (room.password && room.password !== (msg.password?.trim() ?? '')) {
      return {
        ok: false,
        errorCode: 'INVALID_PASSWORD',
        errorMessage: 'Mot de passe du salon incorrect.',
      };
    }

    room.lastActivityMs = Date.now();

    // Reconnection via sessionToken reclaims the existing participant without duplicating tokens/sheets (Bug #10)
    if (msg.sessionToken) {
      const existingId = room.sessionTokens.get(msg.sessionToken);
      const existingParticipant = existingId
        ? room.state.participants.find((p) => p.id === existingId)
        : undefined;
      if (existingParticipant) {
        existingParticipant.connected = true;
        this.pushSystemChat(room, `${existingParticipant.name} s’est reconnecté(e).`);
        return {
          ok: true,
          roomCode: code,
          participantId: existingParticipant.id,
          role: existingParticipant.role,
          sessionToken: msg.sessionToken,
          broadcastState: true,
        };
      }
    }

    const playerId = nextId('plr');
    const sessionToken = nextId('ses');
    room.sessionTokens.set(sessionToken, playerId);
    const playerName = msg.playerName.trim() || `Joueur ${room.state.participants.length}`;
    const participant: VttParticipant = {
      id: playerId,
      name: playerName,
      role: 'player',
      connected: true,
    };
    room.state.participants.push(participant);

    // Create default character sheet & controllable player token at spawn
    const sheet: VttCharacterSheet = {
      participantId: playerId,
      characterName: playerName,
      hp: 100,
      maxHp: 100,
      mp: 30,
      maxMp: 30,
      atk: 12,
      def: 5,
      gold: 25,
      inventory: [
        { itemId: 'potion_soin', quantity: 2 },
        { itemId: 'epee_fer', quantity: 1 },
      ],
      notes: '',
    };
    room.state.sheets[playerId] = sheet;

    const map = room.state.activeMap;
    const color = TOKEN_COLORS[(room.state.participants.length - 1) % TOKEN_COLORS.length]!;
    const playerToken: VttToken = {
      id: nextId('tok'),
      name: playerName,
      kind: 'player',
      x: map.playerSpawn.x,
      y: map.playerSpawn.y,
      color,
      spriteAssetId: map.playerAssetId,
      ownerIds: [playerId],
      hp: sheet.hp,
      maxHp: sheet.maxHp,
      mp: sheet.mp,
      maxMp: sheet.maxMp,
      lightRadius: 3,
      visibleToPlayers: true,
      isSolid: true,
    };
    room.state.tokens.push(playerToken);

    this.pushSystemChat(room, `${playerName} a rejoint la table.`);

    return {
      ok: true,
      roomCode: code,
      participantId: playerId,
      role: 'player',
      sessionToken,
      broadcastState: true,
    };
  }

  private requireGm(participant: VttParticipant): RoomActionOutcome | null {
    if (participant.role !== 'gm') {
      return {
        ok: false,
        errorCode: 'FORBIDDEN_GM_ONLY',
        errorMessage: 'Action réservée au Maître du Jeu (MJ).',
      };
    }
    return null;
  }

  private moveToken(
    room: InternalRoom,
    participant: VttParticipant,
    tokenId: string,
    rawX: number,
    rawY: number,
  ): RoomActionOutcome {
    const token = room.state.tokens.find((t) => t.id === tokenId);
    if (!token) {
      return { ok: false, errorCode: 'TOKEN_NOT_FOUND', errorMessage: 'Token introuvable.' };
    }

    const isGm = participant.role === 'gm';
    if (!isGm && !token.ownerIds.includes(participant.id)) {
      return {
        ok: false,
        errorCode: 'FORBIDDEN_TOKEN',
        errorMessage: 'Vous n’avez pas la permission de déplacer ce token.',
      };
    }

    const x = Math.trunc(rawX);
    const y = Math.trunc(rawY);
    const map = room.state.activeMap;
    if (x < 0 || y < 0 || x >= map.width || y >= map.height) {
      return { ok: false, errorCode: 'OUT_OF_BOUNDS', errorMessage: 'Case hors de la carte.' };
    }

    // Players obey distance limit, collisionLayer AND solid tokens; GM can place tokens anywhere
    if (!isGm) {
      const chebyshevDist = Math.max(Math.abs(x - token.x), Math.abs(y - token.y));
      if (chebyshevDist > MAX_PLAYER_MOVE_DISTANCE) {
        return {
          ok: false,
          errorCode: 'MOVE_TOO_FAR',
          errorMessage: `Déplacement trop lointain (max ${MAX_PLAYER_MOVE_DISTANCE} cases par action).`,
        };
      }

      if ((map.collisionLayer.cells[y * map.width + x] ?? 0) !== 0) {
        return {
          ok: false,
          errorCode: 'COLLISION_BLOCKED',
          errorMessage: 'Déplacement bloqué par le calque de collision.',
        };
      }

      const blockingToken = room.state.tokens.find(
        (other) =>
          other.id !== token.id &&
          (other.isSolid ?? true) &&
          other.x === x &&
          other.y === y,
      );
      if (blockingToken) {
        // Generic message prevents leaking names of hidden/fogged tokens (Bug #9)
        return {
          ok: false,
          errorCode: 'TOKEN_BLOCKED',
          errorMessage: 'Case bloquée.',
        };
      }
    }

    token.x = x;
    token.y = y;

    // Moving a player token reveals tiles within its light radius if fog is active
    if (token.kind === 'player' && token.lightRadius > 0) {
      revealAround(room.state.fogOfWar, map.width, map.height, x, y, token.lightRadius);
    }

    return { ok: true, roomCode: room.state.roomCode, broadcastState: true };
  }

  private spawnToken(
    room: InternalRoom,
    participant: VttParticipant,
    tokenSpec: Omit<VttToken, 'id'>,
  ): RoomActionOutcome {
    const denied = this.requireGm(participant);
    if (denied) return denied;

    const map = room.state.activeMap;
    const clampedX = Math.max(0, Math.min(map.width - 1, Math.trunc(tokenSpec.x)));
    const clampedY = Math.max(0, Math.min(map.height - 1, Math.trunc(tokenSpec.y)));

    const token: VttToken = {
      ...tokenSpec,
      id: nextId('tok'),
      x: clampedX,
      y: clampedY,
      ownerIds: [...tokenSpec.ownerIds],
    };
    room.state.tokens.push(token);
    this.pushSystemChat(room, `Le MJ fait apparaître « ${token.name} ».`);
    return { ok: true, roomCode: room.state.roomCode, broadcastState: true };
  }

  private updateToken(
    room: InternalRoom,
    participant: VttParticipant,
    tokenId: string,
    patch: Partial<Omit<VttToken, 'id'>>,
  ): RoomActionOutcome {
    const denied = this.requireGm(participant);
    if (denied) return denied;

    const token = room.state.tokens.find((t) => t.id === tokenId);
    if (!token) {
      return { ok: false, errorCode: 'TOKEN_NOT_FOUND', errorMessage: 'Token introuvable.' };
    }
    Object.assign(token, patch);
    if (patch.ownerIds) {
      token.ownerIds = [...patch.ownerIds];
    }
    return { ok: true, roomCode: room.state.roomCode, broadcastState: true };
  }

  private removeToken(
    room: InternalRoom,
    participant: VttParticipant,
    tokenId: string,
  ): RoomActionOutcome {
    const denied = this.requireGm(participant);
    if (denied) return denied;

    const idx = room.state.tokens.findIndex((t) => t.id === tokenId);
    if (idx === -1) {
      return { ok: false, errorCode: 'TOKEN_NOT_FOUND', errorMessage: 'Token introuvable.' };
    }
    const [removed] = room.state.tokens.splice(idx, 1);
    if (removed) {
      this.pushSystemChat(room, `Le MJ retire « ${removed.name} » du plateau.`);
    }
    return { ok: true, roomCode: room.state.roomCode, broadcastState: true };
  }

  private changeMap(
    room: InternalRoom,
    participant: VttParticipant,
    map: TileMapData,
    hideAllFog: boolean,
  ): RoomActionOutcome {
    const denied = this.requireGm(participant);
    if (denied) return denied;

    room.state.activeMap = map;
    const fog = createInitialFog(map, hideAllFog);
    revealAround(fog, map.width, map.height, map.playerSpawn.x, map.playerSpawn.y, 4);
    room.state.fogOfWar = fog;

    // Keep player tokens and reposition them at the new map's spawn
    room.state.tokens = room.state.tokens
      .filter((t) => t.kind === 'player')
      .map((t) => ({
        ...t,
        x: map.playerSpawn.x,
        y: map.playerSpawn.y,
      }));

    this.pushSystemChat(room, `Le MJ change la scène active vers « ${map.name} ».`);
    return { ok: true, roomCode: room.state.roomCode, broadcastState: true };
  }

  private updateFog(
    room: InternalRoom,
    participant: VttParticipant,
    msg: Extract<VttClientMessage, { type: 'update_fog' }>,
  ): RoomActionOutcome {
    const denied = this.requireGm(participant);
    if (denied) return denied;

    const map = room.state.activeMap;
    if (msg.action === 'reveal_all') {
      room.state.fogOfWar.fill(0);
    } else if (msg.action === 'hide_all') {
      room.state.fogOfWar.fill(1);
    } else if (msg.action === 'set_enabled') {
      room.state.fogEnabled = Boolean(msg.enabled);
    }

    if (msg.cells) {
      for (const cell of msg.cells) {
        if (cell.x < 0 || cell.y < 0 || cell.x >= map.width || cell.y >= map.height) continue;
        room.state.fogOfWar[cell.y * map.width + cell.x] = cell.hidden ? 1 : 0;
      }
    }

    return { ok: true, roomCode: room.state.roomCode, broadcastState: true };
  }

  private updateSheet(
    room: InternalRoom,
    participant: VttParticipant,
    targetParticipantId: string,
    patch: Partial<Omit<VttCharacterSheet, 'participantId'>>,
  ): RoomActionOutcome {
    const sheet = room.state.sheets[targetParticipantId];
    if (!sheet) {
      return { ok: false, errorCode: 'SHEET_NOT_FOUND', errorMessage: 'Fiche personnage introuvable.' };
    }

    if (participant.role === 'gm') {
      Object.assign(sheet, patch);
      if (patch.inventory) {
        sheet.inventory = patch.inventory.map((it) => ({ ...it }));
      }
      // Keep matching player token HP/MP synchronized with sheet
      for (const token of room.state.tokens) {
        if (token.kind === 'player' && token.ownerIds.includes(targetParticipantId)) {
          token.hp = sheet.hp;
          token.maxHp = sheet.maxHp;
          token.mp = sheet.mp;
          token.maxMp = sheet.maxMp;
          token.name = sheet.characterName;
        }
      }
      return { ok: true, roomCode: room.state.roomCode, broadcastState: true };
    }

    // Players can only update their own characterName and RP notes
    if (participant.id !== targetParticipantId) {
      return {
        ok: false,
        errorCode: 'FORBIDDEN_SHEET',
        errorMessage: 'Seul le MJ peut modifier la fiche d’un autre joueur.',
      };
    }

    if (patch.notes !== undefined) sheet.notes = patch.notes;
    if (patch.characterName !== undefined && patch.characterName.trim()) {
      sheet.characterName = patch.characterName.trim();
    }
    return { ok: true, roomCode: room.state.roomCode, broadcastState: true };
  }

  private sendChat(
    room: InternalRoom,
    participant: VttParticipant,
    channel: 'rp' | 'hrp',
    text: string,
  ): RoomActionOutcome {
    const trimmed = text.trim();
    if (!trimmed) {
      return { ok: false, errorCode: 'EMPTY_MESSAGE', errorMessage: 'Message vide.' };
    }
    const message: VttChatMessage = {
      id: nextId('msg'),
      timestamp: new Date().toISOString(),
      senderId: participant.id,
      senderName:
        channel === 'rp'
          ? (room.state.sheets[participant.id]?.characterName ?? participant.name)
          : participant.name,
      senderRole: participant.role,
      channel,
      text: trimmed,
    };
    room.state.chat.push(message);
    if (room.state.chat.length > 200) {
      room.state.chat.shift();
    }
    return { ok: true, roomCode: room.state.roomCode, chatMessage: message };
  }

  private rollDice(
    room: InternalRoom,
    participant: VttParticipant,
    formula: string,
    label?: string,
  ): RoomActionOutcome {
    try {
      const roll = rollDiceFormula(formula, this.rng);
      const prefix = label?.trim() ? `${label.trim()} — ` : '';
      const message: VttChatMessage = {
        id: nextId('msg'),
        timestamp: new Date().toISOString(),
        senderId: participant.id,
        senderName: participant.name,
        senderRole: participant.role,
        channel: 'dice',
        text: `${prefix}${roll.formula} → [${roll.rolls.join(', ')}]${
          roll.modifier !== 0 ? (roll.modifier > 0 ? ` + ${roll.modifier}` : ` - ${Math.abs(roll.modifier)}`) : ''
        } = ${roll.total}`,
        roll,
      };
      room.state.chat.push(message);
      if (room.state.chat.length > 200) {
        room.state.chat.shift();
      }
      return { ok: true, roomCode: room.state.roomCode, chatMessage: message };
    } catch (error) {
      return {
        ok: false,
        errorCode: 'INVALID_DICE',
        errorMessage: error instanceof Error ? error.message : 'Formule de dés invalide.',
      };
    }
  }

  private triggerEvent(
    room: InternalRoom,
    participant: VttParticipant,
    kind: 'event' | 'music',
    title: string,
    message: string,
  ): RoomActionOutcome {
    const denied = this.requireGm(participant);
    if (denied) return denied;

    room.state.activeAnnouncement = {
      id: nextId('ann'),
      kind,
      title: title.trim() || (kind === 'music' ? 'Ambiance musicale' : 'Événement MJ'),
      message: message.trim(),
      timestamp: new Date().toISOString(),
    };
    this.pushSystemChat(
      room,
      `${kind === 'music' ? '♪ Musique' : '★ Événement'} — ${room.state.activeAnnouncement.title}${
        message.trim() ? ` : ${message.trim()}` : ''
      }`,
    );
    return { ok: true, roomCode: room.state.roomCode, broadcastState: true };
  }
}
