import {
  migrateAndValidateProjectManifest,
  type ProjectManifest,
  type ProjectStorageAdapter,
} from '@rpg-player/core-types';
import { saveProjectManifest } from './project-service';

export const AUTOSAVE_DIR = '.autosave' as const;
export const AUTOSAVE_INDEX_FILE = `${AUTOSAVE_DIR}/index.json` as const;
export const MAX_AUTOSAVE_ROTATIONS = 5;

export interface AutosaveEntry {
  slot: number;
  filePath: string;
  savedAt: string;
  projectName: string;
}

export interface AutosaveIndex {
  dirty: boolean;
  lastSlot: number;
  entries: AutosaveEntry[];
}

async function readAutosaveIndex(adapter: ProjectStorageAdapter): Promise<AutosaveIndex> {
  try {
    if (!(await adapter.exists(AUTOSAVE_INDEX_FILE))) {
      return { dirty: false, lastSlot: 0, entries: [] };
    }
    const raw = await adapter.readText(AUTOSAVE_INDEX_FILE);
    const parsed = JSON.parse(raw) as Partial<AutosaveIndex>;
    return {
      dirty: Boolean(parsed.dirty),
      lastSlot: typeof parsed.lastSlot === 'number' ? parsed.lastSlot : 0,
      entries: Array.isArray(parsed.entries) ? parsed.entries : [],
    };
  } catch {
    return { dirty: false, lastSlot: 0, entries: [] };
  }
}

async function writeAutosaveIndex(
  adapter: ProjectStorageAdapter,
  index: AutosaveIndex,
): Promise<void> {
  await adapter.ensureDir(AUTOSAVE_DIR);
  await adapter.writeText(AUTOSAVE_INDEX_FILE, JSON.stringify(index, null, 2));
}

/**
 * Writes a rotating project manifest snapshot into `.autosave/` (max 5 slots).
 * Marks session `dirty = true` until `markAutosaveSessionClean()` is called on graceful exit.
 */
export async function writeProjectAutosave(
  adapter: ProjectStorageAdapter,
  manifest: ProjectManifest,
): Promise<AutosaveEntry> {
  const index = await readAutosaveIndex(adapter);
  const nextSlot = (index.lastSlot % MAX_AUTOSAVE_ROTATIONS) + 1;
  const filePath = `${AUTOSAVE_DIR}/project.autosave-${nextSlot}.json`;
  const savedAt = new Date().toISOString();

  await adapter.ensureDir(AUTOSAVE_DIR);
  await adapter.writeText(filePath, JSON.stringify(manifest, null, 2));

  const entry: AutosaveEntry = {
    slot: nextSlot,
    filePath,
    savedAt,
    projectName: manifest.name,
  };

  const remaining = index.entries.filter((e) => e.slot !== nextSlot);
  const entries = [entry, ...remaining].slice(0, MAX_AUTOSAVE_ROTATIONS);

  await writeAutosaveIndex(adapter, {
    dirty: true,
    lastSlot: nextSlot,
    entries,
  });

  return entry;
}

export async function markAutosaveSessionClean(adapter: ProjectStorageAdapter): Promise<void> {
  if (!(await adapter.exists(AUTOSAVE_INDEX_FILE))) return;
  const index = await readAutosaveIndex(adapter);
  if (!index.dirty) return;
  await writeAutosaveIndex(adapter, { ...index, dirty: false });
}

/**
 * Checks whether the previous session crashed with an unrecovered autosave snapshot.
 */
export async function getRecoverableAutosave(
  adapter: ProjectStorageAdapter,
): Promise<AutosaveEntry | null> {
  const index = await readAutosaveIndex(adapter);
  if (!index.dirty || index.entries.length === 0) return null;
  const latest = index.entries[0]!;
  if (!(await adapter.exists(latest.filePath))) return null;
  return latest;
}

export async function listAutosaves(adapter: ProjectStorageAdapter): Promise<AutosaveEntry[]> {
  const index = await readAutosaveIndex(adapter);
  return index.entries;
}

export async function restoreAutosave(
  adapter: ProjectStorageAdapter,
  entry: AutosaveEntry,
): Promise<ProjectManifest> {
  const raw = await adapter.readText(entry.filePath);
  const parsed: unknown = JSON.parse(raw);
  const validated = migrateAndValidateProjectManifest(parsed, entry.filePath);
  if (!validated.ok) {
    throw new Error(validated.error);
  }
  const saved = await saveProjectManifest(adapter, validated.manifest);
  await markAutosaveSessionClean(adapter);
  return saved;
}
