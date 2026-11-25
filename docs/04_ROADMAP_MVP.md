# Roadmap par Phases (MVP)

Objectif : livrer un socle fonctionnel à chaque phase plutôt que de coder les 3 modules en parallèle.

## Phase 1 : Socle & Pixel Studio (MVP)
- Initialisation du monorepo (`desktop-app`, `core-types`, `pixel-studio`).
- Création/chargement d'un dossier projet local.
- Canvas pixel art fonctionnel : choix de grille (presets + custom), crayon, gomme, palette, calques basiques, export PNG + `AssetMeta`.

## Phase 2 : Éditeur de Maps & Runtime 2D
- Intégration de PixiJS dans `rpg-engine`.
- Import automatique des assets créés en Phase 1.
- Éditeur de tilemap (sol, murs/collisions) + déplacement d'un personnage jouable en mode Preview.

## Phase 3 : Narration Nodale & Systèmes RPG
- Intégration de l'éditeur nodal (`narrative-editor`) inspiré de Twine.
- Interpréteur de dialogues, choix, variables et conditions lié aux PNJ sur la map.
- Système d'inventaire et prototype de combat tour par tour.

## Phase 4 : Mode JDR / VTT Multijoueur
- Création du serveur WebSocket (`vtt-network`) et système de Rooms.
- Distinction des rôles **MJ (Admin)** vs **Joueurs**.
- Synchronisation en temps réel : déplacement des tokens, changement de map par le MJ, brouillard de guerre, chat + lanceur de dés, édition live des fiches/inventaires.

## Phase 5 : Animation Studio, Cinématiques Twine & Combat Modulaire (3 Modes)
Découpage incrémental pour garantir la stabilité sans rien casser :
- **Étape 5.1 — Contrats & Noyau Animation** : extension rétro-compatible de `core-types` (`AnimationClip` avec `category`, `frameDurationsMs`, `markers`, `CinematicNode`, `CombatConfig` & `AIProfile`) + gestion multi-frames, pelure d'oignon et marqueurs dans `@rpg-player/pixel-studio` + tests Vitest.
- **Étape 5.2 — Onglet Animation Studio** : nouveau package/module `animation-studio` (timeline multi-calques, onion skinning précédent/suivant, marqueurs `hit_frame`/`vfx_spawn`, preview Play/Pause `×0.5`/`×1`/`×2`, export unifié PNG + JSON) intégré comme nouvel onglet dans `desktop-app`.
- **Étape 5.3 — `CinematicNode` dans la Narration (Twine)** : nouveau nœud visuel dans `@rpg-player/narrative-editor`, support dans `NarrativeRunner` et lecteur de cinématiques (plein écran / encart / boucle arrière-plan) dans le Preview RPG.
- **Étape 5.4 — Refonte Combat Strategy Pattern (3 Modes)** : découplage en 3 stratégies (`simple`, `turn_based_animated` synchronisé sur `hit_frame` + VFX, `dynamic_ai` temps réel avec profils IA `melee`/`ranged`/`hybrid`, kiting, projectiles et collisions existantes) + éditeur de `CombatConfig`/`AIProfile` dans la Base de Données.