# Architecture Technique

## Choix de Stack (Recommandé)
- **Application Desktop** : **Tauri** (Rust + Webview, léger) ou **Electron** (Node.js, écosystème plus simple si besoin de serveurs locaux embarqués).
- **Frontend / UI** : **React + TypeScript + Tailwind CSS** (interface des onglets, inspecteurs, panneaux).
- **Rendu 2D (Pixel Studio & Moteur)** :
  - **HTML5 Canvas 2D** natif pour le Pixel Studio (manipulation directe de `ImageData` au pixel près).
  - **PixiJS** (WebGL) pour l'éditeur de maps, le runtime RPG et le plateau VTT (performant pour les lumières, shaders et grandes maps).
- **Éditeur Nodal (Twine-like)** : **React Flow** (ou équivalent) sérialisé en JSON.
- **Multijoueur (Mode JDR)** : **WebSockets** via **Colyseus** ou **Socket.io** (serveur Node.js/TypeScript). Possibilité d'héberger le serveur localement (le PC du MJ fait office d'hôte) ou via un serveur dédié.
- **Stockage Projet** : Format local-first (dossier projet contenant un `project.json`, des sous-dossiers `/assets`, `/maps`, `/narratives`, `/database` ou une base **SQLite** embarquée).

## Structure du Monorepo
```text
/packages
├── core-types/        # Interfaces TypeScript partagées (Assets, Maps, Entities, Narrative)
├── pixel-studio/      # Moteur de dessin pixel art + outils + gestion des calques
├── rpg-engine/        # Runtime 2D (PixiJS), système de combat, inventaire, interpréteur nodal
├── narrative-editor/  # Composant graphe nodal (style Twine) + moteur de conditions
├── vtt-network/       # Protocole WebSocket, synchronisation d'état, permissions MJ/Joueurs
└── desktop-app/       # Shell React + Tauri/Electron qui assemble les 3 onglets