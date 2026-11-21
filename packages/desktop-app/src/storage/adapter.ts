import type {
  PickedDirectory,
  ProjectStorageAdapter,
  StorageDirectoryEntry,
} from '@rpg-player/core-types';

interface BrowserFileHandle {
  kind: 'file';
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{
    write(data: string | Uint8Array): Promise<void>;
    close(): Promise<void>;
  }>;
}

interface BrowserDirectoryHandle {
  kind: 'directory';
  name: string;
  getDirectoryHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<BrowserDirectoryHandle>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<BrowserFileHandle>;
  values(): AsyncIterableIterator<BrowserDirectoryHandle | BrowserFileHandle>;
}

interface WindowWithDirectoryPicker extends Window {
  showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<BrowserDirectoryHandle>;
}

function splitPath(relPath: string): string[] {
  return relPath
    .replace(/\\/g, '/')
    .split('/')
    .filter((segment) => segment.length > 0 && segment !== '.');
}

class ElectronStorageAdapter implements ProjectStorageAdapter {
  readonly mode = 'electron' as const;
  private currentPath: string | null = null;

  async pickProjectDirectory(): Promise<PickedDirectory | null> {
    if (!window.rpgPlayerFs) {
      throw new Error('Bridge Electron indisponible.');
    }
    const picked = await window.rpgPlayerFs.pickProjectDirectory();
    if (picked) {
      this.currentPath = picked.path;
    }
    return picked;
  }

  getCurrentProjectPath(): string | null {
    return this.currentPath;
  }

  ensureDir(relPath: string): Promise<void> {
    return window.rpgPlayerFs!.ensureDir(relPath);
  }

  exists(relPath: string): Promise<boolean> {
    return window.rpgPlayerFs!.exists(relPath);
  }

  readText(relPath: string): Promise<string> {
    return window.rpgPlayerFs!.readText(relPath);
  }

  writeText(relPath: string, content: string): Promise<void> {
    return window.rpgPlayerFs!.writeText(relPath, content);
  }

  readBinary(relPath: string): Promise<Uint8Array> {
    return window.rpgPlayerFs!.readBinary(relPath);
  }

  writeBinary(relPath: string, data: Uint8Array): Promise<void> {
    return window.rpgPlayerFs!.writeBinary(relPath, data);
  }

  listDir(relPath: string): Promise<StorageDirectoryEntry[]> {
    return window.rpgPlayerFs!.listDir(relPath);
  }
}

class WebFileSystemStorageAdapter implements ProjectStorageAdapter {
  readonly mode = 'web-fs' as const;
  private rootHandle: BrowserDirectoryHandle | null = null;

  async pickProjectDirectory(): Promise<PickedDirectory | null> {
    const picker = (window as WindowWithDirectoryPicker).showDirectoryPicker;
    if (!picker) {
      return null;
    }
    try {
      const handle = await picker({ mode: 'readwrite' });
      this.rootHandle = handle;
      return { path: handle.name, name: handle.name };
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return null;
      }
      throw error;
    }
  }

  getCurrentProjectPath(): string | null {
    return this.rootHandle?.name ?? null;
  }

  private requireRoot(): BrowserDirectoryHandle {
    if (!this.rootHandle) {
      throw new Error('Aucun dossier projet sélectionné.');
    }
    return this.rootHandle;
  }

  private async navigateDirectory(
    segments: string[],
    create: boolean,
  ): Promise<BrowserDirectoryHandle> {
    let dir = this.requireRoot();
    for (const segment of segments) {
      if (segment === '..') {
        throw new Error('Chemin parent ("..") interdit.');
      }
      dir = await dir.getDirectoryHandle(segment, { create });
    }
    return dir;
  }

  async ensureDir(relPath: string): Promise<void> {
    await this.navigateDirectory(splitPath(relPath), true);
  }

  async exists(relPath: string): Promise<boolean> {
    const parts = splitPath(relPath);
    if (parts.length === 0) {
      return this.rootHandle !== null;
    }
    const leaf = parts[parts.length - 1]!;
    try {
      const parent = await this.navigateDirectory(parts.slice(0, -1), false);
      try {
        await parent.getFileHandle(leaf, { create: false });
        return true;
      } catch {
        await parent.getDirectoryHandle(leaf, { create: false });
        return true;
      }
    } catch {
      return false;
    }
  }

  async readText(relPath: string): Promise<string> {
    const parts = splitPath(relPath);
    const leaf = parts.pop();
    if (!leaf) {
      throw new Error('Chemin de fichier invalide.');
    }
    const parent = await this.navigateDirectory(parts, false);
    const fileHandle = await parent.getFileHandle(leaf, { create: false });
    const file = await fileHandle.getFile();
    return file.text();
  }

  async writeText(relPath: string, content: string): Promise<void> {
    const parts = splitPath(relPath);
    const leaf = parts.pop();
    if (!leaf) {
      throw new Error('Chemin de fichier invalide.');
    }
    const parent = await this.navigateDirectory(parts, true);
    const fileHandle = await parent.getFileHandle(leaf, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
  }

  async readBinary(relPath: string): Promise<Uint8Array> {
    const parts = splitPath(relPath);
    const leaf = parts.pop();
    if (!leaf) {
      throw new Error('Chemin de fichier invalide.');
    }
    const parent = await this.navigateDirectory(parts, false);
    const fileHandle = await parent.getFileHandle(leaf, { create: false });
    const file = await fileHandle.getFile();
    const buffer = await file.arrayBuffer();
    return new Uint8Array(buffer);
  }

  async writeBinary(relPath: string, data: Uint8Array): Promise<void> {
    const parts = splitPath(relPath);
    const leaf = parts.pop();
    if (!leaf) {
      throw new Error('Chemin de fichier invalide.');
    }
    const parent = await this.navigateDirectory(parts, true);
    const fileHandle = await parent.getFileHandle(leaf, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(data);
    await writable.close();
  }

  async listDir(relPath: string): Promise<StorageDirectoryEntry[]> {
    const dir = await this.navigateDirectory(splitPath(relPath), false);
    const entries: StorageDirectoryEntry[] = [];
    for await (const entry of dir.values()) {
      entries.push({
        name: entry.name,
        isDirectory: entry.kind === 'directory',
      });
    }
    return entries;
  }
}

export class MemoryStorageAdapter implements ProjectStorageAdapter {
  readonly mode = 'memory' as const;
  private currentPath: string | null = null;
  private readonly files = new Map<string, Uint8Array>();
  private readonly dirs = new Set<string>(['']);

  async pickProjectDirectory(): Promise<PickedDirectory | null> {
    this.currentPath = 'sandbox-project';
    return { path: this.currentPath, name: 'Projet Mémoire' };
  }

  getCurrentProjectPath(): string | null {
    return this.currentPath;
  }

  private normalize(relPath: string): string {
    return splitPath(relPath).join('/');
  }

  async ensureDir(relPath: string): Promise<void> {
    const parts = splitPath(relPath);
    let current = '';
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      this.dirs.add(current);
    }
  }

  async exists(relPath: string): Promise<boolean> {
    const key = this.normalize(relPath);
    return this.files.has(key) || this.dirs.has(key);
  }

  async readText(relPath: string): Promise<string> {
    const bytes = await this.readBinary(relPath);
    return new TextDecoder().decode(bytes);
  }

  async writeText(relPath: string, content: string): Promise<void> {
    await this.writeBinary(relPath, new TextEncoder().encode(content));
  }

  async readBinary(relPath: string): Promise<Uint8Array> {
    const key = this.normalize(relPath);
    const data = this.files.get(key);
    if (!data) {
      throw new Error(`Fichier introuvable en mémoire : ${key}`);
    }
    return new Uint8Array(data);
  }

  async writeBinary(relPath: string, data: Uint8Array): Promise<void> {
    const parts = splitPath(relPath);
    if (parts.length > 1) {
      await this.ensureDir(parts.slice(0, -1).join('/'));
    }
    this.files.set(parts.join('/'), new Uint8Array(data));
  }

  async listDir(relPath: string): Promise<StorageDirectoryEntry[]> {
    const prefix = this.normalize(relPath);
    const results = new Map<string, boolean>();
    const addCandidate = (full: string, isDir: boolean) => {
      if (prefix && !full.startsWith(`${prefix}/`)) return;
      const rest = prefix ? full.slice(prefix.length + 1) : full;
      if (!rest) return;
      const [first, ...tail] = rest.split('/');
      if (!first) return;
      results.set(first, tail.length > 0 ? true : isDir);
    };

    for (const dir of this.dirs) {
      if (dir) addCandidate(dir, true);
    }
    for (const file of this.files.keys()) {
      addCandidate(file, false);
    }

    return Array.from(results.entries()).map(([name, isDirectory]) => ({
      name,
      isDirectory,
    }));
  }
}

export function createStorageAdapter(): ProjectStorageAdapter {
  if (typeof window !== 'undefined' && window.rpgPlayerFs) {
    return new ElectronStorageAdapter();
  }
  if (typeof window !== 'undefined' && 'showDirectoryPicker' in window) {
    return new WebFileSystemStorageAdapter();
  }
  return new MemoryStorageAdapter();
}
