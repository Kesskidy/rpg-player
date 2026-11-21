import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import * as fs from 'node:fs';
import * as path from 'node:path';

const DEMO_PACK_DIR = path.resolve(__dirname, '../../demo-pack');
const SCENARIOS_DIR = path.resolve(__dirname, '../../scenarios');

function serveStaticBundleDir(
  routePrefix: string,
  sourceDir: string,
  distSubdir: string,
): Plugin {
  return {
    name: `serve-${distSubdir}`,
    configureServer(server) {
      server.middlewares.use(routePrefix, (req, res, next) => {
        const cleanUrl = (req.url ?? '/').split('?')[0] ?? '/';
        const rel = cleanUrl.replace(/^\/+/, '');
        const fullPath = path.resolve(sourceDir, rel);
        const relative = path.relative(sourceDir, fullPath);
        if (relative.startsWith('..') || path.isAbsolute(relative)) {
          res.statusCode = 403;
          res.end('Forbidden');
          return;
        }
        if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
          next();
          return;
        }
        const ext = path.extname(fullPath).toLowerCase();
        const mime =
          ext === '.png'
            ? 'image/png'
            : ext === '.json'
              ? 'application/json; charset=utf-8'
              : 'application/octet-stream';
        res.setHeader('Content-Type', mime);
        fs.createReadStream(fullPath).pipe(res);
      });
    },
    closeBundle() {
      const targetDir = path.resolve(__dirname, 'dist', distSubdir);
      if (fs.existsSync(sourceDir)) {
        fs.cpSync(sourceDir, targetDir, { recursive: true });
      }
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    serveStaticBundleDir('/demo-pack', DEMO_PACK_DIR, 'demo-pack'),
    serveStaticBundleDir('/scenarios', SCENARIOS_DIR, 'scenarios'),
  ],
  base: './',
  server: {
    port: 5173,
    strictPort: true,
  },
});
