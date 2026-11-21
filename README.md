# RPG Player Studio

Suite tout-en-un dédiée à la création de **RPG 2D en pixel art** et aux **sessions JDR multijoueurs (VTT)**, articulée autour de **3 modules interconnectés** qui partagent un format de projet local-first unifié.

> Un asset dessiné dans **Pixel Studio** est immédiatement utilisable comme tuile ou sprite dans **RPG Engine** et comme token ou décor sur le plateau **VTT / Mode JDR**.

---

## Fonctionnalités

### 1. Pixel Studio (Création d'assets)
- **Grilles flexibles** : presets standards (`16×16`, `24×24`, `32×32`, `48×48`, `64×64`, `128×128`) et dimensions personnalisées (`32×48`, `64×64`, etc.).
- **Moteur headless pur TypeScript** : tracé Bresenham pixel-perfect, crayon, gomme, taille de brosse (`1–4px`), opacité pinceau, palette personnalisable, calques (visibilité, opacité, ordre, verrouillage, renommage) et historique **Undo/Redo**.
- **Sauvegarde & Export** : génération simultanée d'une spritesheet **PNG** (encodeur RGBA pur TS), des métadonnées `AssetMeta` (`anchor`, `defaultCollider`, `animations`, `hitboxes`, `tags`) et d'une source éditable `.pxs.json` préservant les calques.
- **Convertisseur Image → Pixel Art** : import PNG/JPG/WebP par hauteur cible (ratio conservé), pipette multi-couleurs avec tolérance RGB & flood-fill contigu depuis les bords, pixelisation stricte par couleur dominante (zéro flou bilinear) et quantification de palette optionnelle (`image-q`).

### 2. RPG Engine (Maps, Narration & Systèmes RPG)
- **Éditeur de Tilemap PixiJS v8 (WebGL)** avec séparation stricte **Rendu Visuel vs Collisions** :
  - **Calque de collisions indépendant** (`collisionLayer`) éditable librement case par case par-dessus n'importe quel décor.
  - **Superposition d'assets** : modes *Remplacer* et *Empiler* sur une même case (même bloquée).
  - **Pipeline 3 plans + Y-Sorting** : `below` (sols, tapis) → `y_sorted` (décors, meubles, PNJ, monstres et héros triés dynamiquement selon `Y` aux pieds) → `above` (cimes, arches, chapiteaux).
  - **Collisions d'entités & empreintes aux pieds** : drapeau `isSolid` et hitbox AABB configurable aux pieds (`32×16` pour un sprite `32×48`, `48×32` pour un boss `64×64`).
- **Narration Nodale (style Twine)** : éditeur de graphe visuel **React Flow** (nœuds *Dialogue*, *Condition*, *Action RPG*, *Fin*) + évaluateur d'expressions sûr sans `eval` (`has_item("cle_fer")`, `flag(...)`, `var(...) >= 10`, `&&`, `||`, `!`).
- **Systèmes RPG intégrés** :
  - **Inventaire** : consommables, équipements (Arme/Armure/Accessoire avec bonus de stats), objets de quête, gestion des slots et du poids.
  - **Combat tour par tour** : PV/PM/ATK/DEF, compétences, effets de statut (`burn`, `poison`, `shield`, `stun`), objets en combat, défense, fuite et butins.
  - **Play Preview instantané** : déplacement fluide ZQSD/WASD/Flèches, animations `idle`/`walk`, dialogues PNJ (`E`), inventaire (`I`) et téléportation entre maps.

### 3. VTT / Mode JDR (Multijoueur temps réel)
- **Salons multijoueurs WebSocket** avec code d'invitation 6 caractères et mot de passe optionnel.
- **Rôle Maître du Jeu (MJ / Admin)** vs **Rôle Joueur** enforced côté serveur :
  - Changement de scène global pour toute la table.
  - **Brouillard de guerre anti-triche** (filtrage serveur des tokens cachés) + lumière dynamique par token.
  - Spawn/retrait de PNJ et monstres à la volée, gestion des permissions de déplacement (`ownerIds`) et de solidité (`isSolid`).
  - Édition en direct des fiches personnages (PV, PM, ATK, DEF, Or, inventaire) et diffusion d'événements/musiques.
- **Chat RP / HRP & Lanceur de dés** (`1d4` à `1d100` + formules personnalisées comme `2d6+3`).
- **Mode Démo Local intégré** : bascule en 1 clic entre la vue **MJ** et la vue **Joueur** sans lancer de serveur externe.

---

## Architecture du Monorepo

Séparation stricte entre les contrats de données, les moteurs métier headless, l'interface éditeur et la couche réseau :

```text
/
├── packages/
│   ├── core-types/          # Interfaces TypeScript partagées (Project, AssetMeta, TileMapData v2, EntityData, NarrativeGraph, RpgDatabase, VTT)
│   ├── pixel-studio/        # Moteur de dessin pixel art headless, calques, Undo/Redo, encodeur PNG pur TS
│   ├── rpg-engine/          # Simulation 2D headless, inventaire, combat tour par tour, interpréteur Twine, renderers PixiJS v8 (Editor + VTT)
│   ├── narrative-editor/    # Éditeur nodal visuel React Flow (style Twine)
│   ├── vtt-network/         # Protocole WebSocket, lanceur de dés, VttRoomManager autoritatif, serveur Node (`ws`) et client navigateur
│   └── desktop-app/         # Shell React + Vite + Tailwind CSS + Electron assemblant les 3 modules
├── scripts/
│   └── demo-pack/           # Script générateur procédural du Starter Pack (PNG pixel-art + métadonnées + maps + quêtes)
└── demo-pack/               # Projet de démo prêt à charger en 1 clic (Guilde & Donjon)
```

---

## Démarrage rapide

### Prérequis
- **Node.js** `>= 20` (testé avec `v22.19`)
- **npm** *(sur Windows PowerShell si l'ExecutionPolicy bloque `npm.ps1`, utiliser `npm.cmd` à la place de `npm`)*

### Installation
```powershell
npm.cmd install
```

### Lancer l'application (Mode Web — Vite)
```powershell
npm.cmd run dev
```
Puis ouvrir **http://localhost:5173/**.

### Lancer le serveur multijoueur VTT (optionnel, pour jouer à plusieurs onglets / LAN)
Dans un second terminal :
```powershell
npm.cmd run vtt:server
```
Le serveur WebSocket écoute par défaut sur `ws://localhost:8765` (configurable via la variable d'environnement `VTT_PORT`).

### Lancer en mode Desktop (Electron)
```powershell
npm.cmd run build
npm.cmd run electron:start -w @rpg-player/desktop-app
```

---

## Starter Pack de Démo (`demo-pack/`)

Le projet inclut un pack complet généré par script (tilesets Guilde & Donjon `32×32`, 4 personnages `32×48` animés, 4 monstres dont un **Boss Golem de Pierre `64×64`**, 2 maps, 3 graphes narratifs et une base RPG).

1. Dans l'application, cliquez sur le bouton vert **« Charger le projet de démo »** en haut à droite.
2. Vous arrivez sur **`map_guilde`** : cliquez sur **▶ Play Preview**, parlez au **Maître de Guilde** (`E`) pour accepter la quête et recevoir une potion (`I`), puis franchissez la porte en bois au nord (`E`) pour entrer dans **`map_donjon`**.
3. Pour régénérer `demo-pack/` après modification du générateur :
   ```powershell
   npm.cmd run demo:generate
   ```

---

## Commandes utiles

| Commande | Action |
| :--- | :--- |
| `npm.cmd run dev` | Compile les packages core et lance le serveur de dev Vite (`localhost:5173`) |
| `npm.cmd run vtt:server` | Lance le serveur WebSocket VTT local (`ws://localhost:8765`) |
| `npm.cmd run demo:generate` | Régénère intégralement le dossier `demo-pack/` (PNG + JSON) |
| `npm.cmd run build` | Compile tous les packages TypeScript, Electron et le bundle Vite |
| `npm.cmd run typecheck` | Vérifie le typage strict TypeScript sur les 6 workspaces |
| `npm.cmd test` | Exécute la suite de tests unitaires Vitest |

---

## Raccourcis clavier

- **Pixel Studio** : `B` Crayon · `E` Gomme · `G` Grille · `Ctrl+Z` / `Ctrl+Y` Annuler/Rétablir · `Espace + Glisser` Déplacer la vue · `Molette` Zoom
- **Éditeur de Maps** : `B` Peindre tuile · `E` Gommer tuile · `C` Mur/Collision · `X` Effacer mur · `N` Placer PNJ/Événement · `S` Spawn · `G` Grille · `Ctrl+Z` / `Ctrl+Y`
- **Play Preview RPG** : `ZQSD` / `WASD` / `Flèches` Se déplacer · `E` / `Entrée` Interagir · `I` Inventaire · `Échap` Quitter

---

## Format d'un dossier projet local-first

```text
mon-projet-rpg/
├── project.json                        # Manifeste (index assets, maps, narratives, databasePath)
├── assets/
│   ├── <id>.png                        # Spritesheet exportée
│   ├── <id>.meta.json                  # Métadonnées AssetMeta (anchor, defaultCollider, animations)
│   └── <id>.pxs.json                   # Source éditable Pixel Studio (calques & frames)
├── maps/
│   └── <id>.map.json                   # TileMapData v2 (calques below/y_sorted/above + collisionLayer + events)
├── narratives/
│   └── <id>.narrative.json             # Graphe nodal Twine sérialisé
└── database/
    └── rpg.db.json                     # Héros, objets, compétences & monstres
```

---

## Crédits

**Made by Gemini Neon**
