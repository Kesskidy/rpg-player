import * as esbuild from 'esbuild';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');
const outDir = path.join(appRoot, 'dist-electron');

// Bundle Electron main process into a single CJS file including `ws` and `@rpg-player/vtt-network`
// so `electron-builder` can keep `!node_modules/**/*` while hosting the VTT server natively (B1).
await Promise.all([
  esbuild.build({
    entryPoints: [path.join(__dirname, 'main.ts')],
    outfile: path.join(outDir, 'main.js'),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    sourcemap: false,
    external: ['electron', 'bufferutil', 'utf-8-validate'],
    logLevel: 'info',
  }),
  esbuild.build({
    entryPoints: [path.join(__dirname, 'preload.ts')],
    outfile: path.join(outDir, 'preload.js'),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    sourcemap: false,
    external: ['electron'],
    logLevel: 'info',
  }),
]);
