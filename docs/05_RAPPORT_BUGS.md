# Rapport d'évaluation des bugs — ✅ RÉSOLU

**Date :** 21/11/2026
**Statut :** ✅ **Tous les 21 bugs ont été corrigés et vérifiés par tests de non-régression** (commit [`0f0aab9`](https://github.com/Kesskidy/rpg-player/commit/0f0aab9), phases B1 à B5).
**Périmètre :** les 6 packages (`core-types`, `pixel-studio`, `rpg-engine`, `narrative-editor`, `vtt-network`, `desktop-app`).
**Méthode :** relecture du code par rapport aux spécifications `01` à `04`. Les bugs marqués **(confirmé)** ont été reproduits par un script ; les autres viennent de la lecture du code.

## État général

| Vérification | Résultat |
|---|---|
| `npm test` (Vitest) | 31/31 tests passent |
| `npm run typecheck` | Aucune erreur |

Les tests passent, mais aucun ne couvre les chemins décrits ci-dessous. Chaque correction devrait s'accompagner d'un test qui reproduit le bug.

## Synthèse

| # | Gravité | Module | Bug |
|---|---|---|---|
| 1 | 🔴 Élevée | VTT serveur | Un message malformé fait planter le serveur **(confirmé)** |
| 2 | 🔴 Élevée | RPG Engine | La téléportation en Preview remplace la map de l'éditeur |
| 3 | 🔴 Élevée | VTT scénario | L'épée disparaît et les potions se dupliquent **(confirmé)** |
| 4 | 🔴 Élevée | Combat | Changer de mode relance le combat, même après une victoire |
| 5 | 🔴 Élevée | Projet | Un échec d'ouverture peut écraser le `project.json` d'un autre dossier |
| 6 | 🟠 Moyenne | Narration | `start_battle` perdu si un dialogue suit l'action |
| 7 | 🟠 Moyenne | Narration | Une cinématique non bloquante n'est jamais jouée |
| 8 | 🟠 Moyenne | Combat | L'étourdissement (`stun`) n'a aucun effet sur le héros |
| 9 | 🟠 Moyenne | VTT | Fuite d'informations et contournement du brouillard |
| 10 | 🟠 Moyenne | VTT | Sessions fragiles : pas de reconnexion, salons orphelins, participants fantômes |
| 11 | 🟠 Moyenne | Éditeur de map | Peinture ignorée après l'annulation d'« ajouter calque » |
| 12 | 🟠 Moyenne | Éditeur de map | Déplacer un événement peut en écraser un autre |
| 13 | 🟠 Moyenne | Combat animé | Chiffres faux quand soin et dégâts tombent dans le même tour |
| 14 | 🟠 Moyenne | Combat dynamique | Murs invisibles aléatoires dans l'arène |
| 15 à 21 | 🟡 Faible | Divers | Voir la dernière section |

---

## 🔴 Gravité élevée

### 1. Un message malformé fait planter le serveur VTT (confirmé)

**Fichiers :** [room-manager.ts:146-198](../packages/vtt-network/src/room-manager.ts#L146-L198), [server.ts:66-82](../packages/vtt-network/src/server.ts#L66-L82)

**Symptôme :** le serveur lancé par `npm run vtt:server` s'arrête et toute la table est déconnectée.

**Cause :**
- Les messages reçus ne sont pas validés : `JSON.parse` peut renvoyer `null`, et les champs obligatoires peuvent manquer.
- Le `switch` de `handleMessage` n'a pas de cas `default` : un `type` inconnu renvoie `undefined`, puis `outcome.ok` plante.
- L'exception remonte du handler `ws` sans être attrapée et arrête le processus Node.
- Le serveur écoute sur `0.0.0.0` : n'importe quel client du réseau peut provoquer le crash.

**Reproduction :** les 4 messages suivants lèvent tous une exception dans `handleRawMessage` :

| Message envoyé | Erreur |
|---|---|
| `null` | `Cannot read properties of null (reading 'type')` |
| `{"type":"create_room"}` | `Cannot read properties of undefined (reading 'trim')` |
| `{"type":"join_room"}` | `Cannot read properties of undefined (reading 'trim')` |
| `{"type":"foo"}` (après connexion) | `Cannot read properties of undefined (reading 'ok')` |

**Correction proposée :**
- Valider la forme de chaque message avant de le traiter (type, champs obligatoires, types des champs).
- Entourer `handleRawMessage` d'un `try/catch` qui renvoie une erreur au client.
- Ajouter un cas `default` qui renvoie `{ ok: false, errorCode: 'UNKNOWN_MESSAGE' }`.
- Définir `maxPayload` sur le `WebSocketServer`. La valeur par défaut est de 100 Mio, et n'importe qui peut créer un salon avec une map énorme.

### 2. La téléportation en mode Preview remplace la map de l'éditeur

**Fichier :** [MapEditorWorkspace.tsx:272](../packages/desktop-app/src/components/rpg-engine/MapEditorWorkspace.tsx#L272)

**Symptôme :**
1. On modifie la map A sans sauvegarder, puis on passe en Preview.
2. Le joueur marche sur une téléportation vers la map B.
3. De retour en mode éditeur, les modifications de A ont disparu et l'historique d'annulation est vide.
4. L'éditeur affiche maintenant B, avec un spawn déplacé sur la case d'arrivée. « Sauvegarder » écrit ce spawn modifié dans B.

**Cause :** la Preview appelle `editor.loadMap(teleportedMap)`, donc le moteur d'édition lui-même change de map.

**Correction proposée :** en Preview, charger la map de destination seulement dans le viewport et la simulation (`viewportRef.current.syncMap`), sans toucher à `MapEditorEngine`. Au retour en mode éditeur, réafficher `editor.getMap()`.

### 3. VTT scénario : l'épée disparaît et les potions se dupliquent (confirmé)

**Fichiers :** [VttWorkspace.tsx:660-675](../packages/desktop-app/src/components/vtt/VttWorkspace.tsx#L660-L675), [VttWorkspace.tsx:766](../packages/desktop-app/src/components/vtt/VttWorkspace.tsx#L766), [VttWorkspace.tsx:799](../packages/desktop-app/src/components/vtt/VttWorkspace.tsx#L799)

**Causes :**
- **Duplication :** `createInventoryFromPlayerSheet` vide l'inventaire de départ avec une boucle `for…of` sur `inv.getSlots()`. `removeItem` modifie ce même tableau pendant le parcours, donc un élément sur deux est sauté. Les objets restants s'ajoutent ensuite à ceux de la fiche. Cela se produit à chaque dialogue et à chaque combat.
- **Disparition :** avant le combat, `epee_basique` est équipée, ce qui la retire du sac. Après le combat, seul le sac (`getSlots()`) est recopié sur la fiche, sans l'équipement.

**Reproduction :** simulation de la fiche du scénario « La Prime de la Taverne » sur 3 combats :

```text
départ          : [epee_basique ×1, potion_soin ×1]
après combat 1  : [potion_soin ×2]
après combat 2  : [potion_soin ×3]
après combat 3  : [potion_soin ×4]
```

**Correction proposée :**
- Vider l'inventaire en parcourant une copie (`[...inv.getSlots()]`), ou mieux : ajouter une méthode `InventorySystem.reset()` ou `fromSnapshot()`.
- Recopier aussi l'équipement sur la fiche, ce qui demande un champ `equipment` dans `VttCharacterSheet`, ou déséquiper l'épée avant de synchroniser.

### 4. Changer de mode de combat relance le combat, même après une victoire

**Fichier :** [CombatOverlay.tsx:99-111](../packages/desktop-app/src/components/rpg-engine/CombatOverlay.tsx#L99-L111), boutons aux lignes 159-175

**Symptôme :**
- Les boutons « mode » restent actifs pendant et après le combat. Cliquer dessus crée un nouveau combat : ennemi à PV max, héros aux PV d'entrée.
- **Après une victoire :** on peut changer de mode et regagner. L'or et l'objet de récompense sont donnés une deuxième fois (`addGold` / `addItem` sur l'inventaire partagé).
- **En plein combat :** le héros retrouve ses PV d'entrée, mais les potions consommées restent perdues.
- Cliquer sur le mode déjà actif relance aussi le combat.

**Correction proposée :** n'autoriser le changement de mode qu'avant la première action (tour 1, aucune action jouée). Désactiver les boutons si `isFinished` est vrai, et ne rien faire si `nextMode === activeMode`.

### 5. Un échec d'ouverture peut écraser le `project.json` d'un autre dossier

**Fichier :** [App.tsx:34-54](../packages/desktop-app/src/App.tsx#L34-L54)

**Symptôme :**
1. Un projet A est ouvert.
2. On sélectionne un dossier B dont le `project.json` est corrompu ou d'une version non supportée. Une erreur s'affiche.
3. L'application affiche toujours A, mais le stockage (et `currentProjectRoot` côté Electron) pointe déjà sur B.
4. La sauvegarde suivante écrit le manifeste de A dans le dossier B et écrase son `project.json`.

**Cause :** `setStorage(nativeAdapter)` est appelé avant `openProject`, et rien n'est annulé si `openProject` lève une exception.

**Correction proposée :** appeler `setStorage` et `setProjectPath` seulement après la réussite de `openProject` ou `createProject`. En cas d'erreur, garder l'adaptateur précédent. Côté Electron, il faut aussi remettre `currentProjectRoot` sur le dossier précédent.

---

## 🟠 Gravité moyenne

### 6. `start_battle` perdu si un dialogue suit l'action

**Fichiers :** [narrative-interpreter.ts:416-500](../packages/rpg-engine/src/narrative-interpreter.ts#L416-L500), [MapEditorWorkspace.tsx:1004-1024](../packages/desktop-app/src/components/rpg-engine/MapEditorWorkspace.tsx#L1004-L1024)

`triggeredBattleEnemyId` n'est rempli que pour l'étape en cours, et l'interface ne lance le combat que si `status === 'ended'`. Un graphe « Action : combat → Dialogue "En garde !" → Fin » ne lance jamais le combat.

**Correction proposée :** conserver le combat en attente dans `NarrativeRunner` (`pendingBattleEnemyId`) jusqu'à la fin du dialogue, ou lancer le combat dès qu'il est déclenché.

### 7. Une cinématique non bloquante n'est jamais jouée

**Fichier :** [narrative-interpreter.ts:460-481](../packages/rpg-engine/src/narrative-interpreter.ts#L460-L481)

Avec `waitForCompletion: false` et `loopInBackground: false`, le nœud est simplement sauté : aucun état ne transmet la cinématique à l'interface. La spec (`03_DATA_SCHEMA.md` §5) prévoit pourtant un encart ou une lecture en plein écran pendant que le dialogue continue.

**Correction proposée :** ajouter un champ `oneShotCinematic` à `NarrativeStepState`, transmis au nœud de dialogue suivant.

### 8. L'étourdissement (`stun`) n'a aucun effet sur le héros

**Fichier :** [combat.ts:236](../packages/rpg-engine/src/combat.ts#L236)

`tickStatuses(this.hero)` renvoie `{ stunned }`, mais le résultat est ignoré : un ennemi qui étourdit le héros ne lui fait jamais passer son tour.

**Correction proposée :** mémoriser l'étourdissement et faire passer automatiquement le prochain tour du joueur.

### 9. VTT : fuite d'informations et contournement du brouillard

**Fichier :** [room-manager.ts:405-444](../packages/vtt-network/src/room-manager.ts#L405-L444)

- Le message d'erreur `TOKEN_BLOCKED` (« Case occupée par X ») donne le nom et la position de tokens que le joueur ne doit pas voir (`visibleToPlayers: false` ou sous le brouillard).
- Aucune limite de distance sur `move_token` : un joueur peut envoyer son token sur n'importe quelle case et lever le brouillard autour.
- `projectStateFor` envoie aussi `activeMap.events` en entier aux joueurs, y compris les événements cachés.

**Correction proposée :** renvoyer un message générique (« Case bloquée »), limiter le déplacement à N cases par action (ou laisser le MJ choisir), et filtrer les événements envoyés aux joueurs.

### 10. VTT : sessions fragiles

**Fichiers :** [server.ts:92-131](../packages/vtt-network/src/server.ts#L92-L131), [room-manager.ts:200-207](../packages/vtt-network/src/room-manager.ts#L200-L207), [client.ts:32-93](../packages/vtt-network/src/client.ts#L32-L93)

- **Pas de reconnexion :** après une coupure réseau, le joueur revient comme nouveau participant, avec une nouvelle fiche et un deuxième token.
- **Salons jamais supprimés :** fuite de mémoire. Un MJ déconnecté ne peut plus reprendre son rôle, et le salon reste sans MJ.
- **Participant fantôme :** si une même connexion envoie `create_room` ou `join_room` deux fois, l'ancien participant reste affiché comme connecté.
- **Côté client :** `handleCreateRoom` et `handleJoinRoom` ne ferment pas le `VttClient` précédent.

**Correction proposée :** jeton de session renvoyé dans `room_joined` et accepté par `join_room` pour reprendre son rôle, suppression des salons vides après un délai, refus d'un deuxième `create_room`/`join_room` sur une même connexion.

### 11. Peinture ignorée après l'annulation d'« ajouter calque »

**Fichier :** [map-editor-core.ts:629-648](../packages/rpg-engine/src/map-editor-core.ts#L629-L648)

`undo()` et `redo()` remplacent la map sans vérifier `state.activeLayerId`. Après l'annulation d'un ajout de calque (ou le rétablissement d'une suppression), le calque actif n'existe plus et `paint-tile` / `erase-tile` ne font rien, sans aucun message.

**Correction proposée :** après `undo` et `redo`, si le calque actif n'existe plus, sélectionner le premier calque disponible (comme `ensureValidActiveLayer` dans le Pixel Studio).

### 12. Déplacer un événement peut en écraser un autre

**Fichier :** [map-editor-core.ts:437-452](../packages/rpg-engine/src/map-editor-core.ts#L437-L452)

`upsertEvent` cherche l'événement existant par identifiant **ou** par position. Si on déplace un événement sur la case d'un autre, `findIndex` peut tomber sur l'autre : celui-ci est écrasé, et l'événement modifié reste aussi à son ancienne position.

**Correction proposée :** chercher uniquement par `id`, et refuser (ou signaler) un déplacement vers une case occupée.

### 13. Combat animé : chiffres faux quand soin et dégâts tombent dans le même tour

**Fichier :** [combat-strategies.ts:165-219](../packages/rpg-engine/src/combat-strategies.ts#L165-L219)

`heroDelta` est calculé sur le tour complet. Si le héros se soigne de 30 et que l'ennemi riposte pour 10, l'interface affiche « +20 PV » à la frame d'impact et aucun dégât sur la riposte. De plus, le snapshot affiché à la première étape contient déjà le journal de la riposte.

**Correction proposée :** demander au moteur un instantané après l'action du héros et un autre après la riposte, au lieu de déduire les deux à partir du résultat final.

### 14. Combat dynamique : murs invisibles aléatoires dans l'arène

**Fichiers :** [combat-strategies.ts:512-527](../packages/rpg-engine/src/combat-strategies.ts#L512-L527), [DynamicCombatArena.tsx:57-65](../packages/desktop-app/src/components/rpg-engine/DynamicCombatArena.tsx#L57-L65)

L'arène (560×280 px) reçoit la map du monde, et `canMoveTo` teste les collisions de cette map avec les coordonnées de l'arène. Le héros et l'ennemi se heurtent donc à des murs invisibles qui correspondent au coin haut-gauche de la map.

**Correction proposée :** ne pas transmettre la map à l'arène, ou décaler les coordonnées pour centrer l'arène sur la position du joueur dans le monde.

---

## 🟡 Gravité faible ou latente

| # | Fichier | Problème |
|---|---|---|
| 15 | [combat.ts:201-204](../packages/rpg-engine/src/combat.ts#L201-L204) | IA ennemie : si l'ennemi a un nombre pair de compétences, celles d'indice impair ne sont jamais utilisées (`turn % 2 === 0`, puis `turn % length`). **Latent :** les ennemis livrés ont au plus une compétence. |
| 16 | [narrative-interpreter.ts:301-306](../packages/rpg-engine/src/narrative-interpreter.ts#L301-L306) | « Retiré : X » s'affiche même si `removeItem` a échoué. |
| 17 | [inventory.ts](../packages/rpg-engine/src/inventory.ts) | `equipItem` et `unequipSlot` ne vérifient pas le poids maximal. `equipItem` peut dépasser le nombre de cases quand l'équipement est empilable. |
| 18 | [engine.ts:384-400](../packages/pixel-studio/src/engine.ts#L384-L400), [history.ts](../packages/pixel-studio/src/history.ts) | Changer la durée d'une frame ou l'opacité d'un calque ajoute une copie complète du document (avant + après) à l'historique, jusqu'à 100 entrées. La mémoire peut exploser sur une grande animation. |
| 19 | [demo-loader.ts](../packages/desktop-app/src/storage/demo-loader.ts), [scenario-loader.ts](../packages/desktop-app/src/storage/scenario-loader.ts) | Les projets démo et scénario sont stockés en mémoire : « Map sauvegardée » s'affiche, mais tout est perdu à la fermeture, sans avertissement. |
| 20 | [main.ts:197-213](../packages/desktop-app/electron/main.ts#L197-L213) | L'écriture des fichiers n'est pas atomique : un crash pendant l'écriture peut corrompre `project.json`. Écrire dans un fichier temporaire puis le renommer. |
| 21 | [project-service.ts](../packages/desktop-app/src/storage/project-service.ts) | Deux sauvegardes rapprochées (map et asset) partent chacune de l'état du manifeste qu'elles ont reçu : la dernière écrite peut effacer l'entrée ajoutée par l'autre. |

---

## Ordre de correction conseillé

1. **Bugs 1, 2, 3 et 5** : crash du serveur, perte et corruption de données.
2. **Bugs 4 et 6** : exploits de récompense et combats narratifs qui ne se lancent pas.
3. **Bugs 7 à 14** : cohérence du gameplay et du VTT.
4. **Bugs 15 à 21** : robustesse générale.

Pour chaque correction, ajouter un test Vitest qui reproduit d'abord le bug (notamment les messages malformés du VTT, l'aller-retour de l'inventaire scénario et le changement de mode après une victoire).
