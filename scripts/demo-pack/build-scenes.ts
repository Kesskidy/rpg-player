import {
  MAP_SCHEMA_VERSION,
  NARRATIVE_SCHEMA_VERSION,
  RPG_DATABASE_SCHEMA_VERSION,
  type NarrativeGraph,
  type RpgDatabase,
  type TileCell,
  type TileMapData,
} from '@rpg-player/core-types';

function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

function putCell(
  cells: Record<string, TileCell[]>,
  x: number,
  y: number,
  tile: TileCell,
  stack = false,
): void {
  const k = cellKey(x, y);
  if (stack && cells[k]) {
    cells[k]!.push(tile);
  } else {
    cells[k] = [tile];
  }
}

function setCollision(cols: number[], width: number, x: number, y: number, blocked = true): void {
  cols[y * width + x] = blocked ? 1 : 0;
}

export function buildDemoRpgDatabase(): RpgDatabase {
  return {
    schemaVersion: RPG_DATABASE_SCHEMA_VERSION,
    hero: {
      name: 'Aventurier',
      stats: {
        maxHp: 110,
        maxMp: 35,
        atk: 14,
        def: 6,
      },
      skillIds: ['frappe_lourde', 'boule_feu', 'soin_mineur', 'egide'],
      startingItems: [
        { itemId: 'potion_soin', quantity: 2 },
        { itemId: 'epee_fer', quantity: 1 },
      ],
      maxSlots: 20,
      maxWeight: 50,
    },
    items: {
      potion_soin: {
        id: 'potion_soin',
        name: 'Potion de soin',
        description: 'Restaure 40 PV.',
        category: 'consumable',
        stackable: true,
        weight: 0.5,
        healHp: 40,
      },
      elixir_mana: {
        id: 'elixir_mana',
        name: 'Élixir de mana',
        description: 'Restaure 25 PM.',
        category: 'consumable',
        stackable: true,
        weight: 0.5,
        healMp: 25,
      },
      epee_fer: {
        id: 'epee_fer',
        name: 'Épée en fer',
        description: 'Lame d’aventurier (+6 ATK).',
        category: 'equipment',
        stackable: false,
        weight: 4,
        slot: 'weapon',
        statBonus: { atk: 6 },
      },
      bouclier_chene: {
        id: 'bouclier_chene',
        name: 'Bouclier de la Guilde',
        description: 'Bouclier renforcé (+5 DEF, +15 PV).',
        category: 'equipment',
        stackable: false,
        weight: 5,
        slot: 'armor',
        statBonus: { def: 5, maxHp: 15 },
      },
      coeur_golem: {
        id: 'coeur_golem',
        name: 'Cœur Runique du Golem',
        description: 'Preuve de victoire contre le Boss Golem de Pierre.',
        category: 'quest',
        stackable: false,
        weight: 1.5,
      },
    },
    skills: {
      frappe_lourde: {
        id: 'frappe_lourde',
        name: 'Frappe lourde',
        description: 'Un coup puissant qui brise la garde.',
        mpCost: 6,
        power: 20,
      },
      boule_feu: {
        id: 'boule_feu',
        name: 'Boule de feu',
        description: 'Inflige des dégâts de feu et brûle pendant 2 tours.',
        mpCost: 8,
        power: 16,
        statusEffect: { kind: 'burn', turns: 2, potency: 6 },
      },
      soin_mineur: {
        id: 'soin_mineur',
        name: 'Soin mineur',
        description: 'Restaure 35 PV.',
        mpCost: 7,
        power: 35,
        isHeal: true,
      },
      egide: {
        id: 'egide',
        name: 'Égide',
        description: 'Bouclier protecteur pendant 2 tours.',
        mpCost: 5,
        power: 0,
        statusEffect: { kind: 'shield', turns: 2, potency: 5 },
      },
      jet_acide: {
        id: 'jet_acide',
        name: 'Jet acide',
        description: 'Empoisonne la cible pendant 2 tours.',
        mpCost: 4,
        power: 9,
        statusEffect: { kind: 'poison', turns: 2, potency: 4 },
      },
      seisme_roche: {
        id: 'seisme_roche',
        name: 'Séisme de Pierre',
        description: 'Onde de choc dévastatrice du Golem.',
        mpCost: 8,
        power: 18,
      },
    },
    enemies: {
      monstre_slime: {
        id: 'monstre_slime',
        name: 'Slime Émeraude',
        spriteAssetId: 'monstre_slime',
        stats: { maxHp: 34, maxMp: 12, atk: 8, def: 2 },
        skillIds: ['jet_acide'],
        rewardItemId: 'potion_soin',
        rewardGold: 10,
      },
      monstre_gobelin: {
        id: 'monstre_gobelin',
        name: 'Gobelin Pillard',
        spriteAssetId: 'monstre_gobelin',
        stats: { maxHp: 46, maxMp: 10, atk: 12, def: 3 },
        skillIds: ['frappe_lourde'],
        rewardItemId: 'elixir_mana',
        rewardGold: 18,
      },
      monstre_squelette: {
        id: 'monstre_squelette',
        name: 'Squelette Gardien',
        spriteAssetId: 'monstre_squelette',
        stats: { maxHp: 58, maxMp: 12, atk: 14, def: 5 },
        skillIds: ['frappe_lourde'],
        rewardItemId: 'potion_soin',
        rewardGold: 25,
      },
      boss_golem_pierre: {
        id: 'boss_golem_pierre',
        name: 'Boss Golem de Pierre',
        spriteAssetId: 'boss_golem_pierre',
        stats: { maxHp: 115, maxMp: 24, atk: 18, def: 8 },
        skillIds: ['seisme_roche'],
        rewardItemId: 'coeur_golem',
        rewardGold: 100,
      },
    },
  };
}

export function buildDemoNarratives(): NarrativeGraph[] {
  const queteGuilde: NarrativeGraph = {
    schemaVersion: NARRATIVE_SCHEMA_VERSION,
    id: 'quete_guilde',
    name: 'Quête du Maître de Guilde',
    entryNodeId: 'n_check_done',
    nodes: [
      {
        id: 'n_check_done',
        type: 'condition',
        position: { x: 40, y: 120 },
        title: 'A vaincu le Golem ?',
        condition: 'has_item("coeur_golem")',
        trueNextNodeId: 'n_victory',
        falseNextNodeId: 'n_intro',
      },
      {
        id: 'n_intro',
        type: 'dialogue',
        position: { x: 330, y: 180 },
        title: 'Accueil du Maître',
        speaker: 'Maître de Guilde',
        text: 'Bienvenue à la Guilde, jeune aventurier ! Un Golem de Pierre s’est réveillé dans le donjon derrière la porte nord. Acceptes-tu cette quête ?',
        choices: [
          {
            id: 'ch_accept',
            label: 'J’accepte la quête !',
            condition: '!flag("quete_golem_acceptee")',
            nextNodeId: 'n_give_potion',
          },
          {
            id: 'ch_remind',
            label: 'Où se trouve l’entrée du donjon ?',
            nextNodeId: 'n_hint',
          },
          {
            id: 'ch_bye',
            label: 'Je vais me préparer d’abord.',
            nextNodeId: 'n_end',
          },
        ],
      },
      {
        id: 'n_give_potion',
        type: 'action',
        position: { x: 670, y: 80 },
        title: 'Donner Potion + Activer Quête',
        effects: [
          { type: 'set_var', key: 'quete_golem_acceptee', value: true },
          { type: 'give_item', itemId: 'potion_soin', quantity: 1 },
        ],
        nextNodeId: 'n_accepted_text',
      },
      {
        id: 'n_accepted_text',
        type: 'dialogue',
        position: { x: 960, y: 80 },
        title: 'Quête acceptée',
        speaker: 'Maître de Guilde',
        text: 'Brave décision ! Prends cette Potion de soin (ajoutée à ton inventaire, touche I). Franchis la porte en bois au nord pour descendre dans le donjon.',
        nextNodeId: 'n_end',
      },
      {
        id: 'n_hint',
        type: 'dialogue',
        position: { x: 670, y: 230 },
        title: 'Indication porte',
        speaker: 'Maître de Guilde',
        text: 'La porte du donjon est juste sur le mur nord à droite du comptoir. Pense aussi à équiper ton épée dans l’inventaire (touche I) !',
        nextNodeId: 'n_end',
      },
      {
        id: 'n_victory',
        type: 'dialogue',
        position: { x: 330, y: 10 },
        title: 'Triomphe du Héros',
        speaker: 'Maître de Guilde',
        text: 'Par les anciens ! Tu as rapporté le Cœur Runique du Golem de Pierre ! Toute la guilde célèbre ton exploit !',
        nextNodeId: 'n_end',
      },
      {
        id: 'n_end',
        type: 'end',
        position: { x: 1260, y: 180 },
        title: 'Fin',
      },
    ],
  };

  const marchandGuilde: NarrativeGraph = {
    schemaVersion: NARRATIVE_SCHEMA_VERSION,
    id: 'marchand_guilde',
    name: 'Dialogue du Marchand',
    entryNodeId: 'm_intro',
    nodes: [
      {
        id: 'm_intro',
        type: 'dialogue',
        position: { x: 60, y: 100 },
        title: 'Stand du Marchand',
        speaker: 'Marchand Aubergiste',
        text: 'Besoin de reprendre des forces avant le donjon ? Je peux te soigner ou t’offrir un élixir de mana !',
        choices: [
          { id: 'm_heal', label: 'Me reposer (+100 PV / +35 PM)', nextNodeId: 'm_do_heal' },
          {
            id: 'm_elixir',
            label: 'Prendre un Élixir de mana gratuit',
            condition: '!flag("elixir_recu")',
            nextNodeId: 'm_do_elixir',
          },
          { id: 'm_leave', label: 'Merci, à plus tard.', nextNodeId: 'm_end' },
        ],
      },
      {
        id: 'm_do_heal',
        type: 'action',
        position: { x: 400, y: 40 },
        title: 'Repos complet',
        effects: [{ type: 'heal', hp: 100, mp: 35 }],
        nextNodeId: 'm_done',
      },
      {
        id: 'm_do_elixir',
        type: 'action',
        position: { x: 400, y: 170 },
        title: 'Donner Élixir',
        effects: [
          { type: 'set_var', key: 'elixir_recu', value: true },
          { type: 'give_item', itemId: 'elixir_mana', quantity: 1 },
        ],
        nextNodeId: 'm_done',
      },
      {
        id: 'm_done',
        type: 'dialogue',
        position: { x: 700, y: 100 },
        title: 'Bonne route',
        speaker: 'Marchand Aubergiste',
        text: 'Et voilà ! Bonne chance dans les profondeurs du donjon.',
        nextNodeId: 'm_end',
      },
      {
        id: 'm_end',
        type: 'end',
        position: { x: 980, y: 100 },
        title: 'Fin',
      },
    ],
  };

  const coffreDonjon: NarrativeGraph = {
    schemaVersion: NARRATIVE_SCHEMA_VERSION,
    id: 'coffre_donjon',
    name: 'Coffre du Donjon',
    entryNodeId: 'c_check',
    nodes: [
      {
        id: 'c_check',
        type: 'condition',
        position: { x: 40, y: 100 },
        title: 'Déjà ouvert ?',
        condition: 'flag("coffre_donjon_ouvert")',
        trueNextNodeId: 'c_empty',
        falseNextNodeId: 'c_open',
      },
      {
        id: 'c_open',
        type: 'action',
        position: { x: 340, y: 160 },
        title: 'Butin du coffre',
        effects: [
          { type: 'set_var', key: 'coffre_donjon_ouvert', value: true },
          { type: 'give_item', itemId: 'bouclier_chene', quantity: 1 },
          { type: 'give_item', itemId: 'potion_soin', quantity: 1 },
        ],
        nextNodeId: 'c_found',
      },
      {
        id: 'c_found',
        type: 'dialogue',
        position: { x: 650, y: 160 },
        title: 'Trésor trouvé !',
        speaker: 'Coffre au Trésor',
        text: 'Vous ouvrez le coffre : vous trouvez un Bouclier de la Guilde (+5 DEF, +15 PV) et une Potion de soin ! Équipez-le dans votre inventaire (touche I).',
        nextNodeId: 'c_end',
      },
      {
        id: 'c_empty',
        type: 'dialogue',
        position: { x: 340, y: 20 },
        title: 'Coffre vide',
        speaker: 'Coffre au Trésor',
        text: 'Le coffre est désormais vide.',
        nextNodeId: 'c_end',
      },
      {
        id: 'c_end',
        type: 'end',
        position: { x: 940, y: 100 },
        title: 'Fin',
      },
    ],
  };

  return [queteGuilde, marchandGuilde, coffreDonjon];
}

/**
 * Scene 1: `map_guilde` (16x12) — Complete Guild Hall with Y-Sorted furniture,
 * Guild Master narrative quest, Merchant, Guard, and Door teleporting to `map_donjon`.
 */
export function buildGuildMap(): TileMapData {
  const W = 16;
  const H = 12;
  const ground: Record<string, TileCell[]> = {};
  const carpet: Record<string, TileCell[]> = {};
  const ySorted: Record<string, TileCell[]> = {};
  const above: Record<string, TileCell[]> = {};
  const col = Array<number>(W * H).fill(0);

  const G = 'tileset_guilde';

  // Floor & perimeter walls
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const isTopWall = y === 0 || y === 1;
      const isSideWall = x === 0 || x === W - 1;
      const isBottomWall = y === H - 1;

      if (isTopWall) {
        if (y === 0) {
          putCell(ground, x, y, { assetId: G, tileX: 3, tileY: 1 });
        } else {
          // Windows at x=3, x=11; Door to Dungeon at x=13
          if (x === 3 || x === 11) {
            putCell(ground, x, y, { assetId: G, tileX: 2, tileY: 1 });
          } else if (x === 13) {
            putCell(ground, x, y, { assetId: G, tileX: 1, tileY: 1 });
          } else {
            putCell(ground, x, y, { assetId: G, tileX: 0, tileY: 1 });
          }
        }
        setCollision(col, W, x, y, true);
      } else if (isSideWall || isBottomWall) {
        putCell(ground, x, y, { assetId: G, tileX: 3, tileY: 1 });
        setCollision(col, W, x, y, true);
      } else {
        putCell(ground, x, y, { assetId: G, tileX: 0, tileY: 0 });
      }
    }
  }

  // Entry stone tiles at bottom-center (7..8, 10)
  for (const x of [7, 8]) {
    putCell(ground, x, 10, { assetId: G, tileX: 1, tileY: 0 });
  }

  // Red carpet aisle from entrance up to Guild counter
  for (let y = 4; y <= 9; y += 1) {
    putCell(carpet, 7, y, { assetId: G, tileX: 3, tileY: 0 });
    putCell(carpet, 8, y, { assetId: G, tileX: 3, tileY: 0 });
    putCell(carpet, 6, y, { assetId: G, tileX: 2, tileY: 0 });
    putCell(carpet, 9, y, { assetId: G, tileX: 2, tileY: 0 });
  }

  // Wall torches (above/wall decor)
  putCell(ySorted, 5, 1, { assetId: G, tileX: 2, tileY: 3, sortOffsetY: 32 });
  putCell(ySorted, 9, 1, { assetId: G, tileX: 3, tileY: 3, sortOffsetY: 32 });

  // Reception counter (x=5..9, y=3) — blocked on collisionLayer + stacked decor
  for (let x = 5; x <= 9; x += 1) {
    putCell(ySorted, x, 3, { assetId: G, tileX: 0, tileY: 2, sortOffsetY: 32 });
    setCollision(col, W, x, 3, true);
  }

  // Bookshelves against north wall (x=1..2, y=2)
  for (const x of [1, 2]) {
    putCell(ySorted, x, 2, { assetId: G, tileX: 1, tileY: 3, sortOffsetY: 32 });
    setCollision(col, W, x, 2, true);
  }

  // Quest board at (11, 2)
  putCell(ySorted, 11, 2, { assetId: G, tileX: 3, tileY: 2, sortOffsetY: 32 });
  setCollision(col, W, 11, 2, true);

  // Tavern tables + stools (Y-Sorted! Hero can walk behind and in front!)
  for (const [tx, ty] of [
    [3, 6],
    [12, 6],
    [3, 9],
  ]) {
    putCell(ySorted, tx!, ty!, { assetId: G, tileX: 1, tileY: 2, sortOffsetY: 32 });
    setCollision(col, W, tx!, ty!, true);
    putCell(ySorted, tx! - 1, ty!, { assetId: G, tileX: 2, tileY: 2, sortOffsetY: 32 });
    putCell(ySorted, tx! + 1, ty!, { assetId: G, tileX: 2, tileY: 2, sortOffsetY: 32 });
  }

  // Barrels in bottom-right corner (13..14, 9..10)
  for (const [bx, by] of [
    [13, 9],
    [14, 9],
    [14, 10],
  ]) {
    putCell(ySorted, bx!, by!, { assetId: G, tileX: 0, tileY: 3, sortOffsetY: 32 });
    setCollision(col, W, bx!, by!, true);
  }

  // Door exit tile (13, 2) walkable for teleport trigger
  putCell(ground, 13, 2, { assetId: G, tileX: 1, tileY: 0 });

  return {
    schemaVersion: MAP_SCHEMA_VERSION,
    id: 'map_guilde',
    name: 'Guilde des Aventuriers',
    width: W,
    height: H,
    tileSize: 32,
    layers: [
      { id: 'layer_ground', name: 'Sol', plane: 'below', zOrder: 0, visible: true, opacity: 1, cells: ground },
      { id: 'layer_carpet', name: 'Tapis & Dalles', plane: 'below', zOrder: 1, visible: true, opacity: 1, cells: carpet },
      { id: 'layer_ysorted', name: 'Mobilier & Décors (Y-Sort)', plane: 'y_sorted', zOrder: 0, visible: true, opacity: 1, cells: ySorted },
      { id: 'layer_above', name: 'Premier Plan', plane: 'above', zOrder: 0, visible: true, opacity: 1, cells: above },
    ],
    collisionLayer: {
      visibleInEditor: true,
      cells: col,
    },
    playerSpawn: { x: 7, y: 9, direction: 'up' },
    playerAssetId: 'hero_aventurier',
    playerCollider: { offsetX: -12, offsetY: -16, width: 24, height: 16 },
    events: [
      {
        id: 'ev_maitre_guilde',
        name: 'Maître de Guilde',
        kind: 'npc',
        trigger: 'interact',
        x: 7,
        y: 2,
        spriteAssetId: 'pnj_maitre_guilde',
        narrativeId: 'quete_guilde',
        battleEnemyId: null,
        isSolid: true,
        plane: 'y_sorted',
        collider: { offsetX: -16, offsetY: -16, width: 32, height: 16 },
      },
      {
        id: 'ev_marchand',
        name: 'Marchand Aubergiste',
        kind: 'npc',
        trigger: 'interact',
        x: 11,
        y: 8,
        spriteAssetId: 'pnj_marchand',
        narrativeId: 'marchand_guilde',
        battleEnemyId: null,
        isSolid: true,
        plane: 'y_sorted',
        collider: { offsetX: -16, offsetY: -16, width: 32, height: 16 },
      },
      {
        id: 'ev_garde',
        name: 'Garde de la Guilde',
        kind: 'npc',
        trigger: 'interact',
        x: 12,
        y: 3,
        spriteAssetId: 'pnj_garde',
        narrativeId: 'quete_guilde',
        battleEnemyId: null,
        isSolid: true,
        plane: 'y_sorted',
        collider: { offsetX: -16, offsetY: -16, width: 32, height: 16 },
      },
      {
        id: 'ev_porte_donjon',
        name: 'Porte vers le Donjon',
        kind: 'zone',
        trigger: 'interact',
        x: 13,
        y: 2,
        spriteAssetId: null,
        narrativeId: null,
        battleEnemyId: null,
        teleport: {
          targetMapId: 'map_donjon',
          targetX: 2,
          targetY: 7,
          direction: 'right',
        },
        isSolid: false,
        plane: 'below',
      },
    ],
  };
}

/**
 * Scene 2: `map_donjon` (22x14) — 3 connected rooms with Y-Sorted pillars,
 * manually painted collisions, traps, treasure chest, monsters, and 64x64 Stone Golem Boss.
 */
export function buildDungeonMap(): TileMapData {
  const W = 22;
  const H = 14;
  const ground: Record<string, TileCell[]> = {};
  const details: Record<string, TileCell[]> = {};
  const ySorted: Record<string, TileCell[]> = {};
  const above: Record<string, TileCell[]> = {};
  const col = Array<number>(W * H).fill(0);

  const D = 'tileset_donjon';

  // Fill with dungeon brick walls first, then carve 3 rooms + 2 corridors
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      putCell(ground, x, y, { assetId: D, tileX: 0, tileY: 1 });
      setCollision(col, W, x, y, true);
    }
  }

  const carveRect = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const cracked = (x * 7 + y * 13) % 5 === 0;
        putCell(ground, x, y, { assetId: D, tileX: cracked ? 1 : 0, tileY: 0 });
        setCollision(col, W, x, y, false);
      }
    }
  };

  // Room 1: Entrance hall (1..5, 4..10)
  carveRect(1, 4, 5, 10);
  // Corridor 1->2 (6..7, 6..8)
  carveRect(6, 6, 7, 8);
  // Room 2: Pillared hall (8..13, 2..11)
  carveRect(8, 2, 13, 11);
  // Corridor 2->3 (14..15, 6..8)
  carveRect(14, 6, 15, 8);
  // Room 3: Boss Sanctuary (16..20, 3..10)
  carveRect(16, 3, 20, 10);

  // Return stairs to Guild at (1, 7)
  putCell(ground, 1, 7, { assetId: D, tileX: 3, tileY: 1 });

  // Stone archways in `above` plane over corridors so hero walks UNDER them!
  putCell(above, 6, 6, { assetId: D, tileX: 3, tileY: 3 });
  putCell(above, 14, 6, { assetId: D, tileX: 3, tileY: 3 });

  // Lava pit along bottom of Room 2 (9..12, 11) + manual collision
  for (let x = 9; x <= 12; x += 1) {
    putCell(ground, x, 11, { assetId: D, tileX: x % 2 === 0 ? 2 : 3, tileY: 0 });
    setCollision(col, W, x, 11, true);
  }

  // Iron grate decorative window in Room 1 north wall
  putCell(details, 3, 3, { assetId: D, tileX: 2, tileY: 1 });

  // Y-Sorted Pillars in Room 2 (9,5), (12,5), (9,9), (12,9) with `above` capitals on y-1!
  for (const [px, py] of [
    [9, 5],
    [12, 5],
    [9, 9],
    [12, 9],
  ]) {
    putCell(ySorted, px!, py!, { assetId: D, tileX: 1, tileY: 1, sortOffsetY: 32 });
    putCell(above, px!, py! - 1, { assetId: D, tileX: 2, tileY: 3 });
    setCollision(col, W, px!, py!, true);
  }

  // Lit Braziers in Entrance and Boss Room
  for (const [bx, by, frame] of [
    [2, 5, 0],
    [2, 9, 1],
    [16, 4, 0],
    [16, 9, 1],
  ]) {
    putCell(ySorted, bx!, by!, { assetId: D, tileX: frame!, tileY: 3, sortOffsetY: 32 });
    setCollision(col, W, bx!, by!, true);
  }

  // Spike traps on floor (`below` detail layer)
  putCell(details, 7, 7, { assetId: D, tileX: 2, tileY: 2 });
  putCell(details, 10, 7, { assetId: D, tileX: 3, tileY: 2 });

  // Closed Treasure Chest visual on tile (11, 2)
  putCell(ySorted, 11, 2, { assetId: D, tileX: 0, tileY: 2, sortOffsetY: 32 });

  return {
    schemaVersion: MAP_SCHEMA_VERSION,
    id: 'map_donjon',
    name: 'Donjon du Golem',
    width: W,
    height: H,
    tileSize: 32,
    layers: [
      { id: 'layer_ground', name: 'Dalles & Lave', plane: 'below', zOrder: 0, visible: true, opacity: 1, cells: ground },
      { id: 'layer_details', name: 'Pièges & Grilles', plane: 'below', zOrder: 1, visible: true, opacity: 1, cells: details },
      { id: 'layer_ysorted', name: 'Piliers & Braseros (Y-Sort)', plane: 'y_sorted', zOrder: 0, visible: true, opacity: 1, cells: ySorted },
      { id: 'layer_above', name: 'Chapiteaux & Arches', plane: 'above', zOrder: 0, visible: true, opacity: 1, cells: above },
    ],
    collisionLayer: {
      visibleInEditor: true,
      cells: col,
    },
    playerSpawn: { x: 2, y: 7, direction: 'right' },
    playerAssetId: 'hero_aventurier',
    playerCollider: { offsetX: -12, offsetY: -16, width: 24, height: 16 },
    events: [
      {
        id: 'ev_retour_guilde',
        name: 'Escalier vers la Guilde',
        kind: 'zone',
        trigger: 'interact',
        x: 1,
        y: 7,
        spriteAssetId: null,
        narrativeId: null,
        battleEnemyId: null,
        teleport: {
          targetMapId: 'map_guilde',
          targetX: 13,
          targetY: 3,
          direction: 'down',
        },
        isSolid: false,
        plane: 'below',
      },
      {
        id: 'ev_coffre_donjon',
        name: 'Coffre au Trésor',
        kind: 'chest',
        trigger: 'interact',
        x: 11,
        y: 2,
        spriteAssetId: null,
        narrativeId: 'coffre_donjon',
        battleEnemyId: null,
        isSolid: true,
        plane: 'y_sorted',
        collider: { offsetX: -14, offsetY: -16, width: 28, height: 16 },
      },
      {
        id: 'ev_slime',
        name: 'Slime Émeraude',
        kind: 'npc',
        trigger: 'interact',
        x: 4,
        y: 7,
        spriteAssetId: 'monstre_slime',
        narrativeId: null,
        battleEnemyId: 'monstre_slime',
        isSolid: true,
        plane: 'y_sorted',
        collider: { offsetX: -12, offsetY: -14, width: 24, height: 14 },
      },
      {
        id: 'ev_gobelin',
        name: 'Gobelin Pillard',
        kind: 'npc',
        trigger: 'interact',
        x: 10,
        y: 4,
        spriteAssetId: 'monstre_gobelin',
        narrativeId: null,
        battleEnemyId: 'monstre_gobelin',
        isSolid: true,
        plane: 'y_sorted',
        collider: { offsetX: -12, offsetY: -14, width: 24, height: 14 },
      },
      {
        id: 'ev_squelette',
        name: 'Squelette Gardien',
        kind: 'npc',
        trigger: 'interact',
        x: 11,
        y: 8,
        spriteAssetId: 'monstre_squelette',
        narrativeId: null,
        battleEnemyId: 'monstre_squelette',
        isSolid: true,
        plane: 'y_sorted',
        collider: { offsetX: -16, offsetY: -16, width: 32, height: 16 },
      },
      {
        id: 'ev_boss_golem',
        name: 'Boss Golem de Pierre',
        kind: 'npc',
        trigger: 'interact',
        x: 18,
        y: 7,
        spriteAssetId: 'boss_golem_pierre',
        narrativeId: null,
        battleEnemyId: 'boss_golem_pierre',
        isSolid: true,
        plane: 'y_sorted',
        collider: { offsetX: -24, offsetY: -32, width: 48, height: 32 },
      },
    ],
  };
}
