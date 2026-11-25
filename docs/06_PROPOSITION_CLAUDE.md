# Propositions d'amélioration et plan Cloudflare

**Date :** 21/11/2026
**Contexte :** les 21 bugs de [05_RAPPORT_BUGS.md](05_RAPPORT_BUGS.md) ont été corrigés. Ce document propose la suite : consolider le projet (partie A), puis permettre à un MJ d'ouvrir un salon VTT accessible par Internet sans configurer sa box (partie B).

## Sommaire

- [Partie A : cinq axes de consolidation](#partie-a--cinq-axes-de-consolidation)
  - [A1. Filet de sécurité](#a1-filet-de-sécurité)
  - [A2. Robustesse des données des utilisateurs](#a2-robustesse-des-données-des-utilisateurs)
  - [A3. Multijoueur (VTT)](#a3-multijoueur-vtt)
  - [A4. Confort et qualité perçue](#a4-confort-et-qualité-perçue)
  - [A5. Maintenance](#a5-maintenance)
- [Partie B : plan d'implémentation Cloudflare Tunnel](#partie-b--plan-dimplémentation-cloudflare-tunnel)
- [Ordre de réalisation conseillé](#ordre-de-réalisation-conseillé)

Taille estimée : **S** = moins d'une demi-journée, **M** = 1 à 2 jours, **L** = plus de 2 jours.

---

## Partie A : cinq axes de consolidation

### A1. Filet de sécurité

**Constat :** il n'y a pas d'intégration continue (pas de dossier `.github/`), pas de linter ni de formateur, et seulement 8 fichiers de tests. `narrative-editor` et `core-types` n'ont aucun test.

| Action | Taille | Détail |
|---|---|---|
| CI GitHub Actions | S | Sur chaque push et PR vers `main` : `npm ci`, `npm run typecheck`, `npm test`, sous `windows-latest` (la cible de distribution) et `ubuntu-latest`. Protéger `main` : PR obligatoire et CI verte. |
| Tests de non-régression des 21 bugs | M | Un test par bug du rapport 05, nommé d'après son numéro (`it('bug #3 : equip ne duplique pas les potions')`). En priorité les bugs 1, 3, 4 et 5. |
| Tests du `NarrativeRunner` | M | Chaque type de nœud, plus les enchaînements à risque : dialogue → `start_battle`, cinématique non bloquante, conditions sur variables, nœud de fin. C'est le moteur qui a eu le plus de bugs (6, 7, 16). |
| ESLint + Prettier | S | `typescript-eslint` avec `no-floating-promises`, `no-misused-promises` et `switch-exhaustiveness-check` (cette dernière aurait évité le bug 1). Ajouter Prettier à la CI en mode `--check`. |
| Mesure de couverture | S | `vitest --coverage` avec un seuil minimal sur `rpg-engine`, `narrative-editor` et `vtt-network`, à relever petit à petit. |

### A2. Robustesse des données des utilisateurs

**Constat :** un `project.json` corrompu, modifié à la main ou venant d'une ancienne version est chargé sans vérification. Dès que de vrais utilisateurs auront des projets, chaque changement de format risque de les casser.

| Action | Taille | Détail |
|---|---|---|
| Validation au chargement | M | Des schémas (Zod, ou des gardes écrites à la main dans `core-types`) pour le manifeste, les maps, la narration et les fiches. En cas d'erreur, afficher un message clair (« la map `foret.json` est invalide : champ `width` manquant ») au lieu d'un plantage. |
| Version du format et migrations | M | Un champ `schemaVersion` dans le manifeste, et un tableau `migrations[n] : (v_n) => v_n+1` dans `core-types`. Migrer au chargement, après une sauvegarde automatique de l'original (`project.json.bak-v2`). Tester chaque migration avec un projet figé. |
| Sauvegarde automatique et récupération | M | Une sauvegarde en arrière-plan toutes les N minutes dans `.autosave/`, avec rotation des 5 dernières. Au démarrage après un crash, proposer de restaurer. |
| Validation unique pour le réseau | S | Les messages VTT sont déjà validés côté serveur (`validation.ts`). Il faudrait déplacer ces validateurs dans `core-types` pour que le client valide aussi les messages du serveur avec le même code. |

### A3. Multijoueur (VTT)

**Constat :** les corrections du bug 10 ont ajouté côté serveur le marquage des déconnexions (`markDisconnected`) et le nettoyage des salons inactifs (`pruneIdleRooms`). En revanche, le client ne se reconnecte pas tout seul, et aucun battement de cœur ne détecte les connexions mortes.

| Action | Taille | Détail |
|---|---|---|
| Reconnexion automatique du client | M | Dans `VttClient` : en cas de coupure, réessayer avec un délai croissant (1 s, 2 s, 4 s… jusqu'à 30 s) en renvoyant le `participantId` et un jeton de session. Le joueur retrouve son personnage et son état. L'interface affiche « Reconnexion… ». |
| Battement de cœur | S | Côté serveur, `ws.ping()` toutes les 20 s ; fermer le socket sans `pong` après 2 cycles. Indispensable derrière un tunnel (partie B), où les coupures silencieuses sont courantes. |
| Tests d'intégration réseau | M | Démarrer un vrai `startVttServer(0, '127.0.0.1')`, connecter un MJ et 2 joueurs, puis vérifier : projection d'état, brouillard (aucune fuite de jeton caché), reconnexion, nettoyage des salons. |
| Codes de salon robustes | S | Remplacer `Math.random()` par `crypto.randomInt()` dans `generateRoomCode`, et passer à 8 caractères quand le salon est exposé sur Internet (voir B5). |

### A4. Confort et qualité perçue

| Action | Taille | Détail |
|---|---|---|
| Mode « Jouer » isolé | M | L'aperçu doit travailler sur une **copie profonde** du projet (maps, variables, inventaire), jamais sur l'état de l'éditeur. C'est la cause profonde du bug 2, et cela supprime toute une famille de bugs du même genre. |
| Vérificateur de projet | M | Un panneau « Problèmes » qui liste les incohérences avec un lien vers chacune : téléportation vers une map inexistante, nœud narratif orphelin, objet inconnu dans un coffre, sprite ou animation manquants, `hit_frame` hors limites. La logique va dans un package moteur sans UI, donc elle est testable. |
| Export d'un jeu jouable | L | Produire une version jouable sans l'éditeur (HTML statique ou exécutable Electron minimal), contenant uniquement le runtime `rpg-engine`, `narrative-editor` et les assets du projet. C'est la fonctionnalité la plus attendue d'un « RPG maker ». |

### A5. Maintenance

| Action | Taille | Détail |
|---|---|---|
| Tests de bout en bout | M | Playwright pour Electron sur 4 parcours : créer un projet, peindre une tuile, lancer l'aperçu, sauvegarder, fermer et rouvrir. Les lancer en CI sous Windows. |
| Versions et `CHANGELOG.md` | S | Le projet est en `0.1.0` depuis le début. Adopter des messages de commit conventionnels (déjà en partie utilisés : `feat:`, `fix:`) et versionner à chaque livraison. |
| Documentation à jour | S | Marquer [05_RAPPORT_BUGS.md](05_RAPPORT_BUGS.md) comme résolu (avec le commit `0f0aab9`), documenter le format de fichier du projet dans `03_DATA_SCHEMA.md` avec `schemaVersion`, et ajouter un `CONTRIBUTING.md` (commandes, conventions, comment lancer le serveur VTT). |

---

## Partie B : plan d'implémentation Cloudflare Tunnel

### Objectif

Quand le MJ crée un salon, l'application :
1. démarre elle-même le serveur VTT ;
2. ouvre un **Cloudflare Quick Tunnel** ;
3. affiche un **code d'invitation** à transmettre aux joueurs.

Les joueurs collent ce code et rejoignent la partie, sans compte Cloudflare, sans redirection de port et sans connaître d'adresse IP.

### Situation actuelle

- Le serveur VTT se lance à part, avec `npm run vtt:server` ([cli.ts](../packages/vtt-network/src/cli.ts)). Il écoute sur `0.0.0.0:8765`.
- [server.ts](../packages/vtt-network/src/server.ts) prévoit déjà d'être intégré au processus principal d'Electron, mais [main.ts](../packages/desktop-app/electron/main.ts) ne le fait pas.
- Le lobby utilise `ws://localhost:8765` en dur ([VttLobby.tsx:46](../packages/desktop-app/src/components/vtt/VttLobby.tsx#L46)).
- L'empaquetage exclut `node_modules` (`"!node_modules/**/*"` dans `desktop-app/package.json`). Le processus principal ne pourra donc pas charger `ws` ni `@rpg-player/vtt-network` une fois installé : **ce point est à régler en premier** (étape B1).

### Principe

```
 PC du MJ                                              PC d'un joueur
┌──────────────────────────────────────────┐
│ Electron (processus principal)           │
│  ┌─────────────┐     ┌────────────────┐  │    Internet    ┌─────────────┐
│  │ Serveur VTT │◄────┤  cloudflared   │◄─┼────────────────┤ Application │
│  │ 127.0.0.1:p │     │ (proc. enfant) │  │ wss://xxx.     │ (VttClient) │
│  └──────▲──────┘     └────────────────┘  │ trycloudflare  └─────────────┘
│         │ ws://127.0.0.1:p               │ .com
│  ┌──────┴──────┐                         │
│  │  UI du MJ   │                         │
│  │ (renderer)  │                         │
│  └─────────────┘                         │
└──────────────────────────────────────────┘
```

- Le serveur n'écoute que sur `127.0.0.1` : seul le tunnel le rend accessible de l'extérieur.
- Le MJ se connecte directement en local, sans passer par Cloudflare, pour avoir moins de latence.
- `cloudflared tunnel --url http://127.0.0.1:<port>` ouvre une connexion **sortante** vers Cloudflare et affiche une adresse `https://<mots-aléatoires>.trycloudflare.com`. Les WebSockets passent par ce tunnel : côté joueur, l'adresse devient `wss://<mots-aléatoires>.trycloudflare.com`.

### Décision à prendre : comment fournir `cloudflared`

| Option | Avantages | Inconvénients |
|---|---|---|
| **A. Inclus dans l'installeur (recommandé)** | Fonctionne hors ligne. Aucun téléchargement à l'exécution, donc aucune surface d'attaque supplémentaire. Simple à tester. | L'installeur grossit de plusieurs dizaines de Mo. Il faut mettre à jour la version à la main. |
| B. Téléchargé au premier usage | Installeur léger. | Il faut une connexion, vérifier la somme de contrôle et gérer les erreurs. Les antivirus réagissent parfois aux exécutables téléchargés. |
| C. Installé par l'utilisateur | Rien à empaqueter. | Mauvaise expérience pour un public non technique. |

Recommandation : **option A**, avec une version épinglée et une somme SHA-256 vérifiée au moment du build. `cloudflared` est publié sous licence Apache 2.0 : il faut inclure sa licence dans l'installeur.

### Étapes

#### B1. Rendre le serveur VTT utilisable dans Electron (M)

- Empaqueter le processus principal avec **esbuild** (ou `tsup`) dans un seul fichier `dist-electron/main.js`, en y intégrant `ws` et `@rpg-player/vtt-network` (`electron` reste externe). La règle `!node_modules/**/*` peut alors rester. `ws` n'utilise pas de module natif obligatoire, donc l'intégration ne pose pas de problème.
- Créer `electron/vtt-host.ts` :

```ts
import { startVttServer, type RunningVttServer } from '@rpg-player/vtt-network';

let server: RunningVttServer | null = null;

export async function startHostServer(mode: 'local' | 'lan' | 'tunnel') {
  if (server) return server;
  const host = mode === 'lan' ? '0.0.0.0' : '127.0.0.1';
  server = await startVttServer(0, host); // port 0 = port libre choisi par l'OS
  return server;
}

export async function stopHostServer() {
  await server?.close();
  server = null;
}
```

- Ajouter à `startVttServer` un paramètre d'options (`{ port, host, exposure: 'local' | 'lan' | 'public' }`) qu'utilisera l'étape B5.

#### B2. Gestionnaire du tunnel (M)

Créer `electron/cloudflare-tunnel.ts`. Le chemin du binaire doit pouvoir être injecté, pour les tests.

```ts
import { spawn, type ChildProcess } from 'node:child_process';

export type TunnelStatus =
  | { state: 'idle' }
  | { state: 'starting' }
  | { state: 'ready'; publicUrl: string }   // wss://xxx.trycloudflare.com
  | { state: 'error'; message: string };

const URL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;

export function parseTunnelUrl(line: string): string | null {
  const m = URL_RE.exec(line);
  return m ? m[0].replace(/^https:/, 'wss:') : null;
}

export class CloudflareTunnel {
  private child: ChildProcess | null = null;
  constructor(private binPath: string, private onStatus: (s: TunnelStatus) => void) {}

  start(localPort: number, timeoutMs = 30_000): Promise<string> { /* … */ }
  stop(): void { /* … */ }
}
```

Comportement attendu :
- **Lancement :** `spawn(binPath, ['tunnel', '--no-autoupdate', '--url', \`http://127.0.0.1:${port}\`], { windowsHide: true })`.
- **Lecture de l'adresse :** `cloudflared` écrit ses journaux sur **stderr**. Lire stderr ligne par ligne et résoudre la promesse dès que `parseTunnelUrl` trouve une adresse.
- **Échecs :** au bout de 30 s sans adresse, ou si le processus se termine avant, passer à l'état `error` en gardant les dernières lignes du journal.
- **Arrêt :** `child.kill()` à la fermeture du salon et sur `app.on('before-quit')`. Il ne doit pas rester de processus `cloudflared` orphelin.
- **Coupure inattendue :** si le processus se termine pendant la partie, envoyer `error` à l'interface et proposer « Relancer le tunnel ». La nouvelle adresse sera différente : il faudra renvoyer l'invitation.
- **Emplacement du binaire :** `path.join(process.resourcesPath, 'bin', 'cloudflared.exe')` une fois l'application installée, et `vendor/cloudflared/` en développement.

#### B3. Pont IPC (S)

Dans `main.ts` et `preload.ts`, exposer un nouveau pont `rpgPlayerVttHost`, distinct de `rpgPlayerFs` :

| Canal | Direction | Contenu |
|---|---|---|
| `vtt:host:start` | renderer → main | `{ exposure: 'local' \| 'lan' \| 'public' }` → `{ localUrl, publicUrl?, lanUrls? }` |
| `vtt:host:stop` | renderer → main | arrête le tunnel, puis le serveur |
| `vtt:host:status` | main → renderer (événement) | `TunnelStatus`, plus l'état du serveur |

- En mode `lan`, `lanUrls` liste les adresses `ws://<IP locale>:<port>`, obtenues avec `os.networkInterfaces()`.
- Dans la version web (sans Electron), le pont est absent. Le lobby cache alors l'option « Héberger » et garde la saisie manuelle de l'adresse actuelle.

#### B4. Interface du lobby (M)

Côté **MJ**, dans [VttLobby.tsx](../packages/desktop-app/src/components/vtt/VttLobby.tsx) :
- Un choix « Héberger la partie » avec trois options : **Sur Internet (Cloudflare)**, **Réseau local**, **Ce PC uniquement**.
- Des états visibles : « Démarrage du serveur… », « Ouverture du tunnel… », « Prêt », ou une erreur avec un bouton « Réessayer en réseau local ».
- Une fois le salon créé, un **code d'invitation** avec un bouton Copier, au format `vive-lune-42.trycloudflare.com#ABCD2345` (l'adresse du tunnel sans `wss://`, puis le code du salon).
- Un rappel : « Ce lien change à chaque partie. »

Côté **joueur** :
- Un champ unique « Code d'invitation ». La fonction `parseInvitation(text)`, dans `vtt-network`, accepte l'invitation complète, une adresse `wss://…` ou l'ancien couple adresse + code saisis séparément.
- Pour les adresses `*.trycloudflare.com`, ajouter `wss://` automatiquement.

#### B5. Durcissement en mode public (M)

Une fois exposé sur Internet, le serveur peut recevoir des connexions de n'importe qui. Mesures à prendre :

| Mesure | Détail |
|---|---|
| Un seul salon par serveur | En mode `public`, seul le MJ local (connexion depuis `127.0.0.1` **sans** en-tête `CF-Connecting-IP`) peut envoyer `create_room`. Les connexions venant du tunnel ne peuvent que `join_room`. |
| Code de salon plus long | 8 caractères générés avec `crypto.randomInt()`. |
| Limite des tentatives | Au plus 5 `join_room` échoués par minute et par adresse IP. Derrière le tunnel, toutes les connexions semblent venir de `127.0.0.1` : il faut lire la vraie IP dans l'en-tête `CF-Connecting-IP` de la requête d'upgrade WebSocket. |
| Nombre de participants limité | Une limite configurable, 8 par défaut. Au-delà, l'erreur `ROOM_FULL`. |
| Battement de cœur | Voir A3. Il ferme les sockets morts que le tunnel ne signale pas. |
| Écoute en local uniquement | `127.0.0.1` en mode `public`, jamais `0.0.0.0`. |

La validation des messages et la limite de taille (`maxPayload` à 2 Mio) sont déjà en place.

#### B6. Empaquetage (S)

- Ajouter un script `scripts/fetch-cloudflared.mjs`. Il télécharge une **version épinglée** de `cloudflared-windows-amd64.exe` depuis les versions officielles sur GitHub, vérifie sa SHA-256 inscrite dans le script, puis l'enregistre dans `vendor/cloudflared/cloudflared.exe`. Ajouter `vendor/` au `.gitignore`.
- Lancer ce script avant `dist:win`.
- Dans `desktop-app/package.json`, ajouter à `extraResources` :

```json
{ "from": "../../vendor/cloudflared", "to": "bin" }
```

- Copier `LICENSE` de `cloudflared` dans le même dossier.

#### B7. Tests (M)

| Test | Type |
|---|---|
| `parseTunnelUrl` sur des extraits réels de journaux `cloudflared` (adresse présente, absente, sur plusieurs lignes) | Unitaire |
| `CloudflareTunnel` avec un **faux binaire** (script Node qui affiche une adresse sur stderr, ou qui se termine en erreur, ou qui ne répond jamais) : `ready`, `error`, délai dépassé, `stop` qui termine bien le processus | Unitaire |
| `parseInvitation` sur tous les formats acceptés | Unitaire |
| Serveur en mode `public` : un `create_room` venant de l'extérieur est refusé, la limite de tentatives s'applique, `ROOM_FULL` est renvoyé | Intégration (`vtt-network`) |
| Partie réelle par tunnel : un MJ et un joueur sur deux réseaux différents (par exemple partage de connexion 4G) | Manuel, avant chaque version |

### Critères d'acceptation

- [ ] Le MJ clique sur « Héberger sur Internet » et obtient un code d'invitation en moins de 15 s, sans rien installer de plus.
- [ ] Un joueur sur un autre réseau colle le code et rejoint le salon.
- [ ] Fermer le salon ou l'application ne laisse **aucun** processus `cloudflared` actif (à vérifier dans le Gestionnaire des tâches).
- [ ] Si le tunnel échoue, un message clair s'affiche et le mode réseau local est proposé.
- [ ] Un client externe ne peut pas créer de salon et ne peut pas deviner le code par force brute.
- [ ] La version web (sans Electron) fonctionne comme avant, avec la saisie manuelle de l'adresse.

### Risques et limites

| Risque | Conséquence | Parade |
|---|---|---|
| Les Quick Tunnels sont présentés par Cloudflare comme un outil de **test**, sans garantie de disponibilité | Coupure possible en pleine partie | Reconnexion automatique (A3), bouton « Relancer le tunnel », mode réseau local en repli |
| L'adresse change à chaque lancement | Il faut renvoyer l'invitation à chaque partie | Plus tard : option « tunnel nommé » pour les MJ qui ont un compte Cloudflare et un domaine (adresse fixe) |
| Réseaux d'entreprise ou d'école qui bloquent Cloudflare | Le tunnel ne s'ouvre pas | Message d'erreur explicite, repli en réseau local |
| Antivirus ou pare-feu Windows qui réagissent à un exécutable lancé | Blocage ou alerte au premier lancement | Binaire officiel et non modifié, documenté dans la FAQ. À terme, signer l'application (aujourd'hui `signAndEditExecutable: false`) |
| Latence ajoutée par le passage par Cloudflare | Quelques dizaines de ms en plus | Sans importance pour un VTT au tour par tour. Le MJ reste connecté en local |

---

## Ordre de réalisation conseillé

1. **A1 : CI et tests de non-régression des bugs 1, 3, 4 et 5.** Ça protège tout le reste.
2. **B1 → B4 : Cloudflare utilisable de bout en bout**, en même temps que **A3 : reconnexion et battement de cœur**, nécessaires derrière un tunnel.
3. **B5 → B7 : durcissement, empaquetage et tests du mode public**, avant toute diffusion à des joueurs extérieurs.
4. **A2 : validation et migrations des projets**, avant que les formats de fichiers n'évoluent encore.
5. **A4 et A5**, selon les priorités produit. L'export d'un jeu jouable est la fonctionnalité la plus visible.
