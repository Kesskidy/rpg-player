import { startVttServer } from './server.js';

const port = Number(process.env['VTT_PORT'] ?? 8765);

void startVttServer(port).then((server) => {
  console.log(`[RPG Player VTT] Serveur WebSocket actif sur ws://localhost:${server.port}`);
});
