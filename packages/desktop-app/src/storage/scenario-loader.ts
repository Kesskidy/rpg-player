import {
  PROJECT_DIRS,
  PROJECT_MANIFEST_FILENAME,
  type NarrativeGraph,
  type ProjectManifest,
  type RpgDatabase,
  type TileMapData,
  type VttCharacterSheet,
  type VttToken,
} from '@rpg-player/core-types';
import { normalizeTileMapData } from '@rpg-player/rpg-engine';
import { MemoryStorageAdapter } from './adapter.js';

export interface VttScenarioScenePreset {
  mapId: string;
  label: string;
  fogEnabled: boolean;
  revealSpawnRadius: number;
  gmNotes: string;
  tokens: Array<Omit<VttToken, 'id' | 'ownerIds'> & { ownerRole: 'player' | 'gm' }>;
}

export interface VttScenarioSessionPreset {
  schemaVersion: 1;
  id: string;
  title: string;
  subtitle: string;
  initialSceneId: string;
  introAnnouncement: {
    kind: 'event' | 'music';
    title: string;
    message: string;
  };
  introChatMessages: Array<{
    channel: 'rp' | 'hrp' | 'system';
    senderName: string;
    senderRole: 'gm' | 'system';
    text: string;
  }>;
  playerSheet: Omit<VttCharacterSheet, 'participantId'>;
  scenes: Record<string, VttScenarioScenePreset>;
}

export interface LoadedScenarioBundle {
  adapter: MemoryStorageAdapter;
  manifest: ProjectManifest;
  database: RpgDatabase;
  maps: Record<string, TileMapData>;
  narratives: Record<string, NarrativeGraph>;
  vttPreset: VttScenarioSessionPreset;
}

async function readScenarioText(scenarioId: string, relPath: string): Promise<string> {
  const fullRel = `${scenarioId}/${relPath}`;
  if (typeof window !== 'undefined' && window.rpgPlayerFs?.readScenarioText) {
    return window.rpgPlayerFs.readScenarioText(fullRel);
  }
  const url = `./scenarios/${fullRel}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Impossible de charger ${url} (HTTP ${res.status})`);
  }
  return res.text();
}

async function readScenarioBinary(scenarioId: string, relPath: string): Promise<Uint8Array> {
  const fullRel = `${scenarioId}/${relPath}`;
  if (typeof window !== 'undefined' && window.rpgPlayerFs?.readScenarioBinary) {
    return window.rpgPlayerFs.readScenarioBinary(fullRel);
  }
  const url = `./scenarios/${fullRel}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Impossible de charger ${url} (HTTP ${res.status})`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

/**
 * Loads a prebuilt JDR/RPG scenario from `scenarios/<scenarioId>/` into memory,
 * ready for immediate 1-click play in VTT Mode AND compatible with RPG Engine & Pixel Studio.
 */
export async function loadScenarioBundle(
  scenarioId = 'quete_taverne',
): Promise<LoadedScenarioBundle> {
  const adapter = new MemoryStorageAdapter();
  await adapter.pickProjectDirectory();

  const manifestText = await readScenarioText(scenarioId, PROJECT_MANIFEST_FILENAME);
  const manifest = JSON.parse(manifestText) as ProjectManifest;
  await adapter.writeText(PROJECT_MANIFEST_FILENAME, manifestText);
  await adapter.ensureDir(PROJECT_DIRS.assets);
  await adapter.ensureDir(PROJECT_DIRS.maps);
  await adapter.ensureDir(PROJECT_DIRS.narratives);
  await adapter.ensureDir(PROJECT_DIRS.database);

  const tasks: Array<Promise<void>> = [];
  const maps: Record<string, TileMapData> = {};
  const narratives: Record<string, NarrativeGraph> = {};

  for (const meta of Object.values(manifest.assets)) {
    tasks.push(
      readScenarioBinary(scenarioId, meta.filePath).then((bytes) =>
        adapter.writeBinary(meta.filePath, bytes),
      ),
    );
    tasks.push(
      readScenarioText(scenarioId, meta.sourcePath).then((txt) =>
        adapter.writeText(meta.sourcePath, txt),
      ),
    );
    const metaPath = `${PROJECT_DIRS.assets}/${meta.id}.meta.json`;
    tasks.push(
      readScenarioText(scenarioId, metaPath)
        .then((txt) => adapter.writeText(metaPath, txt))
        .catch(() => undefined),
    );
  }

  for (const mapMeta of Object.values(manifest.maps ?? {})) {
    tasks.push(
      readScenarioText(scenarioId, mapMeta.filePath).then(async (txt) => {
        await adapter.writeText(mapMeta.filePath, txt);
        maps[mapMeta.id] = normalizeTileMapData(JSON.parse(txt));
      }),
    );
  }

  for (const narMeta of Object.values(manifest.narratives ?? {})) {
    tasks.push(
      readScenarioText(scenarioId, narMeta.filePath).then(async (txt) => {
        await adapter.writeText(narMeta.filePath, txt);
        narratives[narMeta.id] = JSON.parse(txt) as NarrativeGraph;
      }),
    );
  }

  const dbPath = manifest.databasePath ?? `${PROJECT_DIRS.database}/rpg.db.json`;
  let database!: RpgDatabase;
  tasks.push(
    readScenarioText(scenarioId, dbPath).then(async (txt) => {
      await adapter.writeText(dbPath, txt);
      database = JSON.parse(txt) as RpgDatabase;
    }),
  );

  let vttPreset!: VttScenarioSessionPreset;
  tasks.push(
    readScenarioText(scenarioId, 'vtt/session.vtt.json').then((txt) => {
      vttPreset = JSON.parse(txt) as VttScenarioSessionPreset;
    }),
  );

  await Promise.all(tasks);

  return {
    adapter,
    manifest,
    database,
    maps,
    narratives,
    vttPreset,
  };
}
