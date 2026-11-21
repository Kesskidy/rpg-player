import { describe, expect, it } from 'vitest';
import {
  createDefaultRpgDatabase,
  createEmptyTileMap,
  createSampleNarrativeGraph,
  evaluateCondition,
  InventorySystem,
  NarrativeRunner,
  RpgSimulation,
  TurnBasedCombatEngine,
} from '../index.js';

describe('Phase 3 RPG systems & narrative interpreter', () => {
  it('manages inventory slots, weight limits, equipment stat bonuses, and consumables', () => {
    const db = createDefaultRpgDatabase();
    const inv = new InventorySystem(db);

    expect(inv.hasItem('potion_soin', 2)).toBe(true);
    expect(inv.hasItem('epee_fer', 1)).toBe(true);
    expect(inv.hasItem('cle_fer')).toBe(false);

    // Equip sword -> +6 ATK
    const baseStats = db.hero.stats;
    expect(inv.equipItem('epee_fer').ok).toBe(true);
    expect(inv.computeEffectiveStats(baseStats).atk).toBe(baseStats.atk + 6);
    // Equipped item still counts as owned
    expect(inv.hasItem('epee_fer')).toBe(true);

    // Use consumable potion
    const used = inv.useConsumable('potion_soin');
    expect(used.ok).toBe(true);
    expect(used.healHp).toBe(35);
    expect(inv.getItemCount('potion_soin')).toBe(1);
  });

  it('safely evaluates Twine condition expressions and executes branching narrative graphs', () => {
    const db = createDefaultRpgDatabase();
    const inv = new InventorySystem(db);
    const variables: Record<string, string | number | boolean> = { reputation: 12 };
    const ctx = { variables, inventory: inv };

    expect(evaluateCondition('if has_item("cle_fer")', ctx)).toBe(false);
    expect(evaluateCondition('var("reputation") >= 10 && !flag("porte_ouverte")', ctx)).toBe(true);

    // Run sample graph WITHOUT cle_fer -> branches to node_no_key
    const graph = createSampleNarrativeGraph();
    const runnerWithoutKey = new NarrativeRunner(graph, ctx);
    const intro = runnerWithoutKey.start();
    expect(intro.status).toBe('dialogue');
    expect(intro.choices).toHaveLength(3);

    const noKeyStep = runnerWithoutKey.selectChoice('ch_check_key');
    expect(noKeyStep.node?.id).toBe('node_no_key');

    // Give cle_fer and re-run -> branches to reward action + node_success_text
    inv.addItem('cle_fer', 1);
    const runnerWithKey = new NarrativeRunner(graph, ctx);
    runnerWithKey.start();
    const successStep = runnerWithKey.selectChoice('ch_check_key');
    expect(successStep.node?.id).toBe('node_success_text');
    expect(variables['porte_ouverte']).toBe(true);
    expect(inv.hasItem('bouclier_chene')).toBe(true);
  });

  it('runs turn-based combat with skills, burn status, items, and loot rewards', () => {
    const db = createDefaultRpgDatabase();
    const inv = new InventorySystem(db);
    inv.equipItem('epee_fer');

    const combat = new TurnBasedCombatEngine(db, inv, 'gobelin_eclaireur');
    let snap = combat.playerUseSkill('boule_feu');
    expect(snap.enemy.hp).toBeLessThan(db.enemies['gobelin_eclaireur']!.stats.maxHp);
    expect(snap.hero.mp).toBe(db.hero.stats.maxMp - 8);

    // Keep attacking until goblin falls
    for (let i = 0; i < 10 && snap.phase === 'player_turn'; i += 1) {
      snap = combat.playerAttack();
    }

    expect(snap.phase).toBe('victory');
    expect(inv.hasItem('cle_fer')).toBe(true);
    expect(inv.getGold()).toBe(15);
  });

  it('detects solid NPC map events and nearby interaction triggers', () => {
    const map = createEmptyTileMap({
      id: 'map_npc',
      name: 'Place',
      width: 8,
      height: 8,
      tileSize: 32,
    });
    map.playerSpawn = { x: 3, y: 3, direction: 'right' };
    map.events = [
      {
        id: 'npc_guard',
        name: 'Garde',
        kind: 'npc',
        trigger: 'interact',
        x: 4,
        y: 3,
        spriteAssetId: null,
        narrativeId: 'garde_village',
        isSolid: true,
        plane: 'y_sorted',
      },
    ];

    const sim = new RpgSimulation(map);
    expect(sim.collidesAt((4 + 0.5) * 32, (3 + 0.9) * 32)).toBe(true);
    const found = sim.findInteractableEvent();
    expect(found?.id).toBe('npc_guard');
  });

  it('preserves equipped items and prevents duplication across consecutive VTT inventory roundtrips (Bug #3)', () => {
    const db = createDefaultRpgDatabase();
    let sheetSlots = [
      { itemId: 'epee_fer', quantity: 1 },
      { itemId: 'potion_soin', quantity: 1 },
    ];
    let sheetGold = 10;

    // Simulate 3 consecutive VTT combats where hero equips sword and syncs flat slots back
    for (let round = 0; round < 3; round += 1) {
      const inv = new InventorySystem(db);
      inv.replaceFromSnapshot(sheetSlots, sheetGold);
      expect(inv.getItemCount('epee_fer')).toBe(1);
      expect(inv.getItemCount('potion_soin')).toBe(1);

      expect(inv.equipItem('epee_fer').ok).toBe(true);
      sheetSlots = inv.toFlatSlots();
      sheetGold = inv.getGold();
    }

    expect(sheetSlots.filter((s) => s.itemId === 'epee_fer')).toHaveLength(1);
    expect(sheetSlots.find((s) => s.itemId === 'potion_soin')?.quantity).toBe(1);
  });

  it('tracks equipped weight and enforces maxSlots on equip/unequip (Bug #17)', () => {
    const db = createDefaultRpgDatabase();
    db.hero.maxSlots = 1;
    db.hero.maxWeight = 5;
    db.hero.startingItems = [];
    db.items['dague_stack'] = {
      id: 'dague_stack',
      name: 'Dague empilable',
      description: 'Test',
      category: 'equipment',
      slot: 'weapon',
      stackable: true,
      weight: 2,
      statBonus: { atk: 2 },
    };

    const inv = new InventorySystem(db);
    const swordWeight = db.items['epee_fer']!.weight;
    expect(inv.addItem('epee_fer', 1).ok).toBe(true);
    expect(inv.equipItem('epee_fer').ok).toBe(true);
    // Equipped sword still counts toward carried weight, so another sword cannot be added
    expect(inv.getTotalWeight()).toBe(swordWeight);
    expect(inv.addItem('epee_fer', 1).ok).toBe(false);

    // Add a stack of 2 daggers (weight 2? make maxWeight bigger for slot test)
    const db2 = createDefaultRpgDatabase();
    db2.hero.maxSlots = 1;
    db2.hero.maxWeight = 50;
    db2.hero.startingItems = [];
    db2.items['dague_stack'] = db.items['dague_stack']!;
    const inv2 = new InventorySystem(db2);
    expect(inv2.addItem('epee_fer', 1).ok).toBe(true);
    expect(inv2.equipItem('epee_fer').ok).toBe(true);
    expect(inv2.addItem('dague_stack', 2).ok).toBe(true);
    // Bag is at 1/1 slots (dague_stack x2). Swapping with equipped epee_fer would require 2 slots -> refused!
    expect(inv2.equipItem('dague_stack').ok).toBe(false);
    expect(inv2.getSlots()).toHaveLength(1);
    expect(inv2.getEquipped().weapon).toBe('epee_fer');
  });
});
