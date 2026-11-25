# Changelog

Toutes les modifications notables de **RPG Player Studio** sont documentées dans ce fichier.
Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) et le versionnement sémantique.

## [0.2.0] - 2026-11-21

### Ajouté
- **CI GitHub Actions** (`.github/workflows/ci.yml`) sur `windows-latest` et `ubuntu-latest`.
- **Validation & Migrations de schéma** dans `@rpg-player/core-types` (`validateProjectManifest`, `migrateAndValidateProjectManifest`, `validateTileMapPayload`, `validateNarrativeGraphPayload`, `validateRpgDatabasePayload`, validateurs VTT unifiés client/serveur).
- **Autosave & Récupération après crash** (`.autosave/`, rotation des 5 dernières sauvegardes) et sauvegarde `.bak-v<n>` avant migration.
- **VTT — Reconnexion automatique & Heartbeat** (`VttClient` avec backoff exponentiel + `sessionToken`, `ws.ping()` / `pong` toutes les 20 s côté serveur).
- **VTT — Hébergement intégré & Cloudflare Quick Tunnel** :
  - Bundling `esbuild` du processus principal Electron avec `ws` + `@rpg-player/vtt-network`.
  - Modules `electron/vtt-host.ts` et `electron/cloudflare-tunnel.ts` + pont IPC `rpgPlayerVttHost`.
  - UI de création de salon en 1 clic (**Internet / Cloudflare**, **Réseau local LAN**, **Local**) et code d'invitation unifié (`parseInvitation`).
  - Durcissement mode public : codes 8 caractères via CSPRNG, rate-limit par IP (`CF-Connecting-IP`), `create_room` réservé au MJ local, limite de participants (`ROOM_FULL`).
  - Script `scripts/fetch-cloudflared.mjs` (version épinglée + vérification SHA-256).
- **Mode « Jouer » isolé** (copie profonde des maps en Play Preview) et **Vérificateur de projet** (panneau « Problèmes » détectant téléportations cassées, nœuds narratifs orphelins, objets/assets manquants et `hit_frame` hors bornes).

## [0.1.1] - 2026-11-21

### Corrigé
- Résolution des 21 bugs d'audit ([docs/05_RAPPORT_BUGS.md](docs/05_RAPPORT_BUGS.md), commit `0f0aab9`) avec tests de non-régression Vitest.
- Ajout du scénario JDR jouable « La Prime de la Taverne » (`scenarios/quete_taverne/`), des outils de formes (Rectangle / Cercle / Ligne) dans Pixel Studio et du packaging Release Windows (`.exe` portable + installeur NSIS).

## [0.1.0] - 2026-11-20

### Ajouté
- Version initiale : Pixel Studio, Animation Studio (export GIF89a), RPG Engine (Tilemap Y-Sorted, Narration Twine, Combat 3 modes, Fiches & Inventaire) et Table Virtuelle VTT.
