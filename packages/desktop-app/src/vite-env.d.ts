/// <reference types="vite/client" />

export interface ElectronProjectFsBridge {
  pickProjectDirectory: () => Promise<{ path: string; name: string } | null>;
  getCurrentProjectPath: () => Promise<string | null>;
  ensureDir: (relPath: string) => Promise<void>;
  exists: (relPath: string) => Promise<boolean>;
  readText: (relPath: string) => Promise<string>;
  writeText: (relPath: string, content: string) => Promise<void>;
  readBinary: (relPath: string) => Promise<Uint8Array>;
  writeBinary: (relPath: string, data: Uint8Array) => Promise<void>;
  listDir: (relPath: string) => Promise<Array<{ name: string; isDirectory: boolean }>>;
}

declare global {
  interface Window {
    rpgPlayerFs?: ElectronProjectFsBridge;
  }
}
