import { describe, expect, it } from 'vitest';
import { MAP_SCHEMA_VERSION, type TileMapData, type VttServerMessage } from '@rpg-player/core-types';
import { rollDiceFormula, VttRoomManager } from '../index.js';
import { createVttProtocolRouter, type VttSocketLike } from '../server.js';

function makeTestMap(id = 'map_tavern', name = 'Taverne'): TileMapData {
  const width = 10;
  const height = 10;
  const cells = Array<number>(width * height).fill(0);
  // Wall at (6, 5) on independent collisionLayer
  cells[5 * width + 6] = 1;
  return {
    schemaVersion: MAP_SCHEMA_VERSION,
    id,
    name,
    width,
    height,
    tileSize: 32,
    layers: [
      {
        id: 'layer_ground',
        name: 'Sol',
        plane: 'below',
        zOrder: 0,
        visible: true,
        opacity: 1,
        cells: {},
      },
    ],
    collisionLayer: {
      visibleInEditor: true,
      cells,
    },
    playerSpawn: { x: 5, y: 5, direction: 'down' },
    playerAssetId: null,
    events: [],
  };
}

describe('vtt-network authoritative room manager & dice', () => {
  it('parses and rolls dice formulas deterministically', () => {
    const result = rollDiceFormula('2d6+3', () => 0.5); // floor(0.5*6)+1 = 4 each
    expect(result).toEqual({
      formula: '2d6+3',
      count: 2,
      sides: 6,
      modifier: 3,
      rolls: [4, 4],
      total: 11,
    });
    expect(() => rollDiceFormula('invalid')).toThrow();
  });

  it('enforces Room password, GM vs Player permissions, collisions, and server-side Fog of War filtering', () => {
    const manager = new VttRoomManager(() => 0.99);
    const map = makeTestMap();

    // GM creates password-protected room
    const created = manager.handleMessage(null, null, {
      type: 'create_room',
      roomName: 'Campagne d’Or',
      password: 'dragon',
      gmName: 'MJ Aria',
      initialMap: map,
    });
    expect(created.ok).toBe(true);
    expect(created.role).toBe('gm');
    const roomCode = created.roomCode!;
    const gmId = created.participantId!;

    // Wrong password rejected
    const badJoin = manager.handleMessage(null, null, {
      type: 'join_room',
      roomCode,
      password: 'wrong',
      playerName: 'Léo',
    });
    expect(badJoin.ok).toBe(false);
    expect(badJoin.errorCode).toBe('INVALID_PASSWORD');

    // Correct password joins player
    const joined = manager.handleMessage(null, null, {
      type: 'join_room',
      roomCode,
      password: 'dragon',
      playerName: 'Léo',
    });
    expect(joined.ok).toBe(true);
    expect(joined.role).toBe('player');
    const playerId = joined.participantId!;

    // Player cannot spawn monsters or edit Fog of War
    const forbiddenSpawn = manager.handleMessage(roomCode, playerId, {
      type: 'spawn_token',
      token: {
        name: 'Dragon',
        kind: 'monster',
        x: 1,
        y: 1,
        color: '#ef4444',
        spriteAssetId: null,
        ownerIds: [],
        hp: 200,
        maxHp: 200,
        mp: 0,
        maxMp: 0,
        lightRadius: 0,
        visibleToPlayers: true,
      },
    });
    expect(forbiddenSpawn.ok).toBe(false);
    expect(forbiddenSpawn.errorCode).toBe('FORBIDDEN_GM_ONLY');

    // GM spawns a monster inside unrevealed fog at (0, 0)
    const spawned = manager.handleMessage(roomCode, gmId, {
      type: 'spawn_token',
      token: {
        name: 'Gobelin caché',
        kind: 'monster',
        x: 0,
        y: 0,
        color: '#ef4444',
        spriteAssetId: null,
        ownerIds: [],
        hp: 40,
        maxHp: 40,
        mp: 0,
        maxMp: 0,
        lightRadius: 0,
        visibleToPlayers: true,
      },
    });
    expect(spawned.ok).toBe(true);

    // Server-side anti-cheat: GM sees monster, Player does NOT see monster in unrevealed fog!
    const gmView = manager.projectStateFor(roomCode, gmId)!;
    const playerView = manager.projectStateFor(roomCode, playerId)!;
    expect(gmView.tokens.some((t) => t.name === 'Gobelin caché')).toBe(true);
    expect(playerView.tokens.some((t) => t.name === 'Gobelin caché')).toBe(false);

    // GM reveals tile (0, 0) -> Player now sees the monster!
    manager.handleMessage(roomCode, gmId, {
      type: 'update_fog',
      cells: [{ x: 0, y: 0, hidden: false }],
    });
    const playerViewAfterReveal = manager.projectStateFor(roomCode, playerId)!;
    expect(playerViewAfterReveal.tokens.some((t) => t.name === 'Gobelin caché')).toBe(true);

    // Player moves their token into a solid wall at (6, 5) -> blocked!
    const playerToken = playerView.tokens.find((t) => t.ownerIds.includes(playerId))!;
    const blockedMove = manager.handleMessage(roomCode, playerId, {
      type: 'move_token',
      tokenId: playerToken.id,
      x: 6,
      y: 5,
    });
    expect(blockedMove.ok).toBe(false);
    expect(blockedMove.errorCode).toBe('COLLISION_BLOCKED');

    // Valid move to (4, 5) succeeds
    const validMove = manager.handleMessage(roomCode, playerId, {
      type: 'move_token',
      tokenId: playerToken.id,
      x: 4,
      y: 5,
    });
    expect(validMove.ok).toBe(true);

    // Solid token at (3, 5) blocks player; setting isSolid: false lets player pass through
    manager.handleMessage(roomCode, gmId, {
      type: 'spawn_token',
      token: {
        name: 'Garde Solide',
        kind: 'npc',
        x: 3,
        y: 5,
        color: '#06b6d4',
        spriteAssetId: null,
        ownerIds: [gmId],
        hp: 30,
        maxHp: 30,
        mp: 0,
        maxMp: 0,
        lightRadius: 0,
        visibleToPlayers: true,
        isSolid: true,
      },
    });
    const blockedByToken = manager.handleMessage(roomCode, playerId, {
      type: 'move_token',
      tokenId: playerToken.id,
      x: 3,
      y: 5,
    });
    expect(blockedByToken.ok).toBe(false);
    expect(blockedByToken.errorCode).toBe('TOKEN_BLOCKED');

    const guardToken = manager
      .projectStateFor(roomCode, gmId)!
      .tokens.find((t) => t.name === 'Garde Solide')!;
    manager.handleMessage(roomCode, gmId, {
      type: 'update_token',
      tokenId: guardToken.id,
      patch: { isSolid: false },
    });
    expect(
      manager.handleMessage(roomCode, playerId, {
        type: 'move_token',
        tokenId: playerToken.id,
        x: 3,
        y: 5,
      }).ok,
    ).toBe(true);

    // GM live-edits player sheet HP & inventory
    const sheetEdit = manager.handleMessage(roomCode, gmId, {
      type: 'update_sheet',
      participantId: playerId,
      patch: { hp: 72, gold: 120 },
    });
    expect(sheetEdit.ok).toBe(true);
    expect(manager.projectStateFor(roomCode, playerId)?.sheets[playerId]?.hp).toBe(72);

    // Dice roll generates chat message
    const rollOutcome = manager.handleMessage(roomCode, playerId, {
      type: 'roll_dice',
      formula: '1d20+2',
      label: 'Perception',
    });
    expect(rollOutcome.ok).toBe(true);
    expect(rollOutcome.chatMessage?.roll?.total).toBe(22);

    // GM changes active map for everyone
    const nextMap = makeTestMap('map_crypt', 'Crypte Oubliée');
    const changed = manager.handleMessage(roomCode, gmId, {
      type: 'change_map',
      map: nextMap,
    });
    expect(changed.ok).toBe(true);
    expect(manager.projectStateFor(roomCode, playerId)?.activeMap.id).toBe('map_crypt');
  });

  it('routes JSON protocol messages and per-role state sync between GM and Player sockets', () => {
    const manager = new VttRoomManager();
    const router = createVttProtocolRouter(manager);

    const makeMockSocket = () => {
      const received: VttServerMessage[] = [];
      const socket: VttSocketLike = {
        readyState: 1,
        send(data: string) {
          received.push(JSON.parse(data) as VttServerMessage);
        },
      };
      return { socket, received };
    };

    const gm = makeMockSocket();
    const player = makeMockSocket();
    router.register(gm.socket);
    router.register(player.socket);

    router.handleRawMessage(
      gm.socket,
      JSON.stringify({
        type: 'create_room',
        roomName: 'Test Protocol',
        gmName: 'MJ',
        initialMap: makeTestMap(),
      }),
    );

    const gmJoined = gm.received.find((m) => m.type === 'room_joined');
    expect(gmJoined?.type).toBe('room_joined');
    if (!gmJoined || gmJoined.type !== 'room_joined') return;

    router.handleRawMessage(
      player.socket,
      JSON.stringify({
        type: 'join_room',
        roomCode: gmJoined.roomCode,
        playerName: 'Aventurier',
      }),
    );

    const playerJoined = player.received.find((m) => m.type === 'room_joined');
    expect(playerJoined?.type).toBe('room_joined');
    if (!playerJoined || playerJoined.type !== 'room_joined') return;
    expect(playerJoined.state.participants).toHaveLength(2);

    // Chat message broadcasts to both GM and Player
    router.handleRawMessage(
      player.socket,
      JSON.stringify({ type: 'send_chat', channel: 'rp', text: 'J’ouvre la porte !' }),
    );
    expect(gm.received.some((m) => m.type === 'chat_message' && m.message.text === 'J’ouvre la porte !')).toBe(
      true,
    );

    // Disconnect marks participant offline and broadcasts updated state to GM
    router.unregister(player.socket);
    const lastGmSync = [...gm.received].reverse().find((m) => m.type === 'state_sync');
    expect(lastGmSync?.type).toBe('state_sync');
    if (lastGmSync && lastGmSync.type === 'state_sync') {
      const plr = lastGmSync.state.participants.find((p) => p.role === 'player');
      expect(plr?.connected).toBe(false);
    }
  });
});
