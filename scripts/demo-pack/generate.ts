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
import {
  buildDemoNarratives,
  buildDemoRpgDatabase,
  buildDungeonMap,
  buildGuildMap,
} from './build-scenes.js';
import {
  buildGuardSpritesheet,
  buildGuildMasterSpritesheet,
  buildHeroSpritesheet,
  buildMerchantSpritesheet,
} from './draw-characters.js';
import {
  buildGoblinSpritesheet,
  buildSkeletonSpritesheet,
  buildSlimeSpritesheet,
  buildStoneGolemBossSpritesheet,
} from './draw-monsters.js';
import { buildDungeonTileset, buildGuildTileset } from './draw-tilesets.js';
import { DEMO_PALETTE_HEX } from './palette.js';
import type { PixelCanvas } from './pixel-canvas.js';

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

  // Also emit editable .pxs.json so every demo asset can be opened & repainted in Pixel Studio
  const pxsDoc: PixelDocumentSerialized = {
    schemaVersion: PIXEL_DOCUMENT_SCHEMA_VERSION,
    assetId: spec.id,
    width: spec.frames[0]!.width,
    height: spec.frames[0]!.height,
    palette: [...DEMO_PALETTE_HEX],
    frames: spec.frames.map((frame, index) => ({
      id: `frame_${index}`,
      durationMs: 150,
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
  const outDir = path.join(repoRoot, 'demo-pack');

  await fs.mkdir(outDir, { recursive: true });

  const guildTileset = buildGuildTileset();
  const dungeonTileset = buildDungeonTileset();
  const hero = buildHeroSpritesheet();
  const guildMaster = buildGuildMasterSpritesheet();
  const merchant = buildMerchantSpritesheet();
  const guard = buildGuardSpritesheet();
  const slime = buildSlimeSpritesheet();
  const goblin = buildGoblinSpritesheet();
  const skeleton = buildSkeletonSpritesheet();
  const golem = buildStoneGolemBossSpritesheet();

  const characterAnims: Record<string, AnimationClip> = {
    idle: { frames: [0, 1], fps: 3, loop: true },
    walk: { frames: [2, 3, 4, 5], fps: 8, loop: true },
  };
  const humanoidCollider: ColliderBox = { offsetX: -16, offsetY: -16, width: 32, height: 16 };

  const assetSpecs: GeneratedAssetSpec[] = [
    {
      id: 'tileset_guilde',
      name: 'Tileset Guilde (32x32)',
      type: 'tileset',
      gridWidth: 32,
      gridHeight: 32,
      columns: 4,
      frames: [guildTileset],
      sheet: guildTileset,
      anchor: { x: 0, y: 0 },
      animations: { torche: { frames: [14, 15], fps: 5, loop: true } },
      tags: ['tileset', 'guilde', 'interior'],
    },
    {
      id: 'tileset_donjon',
      name: 'Tileset Donjon (32x32)',
      type: 'tileset',
      gridWidth: 32,
      gridHeight: 32,
      columns: 4,
      frames: [dungeonTileset],
      sheet: dungeonTileset,
      anchor: { x: 0, y: 0 },
      animations: {
        lave: { frames: [2, 3], fps: 3, loop: true },
        brasero: { frames: [12, 13], fps: 5, loop: true },
      },
      tags: ['tileset', 'donjon', 'dungeon'],
    },
    {
      id: 'hero_aventurier',
      name: 'Héros Aventurier',
      type: 'sprite',
      gridWidth: 32,
      gridHeight: 48,
      columns: 6,
      frames: hero.frames,
      sheet: hero.sheet,
      anchor: { x: 16, y: 48 },
      defaultCollider: humanoidCollider,
      animations: characterAnims,
      tags: ['hero', 'playable', 'humanoid'],
    },
    {
      id: 'pnj_maitre_guilde',
      name: 'Maître de Guilde',
      type: 'sprite',
      gridWidth: 32,
      gridHeight: 48,
      columns: 6,
      frames: guildMaster.frames,
      sheet: guildMaster.sheet,
      anchor: { x: 16, y: 48 },
      defaultCollider: humanoidCollider,
      animations: characterAnims,
      tags: ['npc', 'guilde', 'quest'],
    },
    {
      id: 'pnj_marchand',
      name: 'Marchand Aubergiste',
      type: 'sprite',
      gridWidth: 32,
      gridHeight: 48,
      columns: 6,
      frames: merchant.frames,
      sheet: merchant.sheet,
      anchor: { x: 16, y: 48 },
      defaultCollider: humanoidCollider,
      animations: characterAnims,
      tags: ['npc', 'merchant'],
    },
    {
      id: 'pnj_garde',
      name: 'Garde en Armure',
      type: 'sprite',
      gridWidth: 32,
      gridHeight: 48,
      columns: 6,
      frames: guard.frames,
      sheet: guard.sheet,
      anchor: { x: 16, y: 48 },
      defaultCollider: humanoidCollider,
      animations: characterAnims,
      tags: ['npc', 'guard'],
    },
    {
      id: 'monstre_slime',
      name: 'Slime Émeraude',
      type: 'sprite',
      gridWidth: 32,
      gridHeight: 32,
      columns: 2,
      frames: slime.frames,
      sheet: slime.sheet,
      anchor: { x: 16, y: 32 },
      defaultCollider: { offsetX: -12, offsetY: -14, width: 24, height: 14 },
      animations: { idle: { frames: [0, 1], fps: 4, loop: true } },
      tags: ['monster', 'slime'],
    },
    {
      id: 'monstre_gobelin',
      name: 'Gobelin Pillard',
      type: 'sprite',
      gridWidth: 32,
      gridHeight: 32,
      columns: 2,
      frames: goblin.frames,
      sheet: goblin.sheet,
      anchor: { x: 16, y: 32 },
      defaultCollider: { offsetX: -12, offsetY: -14, width: 24, height: 14 },
      animations: { idle: { frames: [0, 1], fps: 4, loop: true } },
      tags: ['monster', 'goblin'],
    },
    {
      id: 'monstre_squelette',
      name: 'Squelette Gardien',
      type: 'sprite',
      gridWidth: 32,
      gridHeight: 48,
      columns: 2,
      frames: skeleton.frames,
      sheet: skeleton.sheet,
      anchor: { x: 16, y: 48 },
      defaultCollider: humanoidCollider,
      animations: { idle: { frames: [0, 1], fps: 3, loop: true } },
      tags: ['monster', 'undead'],
    },
    {
      id: 'boss_golem_pierre',
      name: 'Boss Golem de Pierre',
      type: 'sprite',
      gridWidth: 64,
      gridHeight: 64,
      columns: 2,
      frames: golem.frames,
      sheet: golem.sheet,
      anchor: { x: 32, y: 64 },
      defaultCollider: { offsetX: -24, offsetY: -32, width: 48, height: 32 },
      animations: { idle: { frames: [0, 1], fps: 2, loop: true } },
      tags: ['monster', 'boss', 'large'],
    },
  ];

  const assetsIndex: Record<string, AssetMeta> = {};
  for (const spec of assetSpecs) {
    assetsIndex[spec.id] = await writeAsset(outDir, spec);
  }

  // Maps
  const maps = [buildGuildMap(), buildDungeonMap()];
  const mapsIndex: Record<string, MapMeta> = {};
  for (const map of maps) {
    const rel = `${PROJECT_DIRS.maps}/${map.id}.map.json`;
    await writeJson(path.join(outDir, rel), map);
    mapsIndex[map.id] = {
      id: map.id,
      name: map.name,
      width: map.width,
      height: map.height,
      tileSize: map.tileSize,
      filePath: rel,
    };
  }

  // Narratives
  const narratives = buildDemoNarratives();
  const narrativesIndex: Record<string, NarrativeMeta> = {};
  for (const graph of narratives) {
    const rel = `${PROJECT_DIRS.narratives}/${graph.id}.narrative.json`;
    await writeJson(path.join(outDir, rel), graph);
    narrativesIndex[graph.id] = {
      id: graph.id,
      name: graph.name,
      filePath: rel,
    };
  }

  // RPG Database
  const dbRel = `${PROJECT_DIRS.database}/rpg.db.json`;
  await writeJson(path.join(outDir, dbRel), buildDemoRpgDatabase());

  // Root ProjectManifest
  const now = new Date().toISOString();
  const manifest: ProjectManifest = {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: 'proj_demo_pack_rpg',
    name: 'Starter Pack — Guilde & Donjon',
    createdAt: now,
    updatedAt: now,
    defaultTileSize: 32,
    assets: assetsIndex,
    maps: mapsIndex,
    narratives: narrativesIndex,
    databasePath: dbRel,
  };
  await writeJson(path.join(outDir, PROJECT_MANIFEST_FILENAME), manifest);

  console.log(
    `[demo-pack] Généré avec succès dans ${outDir} : ${Object.keys(assetsIndex).length} assets PNG + AssetMeta + .pxs.json, ${maps.length} maps, ${narratives.length} graphes narratifs et 1 base RPG.`,
  );
}

void main();
