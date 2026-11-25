# Modèle de Données Partagé

Tous les modules lisent et écrivent dans ces structures JSON communes. Le **rendu visuel** (calques, empilement d'assets, plans de profondeur et Y-sorting) est strictement dissocié de la **logique de collision** (`collisionLayer` statique + `collider` et `isSolid` par entité/asset).

## 0. Manifeste de projet (`project.json` — `ProjectManifest`)
```json
{
  "schemaVersion": 1,
  "id": "proj_mon_rpg_a1b2c3",
  "name": "Mon Projet RPG",
  "createdAt": "2026-11-21T12:00:00.000Z",
  "updatedAt": "2026-11-21T12:05:00.000Z",
  "defaultTileSize": 32,
  "assets": {},
  "maps": {},
  "narratives": {},
  "databasePath": "database/rpg.db.json"
}
```
> **Migrations & Sauvegarde** :
> - Chaque `project.json` porte un champ `schemaVersion` validé par `migrateAndValidateProjectManifest` (`@rpg-player/core-types`).
> - Lors d'une montée de version automatique, l'ancien fichier est copié dans `project.json.bak-v<n>` avant d'écrire la version migrée.
> - Les sauvegardes automatiques tournent dans `.autosave/` (rotation des 5 dernières copies) pour permettre une récupération après crash.

---

## 1. Asset (`AssetMeta`)
```json
{
  "schemaVersion": 1,
  "id": "asset_hero_01",
  "name": "Chevalier",
  "type": "sprite",
  "gridWidth": 32,
  "gridHeight": 48,
  "frameCount": 6,
  "columns": 6,
  "filePath": "assets/chevalier.png",
  "sourcePath": "assets/chevalier.pxs.json",
  "anchor": { "x": 16, "y": 48 },
  "defaultCollider": {
    "offsetX": -12,
    "offsetY": -16,
    "width": 24,
    "height": 16
  },
  "animations": {
    "idle": { "frames": [0, 1], "fps": 4, "loop": true },
    "walk_down": { "frames": [2, 3, 4, 5], "fps": 8, "loop": true }
  },
  "hitboxes": [
    { "name": "feet", "x": 4, "y": 32, "width": 24, "height": 16 }
  ],
  "tags": ["hero", "humanoid"]
}
```
> **Convention `anchor` & `defaultCollider`** :
> - `anchor` indique le point de pivot aux pieds du sprite (en pixels depuis le coin haut-gauche du frame ; ex. `{ x: 16, y: 48 }` pour un sprite `32x48`). Ce point sert à la fois au positionnement monde et au calcul du **Y-Sorting** (`sortY`).
> - `defaultCollider` définit l'empreinte de collision par défaut relative à `anchor` (ex. une boîte de `24x16px` aux pieds, laissant la tête de `32px` chevaucher visuellement la case du dessus). Un grand décor (ex. arbre `32x64px`) utilise la même convention pour ne bloquer que le tronc.

---

## 2. Map (`TileMapData`)
```json
{
  "schemaVersion": 2,
  "id": "map_foret_village",
  "name": "Orée du Village",
  "width": 24,
  "height": 16,
  "tileSize": 32,
  "layers": [
    {
      "id": "layer_ground_base",
      "name": "Sol",
      "plane": "below",
      "zOrder": 0,
      "visible": true,
      "opacity": 1,
      "cells": {
        "4,5": [
          { "assetId": "tileset_prairie", "tileX": 0, "tileY": 0 }
        ]
      }
    },
    {
      "id": "layer_ground_overlay",
      "name": "Tapis & Ombres",
      "plane": "below",
      "zOrder": 1,
      "visible": true,
      "opacity": 0.9,
      "cells": {
        "4,5": [
          { "assetId": "tileset_decors", "tileX": 2, "tileY": 1 }
        ]
      }
    },
    {
      "id": "layer_ysorted_props",
      "name": "Décors & Meubles (Y-Sorted)",
      "plane": "y_sorted",
      "zOrder": 0,
      "visible": true,
      "opacity": 1,
      "cells": {
        "6,5": [
          { "assetId": "asset_table_bois", "tileX": 0, "tileY": 0, "sortOffsetY": 32 },
          { "assetId": "asset_chope_biere", "tileX": 0, "tileY": 0, "sortOffsetY": 33 }
        ]
      }
    },
    {
      "id": "layer_above_canopy",
      "name": "Cimes & Toits",
      "plane": "above",
      "zOrder": 0,
      "visible": true,
      "opacity": 1,
      "cells": {
        "6,4": [
          { "assetId": "tileset_arbres", "tileX": 0, "tileY": 0 }
        ]
      }
    }
  ],
  "collisionLayer": {
    "visibleInEditor": true,
    "cells": [0, 0, 1, 1]
  },
  "playerSpawn": { "x": 4, "y": 6, "direction": "down" },
  "playerAssetId": "asset_hero_01",
  "entities": [
    "entity_guard_01",
    "entity_chest_01"
  ]
}
```
> **Points clés du schéma `Map`** :
> - **`collisionLayer` indépendant** : grille plate `width * height` (`0` = franchissable, `1` = bloqué) éditable librement case par case, totalement découplée des calques visuels.
> - **Empilement multi-assets** : chaque calque peut être empilé (`zOrder`) **et** chaque case `cells["x,y"]` contient un tableau ordonné d'assets (`TilePlacement[]`), permettant de superposer Sol → Meuble → Objet même sur une case bloquée.
> - **Plans de profondeur (`plane`)** :
>   1. `"below"` : rendu strictement sous les personnages, trié par `zOrder`.
>   2. `"y_sorted"` : fusionné avec les entités/personnages dans un même conteneur trié dynamiquement par `sortY` (`ty * tileSize + sortOffsetY` pour un décor, `entity.y` aux pieds pour un personnage).
>   3. `"above"` : rendu strictement au-dessus des personnages (cimes, toits, arches).

---

## 3. Entité / Personnage / Token (`EntityData`)
Structure unifiée partagée entre **RPG Engine** (joueur, PNJ, ennemis, coffres, grands décors interactifs) et **Mode JDR / VTT** (tokens multijoueurs).

```json
{
  "schemaVersion": 1,
  "id": "entity_guard_01",
  "name": "Garde du Village",
  "kind": "npc",
  "assetId": "asset_guard_32x48",
  "transform": {
    "x": 208,
    "y": 192,
    "direction": "down",
    "plane": "y_sorted",
    "sortOffsetY": 0
  },
  "collision": {
    "isSolid": true,
    "collider": {
      "offsetX": -14,
      "offsetY": -16,
      "width": 28,
      "height": 16
    }
  },
  "interaction": {
    "trigger": "interact",
    "narrativeId": "garde_village",
    "battleEnemyId": null
  },
  "vtt": {
    "ownerIds": ["gm_01"],
    "lightRadius": 0,
    "visibleToPlayers": true
  }
}
```
> **Points clés du schéma `Entity`** :
> - **Position aux pieds (`transform.x`, `transform.y`)** : en pixels monde (ou alignée sur le centre-bas de la case), directement utilisée comme clé de tri `Y-Sorting` (`sortY = transform.y + transform.sortOffsetY`).
> - **Collision statique & dynamique (`collision`)** :
>   - `isSolid: true | false` active ou désactive le blocage exercé par l'entité (un PNJ ou un token allié peut bloquer le passage, tandis qu'une zone au sol ou un fantôme a `isSolid: false`).
>   - `collider` définit l'empreinte AABB exacte au sol (relative à `transform.x, transform.y`). Exemple : pour un personnage `32x48px`, `width: 28, height: 16, offsetX: -14, offsetY: -16` ne bloque que ses pieds (`16px` de haut), laissant les `32px` supérieurs (torse/tête) chevaucher librement la case au-dessus !
>   - Si `collider` est omis, le moteur hérite automatiquement du `defaultCollider` défini sur `AssetMeta`.

---

## 4. Animation unifiée (`AnimationClip` — VFX, Combat & Cinématiques)
Partagé par **Animation Studio**, **Pixel Studio**, **RPG Engine** (combats, VFX, cinématiques) et **VTT**. Rétro-compatible avec `AssetMeta.animations`.

```json
{
  "category": "combat",
  "frames": [0, 1, 2, 3, 4, 5],
  "fps": 10,
  "frameDurationsMs": [100, 100, 80, 60, 140, 100],
  "loop": false,
  "markers": [
    { "frameIndex": 3, "event": "hit_frame", "payload": "slash_impact" },
    { "frameIndex": 3, "event": "vfx_spawn", "payload": "vfx_sword_slash" },
    { "frameIndex": 3, "event": "camera_shake", "payload": "light" }
  ]
}
```
> - `category`: `"vfx" | "combat" | "cutscene"`.
> - `frameDurationsMs` (optionnel) : permet d'ajuster le timing frame par frame (ex. anticipation lente, impact vif, récupération) ; si omis, chaque frame dure `1000 / fps` ms.
> - `markers`: événements déclenchés à l'entrée exacte de la frame indiquée (`hit_frame` pour appliquer les dégâts au moment du coup, `vfx_spawn`, `sfx`, `camera_shake`, `custom`).

---

## 5. Nœud Cinématique (`CinematicNode` dans `NarrativeGraph`)
Nouveau type de nœud (`type: "cinematic"`) éditable dans `@rpg-player/narrative-editor` et exécuté par `NarrativeRunner`.

```json
{
  "id": "node_cutscene_boss",
  "type": "cinematic",
  "position": { "x": 420, "y": 140 },
  "title": "Réveil du Golem",
  "cinematic": {
    "assetId": "cutscene_golem_awakening",
    "clipName": "play",
    "displayMode": "fullscreen",
    "waitForCompletion": true,
    "loopInBackground": false,
    "playbackSpeed": 1,
    "caption": "Les runes anciennes s'illuminent dans les ténèbres..."
  },
  "nextNodeId": "node_battle_golem"
}
```
> - `displayMode`: `"fullscreen"` (cinématique plein écran), `"inset"` (encart animé au-dessus de la boîte de dialogue) ou `"background"` (animation jouée en fond derrière la discussion).
> - `waitForCompletion`: si `true`, le dialogue attend la fin du clip (ou un clic Passer) avant d'avancer vers `nextNodeId`. Si `loopInBackground: true`, l'animation reste active en boucle pendant les nœuds suivants jusqu'à la fin du dialogue.

---

## 6. Configuration de Combat & Profils IA (`CombatConfig` & `AIProfile`)
Stockés dans `database/rpg.db.json` (et surchargeables par rencontre) pour piloter les 3 stratégies de combat (`simple`, `turn_based_animated`, `dynamic_ai`).

```json
{
  "combatConfig": {
    "defaultMode": "turn_based_animated",
    "allowModeSwitchInPreview": true,
    "dynamicSettings": {
      "heroAttackRange": 46,
      "heroAttackCooldownMs": 450,
      "defaultProjectileSpeed": 220
    }
  },
  "enemyExample": {
    "id": "gobelin_archer",
    "name": "Gobelin Éclaireur",
    "spriteAssetId": "monstre_gobelin",
    "stats": { "maxHp": 46, "maxMp": 15, "atk": 12, "def": 3 },
    "combatAnimations": {
      "idle": "idle",
      "move": "walk",
      "attack_melee": "attack_melee",
      "attack_ranged": "attack_ranged",
      "cast": "cast",
      "hurt": "hurt",
      "death": "death"
    },
    "aiProfile": {
      "behavior": "ranged",
      "aggroRange": 240,
      "attackRange": 42,
      "preferredRange": 150,
      "retreatRange": 80,
      "moveSpeed": 85,
      "attackCooldownMs": 1400,
      "projectileVfxAssetId": "vfx_arrow",
      "projectileSpeed": 240,
      "attackHitbox": { "width": 32, "height": 24, "reachOffset": 20 }
    }
  }
}
```
> - `behavior: "melee"` : approche le joueur jusqu'à `attackRange` puis déclenche `attack_melee` (dégâts au `hit_frame`).
> - `behavior: "ranged"` : maintient `preferredRange` ; si la distance passe sous `retreatRange`, la créature recule (*kiting*) en respectant `collisionLayer` avant de tirer son projectile/VFX.
> - `behavior: "hybrid"` : attaque à distance si hors de `attackRange`, passe en `attack_melee` si le joueur arrive au contact ou si le sort est en cooldown.