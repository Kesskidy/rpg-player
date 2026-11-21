import {
  MAP_SCHEMA_VERSION,
  NARRATIVE_SCHEMA_VERSION,
  PROJECT_DIRS,
  PROJECT_MANIFEST_FILENAME,
  PROJECT_SCHEMA_VERSION,
  RPG_DATABASE_SCHEMA_VERSION,
  type AssetMeta,
  type MapMeta,
  type NarrativeGraph,
  type NarrativeMeta,
  type PixelDocumentSerialized,
  type ProjectManifest,
  type ProjectStorageAdapter,
  type RpgDatabase,
  type TileMapData,
} from '@rpg-player/core-types';
import type { ExportAssetOptions, PixelStudioEngine } from '@rpg-player/pixel-studio';
import { normalizeTileMapData } from '@rpg-player/rpg-engine';

export const RPG_DATABASE_FILENAME = `${PROJECT_DIRS.database}/rpg.db.json` as const;

function sanitizeSlug(raw: string, fallback: string): string {
  return (
    raw
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '') || fallback
  );
}

function createProjectId(name: string): string {
  const slug = sanitizeSlug(name, 'rpg');
  const suffix = Math.random().toString(36).slice(2, 8);
  return `proj_${slug}_${suffix}`;
}

export async function createProject(
  adapter: ProjectStorageAdapter,
  name: string,
  defaultTileSize = 32,
): Promise<ProjectManifest> {
  const now = new Date().toISOString();
  const manifest: ProjectManifest = {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: createProjectId(name),
    name: name.trim() || 'Nouveau Projet RPG',
    createdAt: now,
    updatedAt: now,
    defaultTileSize,
    assets: {},
    maps: {},
    narratives: {},
    databasePath: RPG_DATABASE_FILENAME,
  };

  await adapter.ensureDir(PROJECT_DIRS.assets);
  await adapter.ensureDir(PROJECT_DIRS.maps);
  await adapter.ensureDir(PROJECT_DIRS.narratives);
  await adapter.ensureDir(PROJECT_DIRS.database);
  await adapter.writeText(PROJECT_MANIFEST_FILENAME, JSON.stringify(manifest, null, 2));
  return manifest;
}

export async function openProject(
  adapter: ProjectStorageAdapter,
): Promise<ProjectManifest | null> {
  const hasManifest = await adapter.exists(PROJECT_MANIFEST_FILENAME);
  if (!hasManifest) {
    return null;
  }
  const raw = await adapter.readText(PROJECT_MANIFEST_FILENAME);
  const parsed = JSON.parse(raw) as ProjectManifest;
  if (parsed.schemaVersion !== PROJECT_SCHEMA_VERSION) {
    throw new Error(
      `Version de projet non supportée : ${String(parsed.schemaVersion)} (attendu: ${PROJECT_SCHEMA_VERSION})`,
    );
  }
  return {
    ...parsed,
    assets: parsed.assets ?? {},
    maps: parsed.maps ?? {},
    narratives: parsed.narratives ?? {},
    databasePath: parsed.databasePath ?? RPG_DATABASE_FILENAME,
  };
}

export async function saveProjectManifest(
  adapter: ProjectStorageAdapter,
  manifest: ProjectManifest,
): Promise<ProjectManifest> {
  const updated: ProjectManifest = {
    ...manifest,
    updatedAt: new Date().toISOString(),
  };
  await adapter.writeText(PROJECT_MANIFEST_FILENAME, JSON.stringify(updated, null, 2));
  return updated;
}

export interface SavePixelAssetResult {
  manifest: ProjectManifest;
  meta: AssetMeta;
  pngBytes: Uint8Array;
}

export async function savePixelAsset(
  adapter: ProjectStorageAdapter,
  manifest: ProjectManifest,
  engine: PixelStudioEngine,
  options: ExportAssetOptions,
): Promise<SavePixelAssetResult> {
  const exported = engine.exportAsset(options);
  const serialized: PixelDocumentSerialized = {
    ...engine.serialize(),
    assetId: exported.meta.id,
  };

  await adapter.ensureDir(PROJECT_DIRS.assets);
  await adapter.writeText(exported.meta.sourcePath, JSON.stringify(serialized, null, 2));
  await adapter.writeBinary(exported.meta.filePath, exported.pngBytes);
  await adapter.writeText(
    `${PROJECT_DIRS.assets}/${exported.meta.id}.meta.json`,
    JSON.stringify(exported.meta, null, 2),
  );

  const updatedManifest = await saveProjectManifest(adapter, {
    ...manifest,
    assets: {
      ...manifest.assets,
      [exported.meta.id]: exported.meta,
    },
  });

  return {
    manifest: updatedManifest,
    meta: exported.meta,
    pngBytes: exported.pngBytes,
  };
}

export async function loadPixelAssetSource(
  adapter: ProjectStorageAdapter,
  assetMeta: AssetMeta,
): Promise<PixelDocumentSerialized> {
  const raw = await adapter.readText(assetMeta.sourcePath);
  return JSON.parse(raw) as PixelDocumentSerialized;
}

export interface SaveMapResult {
  manifest: ProjectManifest;
  meta: MapMeta;
}

export async function saveMap(
  adapter: ProjectStorageAdapter,
  manifest: ProjectManifest,
  map: TileMapData,
): Promise<SaveMapResult> {
  const safeId = sanitizeSlug(map.id, 'map_unnamed');
  const filePath = `${PROJECT_DIRS.maps}/${safeId}.map.json`;
  const normalizedMap: TileMapData = {
    ...map,
    schemaVersion: MAP_SCHEMA_VERSION,
    id: safeId,
  };

  const meta: MapMeta = {
    id: safeId,
    name: normalizedMap.name,
    width: normalizedMap.width,
    height: normalizedMap.height,
    tileSize: normalizedMap.tileSize,
    filePath,
  };

  await adapter.ensureDir(PROJECT_DIRS.maps);
  await adapter.writeText(filePath, JSON.stringify(normalizedMap, null, 2));

  const updatedManifest = await saveProjectManifest(adapter, {
    ...manifest,
    maps: {
      ...(manifest.maps ?? {}),
      [safeId]: meta,
    },
  });

  return { manifest: updatedManifest, meta };
}

export async function loadMap(
  adapter: ProjectStorageAdapter,
  meta: MapMeta,
): Promise<TileMapData> {
  const raw = await adapter.readText(meta.filePath);
  return normalizeTileMapData(JSON.parse(raw));
}

export interface SaveNarrativeResult {
  manifest: ProjectManifest;
  meta: NarrativeMeta;
}

export async function saveNarrative(
  adapter: ProjectStorageAdapter,
  manifest: ProjectManifest,
  graph: NarrativeGraph,
): Promise<SaveNarrativeResult> {
  const safeId = sanitizeSlug(graph.id, 'dialogue_unnamed');
  const filePath = `${PROJECT_DIRS.narratives}/${safeId}.narrative.json`;
  const normalized: NarrativeGraph = {
    ...graph,
    schemaVersion: NARRATIVE_SCHEMA_VERSION,
    id: safeId,
  };

  const meta: NarrativeMeta = {
    id: safeId,
    name: normalized.name.trim() || safeId,
    filePath,
  };

  await adapter.ensureDir(PROJECT_DIRS.narratives);
  await adapter.writeText(filePath, JSON.stringify(normalized, null, 2));

  const updatedManifest = await saveProjectManifest(adapter, {
    ...manifest,
    narratives: {
      ...(manifest.narratives ?? {}),
      [safeId]: meta,
    },
  });

  return { manifest: updatedManifest, meta };
}

export async function loadNarrative(
  adapter: ProjectStorageAdapter,
  meta: NarrativeMeta,
): Promise<NarrativeGraph> {
  const raw = await adapter.readText(meta.filePath);
  const parsed = JSON.parse(raw) as NarrativeGraph;
  if (parsed.schemaVersion !== NARRATIVE_SCHEMA_VERSION) {
    throw new Error(`Version de graphe narratif non supportée : ${String(parsed.schemaVersion)}`);
  }
  return parsed;
}

export async function saveRpgDatabase(
  adapter: ProjectStorageAdapter,
  manifest: ProjectManifest,
  db: RpgDatabase,
): Promise<ProjectManifest> {
  const dbPath = manifest.databasePath ?? RPG_DATABASE_FILENAME;
  const normalized: RpgDatabase = {
    ...db,
    schemaVersion: RPG_DATABASE_SCHEMA_VERSION,
  };
  await adapter.ensureDir(PROJECT_DIRS.database);
  await adapter.writeText(dbPath, JSON.stringify(normalized, null, 2));
  return saveProjectManifest(adapter, {
    ...manifest,
    databasePath: dbPath,
  });
}

export async function loadRpgDatabase(
  adapter: ProjectStorageAdapter,
  manifest: ProjectManifest,
): Promise<RpgDatabase | null> {
  const dbPath = manifest.databasePath ?? RPG_DATABASE_FILENAME;
  if (!(await adapter.exists(dbPath))) {
    return null;
  }
  const raw = await adapter.readText(dbPath);
  const parsed = JSON.parse(raw) as RpgDatabase;
  if (parsed.schemaVersion !== RPG_DATABASE_SCHEMA_VERSION) {
    throw new Error(`Version de base RPG non supportée : ${String(parsed.schemaVersion)}`);
  }
  return parsed;
}
