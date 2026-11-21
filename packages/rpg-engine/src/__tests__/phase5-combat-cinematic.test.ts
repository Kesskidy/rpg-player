import { describe, expect, it } from 'vitest';
import {
  NARRATIVE_SCHEMA_VERSION,
  type AnimationClip,
  type NarrativeGraph,
} from '@rpg-player/core-types';
import {
  createDefaultRpgDatabase,
  DynamicCombatEngine,
  InventorySystem,
  NarrativeRunner,
  TurnBasedCombatEngine,
  TurnBasedCombatStrategy,
} from '../index.js';

describe('Phase 5: CinematicNode & 3-Mode Combat Strategy Engine', () => {
  it('executes CinematicNode with waitForCompletion and loopInBackground in NarrativeRunner', () => {
    const db = createDefaultRpgDatabase();
    const inv = new InventorySystem(db);
    const graph: NarrativeGraph = {
      schemaVersion: NARRATIVE_SCHEMA_VERSION,
      id: 'cutscene_test',
      name: 'Test Cinématique',
      entryNodeId: 'n_bg',
      nodes: [
        {
          id: 'n_bg',
          type: 'cinematic',
          position: { x: 0, y: 0 },
          title: 'Ambiance Flamme',
          cinematic: {
            assetId: 'vfx_fire',
            clipName: 'loop',
            displayMode: 'background',
            waitForCompletion: false,
            loopInBackground: true,
          },
          nextNodeId: 'n_blocking_cutscene',
        },
        {
          id: 'n_blocking_cutscene',
          type: 'cinematic',
          position: { x: 200, y: 0 },
          title: 'Réveil Boss',
          cinematic: {
            assetId: 'cutscene_boss',
            clipName: 'awaken',
            displayMode: 'fullscreen',
            waitForCompletion: true,
            loopInBackground: false,
            caption: 'Le sol tremble...',
          },
          nextNodeId: 'n_dialogue',
        },
        {
          id: 'n_dialogue',
          type: 'dialogue',
          position: { x: 400, y: 0 },
          title: 'Suite',
          speaker: 'Boss',
          text: 'Qui ose me réveiller ?',
          nextNodeId: 'n_end',
        },
        { id: 'n_end', type: 'end', position: { x: 600, y: 0 }, title: 'Fin' },
      ],
    };

    const runner = new NarrativeRunner(graph, { inventory: inv, variables: {} });
    const step1 = runner.start();
    // Auto-passed non-blocking background cinematic and paused on blocking cutscene
    expect(step1.status).toBe('cinematic');
    expect(step1.activeCinematic?.assetId).toBe('cutscene_boss');
    expect(step1.backgroundCinematic?.assetId).toBe('vfx_fire');

    // Advancing after cutscene finishes enters dialogue while keeping background loop!
    const step2 = runner.advance();
    expect(step2.status).toBe('dialogue');
    expect(step2.text).toBe('Qui ose me réveiller ?');
    expect(step2.backgroundCinematic?.assetId).toBe('vfx_fire');
  });

  it('Mode 2 (turn_based_animated) applies damage strictly on hit_frame marker', () => {
    const db = createDefaultRpgDatabase();
    const inv = new InventorySystem(db);
    const customAttack: AnimationClip = {
      category: 'combat',
      frames: [0, 1, 2, 3],
      fps: 10,
      frameDurationsMs: [100, 100, 100, 100],
      loop: false,
      markers: [{ frameIndex: 2, event: 'hit_frame', payload: 'slash' }],
    };

    const strat = new TurnBasedCombatStrategy('turn_based_animated', db, inv, 'slime_toxique', {
      heroAttackClip: customAttack,
    });
    const maxEnemyHp = strat.getState().displayedSnapshot.enemy.hp;

    strat.playerAttack();
    // After 100ms (frame 1): before hit_frame -> displayed enemy HP MUST still be untouched!
    const beforeHit = strat.step(100);
    expect(beforeHit.busy).toBe(true);
    expect(beforeHit.displayedSnapshot.enemy.hp).toBe(maxEnemyHp);

    // After another 100ms (frame 2 = hit_frame): damage & VFX trigger immediately!
    const atHit = strat.step(100);
    expect(atHit.displayedSnapshot.enemy.hp).toBeLessThan(maxEnemyHp);
    expect(atHit.activeVfx.length).toBeGreaterThan(0);
  });

  it('Mode 3 (dynamic_ai) drives melee pursuit and ranged kiting + projectiles', () => {
    const db = createDefaultRpgDatabase();
    const inv = new InventorySystem(db);

    // 1. Melee enemy closes distance toward hero
    const meleeEngine = new DynamicCombatEngine(db, inv, 'slime_toxique');
    const initialDist = Math.abs(
      meleeEngine.getSnapshot().enemy.x - meleeEngine.getSnapshot().hero.x,
    );
    for (let i = 0; i < 20; i += 1) {
      meleeEngine.step(33);
    }
    const afterApproachDist = Math.abs(
      meleeEngine.getSnapshot().enemy.x - meleeEngine.getSnapshot().hero.x,
    );
    expect(afterApproachDist).toBeLessThan(initialDist - 15);

    // 2. Ranged enemy kites backward when hero stands inside retreatRange and fires projectile
    db.enemies['gobelin_eclaireur']!.aiProfile = {
      behavior: 'ranged',
      aggroRange: 300,
      attackRange: 40,
      preferredRange: 180,
      retreatRange: 140,
      moveSpeed: 100,
      attackCooldownMs: 200,
      projectileSpeed: 220,
    };
    const rangedEngine = new DynamicCombatEngine(db, inv, 'gobelin_eclaireur', {
      arenaWidth: 320,
      arenaHeight: 200,
    });
    // Hero at 80, enemy at 240 -> dist 160; walk hero right into retreatRange (<140)
    rangedEngine.setInput({ right: true });
    let sawProjectile = false;
    const startEnemyX = rangedEngine.getSnapshot().enemy.x;
    for (let i = 0; i < 30; i += 1) {
      const snap = rangedEngine.step(33);
      if (snap.projectiles.some((p) => p.owner === 'enemy')) {
        sawProjectile = true;
      }
    }
    expect(rangedEngine.getSnapshot().enemy.x).toBeGreaterThan(startEnemyX);
    expect(sawProjectile).toBe(true);
  });

  it('persists start_battle across subsequent dialogue nodes and checks remove_item result (Bugs #6 & #16)', () => {
    const db = createDefaultRpgDatabase();
    const inv = new InventorySystem(db);
    const graph: NarrativeGraph = {
      schemaVersion: NARRATIVE_SCHEMA_VERSION,
      id: 'battle_after_taunt',
      name: 'Embuscade',
      entryNodeId: 'n_action',
      nodes: [
        {
          id: 'n_action',
          type: 'action',
          position: { x: 0, y: 0 },
          title: 'Déclencher combat',
          effects: [
            { type: 'remove_item', itemId: 'objet_inexistant', quantity: 1 },
            { type: 'start_battle', enemyId: 'gobelin_eclaireur' },
          ],
          nextNodeId: 'n_taunt',
        },
        {
          id: 'n_taunt',
          type: 'dialogue',
          position: { x: 200, y: 0 },
          title: 'Provocation',
          speaker: 'Gobelin',
          text: 'En garde !',
          nextNodeId: 'n_end',
        },
        { id: 'n_end', type: 'end', position: { x: 400, y: 0 }, title: 'Fin' },
      ],
    };

    const runner = new NarrativeRunner(graph, { inventory: inv, variables: {} });
    const taunt = runner.start();
    expect(taunt.status).toBe('dialogue');
    // Bug #16: must NOT log "Retiré :" for an item the player does not own
    expect(taunt.actionLogs.some((l) => l.startsWith('Retiré :'))).toBe(false);

    // Bug #6: advancing to end STILL delivers triggeredBattleEnemyId
    const ended = runner.advance();
    expect(ended.status).toBe('ended');
    expect(ended.triggeredBattleEnemyId).toBe('gobelin_eclaireur');
  });

  it('exposes non-blocking one-shot CinematicNode on the following dialogue step (Bug #7)', () => {
    const db = createDefaultRpgDatabase();
    const inv = new InventorySystem(db);
    const graph: NarrativeGraph = {
      schemaVersion: NARRATIVE_SCHEMA_VERSION,
      id: 'oneshot_cin',
      name: 'Flash',
      entryNodeId: 'n_flash',
      nodes: [
        {
          id: 'n_flash',
          type: 'cinematic',
          position: { x: 0, y: 0 },
          title: 'Éclair',
          cinematic: {
            assetId: 'vfx_flash',
            clipName: 'strike',
            displayMode: 'inset',
            waitForCompletion: false,
            loopInBackground: false,
          },
          nextNodeId: 'n_dlg',
        },
        {
          id: 'n_dlg',
          type: 'dialogue',
          position: { x: 200, y: 0 },
          title: 'Réaction',
          speaker: 'Héros',
          text: 'Un éclair !',
          nextNodeId: 'n_end',
        },
        { id: 'n_end', type: 'end', position: { x: 400, y: 0 }, title: 'Fin' },
      ],
    };

    const runner = new NarrativeRunner(graph, { inventory: inv, variables: {} });
    const step = runner.start();
    expect(step.status).toBe('dialogue');
    expect(step.oneShotCinematic?.assetId).toBe('vfx_flash');
    expect(step.backgroundCinematic).toBeNull();
  });

  it('honors hero stun and rotates through all enemy skills including odd indices (Bugs #8 & #15)', () => {
    const db = createDefaultRpgDatabase();
    db.skills['sk_stun'] = {
      id: 'sk_stun',
      name: 'Coup Sonnant',
      description: 'Étourdit',
      mpCost: 2,
      power: 5,
      statusEffect: { kind: 'stun', turns: 1, potency: 0 },
    };
    db.skills['sk_second'] = {
      id: 'sk_second',
      name: 'Griffe Sombre',
      description: 'Deuxième compétence',
      mpCost: 2,
      power: 8,
    };
    db.enemies['boss_test'] = {
      id: 'boss_test',
      name: 'Golem Test',
      spriteAssetId: null,
      stats: { maxHp: 300, maxMp: 100, atk: 6, def: 2 },
      skillIds: ['sk_stun', 'sk_second'],
    };

    const inv = new InventorySystem(db);
    const engine = new TurnBasedCombatEngine(db, inv, 'boss_test');

    // Turn 1: enemy attacks normally -> turn becomes 2
    let snap = engine.playerAttack();
    expect(snap.turn).toBe(2);

    // Turn 2 (even): enemy uses sk_stun (index 0) -> hero stunned -> skips Turn 3 -> enemy attacks on Turn 3 -> turn becomes 4!
    snap = engine.playerAttack();
    expect(snap.log.some((l) => l.includes('Coup Sonnant'))).toBe(true);
    expect(snap.log.some((l) => l.includes('est étourdi et passe son tour'))).toBe(true);
    expect(snap.turn).toBe(4);

    // Turn 4 (even): enemy rotates to sk_second (index 1, previously unreachable!)
    snap = engine.playerAttack();
    expect(snap.log.some((l) => l.includes('Griffe Sombre'))).toBe(true);
  });

  it('Mode 2 shows exact hero heal on hero hit_frame and enemy damage on enemy hit_frame without log leaks (Bug #13)', () => {
    const db = createDefaultRpgDatabase();
    const inv = new InventorySystem(db);
    const clip: AnimationClip = {
      category: 'combat',
      frames: [0, 1, 2],
      fps: 10,
      frameDurationsMs: [50, 50, 50],
      loop: false,
      markers: [{ frameIndex: 1, event: 'hit_frame', payload: 'hit' }],
    };

    // Start hero wounded at 40/100 HP; potion heals +35 (to 75), then enemy hits for ~9 (to ~66)
    const strat = new TurnBasedCombatStrategy('turn_based_animated', db, inv, 'slime_toxique', {
      initialHeroHp: 40,
      heroAttackClip: clip,
      enemyAttackClip: clip,
    });

    strat.playerUseItem('potion_soin');
    // Step 1 hit_frame at 50ms -> hero HP must be EXACTLY 75 (40 + 35), NOT net delta, and enemy attack must NOT be in log yet!
    const atHeroHit = strat.step(50);
    expect(atHeroHit.displayedSnapshot.hero.hp).toBe(75);
    expect(atHeroHit.floatingEvents.some((f) => f.target === 'hero' && f.text === '+35 PV')).toBe(
      true,
    );
    expect(atHeroHit.displayedSnapshot.log.some((l) => l.includes('Slime Toxique attaque'))).toBe(
      false,
    );

    // Advance past hero clip (100ms more) and into enemy hit_frame (50ms) -> enemy damage applies & shows exact damage float!
    strat.step(100);
    const atEnemyHit = strat.step(50);
    expect(atEnemyHit.displayedSnapshot.hero.hp).toBeLessThan(75);
    expect(atEnemyHit.floatingEvents.some((f) => f.target === 'hero' && f.kind === 'damage')).toBe(
      true,
    );
  });
});
