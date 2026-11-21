import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

let mainWindow: BrowserWindow | null = null;
let currentProjectRoot: string | null = null;

function resolveProjectPath(relPath: string): string {
  if (!currentProjectRoot) {
    throw new Error('Aucun dossier projet sélectionné.');
  }
  const normalizedRoot = path.resolve(currentProjectRoot);
  const target = path.resolve(normalizedRoot, relPath);
  const relative = path.relative(normalizedRoot, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Chemin hors du dossier projet refusé : "${relPath}"`);
  }
  return target;
}

function registerProjectIpcHandlers(): void {
  ipcMain.handle('project:pickDirectory', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Sélectionner un dossier de projet RPG Player',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    const selectedPath = result.filePaths[0];
    if (!selectedPath) {
      return null;
    }
    currentProjectRoot = path.resolve(selectedPath);
    return {
      path: currentProjectRoot,
      name: path.basename(currentProjectRoot),
    };
  });

  ipcMain.handle('project:getCurrentPath', () => currentProjectRoot);

  ipcMain.handle('project:ensureDir', async (_event, relPath: string) => {
    const fullPath = resolveProjectPath(relPath);
    await fs.mkdir(fullPath, { recursive: true });
  });

  ipcMain.handle('project:exists', async (_event, relPath: string) => {
    const fullPath = resolveProjectPath(relPath);
    try {
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle('project:readText', async (_event, relPath: string) => {
    const fullPath = resolveProjectPath(relPath);
    return fs.readFile(fullPath, 'utf-8');
  });

  ipcMain.handle('project:writeText', async (_event, relPath: string, content: string) => {
    const fullPath = resolveProjectPath(relPath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, 'utf-8');
  });

  ipcMain.handle('project:readBinary', async (_event, relPath: string) => {
    const fullPath = resolveProjectPath(relPath);
    const buffer = await fs.readFile(fullPath);
    return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  });

  ipcMain.handle('project:writeBinary', async (_event, relPath: string, data: Uint8Array) => {
    const fullPath = resolveProjectPath(relPath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, Buffer.from(data));
  });

  ipcMain.handle('project:listDir', async (_event, relPath: string) => {
    const fullPath = resolveProjectPath(relPath);
    const entries = await fs.readdir(fullPath, { withFileTypes: true });
    return entries.map((entry) => ({
      name: entry.name,
      isDirectory: entry.isDirectory(),
    }));
  });
}

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: '#0b0d12',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const devServerUrl = process.env['VITE_DEV_SERVER_URL'];
  if (devServerUrl) {
    void mainWindow.loadURL(devServerUrl);
  } else {
    void mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  registerProjectIpcHandlers();
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
