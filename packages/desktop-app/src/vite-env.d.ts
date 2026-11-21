/// <reference types="vite/client" />

export interface ElectronProjectFsBridge {
  pickProjectDirectory: () => Promise<{ path: string; name: string } | null>;
  getCurrentProjectPath: () => Promise<string | null>;
  setCurrentProjectPath?: (nextPath: string | null) => Promise<void>;
  ensureDir: (relPath: string) => Promise<void>;
  exists: (relPath: string) => Promise<boolean>;
  readText: (relPath: string) => Promise<string>;
  writeText: (relPath: string, content: string) => Promise<void>;
  readBinary: (relPath: string) => Promise<Uint8Array>;
  writeBinary: (relPath: string, data: Uint8Array) => Promise<void>;
  listDir: (relPath: string) => Promise<Array<{ name: string; isDirectory: boolean }>>;
  readDemoText?: (relPath: string) => Promise<string>;
  readDemoBinary?: (relPath: string) => Promise<Uint8Array>;
  readScenarioText?: (relPath: string) => Promise<string>;
  readScenarioBinary?: (relPath: string) => Promise<Uint8Array>;
}

declare global {
  interface Window {
    rpgPlayerFs?: ElectronProjectFsBridge;
  }
}
