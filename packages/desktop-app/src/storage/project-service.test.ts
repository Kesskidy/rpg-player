import { describe, expect, it } from 'vitest';
import { PROJECT_DIRS, PROJECT_MANIFEST_FILENAME } from '@rpg-player/core-types';
import { PixelStudioEngine } from '@rpg-player/pixel-studio';
import {
  cellKey,
  createDefaultRpgDatabase,
  createEmptyTileMap,
  createSampleNarrativeGraph,
  MapEditorEngine,
} from '@rpg-player/rpg-engine';
import { MemoryStorageAdapter } from './adapter.js';
import {
  createProject,
  loadMap,
  loadNarrative,
  loadPixelAssetSource,
  loadRpgDatabase,
  openProject,
  saveMap,
  saveNarrative,
  savePixelAsset,
  saveProjectManifest,
  saveRpgDatabase,
} from './project-service.js';

describe('project-service', () => {
  it('creates, opens, and updates a project manifest via ProjectStorageAdapter', async () => {
    const adapter = new MemoryStorageAdapter();
    await adapter.pickProjectDirectory();

    expect(await openProject(adapter)).toBeNull();

    const created = await createProject(adapter, 'Chroniques d’Aethel', 32);
    expect(created.name).toBe('Chroniques d’Aethel');
    expect(created.defaultTileSize).toBe(32);
    expect(await adapter.exists(PROJECT_MANIFEST_FILENAME)).toBe(true);
    expect(await adapter.exists(PROJECT_DIRS.assets)).toBe(true);
    expect(await adapter.exists(PROJECT_DIRS.maps)).toBe(true);

    const reopened = await openProject(adapter);
    expect(reopened).toEqual(created);

    const updated = await saveProjectManifest(adapter, {
      ...created,
      name: 'Chroniques d’Aethel v2',
    });
    expect(updated.name).toBe('Chroniques d’Aethel v2');
    const reopenedAfterSave = await openProject(adapter);
    expect(reopenedAfterSave?.name).toBe('Chroniques d’Aethel v2');
  });

  it('saves and reloads a Pixel Studio asset (.pxs.json + .png + .meta.json + project.json)', async () => {
    const adapter = new MemoryStorageAdapter();
    await adapter.pickProjectDirectory();
    const manifest = await createProject(adapter, 'Donjon Pixel', 32);

    const engine = new PixelStudioEngine({
      assetId: 'hero_knight',
      width: 32,
      height: 48,
    });
    engine.setHexColor('#ffd541');
    engine.beginStroke({ x: 10, y: 12 });
    engine.continueStroke({ x: 14, y: 12 });
    engine.endStroke();

    const armorLayer = engine.addLayer('Armure');
    engine.setHexColor('#249fde');
    engine.beginStroke({ x: 12, y: 12 });
    engine.endStroke();
    expect(armorLayer.name).toBe('Armure');

    const saved = await savePixelAsset(adapter, manifest, engine, {
      id: 'hero_knight',
      name: 'Chevalier',
      type: 'sprite',
      tags: ['hero'],
    });

    expect(saved.manifest.assets['hero_knight']).toBeDefined();
    expect(await adapter.exists('assets/hero_knight.png')).toBe(true);
    expect(await adapter.exists('assets/hero_knight.pxs.json')).toBe(true);
    expect(await adapter.exists('assets/hero_knight.meta.json')).toBe(true);

    const pngBytes = await adapter.readBinary('assets/hero_knight.png');
    expect(Array.from(pngBytes.slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);

    const reloadedManifest = await openProject(adapter);
    const meta = reloadedManifest?.assets['hero_knight'];
    expect(meta).toBeDefined();

    const source = await loadPixelAssetSource(adapter, meta!);
    const restoredEngine = PixelStudioEngine.fromSerialized(source);
    expect(restoredEngine.getActiveFrame().layers).toHaveLength(2);
    expect(restoredEngine.renderActiveFrame()).toEqual(engine.renderActiveFrame());
  });

  it('saves and reloads a TileMapData document into maps/<id>.map.json', async () => {
    const adapter = new MemoryStorageAdapter();
    await adapter.pickProjectDirectory();
    const manifest = await createProject(adapter, 'Royaume 2D', 32);

    const map = createEmptyTileMap({
      id: 'village_nord',
      name: 'Village du Nord',
      width: 12,
      height: 10,
      tileSize: 32,
    });
    const editor = new MapEditorEngine(map);
    editor.setSelectedTile({ assetId: 'tile_grass', tileX: 0, tileY: 0 });
    editor.applyAtTile(2, 2);
    editor.setTool('paint-collision');
    editor.applyAtTile(3, 2);

    const saved = await saveMap(adapter, manifest, editor.serialize());
    expect(saved.manifest.maps?.['village_nord']).toMatchObject({
      id: 'village_nord',
      name: 'Village du Nord',
      filePath: 'maps/village_nord.map.json',
    });
    expect(await adapter.exists('maps/village_nord.map.json')).toBe(true);

    const reloaded = await loadMap(adapter, saved.meta);
    expect(reloaded.layers[0]?.cells[cellKey(2, 2)]?.[0]).toEqual({
      assetId: 'tile_grass',
      tileX: 0,
      tileY: 0,
    });
    expect(reloaded.collisionLayer.cells[2 * 12 + 3]).toBe(1);
  });

  it('saves and reloads NarrativeGraph and RpgDatabase files', async () => {
    const adapter = new MemoryStorageAdapter();
    await adapter.pickProjectDirectory();
    let manifest = await createProject(adapter, 'Quête du Dragon', 32);

    const graph = createSampleNarrativeGraph('garde_porte', 'Garde de la Porte');
    const savedNarrative = await saveNarrative(adapter, manifest, graph);
    manifest = savedNarrative.manifest;
    expect(await adapter.exists('narratives/garde_porte.narrative.json')).toBe(true);

    const loadedGraph = await loadNarrative(adapter, savedNarrative.meta);
    expect(loadedGraph.nodes).toHaveLength(graph.nodes.length);

    const db = createDefaultRpgDatabase();
    db.hero.name = 'Paladin';
    manifest = await saveRpgDatabase(adapter, manifest, db);
    expect(await adapter.exists('database/rpg.db.json')).toBe(true);

    const loadedDb = await loadRpgDatabase(adapter, manifest);
    expect(loadedDb?.hero.name).toBe('Paladin');
  });
});
