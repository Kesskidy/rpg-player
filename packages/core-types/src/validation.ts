import {
  LEGACY_MAP_SCHEMA_VERSION,
  MAP_SCHEMA_VERSION,
  type TileMapData,
} from './map.js';
import { NARRATIVE_SCHEMA_VERSION, type NarrativeGraph } from './narrative.js';
import { PROJECT_SCHEMA_VERSION, type ProjectManifest } from './project.js';
import { RPG_DATABASE_SCHEMA_VERSION, type RpgDatabase } from './rpg.js';

export type SchemaValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Sequential manifest migrations: `migrations[fromVersion]` upgrades a raw object
 * from `fromVersion` to `fromVersion + 1`.
 */
export type ManifestMigrationFn = (raw: Record<string, unknown>) => Record<string, unknown>;

export const PROJECT_MANIFEST_MIGRATIONS: Record<number, ManifestMigrationFn> = {
  // Legacy v0 manifests (missing schemaVersion / maps / narratives / defaultTileSize) -> v1
  0: (raw) => {
    const now = new Date().toISOString();
    return {
      ...raw,
      schemaVersion: 1,
      createdAt: typeof raw['createdAt'] === 'string' ? raw['createdAt'] : now,
      updatedAt: typeof raw['updatedAt'] === 'string' ? raw['updatedAt'] : now,
      defaultTileSize:
        typeof raw['defaultTileSize'] === 'number' && raw['defaultTileSize'] > 0
          ? raw['defaultTileSize']
          : 32,
      assets: isPlainObject(raw['assets']) ? raw['assets'] : {},
      maps: isPlainObject(raw['maps']) ? raw['maps'] : {},
      narratives: isPlainObject(raw['narratives']) ? raw['narratives'] : {},
    };
  },
};

export interface ManifestMigrationOutcome {
  ok: true;
  manifest: ProjectManifest;
  migratedFromVersion: number | null;
}

export interface ManifestMigrationFailure {
  ok: false;
  error: string;
}

/**
 * Validates a raw parsed `project.json` manifest with clear user-facing errors.
 */
export function validateProjectManifest(
  raw: unknown,
  filename = 'project.json',
): SchemaValidationResult<ProjectManifest> {
  if (!isPlainObject(raw)) {
    return { ok: false, error: `Le fichier ${filename} est invalide : objet JSON attendu.` };
  }
  if (raw['schemaVersion'] !== PROJECT_SCHEMA_VERSION) {
    return {
      ok: false,
      error: `Le fichier ${filename} a une version de schéma non supportée (${String(raw['schemaVersion'] ?? 'manquante')}, attendu : ${PROJECT_SCHEMA_VERSION}).`,
    };
  }
  if (typeof raw['id'] !== 'string' || !raw['id'].trim()) {
    return { ok: false, error: `Le fichier ${filename} est invalide : champ "id" manquant.` };
  }
  if (typeof raw['name'] !== 'string' || !raw['name'].trim()) {
    return { ok: false, error: `Le fichier ${filename} est invalide : champ "name" manquant.` };
  }
  if (
    typeof raw['defaultTileSize'] !== 'number' ||
    !Number.isFinite(raw['defaultTileSize']) ||
    raw['defaultTileSize'] < 8 ||
    raw['defaultTileSize'] > 256
  ) {
    return {
      ok: false,
      error: `Le fichier ${filename} est invalide : "defaultTileSize" doit être un nombre entre 8 et 256.`,
    };
  }
  if (!isPlainObject(raw['assets'])) {
    return {
      ok: false,
      error: `Le fichier ${filename} est invalide : champ "assets" manquant ou corrompu.`,
    };
  }
  if (raw['maps'] !== undefined && !isPlainObject(raw['maps'])) {
    return { ok: false, error: `Le fichier ${filename} est invalide : champ "maps" corrompu.` };
  }
  if (raw['narratives'] !== undefined && !isPlainObject(raw['narratives'])) {
    return {
      ok: false,
      error: `Le fichier ${filename} est invalide : champ "narratives" corrompu.`,
    };
  }

  return { ok: true, data: raw as unknown as ProjectManifest };
}

/**
 * Applies sequential migrations if a manifest comes from an older `schemaVersion`,
 * then validates the migrated manifest.
 */
export function migrateAndValidateProjectManifest(
  raw: unknown,
  filename = 'project.json',
): ManifestMigrationOutcome | ManifestMigrationFailure {
  if (!isPlainObject(raw)) {
    return { ok: false, error: `Le fichier ${filename} est invalide : objet JSON attendu.` };
  }

  const rawVersion = raw['schemaVersion'];
  const startVersion =
    rawVersion === undefined ? 0 : typeof rawVersion === 'number' ? Math.trunc(rawVersion) : -1;

  if (startVersion < 0 || startVersion > PROJECT_SCHEMA_VERSION) {
    return {
      ok: false,
      error: `Version de projet ${String(rawVersion)} non supportée dans ${filename} (version maximale supportée : ${PROJECT_SCHEMA_VERSION}).`,
    };
  }

  let current: Record<string, unknown> = { ...raw };
  let version = startVersion;

  while (version < PROJECT_SCHEMA_VERSION) {
    const step = PROJECT_MANIFEST_MIGRATIONS[version];
    if (!step) {
      return {
        ok: false,
        error: `Aucune migration disponible depuis la version ${version} dans ${filename}.`,
      };
    }
    current = step(current);
    version += 1;
  }

  const validated = validateProjectManifest(current, filename);
  if (!validated.ok) {
    return validated;
  }

  return {
    ok: true,
    manifest: validated.data,
    migratedFromVersion: startVersion < PROJECT_SCHEMA_VERSION ? startVersion : null,
  };
}

/**
 * Validates a raw TileMapData JSON payload (v1 or v2) before normalization.
 */
export function validateTileMapPayload(
  raw: unknown,
  filename = 'map.json',
): SchemaValidationResult<TileMapData> {
  if (!isPlainObject(raw)) {
    return { ok: false, error: `La map "${filename}" est invalide : objet JSON attendu.` };
  }
  const version = raw['schemaVersion'];
  if (version !== MAP_SCHEMA_VERSION && version !== LEGACY_MAP_SCHEMA_VERSION) {
    return {
      ok: false,
      error: `La map "${filename}" a une schemaVersion non supportée (${String(version ?? 'manquante')}).`,
    };
  }
  if (typeof raw['id'] !== 'string' || !raw['id'].trim()) {
    return { ok: false, error: `La map "${filename}" est invalide : champ "id" manquant.` };
  }
  if (typeof raw['width'] !== 'number' || !Number.isInteger(raw['width']) || raw['width'] < 1) {
    return { ok: false, error: `La map "${filename}" est invalide : champ "width" manquant ou invalide.` };
  }
  if (typeof raw['height'] !== 'number' || !Number.isInteger(raw['height']) || raw['height'] < 1) {
    return { ok: false, error: `La map "${filename}" est invalide : champ "height" manquant ou invalide.` };
  }
  if (typeof raw['tileSize'] !== 'number' || raw['tileSize'] < 4) {
    return { ok: false, error: `La map "${filename}" est invalide : champ "tileSize" manquant ou invalide.` };
  }
  if (!Array.isArray(raw['layers'])) {
    return { ok: false, error: `La map "${filename}" est invalide : tableau "layers" manquant.` };
  }
  if (version === MAP_SCHEMA_VERSION) {
    const col = raw['collisionLayer'];
    if (!isPlainObject(col) || !Array.isArray(col['cells'])) {
      return {
        ok: false,
        error: `La map "${filename}" est invalide : "collisionLayer.cells" manquant.`,
      };
    }
  }
  return { ok: true, data: raw as unknown as TileMapData };
}

/**
 * Validates a NarrativeGraph JSON payload.
 */
export function validateNarrativeGraphPayload(
  raw: unknown,
  filename = 'narrative.json',
): SchemaValidationResult<NarrativeGraph> {
  if (!isPlainObject(raw)) {
    return { ok: false, error: `Le graphe narratif "${filename}" est invalide : objet JSON attendu.` };
  }
  if (raw['schemaVersion'] !== NARRATIVE_SCHEMA_VERSION) {
    return {
      ok: false,
      error: `Le graphe narratif "${filename}" a une version non supportée (${String(raw['schemaVersion'] ?? 'manquante')}).`,
    };
  }
  if (typeof raw['id'] !== 'string' || !raw['id'].trim()) {
    return { ok: false, error: `Le graphe narratif "${filename}" est invalide : champ "id" manquant.` };
  }
  if (typeof raw['entryNodeId'] !== 'string' || !raw['entryNodeId'].trim()) {
    return {
      ok: false,
      error: `Le graphe narratif "${filename}" est invalide : champ "entryNodeId" manquant.`,
    };
  }
  if (!Array.isArray(raw['nodes'])) {
    return {
      ok: false,
      error: `Le graphe narratif "${filename}" est invalide : tableau "nodes" manquant.`,
    };
  }
  return { ok: true, data: raw as unknown as NarrativeGraph };
}

/**
 * Validates an RpgDatabase JSON payload.
 */
export function validateRpgDatabasePayload(
  raw: unknown,
  filename = 'database/rpg.db.json',
): SchemaValidationResult<RpgDatabase> {
  if (!isPlainObject(raw)) {
    return { ok: false, error: `La base RPG "${filename}" est invalide : objet JSON attendu.` };
  }
  if (raw['schemaVersion'] !== RPG_DATABASE_SCHEMA_VERSION) {
    return {
      ok: false,
      error: `La base RPG "${filename}" a une version non supportée (${String(raw['schemaVersion'] ?? 'manquante')}).`,
    };
  }
  if (!isPlainObject(raw['hero']) || !isPlainObject(raw['hero']['stats'])) {
    return { ok: false, error: `La base RPG "${filename}" est invalide : profil "hero.stats" manquant.` };
  }
  if (!isPlainObject(raw['items']) || !isPlainObject(raw['skills']) || !isPlainObject(raw['enemies'])) {
    return {
      ok: false,
      error: `La base RPG "${filename}" est invalide : tables "items", "skills" ou "enemies" manquantes.`,
    };
  }
  return { ok: true, data: raw as unknown as RpgDatabase };
}
