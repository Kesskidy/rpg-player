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
});
