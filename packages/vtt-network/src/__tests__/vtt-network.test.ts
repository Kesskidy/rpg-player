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

  it('rejects malformed, null, incomplete, and unknown WebSocket payloads without throwing (Bug #1)', () => {
    const manager = new VttRoomManager();
    const router = createVttProtocolRouter(manager);

    const received: VttServerMessage[] = [];
    const socket: VttSocketLike = {
      readyState: 1,
      send(data: string) {
        received.push(JSON.parse(data) as VttServerMessage);
      },
    };
    router.register(socket);

    const badPayloads = [
      'null',
      '123',
      '[]',
      '{"type":"create_room"}',
      '{"type":"join_room"}',
      '{"type":"foo"}',
      '{"type":"move_token","tokenId":"t1","x":"not-a-number","y":2}',
    ];

    for (const payload of badPayloads) {
      expect(() => router.handleRawMessage(socket, payload)).not.toThrow();
    }

    expect(received).toHaveLength(badPayloads.length);
    for (const msg of received) {
      expect(msg.type).toBe('error');
    }

    // Also test unknown type AFTER joining a valid room
    router.handleRawMessage(
      socket,
      JSON.stringify({
        type: 'create_room',
        roomName: 'Table Sûre',
        gmName: 'MJ',
        initialMap: makeTestMap(),
      }),
    );
    received.length = 0;
    expect(() => router.handleRawMessage(socket, '{"type":"foo"}')).not.toThrow();
    expect(received[0]?.type).toBe('error');
    if (received[0]?.type === 'error') {
      expect(received[0].code).toBe('UNKNOWN_MESSAGE');
    }
  });

  it('prevents anti-cheat leaks: hidden token name, teleport distance, and fogged map events (Bug #9)', () => {
    const manager = new VttRoomManager();
    const map = makeTestMap();
    map.events = [
      {
        id: 'ev_trap_secret',
        name: 'Piège Mortel Secret',
        kind: 'zone',
        trigger: 'touch',
        x: 0,
        y: 0,
        spriteAssetId: null,
        narrativeId: null,
        isSolid: false,
        plane: 'below',
      },
      {
        id: 'ev_visible_npc',
        name: 'Aubergiste',
        kind: 'npc',
        trigger: 'interact',
        x: 5,
        y: 4,
        spriteAssetId: null,
        narrativeId: null,
        isSolid: true,
        plane: 'y_sorted',
      },
    ];

    const created = manager.handleMessage(null, null, {
      type: 'create_room',
      roomName: 'Donjon Secret',
      gmName: 'MJ',
      initialMap: map,
    });
    const roomCode = created.roomCode!;
    const gmId = created.participantId!;

    const joined = manager.handleMessage(null, null, {
      type: 'join_room',
      roomCode,
      playerName: 'Voleur',
    });
    const playerId = joined.participantId!;

    // Spawn an invisible monster adjacent to spawn at (4, 5)
    manager.handleMessage(roomCode, gmId, {
      type: 'spawn_token',
      token: {
        name: 'Assassin Invisible Secret',
        kind: 'monster',
        x: 4,
        y: 5,
        color: '#ef4444',
        spriteAssetId: null,
        ownerIds: [],
        hp: 50,
        maxHp: 50,
        mp: 0,
        maxMp: 0,
        lightRadius: 0,
        visibleToPlayers: false,
        isSolid: true,
      },
    });

    const playerView = manager.projectStateFor(roomCode, playerId)!;
    const playerToken = playerView.tokens.find((t) => t.ownerIds.includes(playerId))!;

    // 1. Fogged map events must NOT be sent to players
    expect(playerView.activeMap.events.some((e) => e.id === 'ev_trap_secret')).toBe(false);
    expect(playerView.activeMap.events.some((e) => e.id === 'ev_visible_npc')).toBe(true);
    expect(
      manager.projectStateFor(roomCode, gmId)!.activeMap.events.some((e) => e.id === 'ev_trap_secret'),
    ).toBe(true);

    // 2. Bumping into hidden solid token must NOT leak its name!
    const bump = manager.handleMessage(roomCode, playerId, {
      type: 'move_token',
      tokenId: playerToken.id,
      x: 4,
      y: 5,
    });
    expect(bump.ok).toBe(false);
    expect(bump.errorCode).toBe('TOKEN_BLOCKED');
    expect(bump.errorMessage).not.toContain('Assassin');

    // 3. Teleporting across the map (> 6 tiles) is rejected for players
    const farMove = manager.handleMessage(roomCode, playerId, {
      type: 'move_token',
      tokenId: playerToken.id,
      x: 9,
      y: 9,
    });
    expect(farMove.ok).toBe(true); // dist is max(4,4) = 4 <= 6
    const tooFarMove = manager.handleMessage(roomCode, playerId, {
      type: 'move_token',
      tokenId: playerToken.id,
      x: 0,
      y: 0,
    });
    expect(tooFarMove.ok).toBe(false);
    expect(tooFarMove.errorCode).toBe('MOVE_TOO_FAR');
  });

  it('supports sessionToken reconnection, blocks duplicate join on same socket, and prunes idle rooms (Bug #10)', () => {
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
    const plr1 = makeMockSocket();
    router.register(gm.socket);
    router.register(plr1.socket);

    router.handleRawMessage(
      gm.socket,
      JSON.stringify({
        type: 'create_room',
        roomName: 'Campagne',
        gmName: 'MJ',
        initialMap: makeTestMap(),
      }),
    );
    const gmJoined = gm.received.find((m) => m.type === 'room_joined')!;
    expect(gmJoined.type).toBe('room_joined');
    if (gmJoined.type !== 'room_joined') return;
    const roomCode = gmJoined.roomCode;

    // Duplicate create_room on already-joined socket is refused
    gm.received.length = 0;
    router.handleRawMessage(
      gm.socket,
      JSON.stringify({
        type: 'create_room',
        roomName: 'Autre',
        gmName: 'MJ',
        initialMap: makeTestMap(),
      }),
    );
    expect(gm.received[0]?.type).toBe('error');
    if (gm.received[0]?.type === 'error') {
      expect(gm.received[0].code).toBe('ALREADY_IN_ROOM');
    }

    // Player joins and receives a sessionToken
    router.handleRawMessage(
      plr1.socket,
      JSON.stringify({ type: 'join_room', roomCode, playerName: 'Alice' }),
    );
    const plrJoined = plr1.received.find((m) => m.type === 'room_joined')!;
    expect(plrJoined.type).toBe('room_joined');
    if (plrJoined.type !== 'room_joined') return;
    expect(plrJoined.sessionToken).toBeTruthy();

    // Player disconnects and reconnects on a NEW socket using sessionToken -> reclaims same seat!
    router.unregister(plr1.socket);
    const plr2 = makeMockSocket();
    router.register(plr2.socket);
    router.handleRawMessage(
      plr2.socket,
      JSON.stringify({
        type: 'join_room',
        roomCode,
        playerName: 'Alice',
        sessionToken: plrJoined.sessionToken,
      }),
    );
    const reconnected = plr2.received.find((m) => m.type === 'room_joined')!;
    expect(reconnected.type).toBe('room_joined');
    if (reconnected.type !== 'room_joined') return;
    expect(reconnected.participantId).toBe(plrJoined.participantId);
    expect(reconnected.state.participants).toHaveLength(2);
    expect(reconnected.state.tokens.filter((t) => t.kind === 'player')).toHaveLength(1);

    // Disconnect everyone and prune idle room
    router.unregister(gm.socket);
    router.unregister(plr2.socket);
    expect(manager.pruneIdleRooms(0, Date.now() + 1000)).toContain(roomCode);
    expect(manager.getRoomCodes()).not.toContain(roomCode);
  });
});
