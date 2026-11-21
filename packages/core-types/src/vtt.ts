import type { ColliderBox } from './asset.js';
import type { TileMapData } from './map.js';
import type { InventorySlotEntry } from './rpg.js';

export const VTT_PROTOCOL_VERSION = 1 as const;

export type VttRole = 'gm' | 'player';

export type VttTokenKind = 'player' | 'npc' | 'monster';

export type VttChatChannel = 'rp' | 'hrp' | 'system' | 'dice';

export interface VttParticipant {
  id: string;
  name: string;
  role: VttRole;
  connected: boolean;
}

export interface VttToken {
  id: string;
  name: string;
  kind: VttTokenKind;
  /** Tile X coordinate. */
  x: number;
  /** Tile Y coordinate. */
  y: number;
  color: string;
  spriteAssetId: string | null;
  /** Participant IDs allowed to move this token (GM can always move any token). */
  ownerIds: string[];
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  /** Dynamic light / vision radius in tiles. */
  lightRadius: number;
  /** If false, hidden from players even outside fog of war (GM secret token). */
  visibleToPlayers: boolean;
  /** Whether this token blocks other tokens from entering its tile (defaults to true). */
  isSolid?: boolean;
  /** Optional feet collision footprint for large tokens/assets. */
  collider?: ColliderBox;
}

export interface VttCharacterSheet {
  participantId: string;
  characterName: string;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  atk: number;
  def: number;
  gold: number;
  inventory: InventorySlotEntry[];
  notes: string;
}

export interface VttDiceRollResult {
  formula: string;
  count: number;
  sides: number;
  modifier: number;
  rolls: number[];
  total: number;
}

export interface VttChatMessage {
  id: string;
  timestamp: string;
  senderId: string;
  senderName: string;
  senderRole: VttRole | 'system';
  channel: VttChatChannel;
  text: string;
  roll?: VttDiceRollResult;
}

export interface VttAnnouncement {
  id: string;
  kind: 'event' | 'music';
  title: string;
  message: string;
  timestamp: string;
}

/**
 * Synchronized state of a VTT room.
 * Server filters hidden tokens out before sending to non-GM clients.
 */
export interface VttRoomState {
  protocolVersion: typeof VTT_PROTOCOL_VERSION;
  roomCode: string;
  roomName: string;
  hasPassword: boolean;
  gmParticipantId: string;
  participants: VttParticipant[];
  activeMap: TileMapData;
  /** Flat row-major array of length activeMap.width * activeMap.height (1 = hidden by fog, 0 = revealed). */
  fogOfWar: number[];
  fogEnabled: boolean;
  tokens: VttToken[];
  sheets: Record<string, VttCharacterSheet>;
  chat: VttChatMessage[];
  activeAnnouncement: VttAnnouncement | null;
}

export interface FogCellUpdate {
  x: number;
  y: number;
  hidden: boolean;
}

export type VttClientMessage =
  | {
      type: 'create_room';
      roomName: string;
      password?: string;
      gmName: string;
      initialMap: TileMapData;
    }
  | {
      type: 'join_room';
      roomCode: string;
      password?: string;
      playerName: string;
      /** Optional session token received in a previous `room_joined` to reclaim the same seat on reconnect. */
      sessionToken?: string;
    }
  | {
      type: 'move_token';
      tokenId: string;
      x: number;
      y: number;
    }
  | {
      type: 'spawn_token';
      token: Omit<VttToken, 'id'>;
    }
  | {
      type: 'update_token';
      tokenId: string;
      patch: Partial<Omit<VttToken, 'id'>>;
    }
  | {
      type: 'remove_token';
      tokenId: string;
    }
  | {
      type: 'change_map';
      map: TileMapData;
      hideAllFog?: boolean;
    }
  | {
      type: 'update_fog';
      cells?: FogCellUpdate[];
      action?: 'reveal_all' | 'hide_all' | 'set_enabled';
      enabled?: boolean;
    }
  | {
      type: 'update_sheet';
      participantId: string;
      patch: Partial<Omit<VttCharacterSheet, 'participantId'>>;
    }
  | {
      type: 'send_chat';
      channel: 'rp' | 'hrp';
      text: string;
    }
  | {
      type: 'roll_dice';
      formula: string;
      label?: string;
    }
  | {
      type: 'gm_trigger_event';
      kind: 'event' | 'music';
      title: string;
      message: string;
    };

export type VttServerMessage =
  | {
      type: 'room_joined';
      roomCode: string;
      participantId: string;
      role: VttRole;
      sessionToken?: string;
      state: VttRoomState;
    }
  | {
      type: 'state_sync';
      state: VttRoomState;
    }
  | {
      type: 'chat_message';
      message: VttChatMessage;
    }
  | {
      type: 'error';
      code: string;
      message: string;
    };
