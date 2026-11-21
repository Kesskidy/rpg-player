import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import * as fs from 'node:fs';
import * as path from 'node:path';

const DEMO_PACK_DIR = path.resolve(__dirname, '../../demo-pack');

function serveDemoPackPlugin(): Plugin {
  return {
    name: 'serve-demo-pack',
    configureServer(server) {
      server.middlewares.use('/demo-pack', (req, res, next) => {
        const cleanUrl = (req.url ?? '/').split('?')[0] ?? '/';
        const rel = cleanUrl.replace(/^\/+/, '');
        const fullPath = path.resolve(DEMO_PACK_DIR, rel);
        const relative = path.relative(DEMO_PACK_DIR, fullPath);
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
      const targetDir = path.resolve(__dirname, 'dist', 'demo-pack');
      if (fs.existsSync(DEMO_PACK_DIR)) {
        fs.cpSync(DEMO_PACK_DIR, targetDir, { recursive: true });
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), serveDemoPackPlugin()],
  base: './',
  server: {
    port: 5173,
    strictPort: true,
  },
});
