# Spécifications Fonctionnelles

Le logiciel fonctionne sur un principe de **projet unifié** : un asset créé dans le Module 1 est immédiatement utilisable comme sprite/tile dans le Module 2 et comme token/map dans le Module 3.

## Module 1 : Pixel Studio (Création d'assets)
- **Grilles & Canvas** :
  - Presets standards : 16x16, 24x24, 32x32, 48x48, 64x64, 128x128.
  - Tailles personnalisables par l'utilisateur (ex: 32x64 pour un personnage détaillé, ou grandes grilles pour des boss/décors).
- **Outils de dessin** : Crayon pixel-perfect, gomme, pot de peinture, pipette, formes géométriques, sélection/déplacement, miroir (X/Y), dithering.
- **Calques & Animation** :
  - Système de calques (opacité, visibilité, ordre).
  - Timeline d'animation frame par frame avec pelure d'oignon (onion skinning) et prévisualisation en boucle.
- **Export / Sauvegarde** : Génération automatique de spritesheets (PNG) + métadonnées JSON (frames, hitboxes, tags).
- **Convertisseur Image vers Pixel Art (`ImageToPixelArt`)** :
  - **Import & Redimensionnement par hauteur cible** : import PNG/JPG/WebP avec hauteur cible en pixels (presets 32px, 48px, 64px ou valeur libre) et conservation automatique du ratio d'origine (avec option de centrage/recadrage sur la grille du canvas actif).
  - **Suppression de couleur de fond (Chroma Key)** : pipette multi-couleurs sur l'image source, curseur de tolérance RGB (nettoyage des artefacts de compression) et option **Contigu uniquement** (flood-fill depuis les bords pour préserver les pixels intérieurs de même couleur).
  - **Pixelisation par couleur dominante** : découpage strict en cellules sur la grille cible sans lissage/moyennage (bilinear/bicubic interdit) ; une cellule dont la proportion de pixels transparents/supprimés dépasse un seuil configurable (ex : 50 %) devient transparente, sinon la couleur dominante parmi les pixels opaques est retenue.
  - **Quantification de palette (optionnelle)** : limitation à N couleurs (ex : 16, 32, 64) via une bibliothèque open source légère (ex : `quantize` / `image-q`) pour un rendu pixel art homogène.
  - **Prévisualisation & Injection** : aperçu temps réel côte à côte (source / résultat) puis injection directe en tant que **nouveau calque** dans le document actif ou **nouvel asset** éditable pixel par pixel.

## Module 2 : RPG Engine (Création de jeux)
- **Éditeur de Maps (Tilemap) — Séparation stricte Rendu Visuel vs Collisions** :
  - **Calque de collisions indépendant et éditable (`collisionLayer`)** :
    - Les blocages (cases infranchissables) sont totalement découplés du rendu visuel et ne dépendent pas uniquement d'un type de tuile.
    - L'utilisateur peut peindre ou effacer librement des zones de blocage case par case, y compris par-dessus des cases contenant déjà du sol ou plusieurs décors.
  - **Superposition d'assets & Ordre de profondeur (Multi-calques + Y-Sorting)** :
    - Possibilité d'empiler plusieurs assets sur une même case, qu'elle soit bloquée ou franchissable (ex : Sol → Meuble/Décor → Objet posé dessus).
    - Pipeline de rendu structuré en 3 plans de profondeur :
      1. **Sous le personnage (`below`)** : sols, routes, tapis, ombres au sol (multi-calques empilables).
      2. **Trié en Y (`y_sorted`)** : décors avec volume (arbres, piliers, meubles, murs bas) + personnages/entités. L'ordre d'affichage est calculé dynamiquement selon la coordonnée `Y` de la base (`sortY`), permettant de passer naturellement *devant* ou *derrière* un décor ou un autre personnage.
      3. **Au-dessus du personnage (`above`)** : cimes d'arbres, toits, arches, ponts supérieurs.
  - **Collisions des personnages et grands assets (Statiques & Dynamiques)** :
    - Chaque entité (joueur, PNJ, ennemi, token VTT) dispose d'un drapeau `isSolid` (`true`/`false`) permettant d'activer ou non le blocage dynamique du passage.
    - Définition d'une **hitbox / empreinte de collision** (`collider`) au niveau des pieds sur les personnages et les grands assets (ex : un sprite de `32x48px` ne bloque qu'une base de `32x16px` aux pieds afin que la tête puisse chevaucher la case du dessus).
  - Support de l'auto-tiling et des lumières/ambiances 2D.
- **Narration Nodale (Style Twine)** :
  - Éditeur de graphe visuel : nœuds de dialogue, choix multiples, conditions (ex: `if has_item("cle_fer")`), actions RPG (variables, objets, soins, combat) et **`CinematicNode`** (déclenchement d'une cinématique ou animation d'asset en plein écran, en encart ou en boucle d'arrière-plan au milieu d'un dialogue, avec option *Attendre la fin avant le dialogue suivant*).
  - Liaison directe entre un nœud narratif et un événement sur la map (PNJ, coffre, zone).
- **Systèmes RPG intégrés** :
  - **Inventaire** : Objets consommables, équipements, objets de quête, gestion du poids ou des slots.
  - **Combat modulaire (3 Modes au choix — Strategy Pattern)** : configurable globalement dans le projet ou par rencontre, via des stats (PV, PM, ATK, DEF, compétences, effets de statut) :
    1. **Mode 1 : Minimaliste (`simple`)** : échange de stats rapide, barres de vie et affichage direct des chiffres de dégâts.
    2. **Mode 2 : Tour par tour animé (`turn_based_animated`)** : combat JRPG tour par tour avec lecture des `AnimationClip` (`attack_melee`, `cast`, VFX de sorts, `hurt`, `death`) ; les dégâts et effets d'impact s'appliquent au moment exact du marqueur `hit_frame`.
    3. **Mode 3 : Combat Dynamique avec IA (`dynamic_ai`)** : combat temps réel / tactique actif sur la map/arène avec hitboxes d'attaque, cooldowns, projectiles VFX, collisions existantes et profils IA configurables (`melee` approche & frappe, `ranged` distance de sécurité + kiting + projectile, `hybrid` alternance portée/cooldowns).
  - **Base de données** : Gestion des personnages, monstres (incluant `aiProfile`), objets, sorts (VFX) et quêtes.
- **Runtime / Preview** : Bouton "Play" pour tester le jeu instantanément dans une fenêtre dédiée, puis export en build jouable.

## Module 1 bis : Animation Studio (`animation-studio`)
Nouvel onglet dédié à la création d'animations pixel art, produisant 3 catégories partageant le contrat unifié **`AnimationClip`** :
- **Assets & VFX animés (`vfx`)** : boucles d'effets (flamme, torche, sort de feu, eau, impact d'épée) plaçables sur la map ou attachables à une compétence/attaque.
- **Animations de combat (`combat`)** : séquences liées à un personnage ou monstre (`idle`, `move`, `attack_melee`, `attack_ranged`, `cast`, `hurt`, `death`).
- **Cinématiques (`cutscene`)** : séquences multi-frames plus larges jouables en plein écran ou en encart dans un `CinematicNode`.
- **Outils dédiés** :
  - **Timeline multi-calques** : ajout/duplication/réorganisation/suppression de frames, durée individuelle par frame (ms) ou FPS global, boucle (`loop: true/false`), et **pelure d'oignon (onion skinning)** configurable (frame précédente teintée rouge / frame suivante teintée bleu).
  - **Marqueurs d'événements (Event Markers)** sur des frames précises (ex. `hit_frame` sur la frame 4 pour synchroniser dégâts + VFX d'impact, `vfx_spawn`, `sfx`, `camera_shake`).
  - **Prévisualisation temps réel** : Play/Pause, scrubbing sur la timeline, vitesse `×0.5` / `×1` / `×2`.
  - **Export unifié** : Spritesheet PNG + métadonnées JSON (`AssetMeta` + `AnimationClip[]`) immédiatement exploitables dans le RPG Engine et le Mode JDR/VTT.

## Module 3 : Mode JDR / VTT (Multijoueur + MJ)
- **Réutilisation du moteur** : Charge les mêmes maps, sprites, fiches d'inventaire et stats que le Module 2.
- **Connexion Multijoueur** :
  - Création de salon (Room) avec code d'invitation / mot de passe.
  - Synchronisation temps réel : positions des tokens, brouillard de guerre, jets de dés, chat RP/HRP, état des PV/inventaires.
- **Rôle Maître du Jeu (MJ / Admin de session)** :
  - Contrôle total de la map active (changement de scène pour tous les joueurs).
  - Gestion du brouillard de guerre (révéler/masquer des zones) et de la lumière dynamique.
  - Spawn/déplacement de PNJ et monstres à la volée, déclenchement manuel d'événements ou de musiques.
  - Modification en direct des stats/inventaires des joueurs et gestion des permissions (qui peut déplacer quel token).
- **Rôle Joueur** :
  - Déplacement de son token selon les règles de collision/vision.
  - Accès à sa fiche personnage, son inventaire, ses compétences et le lanceur de dés.