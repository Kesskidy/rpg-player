import { describe, expect, it } from 'vitest';
import {
  MAP_SCHEMA_VERSION,
  NARRATIVE_SCHEMA_VERSION,
  PROJECT_SCHEMA_VERSION,
  RPG_DATABASE_SCHEMA_VERSION,
  migrateAndValidateProjectManifest,
  validateNarrativeGraphPayload,
  validateProjectManifest,
  validateRpgDatabasePayload,
  validateTileMapPayload,
  validateVttClientMessage,
  validateVttServerMessage,
} from '../index.js';

describe('core-types schema validation & migrations (A2)', () => {
  it('validates valid ProjectManifest and rejects corrupted manifests with clear messages', () => {
    const valid = validateProjectManifest({
      schemaVersion: PROJECT_SCHEMA_VERSION,
      id: 'proj_1',
      name: 'Mon RPG',
      createdAt: '2026-11-21T00:00:00Z',
      updatedAt: '2026-11-21T00:00:00Z',
      defaultTileSize: 32,
      assets: {},
    });
    expect(valid.ok).toBe(true);

    const missingName = validateProjectManifest({
      schemaVersion: PROJECT_SCHEMA_VERSION,
      id: 'proj_1',
      defaultTileSize: 32,
      assets: {},
    });
    expect(missingName.ok).toBe(false);
    if (!missingName.ok) expect(missingName.error).toContain('name');
  });

  it('migrates legacy v0 manifest to v1 cleanly', () => {
    const legacyV0 = {
      id: 'legacy_proj',
      name: 'Ancien Projet',
      assets: {},
    };
    const migrated = migrateAndValidateProjectManifest(legacyV0);
    expect(migrated.ok).toBe(true);
    if (migrated.ok) {
      expect(migrated.migratedFromVersion).toBe(0);
      expect(migrated.manifest.schemaVersion).toBe(PROJECT_SCHEMA_VERSION);
      expect(migrated.manifest.defaultTileSize).toBe(32);
      expect(migrated.manifest.maps).toEqual({});
    }
  });

  it('validates map, narrative, and RPG database payloads with explicit field errors', () => {
    const badMap = validateTileMapPayload({ schemaVersion: MAP_SCHEMA_VERSION, id: 'm1' }, 'foret.json');
    expect(badMap.ok).toBe(false);
    if (!badMap.ok) {
      expect(badMap.error).toContain('foret.json');
      expect(badMap.error).toContain('width');
    }

    const badNar = validateNarrativeGraphPayload({
      schemaVersion: NARRATIVE_SCHEMA_VERSION,
      id: 'n1',
    });
    expect(badNar.ok).toBe(false);

    const badDb = validateRpgDatabasePayload({
      schemaVersion: RPG_DATABASE_SCHEMA_VERSION,
      hero: {},
    });
    expect(badDb.ok).toBe(false);
  });

  it('validates VTT client and server protocol messages uniformly', () => {
    expect(validateVttClientMessage(null).ok).toBe(false);
    expect(validateVttClientMessage({ type: 'join_room', roomCode: 'ABCD12', playerName: 'Léo' }).ok).toBe(
      true,
    );
    expect(validateVttServerMessage({ type: 'error', code: 'E', message: 'Oops' }).ok).toBe(true);
    expect(validateVttServerMessage({ type: 'state_sync', state: null }).ok).toBe(false);
    expect(validateVttServerMessage({ type: 'unknown' }).ok).toBe(false);
  });
});
