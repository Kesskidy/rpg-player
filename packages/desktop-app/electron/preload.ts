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

export interface ElectronVttHostBridge {
  start: (options: { exposure: 'local' | 'lan' | 'public' }) => Promise<{
    exposure: 'local' | 'lan' | 'public';
    localUrl: string;
    publicUrl?: string;
    lanUrls: string[];
    port: number;
  }>;
  stop: () => Promise<void>;
  getStatus: () => Promise<{
    serverRunning: boolean;
    exposure: 'local' | 'lan' | 'public' | null;
    localUrl: string | null;
    lanUrls: string[];
    tunnel:
      | { state: 'idle' }
      | { state: 'starting' }
      | { state: 'ready'; publicUrl: string }
      | { state: 'error'; message: string };
  }>;
  onStatus: (
    listener: (status: {
      serverRunning: boolean;
      exposure: 'local' | 'lan' | 'public' | null;
      localUrl: string | null;
      lanUrls: string[];
      tunnel:
        | { state: 'idle' }
        | { state: 'starting' }
        | { state: 'ready'; publicUrl: string }
        | { state: 'error'; message: string };
    }) => void,
  ) => () => void;
}

const vttHostBridge: ElectronVttHostBridge = {
  start: (options) => ipcRenderer.invoke('vtt:host:start', options),
  stop: () => ipcRenderer.invoke('vtt:host:stop'),
  getStatus: () => ipcRenderer.invoke('vtt:host:getStatus'),
  onStatus: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, status: Parameters<typeof listener>[0]) => {
      listener(status);
    };
    ipcRenderer.on('vtt:host:status', handler);
    return () => {
      ipcRenderer.removeListener('vtt:host:status', handler);
    };
  },
};

contextBridge.exposeInMainWorld('rpgPlayerVttHost', vttHostBridge);
