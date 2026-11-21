import { app, BrowserWindow, dialog, ipcMain, Menu, protocol } from 'electron';
import * as fsSync from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

// Register a privileged custom scheme so Vite ES modules, PixiJS v8 dynamic chunks,
// and WebGL/ImageBitmap work identically to http://localhost without file:// CORS restrictions.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

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

function getDistRoot(): string {
  return path.join(app.getAppPath(), 'dist');
}

function getDemoPackRoot(): string {
  const candidates = [
    path.join(process.resourcesPath, 'demo-pack'),
    path.join(app.getAppPath(), 'dist', 'demo-pack'),
    path.resolve(__dirname, '..', 'dist', 'demo-pack'),
    path.resolve(__dirname, '..', '..', '..', 'demo-pack'),
  ];
  for (const dir of candidates) {
    if (fsSync.existsSync(path.join(dir, 'project.json'))) {
      return dir;
    }
  }
  throw new Error('Dossier demo-pack introuvable dans le bundle applicatif.');
}

function resolveDemoPath(relPath: string): string {
  const root = path.resolve(getDemoPackRoot());
  const cleanRel = relPath.replace(/^\/+/, '');
  const target = path.resolve(root, cleanRel);
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Chemin demo-pack refusé : "${relPath}"`);
  }
  return target;
}

function getScenariosRoot(): string {
  const candidates = [
    path.join(process.resourcesPath, 'scenarios'),
    path.join(app.getAppPath(), 'dist', 'scenarios'),
    path.resolve(__dirname, '..', 'dist', 'scenarios'),
    path.resolve(__dirname, '..', '..', '..', 'scenarios'),
  ];
  for (const dir of candidates) {
    if (fsSync.existsSync(dir)) {
      return dir;
    }
  }
  throw new Error('Dossier scenarios introuvable dans le bundle applicatif.');
}

function resolveScenarioPath(relPath: string): string {
  const root = path.resolve(getScenariosRoot());
  const cleanRel = relPath.replace(/^\/+/, '');
  const target = path.resolve(root, cleanRel);
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Chemin scenario refusé : "${relPath}"`);
  }
  return target;
}

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.js':
    case '.mjs':
      return 'application/javascript; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.png':
      return 'image/png';
    case '.gif':
      return 'image/gif';
    case '.svg':
      return 'image/svg+xml';
    case '.woff2':
      return 'font/woff2';
    case '.woff':
      return 'font/woff';
    default:
      return 'application/octet-stream';
  }
}

function registerAppProtocol(): void {
  const distRoot = path.resolve(getDistRoot());
  protocol.handle('app', async (request) => {
    try {
      const url = new URL(request.url);
      let reqPath = decodeURIComponent(url.pathname);
      if (!reqPath || reqPath === '/') {
        reqPath = '/index.html';
      }
      const cleanRel = reqPath.replace(/^\/+/, '');

      let fullPath: string;
      if (cleanRel.startsWith('demo-pack/')) {
        fullPath = resolveDemoPath(cleanRel.slice('demo-pack/'.length));
      } else if (cleanRel.startsWith('scenarios/')) {
        fullPath = resolveScenarioPath(cleanRel.slice('scenarios/'.length));
      } else {
        fullPath = path.resolve(distRoot, cleanRel);
        const rel = path.relative(distRoot, fullPath);
        if (rel.startsWith('..') || path.isAbsolute(rel)) {
          return new Response('Forbidden', { status: 403 });
        }
      }

      const data = await fs.readFile(fullPath);
      return new Response(new Uint8Array(data), {
        status: 200,
        headers: { 'Content-Type': getMimeType(fullPath) },
      });
    } catch {
      return new Response('Not Found', { status: 404 });
    }
  });
}

async function writeFileAtomic(
  fullPath: string,
  data: string | Buffer,
  encoding?: BufferEncoding,
): Promise<void> {
  const dir = path.dirname(fullPath);
  await fs.mkdir(dir, { recursive: true });
  const tmpPath = `${fullPath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 7)}.tmp`;
  try {
    if (typeof data === 'string') {
      await fs.writeFile(tmpPath, data, encoding ?? 'utf-8');
    } else {
      await fs.writeFile(tmpPath, data);
    }
    await fs.rename(tmpPath, fullPath);
  } catch (error) {
    await fs.unlink(tmpPath).catch(() => undefined);
    throw error;
  }
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

  ipcMain.handle('project:setCurrentPath', (_event, nextPath: string | null) => {
    currentProjectRoot = nextPath ? path.resolve(nextPath) : null;
  });

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
    await writeFileAtomic(fullPath, content, 'utf-8');
  });

  ipcMain.handle('project:readBinary', async (_event, relPath: string) => {
    const fullPath = resolveProjectPath(relPath);
    const buffer = await fs.readFile(fullPath);
    return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  });

  ipcMain.handle('project:writeBinary', async (_event, relPath: string, data: Uint8Array) => {
    const fullPath = resolveProjectPath(relPath);
    await writeFileAtomic(fullPath, Buffer.from(data));
  });

  ipcMain.handle('project:listDir', async (_event, relPath: string) => {
    const fullPath = resolveProjectPath(relPath);
    const entries = await fs.readdir(fullPath, { withFileTypes: true });
    return entries.map((entry) => ({
      name: entry.name,
      isDirectory: entry.isDirectory(),
    }));
  });

  // Bundled demo-pack reader
  ipcMain.handle('demo:readText', async (_event, relPath: string) => {
    const fullPath = resolveDemoPath(relPath);
    return fs.readFile(fullPath, 'utf-8');
  });

  ipcMain.handle('demo:readBinary', async (_event, relPath: string) => {
    const fullPath = resolveDemoPath(relPath);
    const buffer = await fs.readFile(fullPath);
    return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  });

  ipcMain.handle('scenario:readText', async (_event, relPath: string) => {
    const fullPath = resolveScenarioPath(relPath);
    return fs.readFile(fullPath, 'utf-8');
  });

  ipcMain.handle('scenario:readBinary', async (_event, relPath: string) => {
    const fullPath = resolveScenarioPath(relPath);
    const buffer = await fs.readFile(fullPath);
    return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  });
}

function createMainWindow(): void {
  const devServerUrl = process.env['VITE_DEV_SERVER_URL'];
  const isDev = Boolean(devServerUrl);

  if (!isDev) {
    Menu.setApplicationMenu(null);
  }

  mainWindow = new BrowserWindow({
    title: 'RPG Player Studio',
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: '#141218',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: isDev,
    },
  });

  if (!isDev) {
    mainWindow.removeMenu();
  }

  if (devServerUrl) {
    void mainWindow.loadURL(devServerUrl);
  } else {
    void mainWindow.loadURL('app://rpg-player/index.html');
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  registerAppProtocol();
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
