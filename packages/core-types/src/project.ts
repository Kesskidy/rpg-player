import type { AssetMeta } from './asset.js';
import type { MapMeta } from './map.js';
import type { NarrativeMeta } from './narrative.js';

export const PROJECT_SCHEMA_VERSION = 1 as const;
export const PROJECT_MANIFEST_FILENAME = 'project.json' as const;

export const PROJECT_DIRS = {
  assets: 'assets',
  maps: 'maps',
  narratives: 'narratives',
  database: 'database',
} as const;

/**
 * Root manifest stored in `<projectDir>/project.json`.
 */
export interface ProjectManifest {
  schemaVersion: typeof PROJECT_SCHEMA_VERSION;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  /** Default tile size in pixels for maps/VTT grids (e.g. 16 or 32). */
  defaultTileSize: number;
  /** Index of all project assets keyed by AssetMeta.id. */
  assets: Record<string, AssetMeta>;
  /** Index of all project maps keyed by MapMeta.id (introduced in Phase 2). */
  maps?: Record<string, MapMeta>;
  /** Index of all narrative graphs keyed by NarrativeMeta.id (introduced in Phase 3). */
  narratives?: Record<string, NarrativeMeta>;
  /** Relative path to the project RPG database file (e.g. "database/rpg.db.json"). */
  databasePath?: string;
}

export interface StorageDirectoryEntry {
  name: string;
  isDirectory: boolean;
}

export interface PickedDirectory {
  path: string;
  name: string;
}

export type StorageAdapterMode = 'electron' | 'web-fs' | 'memory';

/**
 * Platform-agnostic filesystem contract used by UI and engines.
 * Keeps Electron IPC, Browser File System Access API, and in-memory testing decoupled.
 */
export interface ProjectStorageAdapter {
  readonly mode: StorageAdapterMode;
  pickProjectDirectory(): Promise<PickedDirectory | null>;
  getCurrentProjectPath(): string | null;
  ensureDir(relPath: string): Promise<void>;
  exists(relPath: string): Promise<boolean>;
  readText(relPath: string): Promise<string>;
  writeText(relPath: string, content: string): Promise<void>;
  readBinary(relPath: string): Promise<Uint8Array>;
  writeBinary(relPath: string, data: Uint8Array): Promise<void>;
  listDir(relPath: string): Promise<StorageDirectoryEntry[]>;
}
