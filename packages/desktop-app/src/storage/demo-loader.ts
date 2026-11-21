import {
  PROJECT_DIRS,
  PROJECT_MANIFEST_FILENAME,
  type ProjectManifest,
} from '@rpg-player/core-types';
import { MemoryStorageAdapter } from './adapter.js';

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Impossible de charger ${url} (HTTP ${res.status})`);
  }
  return res.text();
}

async function fetchBinary(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Impossible de charger ${url} (HTTP ${res.status})`);
  }
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

/**
 * Loads the bundled `demo-pack/` project into an in-memory ProjectStorageAdapter
 * so the user can test Pixel Studio, RPG Engine, and VTT immediately with 1 click.
 */
export async function loadDemoPackProject(
  baseUrl = './demo-pack',
): Promise<{ adapter: MemoryStorageAdapter; manifest: ProjectManifest }> {
  const adapter = new MemoryStorageAdapter();
  await adapter.pickProjectDirectory();

  const manifestText = await fetchText(`${baseUrl}/${PROJECT_MANIFEST_FILENAME}`);
  const manifest = JSON.parse(manifestText) as ProjectManifest;
  await adapter.writeText(PROJECT_MANIFEST_FILENAME, manifestText);
  await adapter.ensureDir(PROJECT_DIRS.assets);
  await adapter.ensureDir(PROJECT_DIRS.maps);
  await adapter.ensureDir(PROJECT_DIRS.narratives);
  await adapter.ensureDir(PROJECT_DIRS.database);

  const tasks: Array<Promise<void>> = [];

  // Hydrate all assets (.png, .pxs.json, .meta.json)
  for (const meta of Object.values(manifest.assets)) {
    tasks.push(
      fetchBinary(`${baseUrl}/${meta.filePath}`).then((bytes) =>
        adapter.writeBinary(meta.filePath, bytes),
      ),
    );
    tasks.push(
      fetchText(`${baseUrl}/${meta.sourcePath}`).then((txt) =>
        adapter.writeText(meta.sourcePath, txt),
      ),
    );
    const metaPath = `${PROJECT_DIRS.assets}/${meta.id}.meta.json`;
    tasks.push(
      fetchText(`${baseUrl}/${metaPath}`)
        .then((txt) => adapter.writeText(metaPath, txt))
        .catch(() => undefined),
    );
  }

  // Hydrate maps
  for (const mapMeta of Object.values(manifest.maps ?? {})) {
    tasks.push(
      fetchText(`${baseUrl}/${mapMeta.filePath}`).then((txt) =>
        adapter.writeText(mapMeta.filePath, txt),
      ),
    );
  }

  // Hydrate narrative graphs
  for (const narMeta of Object.values(manifest.narratives ?? {})) {
    tasks.push(
      fetchText(`${baseUrl}/${narMeta.filePath}`).then((txt) =>
        adapter.writeText(narMeta.filePath, txt),
      ),
    );
  }

  // Hydrate RPG database
  if (manifest.databasePath) {
    const dbPath = manifest.databasePath;
    tasks.push(
      fetchText(`${baseUrl}/${dbPath}`).then((txt) => adapter.writeText(dbPath, txt)),
    );
  }

  await Promise.all(tasks);
  return { adapter, manifest };
}
