import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  ASSET_SCHEMA_VERSION,
  PIXEL_DOCUMENT_SCHEMA_VERSION,
  PROJECT_DIRS,
  PROJECT_MANIFEST_FILENAME,
  PROJECT_SCHEMA_VERSION,
  type AnimationClip,
  type AssetMeta,
  type AssetType,
  type ColliderBox,
  type MapMeta,
  type NarrativeMeta,
  type PixelDocumentSerialized,
  type ProjectManifest,
} from '@rpg-player/core-types';
import { encodeBytesToBase64, encodeRgbaToPng } from '@rpg-player/pixel-studio';
import { DEMO_PALETTE_HEX } from '../../demo-pack/palette.js';
import type { PixelCanvas } from '../../demo-pack/pixel-canvas.js';
import {
  buildScenarioDatabase,
  buildScenarioDungeonMap,
  buildScenarioNarratives,
  buildTavernMap,
  buildVttSessionPreset,
} from './build-data.js';
import {
  buildAdventurerSpritesheet,
  buildBossOgreSpritesheet,
  buildMinionSpritesheet,
  buildReceptionistSpritesheet,
  buildScenarioDungeonTileset,
  buildTavernTileset,
} from './draw-assets.js';

interface GeneratedAssetSpec {
  id: string;
  name: string;
  type: AssetType;
  gridWidth: number;
  gridHeight: number;
  columns: number;
  frames: PixelCanvas[];
  sheet: PixelCanvas;
  anchor: { x: number; y: number };
  defaultCollider?: ColliderBox;
  animations: Record<string, AnimationClip>;
  tags: string[];
}

async function writeJson(filePath: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

async function writeAsset(rootDir: string, spec: GeneratedAssetSpec): Promise<AssetMeta> {
  const pngRel = `${PROJECT_DIRS.assets}/${spec.id}.png`;
  const sourceRel = `${PROJECT_DIRS.assets}/${spec.id}.pxs.json`;
  const metaRel = `${PROJECT_DIRS.assets}/${spec.id}.meta.json`;

  const pngBytes = encodeRgbaToPng(spec.sheet.pixels, spec.sheet.width, spec.sheet.height);
  await fs.mkdir(path.join(rootDir, PROJECT_DIRS.assets), { recursive: true });
  await fs.writeFile(path.join(rootDir, pngRel), pngBytes);

  const pxsDoc: PixelDocumentSerialized = {
    schemaVersion: PIXEL_DOCUMENT_SCHEMA_VERSION,
    assetId: spec.id,
    width: spec.frames[0]!.width,
    height: spec.frames[0]!.height,
    palette: [...DEMO_PALETTE_HEX],
    frames: spec.frames.map((frame, index) => ({
      id: `frame_${index}`,
      durationMs: 160,
      layers: [
        {
          id: `layer_base_${index}`,
          name: 'Sprite',
          visible: true,
          opacity: 1,
          locked: false,
          pixelsBase64: encodeBytesToBase64(frame.pixels),
        },
      ],
    })),
  };
  await writeJson(path.join(rootDir, sourceRel), pxsDoc);

  const meta: AssetMeta = {
    schemaVersion: ASSET_SCHEMA_VERSION,
    id: spec.id,
    name: spec.name,
    type: spec.type,
    gridWidth: spec.gridWidth,
    gridHeight: spec.gridHeight,
    frameCount: spec.frames.length,
    columns: spec.columns,
    filePath: pngRel,
    sourcePath: sourceRel,
    anchor: spec.anchor,
    defaultCollider: spec.defaultCollider,
    animations: spec.animations,
    hitboxes: spec.defaultCollider
      ? [
          {
            name: 'feet',
            x: spec.anchor.x + spec.defaultCollider.offsetX,
            y: spec.anchor.y + spec.defaultCollider.offsetY,
            width: spec.defaultCollider.width,
            height: spec.defaultCollider.height,
          },
        ]
      : [],
    tags: spec.tags,
  };

  await writeJson(path.join(rootDir, metaRel), meta);
  return meta;
}

async function main(): Promise<void> {
  const repoRoot = path.resolve(process.cwd());
  const outDir = path.join(repoRoot, 'scenarios', 'quete_taverne');

  const tavernTiles = buildTavernTileset();
  const dungeonTiles = buildScenarioDungeonTileset();
  const adventurer = buildAdventurerSpritesheet();
  const receptionist = buildReceptionistSpritesheet();
  const minion = buildMinionSpritesheet();
  const boss = buildBossOgreSpritesheet();

  const specs: GeneratedAssetSpec[] = [
    {
      id: 'tileset_taverne',
      name: 'Tileset Taverne (32×32)',
      type: 'tileset',
      gridWidth: 32,
      gridHeight: 32,
      columns: 4,
      frames: tavernTiles.frames,
      sheet: tavernTiles.sheet,
      anchor: { x: 0, y: 0 },
      animations: {},
      tags: ['taverne', 'tileset', 'interieur'],
    },
    {
      id: 'tileset_donjon',
      name: 'Tileset Donjon (32×32)',
      type: 'tileset',
      gridWidth: 32,
      gridHeight: 32,
      columns: 4,
      frames: dungeonTiles.frames,
      sheet: dungeonTiles.sheet,
      anchor: { x: 0, y: 0 },
      animations: {
        torch: { category: 'vfx', frames: [4, 5], fps: 6, loop: true },
      },
      tags: ['donjon', 'tileset', 'pierre'],
    },
    {
      id: 'token_aventurier',
      name: 'Aventurier (Token Joueur)',
      type: 'sprite',
      gridWidth: 32,
      gridHeight: 48,
      columns: 6,
      frames: adventurer.frames,
      sheet: adventurer.sheet,
      anchor: { x: 16, y: 48 },
      defaultCollider: { offsetX: -16, offsetY: -16, width: 32, height: 16 },
      animations: {
        idle: { category: 'combat', frames: [0, 1], fps: 4, loop: true },
        walk: { category: 'combat', frames: [2, 3, 4, 5], fps: 8, loop: true },
      },
      tags: ['hero', 'joueur', 'token'],
    },
    {
      id: 'npc_femme_guichet',
      name: 'Femme au guichet',
      type: 'sprite',
      gridWidth: 32,
      gridHeight: 48,
      columns: 2,
      frames: receptionist.frames,
      sheet: receptionist.sheet,
      anchor: { x: 16, y: 48 },
      defaultCollider: { offsetX: -16, offsetY: -16, width: 32, height: 16 },
      animations: {
        idle: { category: 'combat', frames: [0, 1], fps: 3, loop: true },
      },
      tags: ['pnj', 'taverne', 'quete'],
    },
    {
      id: 'monster_sbire',
      name: 'Sbire de donjon',
      type: 'sprite',
      gridWidth: 32,
      gridHeight: 32,
      columns: 2,
      frames: minion.frames,
      sheet: minion.sheet,
      anchor: { x: 16, y: 32 },
      defaultCollider: { offsetX: -12, offsetY: -14, width: 24, height: 14 },
      animations: {
        idle: { category: 'combat', frames: [0, 1], fps: 5, loop: true },
      },
      tags: ['monstre', 'sbire', 'donjon'],
    },
    {
      id: 'boss_monstre_donjon',
      name: 'Ogre Sombre (Boss)',
      type: 'sprite',
      gridWidth: 64,
      gridHeight: 64,
      columns: 2,
      frames: boss.frames,
      sheet: boss.sheet,
      anchor: { x: 32, y: 64 },
      defaultCollider: { offsetX: -24, offsetY: -32, width: 48, height: 32 },
      animations: {
        idle: { category: 'combat', frames: [0, 1], fps: 3, loop: true },
      },
      tags: ['boss', 'monstre', 'donjon'],
    },
  ];

  const assetsIndex: Record<string, AssetMeta> = {};
  for (const spec of specs) {
    const meta = await writeAsset(outDir, spec);
    assetsIndex[meta.id] = meta;
  }

  // Write Maps
  const maps = [buildTavernMap(), buildScenarioDungeonMap()];
  const mapsIndex: Record<string, MapMeta> = {};
  for (const map of maps) {
    const filePath = `${PROJECT_DIRS.maps}/${map.id}.map.json`;
    await writeJson(path.join(outDir, filePath), map);
    mapsIndex[map.id] = {
      id: map.id,
      name: map.name,
      width: map.width,
      height: map.height,
      tileSize: map.tileSize,
      filePath,
    };
  }

  // Write Narratives
  const narratives = buildScenarioNarratives();
  const narrativesIndex: Record<string, NarrativeMeta> = {};
  for (const graph of narratives) {
    const filePath = `${PROJECT_DIRS.narratives}/${graph.id}.narrative.json`;
    await writeJson(path.join(outDir, filePath), graph);
    narrativesIndex[graph.id] = {
      id: graph.id,
      name: graph.name,
      filePath,
    };
  }

  // Write RPG Database & Character Sheets
  const dbPath = `${PROJECT_DIRS.database}/rpg.db.json`;
  await writeJson(path.join(outDir, dbPath), buildScenarioDatabase());

  // Write VTT Session Preset
  await writeJson(path.join(outDir, 'vtt', 'session.vtt.json'), buildVttSessionPreset());

  // Write ProjectManifest
  const now = new Date().toISOString();
  const manifest: ProjectManifest = {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: 'scenario_quete_taverne',
    name: 'Scénario — La Prime de la Taverne',
    createdAt: now,
    updatedAt: now,
    defaultTileSize: 32,
    assets: assetsIndex,
    maps: mapsIndex,
    narratives: narrativesIndex,
    databasePath: dbPath,
  };
  await writeJson(path.join(outDir, PROJECT_MANIFEST_FILENAME), manifest);

  console.log(
    `[scenario:generate] Généré dans ${outDir} (${Object.keys(assetsIndex).length} assets, ${maps.length} maps, ${narratives.length} dialogues, session VTT).`,
  );
}

void main();
