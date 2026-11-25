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
  getRecoverableAutosave,
  listAutosaves,
  markAutosaveSessionClean,
  restoreAutosave,
  writeProjectAutosave,
} from './autosave.js';
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

  it('preserves both asset and map entries when saving concurrently from the same initial manifest (Bug #21)', async () => {
    const adapter = new MemoryStorageAdapter();
    await adapter.pickProjectDirectory();
    const initialManifest = await createProject(adapter, 'Projet Concurrent', 32);

    const engine = new PixelStudioEngine({ assetId: 'hero_a', width: 16, height: 16 });
    const map = createEmptyTileMap({
      id: 'map_a',
      name: 'Map A',
      width: 8,
      height: 8,
      tileSize: 32,
    });

    await Promise.all([
      savePixelAsset(adapter, initialManifest, engine, {
        id: 'hero_a',
        name: 'Héros A',
        type: 'sprite',
      }),
      saveMap(adapter, initialManifest, map),
    ]);

    const finalOnDisk = await openProject(adapter);
    expect(finalOnDisk?.assets['hero_a']).toBeDefined();
    expect(finalOnDisk?.maps?.['map_a']).toBeDefined();
  });

  it('migrates legacy v0 project.json with automatic .bak-v0 backup and rejects corrupted maps cleanly (A2)', async () => {
    const adapter = new MemoryStorageAdapter();
    await adapter.pickProjectDirectory();
    await adapter.writeText(
      PROJECT_MANIFEST_FILENAME,
      JSON.stringify({ id: 'old_rpg', name: 'Ancien Projet', assets: {} }),
    );

    const opened = await openProject(adapter);
    expect(opened?.schemaVersion).toBe(1);
    expect(opened?.defaultTileSize).toBe(32);
    expect(await adapter.exists(`${PROJECT_MANIFEST_FILENAME}.bak-v0`)).toBe(true);

    // Corrupted map throws explicit French error naming the file and missing field
    await adapter.writeText('maps/foret.map.json', JSON.stringify({ schemaVersion: 2, id: 'foret' }));
    await expect(
      loadMap(adapter, {
        id: 'foret',
        name: 'Forêt',
        width: 10,
        height: 10,
        tileSize: 32,
        filePath: 'maps/foret.map.json',
      }),
    ).rejects.toThrow(/foret\.map\.json.*width/i);
  });

  it('rotates 5 autosave slots in .autosave/ and supports crash recovery (A2)', async () => {
    const adapter = new MemoryStorageAdapter();
    await adapter.pickProjectDirectory();
    const manifest = await createProject(adapter, 'Projet Autosave', 32);

    // Write 7 autosaves -> rotates within 5 slots
    for (let i = 1; i <= 7; i += 1) {
      await writeProjectAutosave(adapter, { ...manifest, name: `Projet v${i}` });
    }
    const entries = await listAutosaves(adapter);
    expect(entries).toHaveLength(5);
    expect(entries[0]?.projectName).toBe('Projet v7');

    // Unclean exit leaves recoverable autosave
    const recoverable = await getRecoverableAutosave(adapter);
    expect(recoverable?.projectName).toBe('Projet v7');

    // Restore writes manifest back & marks session clean
    const restored = await restoreAutosave(adapter, recoverable!);
    expect(restored.name).toBe('Projet v7');
    expect(await getRecoverableAutosave(adapter)).toBeNull();

    // Clean exit marker clears dirty flag
    await writeProjectAutosave(adapter, { ...manifest, name: 'Projet v8' });
    await markAutosaveSessionClean(adapter);
    expect(await getRecoverableAutosave(adapter)).toBeNull();
  });
});
