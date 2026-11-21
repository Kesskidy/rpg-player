import { describe, expect, it } from 'vitest';
import {
  cellKey,
  createEmptyTileMap,
  MapEditorEngine,
  normalizeTileMapData,
  RpgSimulation,
} from '../index.js';

describe('rpg-engine headless core (v2 dissociated rendering & collisions)', () => {
  it('stacks multiple assets on the same cell (even when blocked) with independent collisionLayer & Undo/Redo', () => {
    const map = createEmptyTileMap({
      id: 'map_village',
      name: 'Village',
      width: 10,
      height: 8,
      tileSize: 32,
    });

    const editor = new MapEditorEngine(map);
    editor.setSelectedTile({ assetId: 'tileset_grass', tileX: 1, tileY: 0 });

    // Batch paint across 2 tiles on Sol (below)
    editor.beginEdit();
    expect(editor.applyAtTile(2, 3)).toBe(true);
    expect(editor.applyAtTile(3, 3)).toBe(true);
    expect(editor.endEdit()).toBe(true);

    // Paint independent collision on tile (3, 3) WITHOUT removing its ground tile
    editor.setTool('paint-collision');
    expect(editor.applyAtTile(3, 3)).toBe(true);
    expect(editor.getMap().collisionLayer.cells[3 * 10 + 3]).toBe(1);
    expect(editor.getMap().layers[0]?.cells[cellKey(3, 3)]).toHaveLength(1);

    // Switch to Y-Sorted layer + Stack mode and stack 2 assets (Table + Mug) on that SAME blocked tile!
    const ySortedLayer = editor.getMap().layers.find((l) => l.plane === 'y_sorted')!;
    editor.setActiveLayer(ySortedLayer.id);
    editor.setTool('paint-tile');
    editor.setPaintMode('stack');
    editor.setSelectedTile({ assetId: 'asset_table', tileX: 0, tileY: 0 });
    expect(editor.applyAtTile(3, 3)).toBe(true);
    editor.setSelectedTile({ assetId: 'asset_mug', tileX: 0, tileY: 0 });
    expect(editor.applyAtTile(3, 3)).toBe(true);

    const stack = editor.getMap().layers.find((l) => l.id === ySortedLayer.id)!.cells[cellKey(3, 3)];
    expect(stack).toHaveLength(2);
    expect(stack?.[0]?.assetId).toBe('asset_table');
    expect(stack?.[1]?.assetId).toBe('asset_mug');

    // Undo removes the mug while preserving the table and collision
    expect(editor.undo()).toBe(true);
    expect(
      editor.getMap().layers.find((l) => l.id === ySortedLayer.id)!.cells[cellKey(3, 3)],
    ).toHaveLength(1);
    expect(editor.getMap().collisionLayer.cells[3 * 10 + 3]).toBe(1);
  });

  it('simulates feet AABB collisions against collisionLayer and solid/non-solid entities', () => {
    const map = createEmptyTileMap({
      id: 'map_dungeon',
      name: 'Donjon',
      width: 6,
      height: 6,
      tileSize: 32,
    });
    map.playerSpawn = { x: 2, y: 2, direction: 'down' };
    // Independent vertical collision wall along column 3 (rows 1..4)
    for (let row = 1; row <= 4; row += 1) {
      map.collisionLayer.cells[row * 6 + 3] = 1;
    }

    const sim = new RpgSimulation(map);
    const start = { ...sim.getPlayerState() };

    // Walk right + down diagonally into column 3 wall: X blocked, Y slides freely
    sim.setInput({ right: true, down: true });
    for (let i = 0; i < 30; i += 1) {
      sim.step(1 / 60);
    }

    const afterSlide = sim.getPlayerState();
    const rect = sim.getPlayerColliderRect();
    expect(afterSlide.y).toBeGreaterThan(start.y + 30);
    expect(rect.x + rect.width).toBeLessThanOrEqual(3 * 32 + 0.01);

    // Push far left beyond map border -> clamped inside [0..worldWidth]
    sim.setInput({ left: true, right: false, down: false });
    for (let i = 0; i < 120; i += 1) {
      sim.step(1 / 60);
    }
    expect(sim.getPlayerColliderRect().x).toBeGreaterThanOrEqual(0);
  });

  it('respects entity isSolid flag and feet collider footprint (allowing head overlap)', () => {
    const map = createEmptyTileMap({
      id: 'map_npc_feet',
      name: 'Hall',
      width: 6,
      height: 6,
      tileSize: 32,
    });
    map.playerSpawn = { x: 2, y: 3, direction: 'up' };
    // Tall 32x48 NPC at (2, 2) whose feet collider is only 16px tall at the bottom of tile (2,2)
    map.events = [
      {
        id: 'npc_tall',
        name: 'Garde',
        kind: 'npc',
        trigger: 'interact',
        x: 2,
        y: 2,
        spriteAssetId: null,
        narrativeId: null,
        isSolid: true,
        plane: 'y_sorted',
        collider: { offsetX: -12, offsetY: -16, width: 24, height: 16 },
      },
    ];

    const sim = new RpgSimulation(map);
    sim.setInput({ up: true });
    for (let i = 0; i < 40; i += 1) {
      sim.step(1 / 60);
    }
    // Stopped cleanly against the NPC's feet collider (NPC foot Y = 2.9 * 32 = 92.8)
    const stoppedRect = sim.getPlayerColliderRect();
    expect(stoppedRect.y).toBeGreaterThanOrEqual(92.8 - 1);

    // Toggle isSolid = false -> player walks right through the entity!
    map.events[0]!.isSolid = false;
    sim.updateMap(map, false);
    for (let i = 0; i < 40; i += 1) {
      sim.step(1 / 60);
    }
    expect(sim.getPlayerColliderRect().y).toBeLessThan(70);
  });

  it('migrates legacy v1 TileMapData seamlessly into v2', () => {
    const legacyV1 = {
      schemaVersion: 1,
      id: 'old_map',
      name: 'Ancienne Map',
      width: 4,
      height: 4,
      tileSize: 32,
      layers: [
        {
          id: 'l1',
          name: 'Sol',
          kind: 'ground',
          visible: true,
          opacity: 1,
          tiles: [{ assetId: 'grass', tileX: 0, tileY: 0 }, ...Array(15).fill(null)],
        },
        {
          id: 'l2',
          name: 'Décor',
          kind: 'decor',
          visible: true,
          opacity: 1,
          tiles: Array(16).fill(null),
        },
      ],
      collisions: [0, 1, ...Array(14).fill(0)],
      playerSpawn: { x: 2, y: 2, direction: 'down' },
      playerAssetId: null,
      events: [
        {
          id: 'e1',
          name: 'PNJ',
          kind: 'npc',
          trigger: 'interact',
          x: 1,
          y: 1,
          spriteAssetId: null,
          narrativeId: null,
          solid: true,
        },
      ],
    };

    const migrated = normalizeTileMapData(legacyV1);
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.layers[0]?.plane).toBe('below');
    expect(migrated.layers[1]?.plane).toBe('y_sorted');
    expect(migrated.layers[0]?.cells['0,0']?.[0]?.assetId).toBe('grass');
    expect(migrated.collisionLayer.cells[1]).toBe(1);
    expect(migrated.events[0]?.isSolid).toBe(true);
    expect(migrated.events[0]?.plane).toBe('y_sorted');
  });

  it('restores a valid activeLayerId after undo of addLayer (Bug #11)', () => {
    const map = createEmptyTileMap({
      id: 'map_layers',
      name: 'Calques',
      width: 6,
      height: 6,
      tileSize: 32,
    });
    const editor = new MapEditorEngine(map);
    const added = editor.addLayer('Temporaire', 'y_sorted');
    expect(editor.getState().activeLayerId).toBe(added.id);

    // Undo removes the newly added layer -> activeLayerId MUST fall back to an existing layer
    expect(editor.undo()).toBe(true);
    expect(editor.getMap().layers.some((l) => l.id === editor.getState().activeLayerId)).toBe(true);

    // Painting immediately after undo succeeds on the restored valid layer!
    editor.setSelectedTile({ assetId: 'tileset_grass', tileX: 0, tileY: 0 });
    expect(editor.applyAtTile(1, 1)).toBe(true);
  });

  it('refuses moving an event onto a tile already occupied by another event (Bug #12)', () => {
    const map = createEmptyTileMap({
      id: 'map_events',
      name: 'Events',
      width: 6,
      height: 6,
      tileSize: 32,
    });
    const editor = new MapEditorEngine(map);
    const evA = {
      id: 'ev_a',
      name: 'PNJ A',
      kind: 'npc' as const,
      trigger: 'interact' as const,
      x: 1,
      y: 1,
      spriteAssetId: null,
      narrativeId: null,
      isSolid: true,
      plane: 'y_sorted' as const,
    };
    const evB = {
      id: 'ev_b',
      name: 'PNJ B',
      kind: 'npc' as const,
      trigger: 'interact' as const,
      x: 2,
      y: 2,
      spriteAssetId: null,
      narrativeId: null,
      isSolid: true,
      plane: 'y_sorted' as const,
    };

    expect(editor.upsertEvent(evA)).toBe(true);
    expect(editor.upsertEvent(evB)).toBe(true);
    // Attempting to move evB onto evA's tile (1, 1) must be refused without overwriting evA!
    expect(editor.upsertEvent({ ...evB, x: 1, y: 1 })).toBe(false);
    expect(editor.getMap().events).toHaveLength(2);
    expect(editor.getEventAt(1, 1)?.id).toBe('ev_a');
    expect(editor.getEventAt(2, 2)?.id).toBe('ev_b');

    // Updating evB in-place or moving to an empty tile succeeds
    expect(editor.upsertEvent({ ...evB, name: 'PNJ B Modifié', x: 3, y: 3 })).toBe(true);
    expect(editor.getEventAt(3, 3)?.name).toBe('PNJ B Modifié');
  });
});
