import {
  MAP_SCHEMA_VERSION,
  NARRATIVE_SCHEMA_VERSION,
  RPG_DATABASE_SCHEMA_VERSION,
  type ColliderBox,
  type NarrativeGraph,
  type RpgDatabase,
  type TileCell,
  type TileMapData,
  type VttCharacterSheet,
  type VttToken,
} from '@rpg-player/core-types';

const CELL = (assetId: string, tileX: number, tileY: number): TileCell => ({
  assetId,
  tileX,
  tileY,
});

function setCell(
  cells: Record<string, TileCell[]>,
  x: number,
  y: number,
  placement: TileCell,
  stack = false,
): void {
  const key = `${x},${y}`;
  if (!stack) {
    cells[key] = [placement];
  } else {
    cells[key] = [...(cells[key] ?? []), placement];
  }
}

function setSolid(collision: number[], width: number, x: number, y: number, val = 1): void {
  collision[y * width + x] = val;
}

const FEET_HUMANOID: ColliderBox = { offsetX: -16, offsetY: -16, width: 32, height: 16 };
const FEET_MINION: ColliderBox = { offsetX: -12, offsetY: -14, width: 24, height: 14 };
const FEET_BOSS: ColliderBox = { offsetX: -24, offsetY: -32, width: 48, height: 32 };

// ============================================================================
// Acte 1 — La Taverne (`map_taverne`, 16x12)
// ============================================================================

export function buildTavernMap(): TileMapData {
  const width = 16;
  const height = 12;
  const tileSize = 32;

  const floorCells: Record<string, TileCell[]> = {};
  const carpetCells: Record<string, TileCell[]> = {};
  const decorCells: Record<string, TileCell[]> = {};
  const aboveCells: Record<string, TileCell[]> = {};
  const collision = new Array<number>(width * height).fill(0);

  // Parquet floor + perimeter walls
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      setCell(floorCells, x, y, CELL('tileset_taverne', 0, 0));
      const isBorder = x === 0 || y === 0 || x === width - 1 || y === height - 1;
      if (isBorder) {
        setCell(floorCells, x, y, CELL('tileset_taverne', 2, 0));
        setSolid(collision, width, x, y, 1);
      }
    }
  }

  // Exit door at bottom center (8, 11) leading to Dungeon
  setCell(floorCells, 8, 11, CELL('tileset_taverne', 3, 0));
  setSolid(collision, width, 8, 11, 0);

  // Red & gold tavern carpet path from entrance to quest counter
  for (let y = 5; y <= 10; y += 1) {
    setCell(carpetCells, 7, y, CELL('tileset_taverne', 1, 0));
    setCell(carpetCells, 8, y, CELL('tileset_taverne', 1, 0));
  }

  // Quest counter (guichet) across x=5..10, y=4
  for (let x = 5; x <= 10; x += 1) {
    setCell(decorCells, x, 4, CELL('tileset_taverne', 0, 1));
    setSolid(collision, width, x, 4, 1);
  }

  // Cozy tavern tables, stools & beer barrels (Y-Sorted)
  const tables: Array<[number, number]> = [
    [2, 5],
    [3, 5],
    [12, 5],
    [13, 5],
    [3, 8],
    [12, 8],
  ];
  for (const [tx, ty] of tables) {
    setCell(decorCells, tx, ty, CELL('tileset_taverne', 1, 1));
    setSolid(collision, width, tx, ty, 1);
  }

  const stools: Array<[number, number]> = [
    [2, 6],
    [3, 6],
    [12, 6],
    [13, 6],
    [4, 8],
    [11, 8],
  ];
  for (const [sx, sy] of stools) {
    setCell(decorCells, sx, sy, CELL('tileset_taverne', 2, 1));
  }

  const barrels: Array<[number, number]> = [
    [1, 1],
    [2, 1],
    [13, 1],
    [14, 1],
    [1, 10],
    [14, 10],
  ];
  for (const [bx, by] of barrels) {
    setCell(decorCells, bx, by, CELL('tileset_taverne', 3, 1));
    setSolid(collision, width, bx, by, 1);
  }

  return {
    schemaVersion: MAP_SCHEMA_VERSION,
    id: 'map_taverne',
    name: 'Acte 1 — La Taverne',
    width,
    height,
    tileSize,
    layers: [
      { id: 'layer_sol', name: 'Parquet & Murs', plane: 'below', zOrder: 0, visible: true, opacity: 1, cells: floorCells },
      { id: 'layer_tapis', name: 'Tapis', plane: 'below', zOrder: 1, visible: true, opacity: 1, cells: carpetCells },
      { id: 'layer_mobilier', name: 'Guichet & Mobilier (Y-Sort)', plane: 'y_sorted', zOrder: 10, visible: true, opacity: 1, cells: decorCells },
      { id: 'layer_above', name: 'Premier Plan', plane: 'above', zOrder: 20, visible: true, opacity: 1, cells: aboveCells },
    ],
    collisionLayer: {
      visibleInEditor: true,
      cells: collision,
    },
    playerSpawn: { x: 8, y: 9, direction: 'up' },
    playerAssetId: 'token_aventurier',
    playerCollider: { offsetX: -12, offsetY: -16, width: 24, height: 16 },
    events: [
      {
        id: 'ev_femme_guichet',
        name: 'Femme au guichet',
        kind: 'npc',
        trigger: 'interact',
        x: 8,
        y: 3,
        spriteAssetId: 'npc_femme_guichet',
        narrativeId: 'quete_femme_guichet',
        battleEnemyId: null,
        isSolid: true,
        plane: 'y_sorted',
        collider: FEET_HUMANOID,
      },
      {
        id: 'ev_sortie_donjon',
        name: 'Sortie → Donjon voisin',
        kind: 'zone',
        trigger: 'touch',
        x: 8,
        y: 11,
        spriteAssetId: null,
        narrativeId: null,
        battleEnemyId: null,
        isSolid: false,
        plane: 'below',
        teleport: {
          targetMapId: 'map_donjon',
          targetX: 2,
          targetY: 7,
          direction: 'right',
        },
      },
    ],
  };
}

// ============================================================================
// Acte 2 — Le Donjon (`map_donjon`, 26x14 — 3 zones linéaires)
// Zone 1 : Entrée (x=1..6)
// Zone 2 : Couloir / Salle intermédiaire (x=7..16) — piliers, coffre potion, 2 sbires
// Zone 3 : Salle du Monstre / Boss (x=18..24) — arène du Boss Ogre Sombre
// ============================================================================

export function buildScenarioDungeonMap(): TileMapData {
  const width = 26;
  const height = 14;
  const tileSize = 32;

  const floorCells: Record<string, TileCell[]> = {};
  const decorCells: Record<string, TileCell[]> = {};
  const aboveCells: Record<string, TileCell[]> = {};
  const collision = new Array<number>(width * height).fill(0);

  // Fill entire map with walls first, then carve 3 rooms + corridors
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      setCell(floorCells, x, y, CELL('tileset_donjon', 2, 0));
      setSolid(collision, width, x, y, 1);
    }
  }

  const carveRect = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const cracked = (x * 7 + y * 13) % 5 === 0;
        setCell(floorCells, x, y, CELL('tileset_donjon', cracked ? 1 : 0, 0));
        setSolid(collision, width, x, y, 0);
      }
    }
  };

  // Zone 1: Entrance hall
  carveRect(1, 4, 6, 10);
  // Passage 1 -> 2
  carveRect(6, 6, 8, 8);
  // Zone 2: Middle corridor / guard hall
  carveRect(8, 2, 16, 11);
  // Passage 2 -> 3
  carveRect(16, 6, 18, 8);
  // Zone 3: Boss arena
  carveRect(18, 2, 24, 11);

  // Y-Sorted Pillars (obstacles with manual collisions)
  const pillars: Array<[number, number]> = [
    [10, 4],
    [14, 4],
    [10, 9],
    [14, 9],
    [19, 3],
    [23, 3],
    [19, 10],
    [23, 10],
  ];
  for (const [px, py] of pillars) {
    setCell(decorCells, px, py, CELL('tileset_donjon', 3, 0));
    setSolid(collision, width, px, py, 1);
  }

  // Wall torches along the dungeon walls
  const torches: Array<[number, number]> = [
    [3, 3],
    [9, 1],
    [15, 1],
    [20, 1],
    [22, 1],
  ];
  for (const [tx, ty] of torches) {
    setCell(decorCells, tx, ty, CELL('tileset_donjon', 0, 1), true);
  }

  // Treasure chest visual in middle hall (12, 3)
  setCell(decorCells, 12, 3, CELL('tileset_donjon', 2, 1));
  setSolid(collision, width, 12, 3, 1);

  return {
    schemaVersion: MAP_SCHEMA_VERSION,
    id: 'map_donjon',
    name: 'Acte 2 — Le Donjon du Monstre',
    width,
    height,
    tileSize,
    layers: [
      { id: 'layer_dalles', name: 'Dalles & Murs', plane: 'below', zOrder: 0, visible: true, opacity: 1, cells: floorCells },
      { id: 'layer_decors', name: 'Piliers, Torches & Coffre (Y-Sort)', plane: 'y_sorted', zOrder: 10, visible: true, opacity: 1, cells: decorCells },
      { id: 'layer_above', name: 'Premier Plan', plane: 'above', zOrder: 20, visible: true, opacity: 1, cells: aboveCells },
    ],
    collisionLayer: {
      visibleInEditor: true,
      cells: collision,
    },
    playerSpawn: { x: 2, y: 7, direction: 'right' },
    playerAssetId: 'token_aventurier',
    playerCollider: { offsetX: -12, offsetY: -16, width: 24, height: 16 },
    events: [
      {
        id: 'ev_retour_taverne',
        name: 'Sortie → Retour Taverne',
        kind: 'zone',
        trigger: 'touch',
        x: 1,
        y: 7,
        spriteAssetId: null,
        narrativeId: null,
        battleEnemyId: null,
        isSolid: false,
        plane: 'below',
        teleport: {
          targetMapId: 'map_taverne',
          targetX: 8,
          targetY: 9,
          direction: 'up',
        },
      },
      {
        id: 'ev_coffre_potion',
        name: 'Coffre du Couloir',
        kind: 'chest',
        trigger: 'interact',
        x: 12,
        y: 3,
        spriteAssetId: null,
        narrativeId: 'coffre_potion',
        battleEnemyId: null,
        isSolid: true,
        plane: 'y_sorted',
      },
      {
        id: 'ev_sbire_1',
        name: 'Sbire de donjon #1',
        kind: 'npc',
        trigger: 'interact',
        x: 10,
        y: 6,
        spriteAssetId: 'monster_sbire',
        narrativeId: null,
        battleEnemyId: 'sbire_donjon',
        isSolid: true,
        plane: 'y_sorted',
        collider: FEET_MINION,
      },
      {
        id: 'ev_sbire_2',
        name: 'Sbire de donjon #2',
        kind: 'npc',
        trigger: 'interact',
        x: 14,
        y: 8,
        spriteAssetId: 'monster_sbire',
        narrativeId: null,
        battleEnemyId: 'sbire_donjon',
        isSolid: true,
        plane: 'y_sorted',
        collider: FEET_MINION,
      },
      {
        id: 'ev_boss_ogre',
        name: 'Ogre Sombre (Boss)',
        kind: 'npc',
        trigger: 'interact',
        x: 21,
        y: 7,
        spriteAssetId: 'boss_monstre_donjon',
        narrativeId: null,
        battleEnemyId: 'boss_ogre_sombre',
        isSolid: true,
        plane: 'y_sorted',
        collider: FEET_BOSS,
      },
    ],
  };
}

// ============================================================================
// Graphes Narratifs Twine (Femme au guichet + Coffre du donjon)
// ============================================================================

export function buildScenarioNarratives(): NarrativeGraph[] {
  const guichet: NarrativeGraph = {
    schemaVersion: NARRATIVE_SCHEMA_VERSION,
    id: 'quete_femme_guichet',
    name: 'Briefing — Femme au guichet',
    entryNodeId: 'n_check_accepted',
    nodes: [
      {
        id: 'n_check_accepted',
        type: 'condition',
        position: { x: 40, y: 140 },
        title: 'Quête déjà acceptée ?',
        condition: 'flag("quete_prime_acceptee")',
        trueNextNodeId: 'n_already_accepted',
        falseNextNodeId: 'n_intro',
      },
      {
        id: 'n_intro',
        type: 'dialogue',
        position: { x: 320, y: 180 },
        title: 'Accueil au guichet',
        speaker: 'Femme au guichet',
        text: 'Bienvenue à la Taverne ! Si vous cherchez du travail, nous avons un contrat urgent : un Ogre Sombre terrorise les routes depuis le donjon voisin. La guilde offre 120 pièces d’or pour sa tête.',
        choices: [
          {
            id: 'c_accept',
            label: 'J’accepte la prime ! Où se trouve le donjon ?',
            nextNodeId: 'n_accept_action',
          },
          {
            id: 'c_info',
            label: 'Que faut-il savoir avant d’y entrer ?',
            nextNodeId: 'n_tips',
          },
          {
            id: 'c_later',
            label: 'Je vais d’abord finir ma chope.',
            nextNodeId: 'n_end',
          },
        ],
      },
      {
        id: 'n_tips',
        type: 'dialogue',
        position: { x: 640, y: 280 },
        title: 'Renseignements',
        speaker: 'Femme au guichet',
        text: 'Le couloir est gardé par deux sbires gobelins, mais un coffre contenant une potion y a été abandonné. Le Boss vous attend tout au fond dans la grande salle.',
        choices: [
          {
            id: 'c_accept_after',
            label: 'Parfait, je prends le contrat !',
            nextNodeId: 'n_accept_action',
          },
        ],
      },
      {
        id: 'n_accept_action',
        type: 'action',
        position: { x: 640, y: 80 },
        title: 'Accepter contrat + Potion',
        effects: [
          { type: 'set_var', key: 'quete_prime_acceptee', value: true },
          { type: 'give_item', itemId: 'potion_soin', quantity: 1 },
        ],
        nextNodeId: 'n_accepted_bye',
      },
      {
        id: 'n_accepted_bye',
        type: 'dialogue',
        position: { x: 960, y: 80 },
        title: 'Bonne chasse',
        speaker: 'Femme au guichet',
        text: 'Contrat signé ! Prenez cette potion de soin offerte par la maison. Sortez par la grande porte au sud de la taverne pour rejoindre le donjon.',
        nextNodeId: 'n_end',
      },
      {
        id: 'n_already_accepted',
        type: 'dialogue',
        position: { x: 320, y: 20 },
        title: 'Rappel de quête',
        speaker: 'Femme au guichet',
        text: 'Le contrat est toujours actif ! Le donjon vous attend derrière la porte de sortie au sud. Revenez avec la preuve de la défaite de l’Ogre Sombre pour vos 120 pièces d’or.',
        nextNodeId: 'n_end',
      },
      {
        id: 'n_end',
        type: 'end',
        position: { x: 1240, y: 140 },
        title: 'Fin',
      },
    ],
  };

  const chest: NarrativeGraph = {
    schemaVersion: NARRATIVE_SCHEMA_VERSION,
    id: 'coffre_potion',
    name: 'Coffre du Couloir',
    entryNodeId: 'c_check',
    nodes: [
      {
        id: 'c_check',
        type: 'condition',
        position: { x: 40, y: 120 },
        title: 'Coffre déjà ouvert ?',
        condition: 'flag("coffre_donjon_ouvert")',
        trueNextNodeId: 'c_empty',
        falseNextNodeId: 'c_loot',
      },
      {
        id: 'c_loot',
        type: 'action',
        position: { x: 340, y: 180 },
        title: 'Donner Potion de soin',
        effects: [
          { type: 'set_var', key: 'coffre_donjon_ouvert', value: true },
          { type: 'give_item', itemId: 'potion_soin', quantity: 1 },
        ],
        nextNodeId: 'c_found',
      },
      {
        id: 'c_found',
        type: 'dialogue',
        position: { x: 640, y: 180 },
        title: 'Potion trouvée',
        speaker: 'Coffre du Couloir',
        text: 'Vous ouvrez le vieux coffre et trouvez une Potion de soin (+30 PV) intacte !',
        nextNodeId: 'c_end',
      },
      {
        id: 'c_empty',
        type: 'dialogue',
        position: { x: 340, y: 40 },
        title: 'Coffre vide',
        speaker: 'Coffre du Couloir',
        text: 'Le coffre est déjà vide.',
        nextNodeId: 'c_end',
      },
      {
        id: 'c_end',
        type: 'end',
        position: { x: 920, y: 120 },
        title: 'Fin',
      },
    ],
  };

  return [guichet, chest];
}

// ============================================================================
// Base de données RPG & Fiches Personnages (équilibrée : sbire 2-3t, boss 6-7t)
// ============================================================================

export function buildScenarioDatabase(): RpgDatabase {
  return {
    schemaVersion: RPG_DATABASE_SCHEMA_VERSION,
    combatConfig: {
      defaultMode: 'turn_based_animated',
      allowModeSwitchInPreview: true,
      dynamicSettings: {
        heroAttackRange: 48,
        heroAttackCooldownMs: 420,
        defaultProjectileSpeed: 230,
      },
    },
    hero: {
      name: 'Aventurier',
      stats: { maxHp: 60, maxMp: 20, atk: 12, def: 4 },
      skillIds: ['coup_taille', 'garde_fer', 'etincelle'],
      startingItems: [
        { itemId: 'epee_basique', quantity: 1 },
        { itemId: 'potion_soin', quantity: 1 },
      ],
      maxSlots: 16,
      maxWeight: 40,
    },
    characterSheets: {
      sheet_aventurier: {
        id: 'sheet_aventurier',
        name: 'Aventurier',
        characterClass: 'Mercenaire',
        role: 'player_template',
        level: 2,
        spriteAssetId: 'token_aventurier',
        stats: { maxHp: 60, maxMp: 20, atk: 16, def: 4 },
        attributes: { str: 14, dex: 12, int: 10, cha: 11 },
        skillIds: ['coup_taille', 'garde_fer', 'etincelle'],
        equipment: { weapon: 'epee_basique' },
        inventory: [
          { itemId: 'epee_basique', quantity: 1 },
          { itemId: 'potion_soin', quantity: 1 },
        ],
        gold: 25,
        bio: 'Chasseur de primes fraîchement arrivé à la Taverne pour répondre au contrat de l’Ogre Sombre.',
        notes: 'Épée basique équipée (+4 ATK inclus -> 16 ATK). Garder la potion pour la salle du Boss !',
      },
      sheet_femme_guichet: {
        id: 'sheet_femme_guichet',
        name: 'Femme au guichet',
        characterClass: 'Réceptionniste de Guilde',
        role: 'npc',
        level: 3,
        spriteAssetId: 'npc_femme_guichet',
        stats: { maxHp: 35, maxMp: 10, atk: 6, def: 3 },
        attributes: { str: 8, dex: 11, int: 14, cha: 16 },
        skillIds: [],
        equipment: {},
        inventory: [{ itemId: 'potion_soin', quantity: 3 }],
        gold: 120,
        bio: 'Gère les primes et les contrats d’aventuriers depuis le comptoir de la Taverne.',
        notes: 'Prime promise : 120 Or à la défaite de l’Ogre Sombre.',
      },
    },
    items: {
      epee_basique: {
        id: 'epee_basique',
        name: 'Épée basique',
        description: 'Une lame fiable d’aventurier (+4 ATK).',
        category: 'equipment',
        stackable: false,
        weight: 3,
        slot: 'weapon',
        statBonus: { atk: 4 },
      },
      potion_soin: {
        id: 'potion_soin',
        name: 'Potion de soin',
        description: 'Restaure 30 PV immédiatement.',
        category: 'consumable',
        stackable: true,
        weight: 0.5,
        healHp: 30,
      },
      trophee_ogre: {
        id: 'trophee_ogre',
        name: 'Corne d’Ogre Sombre',
        description: 'Preuve de victoire à rapporter à la Femme au guichet.',
        category: 'quest',
        stackable: false,
        weight: 1.5,
      },
    },
    skills: {
      coup_taille: {
        id: 'coup_taille',
        name: 'Coup de taille',
        description: 'Frappe puissante à l’épée (+8 puissance).',
        mpCost: 5,
        power: 18,
      },
      garde_fer: {
        id: 'garde_fer',
        name: 'Garde de fer',
        description: 'Renforce la défense pendant 2 tours.',
        mpCost: 4,
        power: 0,
        statusEffect: { kind: 'shield', turns: 2, potency: 4 },
      },
      etincelle: {
        id: 'etincelle',
        name: 'Étincelle arcanique',
        description: 'Projectile de feu léger qui brûle 2 tours.',
        mpCost: 6,
        power: 14,
        statusEffect: { kind: 'burn', turns: 2, potency: 4 },
      },
      coup_massue: {
        id: 'coup_massue',
        name: 'Écrasement de massue',
        description: 'Lourde attaque de l’Ogre Sombre.',
        mpCost: 6,
        power: 18,
      },
    },
    enemies: {
      sbire_donjon: {
        id: 'sbire_donjon',
        name: 'Sbire de donjon',
        spriteAssetId: 'monster_sbire',
        stats: { maxHp: 32, maxMp: 8, atk: 9, def: 2 },
        skillIds: [],
        rewardItemId: null,
        rewardGold: 15,
        aiProfile: {
          behavior: 'melee',
          aggroRange: 320,
          attackRange: 38,
          preferredRange: 38,
          retreatRange: 0,
          moveSpeed: 88,
          attackCooldownMs: 1150,
        },
      },
      boss_ogre_sombre: {
        id: 'boss_ogre_sombre',
        name: 'Ogre Sombre (Boss)',
        spriteAssetId: 'boss_monstre_donjon',
        stats: { maxHp: 95, maxMp: 20, atk: 14, def: 4 },
        skillIds: ['coup_massue'],
        rewardItemId: 'trophee_ogre',
        rewardGold: 120,
        aiProfile: {
          behavior: 'hybrid',
          aggroRange: 380,
          attackRange: 52,
          preferredRange: 145,
          retreatRange: 60,
          moveSpeed: 68,
          attackCooldownMs: 1400,
          projectileSpeed: 195,
        },
      },
    },
  };
}

// ============================================================================
// Preset de Session VTT / Mode JDR (`vtt/session.vtt.json`)
// ============================================================================

export interface VttScenarioScenePreset {
  mapId: string;
  label: string;
  fogEnabled: boolean;
  revealSpawnRadius: number;
  gmNotes: string;
  tokens: Array<Omit<VttToken, 'id' | 'ownerIds'> & { ownerRole: 'player' | 'gm' }>;
}

export interface VttScenarioSessionPreset {
  schemaVersion: 1;
  id: string;
  title: string;
  subtitle: string;
  initialSceneId: string;
  introAnnouncement: {
    kind: 'event' | 'music';
    title: string;
    message: string;
  };
  introChatMessages: Array<{
    channel: 'rp' | 'hrp' | 'system';
    senderName: string;
    senderRole: 'gm' | 'system';
    text: string;
  }>;
  playerSheet: Omit<VttCharacterSheet, 'participantId'>;
  scenes: Record<string, VttScenarioScenePreset>;
}

export function buildVttSessionPreset(): VttScenarioSessionPreset {
  return {
    schemaVersion: 1,
    id: 'quete_taverne',
    title: 'La Prime de la Taverne',
    subtitle: 'Acte 1 : La Taverne (briefing) → Acte 2 : Le Donjon (brouillard + Boss)',
    initialSceneId: 'map_taverne',
    introAnnouncement: {
      kind: 'event',
      title: 'Acte 1 — La Prime de la Taverne',
      message:
        'Vous poussez les portes d’une taverne chaleureuse. Derrière le guichet, la réceptionniste vous fait signe : un contrat urgent vient d’être affiché !',
    },
    introChatMessages: [
      {
        channel: 'system',
        senderName: 'Système',
        senderRole: 'system',
        text: 'Scénario chargé : « La Prime de la Taverne » (Acte 1 sans brouillard · Acte 2 Donjon avec brouillard activé).',
      },
      {
        channel: 'rp',
        senderName: 'Femme au guichet',
        senderRole: 'gm',
        text: '« Approchez, aventurier ! Un Ogre Sombre terrorise les environs depuis le donjon voisin. 120 pièces d’or de prime si vous l’éliminez ! »',
      },
    ],
    playerSheet: {
      characterName: 'Aventurier',
      hp: 60,
      maxHp: 60,
      mp: 20,
      maxMp: 20,
      atk: 16,
      def: 4,
      gold: 25,
      inventory: [
        { itemId: 'epee_basique', quantity: 1 },
        { itemId: 'potion_soin', quantity: 1 },
      ],
      notes: 'Épée basique équipée (+4 ATK). Objectif : accepter la prime au guichet et vaincre l’Ogre Sombre.',
    },
    scenes: {
      map_taverne: {
        mapId: 'map_taverne',
        label: 'Acte 1 — La Taverne (Fog OFF)',
        fogEnabled: false,
        revealSpawnRadius: 0,
        gmNotes:
          'Laissez le joueur discuter avec la Femme au guichet (utilisez le bouton Dialogue Guichet ou jouez-la en RP), puis passez à l’Acte 2 quand il franchit la porte sud.',
        tokens: [
          {
            name: 'Aventurier',
            kind: 'player',
            x: 8,
            y: 9,
            color: '#3C78B5',
            spriteAssetId: 'token_aventurier',
            ownerRole: 'player',
            hp: 60,
            maxHp: 60,
            mp: 20,
            maxMp: 20,
            lightRadius: 4,
            visibleToPlayers: true,
            isSolid: true,
            collider: FEET_HUMANOID,
          },
          {
            name: 'Femme au guichet',
            kind: 'npc',
            x: 8,
            y: 3,
            color: '#DFA842',
            spriteAssetId: 'npc_femme_guichet',
            ownerRole: 'gm',
            hp: 35,
            maxHp: 35,
            mp: 10,
            maxMp: 10,
            lightRadius: 0,
            visibleToPlayers: true,
            isSolid: true,
            collider: FEET_HUMANOID,
          },
        ],
      },
      map_donjon: {
        mapId: 'map_donjon',
        label: 'Acte 2 — Le Donjon (Fog ON)',
        fogEnabled: true,
        revealSpawnRadius: 4,
        gmNotes:
          'Brouillard de guerre ACTIF : révélez le couloir (2 Sbires 32 PV + 1 coffre potion en 12,3), puis la Salle du Boss (Ogre Sombre 95 PV en 21,7).',
        tokens: [
          {
            name: 'Aventurier',
            kind: 'player',
            x: 2,
            y: 7,
            color: '#3C78B5',
            spriteAssetId: 'token_aventurier',
            ownerRole: 'player',
            hp: 60,
            maxHp: 60,
            mp: 20,
            maxMp: 20,
            lightRadius: 4,
            visibleToPlayers: true,
            isSolid: true,
            collider: FEET_HUMANOID,
          },
          {
            name: 'Sbire de donjon #1',
            kind: 'monster',
            x: 10,
            y: 6,
            color: '#3D9956',
            spriteAssetId: 'monster_sbire',
            ownerRole: 'gm',
            hp: 32,
            maxHp: 32,
            mp: 8,
            maxMp: 8,
            lightRadius: 0,
            visibleToPlayers: true,
            isSolid: true,
            collider: FEET_MINION,
          },
          {
            name: 'Sbire de donjon #2',
            kind: 'monster',
            x: 14,
            y: 8,
            color: '#3D9956',
            spriteAssetId: 'monster_sbire',
            ownerRole: 'gm',
            hp: 32,
            maxHp: 32,
            mp: 8,
            maxMp: 8,
            lightRadius: 0,
            visibleToPlayers: true,
            isSolid: true,
            collider: FEET_MINION,
          },
          {
            name: 'Ogre Sombre (Boss)',
            kind: 'monster',
            x: 21,
            y: 7,
            color: '#C83232',
            spriteAssetId: 'boss_monstre_donjon',
            ownerRole: 'gm',
            hp: 95,
            maxHp: 95,
            mp: 20,
            maxMp: 20,
            lightRadius: 0,
            visibleToPlayers: true,
            isSolid: true,
            collider: FEET_BOSS,
          },
        ],
      },
    },
  };
}
