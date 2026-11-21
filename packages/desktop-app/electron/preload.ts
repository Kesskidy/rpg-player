import { contextBridge, ipcRenderer } from 'electron';

export interface ElectronProjectFsBridge {
  pickProjectDirectory: () => Promise<{ path: string; name: string } | null>;
  getCurrentProjectPath: () => Promise<string | null>;
  setCurrentProjectPath: (nextPath: string | null) => Promise<void>;
  ensureDir: (relPath: string) => Promise<void>;
  exists: (relPath: string) => Promise<boolean>;
  readText: (relPath: string) => Promise<string>;
  writeText: (relPath: string, content: string) => Promise<void>;
  readBinary: (relPath: string) => Promise<Uint8Array>;
  writeBinary: (relPath: string, data: Uint8Array) => Promise<void>;
  listDir: (relPath: string) => Promise<Array<{ name: string; isDirectory: boolean }>>;
  readDemoText: (relPath: string) => Promise<string>;
  readDemoBinary: (relPath: string) => Promise<Uint8Array>;
  readScenarioText: (relPath: string) => Promise<string>;
  readScenarioBinary: (relPath: string) => Promise<Uint8Array>;
}

const bridge: ElectronProjectFsBridge = {
  pickProjectDirectory: () => ipcRenderer.invoke('project:pickDirectory'),
  getCurrentProjectPath: () => ipcRenderer.invoke('project:getCurrentPath'),
  setCurrentProjectPath: (nextPath) => ipcRenderer.invoke('project:setCurrentPath', nextPath),
  ensureDir: (relPath) => ipcRenderer.invoke('project:ensureDir', relPath),
  exists: (relPath) => ipcRenderer.invoke('project:exists', relPath),
  readText: (relPath) => ipcRenderer.invoke('project:readText', relPath),
  writeText: (relPath, content) => ipcRenderer.invoke('project:writeText', relPath, content),
  readBinary: (relPath) => ipcRenderer.invoke('project:readBinary', relPath),
  writeBinary: (relPath, data) => ipcRenderer.invoke('project:writeBinary', relPath, data),
  listDir: (relPath) => ipcRenderer.invoke('project:listDir', relPath),
  readDemoText: (relPath) => ipcRenderer.invoke('demo:readText', relPath),
  readDemoBinary: (relPath) => ipcRenderer.invoke('demo:readBinary', relPath),
  readScenarioText: (relPath) => ipcRenderer.invoke('scenario:readText', relPath),
  readScenarioBinary: (relPath) => ipcRenderer.invoke('scenario:readBinary', relPath),
};

contextBridge.exposeInMainWorld('rpgPlayerFs', bridge);
