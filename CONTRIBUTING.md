# Contribuer à RPG Player Studio

## Prérequis
- **Node.js 22+** (LTS recommandé)
- **Windows** : utiliser `npm.cmd` dans PowerShell si l'exécution de scripts `.ps1` est restreinte.

## Commandes principales

| Commande | Rôle |
|---|---|
| `npm run dev` | Compile les packages core et lance l'interface Vite (`http://localhost:5173`) |
| `npm run build` | Compile les 6 workspaces + Electron (`dist-electron/`) + bundle Web (`dist/`) |
| `npm run typecheck` | Vérifie les types TypeScript de tous les workspaces (y compris Electron) |
| `npm test` | Exécute toute la suite de tests Vitest |
| `npm run vtt:server` | Lance le serveur WebSocket VTT autonome (`ws://0.0.0.0:8765`) |
| `npm run demo:generate` | Régénère le starter pack `demo-pack/` |
| `npm run scenario:generate` | Régénère le scénario JDR `scenarios/quete_taverne/` |
| `npm run fetch:cloudflared` | Télécharge et vérifie (SHA-256) `cloudflared.exe` dans `vendor/cloudflared/` |
| `npm run dist:win` | Construit les exécutables Windows Release (portable + installeur NSIS) |

## Architecture du monorepo
- `packages/core-types` : schémas JSON, validateurs et migrations partagés.
- `packages/pixel-studio` : moteur de dessin pixel-art headless, formes, calques, PNG & GIF89a.
- `packages/rpg-engine` : éditeur/simulation de maps 2D, inventaire, combat 3 modes, interpréteur narratif et vérificateur de projet.
- `packages/narrative-editor` : éditeur nodal Twine (React Flow).
- `packages/vtt-network` : serveur autoritaire VTT, protocole JSON, dés, invitations et client WebSocket.
- `packages/desktop-app` : application Electron + React 19 + Tailwind CSS + hébergement VTT/Cloudflare intégré.

## Conventions
- Commits conventionnels recommandés : `feat:`, `fix:`, `test:`, `docs:`, `chore:`.
- Tout correctif de bug doit être accompagné d'un test de non-régression Vitest reproduisant le problème.
- Ne jamais commiter de binaires téléchargés dans `vendor/` ni de dossiers `.autosave/`.
