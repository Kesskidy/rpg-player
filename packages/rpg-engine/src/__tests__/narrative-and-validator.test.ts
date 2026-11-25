import { describe, expect, it } from 'vitest';
import {
  NARRATIVE_SCHEMA_VERSION,
  PROJECT_SCHEMA_VERSION,
  type NarrativeGraph,
  type ProjectManifest,
} from '@rpg-player/core-types';
import {
  createDefaultRpgDatabase,
  createEmptyTileMap,
  InventorySystem,
  NarrativeRunner,
  validateProjectConsistency,
} from '../index.js';

describe('A1 + A4: Exhaustive NarrativeRunner & Project Consistency Validator', () => {
  it('handles condition branching, choice gating, variable arithmetic, healing, and cycle protection', () => {
    const db = createDefaultRpgDatabase();
    const inv = new InventorySystem(db);
    const vars: Record<string, string | number | boolean> = { gold_bonus: 5 };
    let healedTotal = 0;

    const graph: NarrativeGraph = {
      schemaVersion: NARRATIVE_SCHEMA_VERSION,
      id: 'nar_full',
      name: 'Quête Complète',
      entryNodeId: 'n_start',
      nodes: [
        {
          id: 'n_start',
          type: 'dialogue',
          position: { x: 0, y: 0 },
          title: 'Intro',
          speaker: 'Sage',
          text: 'Choisis ta voie.',
          choices: [
            {
              id: 'c_locked',
              label: 'Voie secrète',
              condition: 'var("gold_bonus") >= 10',
              nextNodeId: 'n_end',
            },
            {
              id: 'c_open',
              label: 'Accepter la bénédiction',
              condition: 'var("gold_bonus") == 5 && !flag("blessed")',
              effects: [
                { type: 'add_var', key: 'gold_bonus', delta: 5 },
                { type: 'set_var', key: 'blessed', value: true },
                { type: 'heal', hp: 25, mp: 10 },
                { type: 'give_item', itemId: 'cle_fer', quantity: 1 },
              ],
              nextNodeId: 'n_cond',
            },
          ],
        },
        {
          id: 'n_cond',
          type: 'condition',
          position: { x: 200, y: 0 },
          title: 'Vérif',
          condition: 'has_item("cle_fer") && var("gold_bonus") == 10',
          trueNextNodeId: 'n_ok',
          falseNextNodeId: 'n_end',
        },
        {
          id: 'n_ok',
          type: 'dialogue',
          position: { x: 400, y: 0 },
          title: 'Succès',
          speaker: 'Sage',
          text: 'Tu es béni !',
          nextNodeId: 'n_end',
        },
        { id: 'n_end', type: 'end', position: { x: 600, y: 0 }, title: 'Fin' },
      ],
    };

    const runner = new NarrativeRunner(graph, {
      inventory: inv,
      variables: vars,
      onHeal: (hp) => {
        healedTotal += hp;
      },
    });

    const step1 = runner.start();
    expect(step1.status).toBe('dialogue');
    expect(step1.choices.find((c) => c.choice.id === 'c_locked')?.enabled).toBe(false);
    expect(step1.choices.find((c) => c.choice.id === 'c_open')?.enabled).toBe(true);

    // Selecting disabled choice is a no-op
    expect(runner.selectChoice('c_locked').node?.id).toBe('n_start');

    // Selecting enabled choice executes all effects and passes through ConditionNode to n_ok
    const step2 = runner.selectChoice('c_open');
    expect(step2.node?.id).toBe('n_ok');
    expect(vars['gold_bonus']).toBe(10);
    expect(vars['blessed']).toBe(true);
    expect(healedTotal).toBe(25);
    expect(inv.hasItem('cle_fer')).toBe(true);

    const end = runner.advance();
    expect(end.status).toBe('ended');

    // Infinite condition loop terminates cleanly via hop guard instead of freezing
    const loopGraph: NarrativeGraph = {
      schemaVersion: NARRATIVE_SCHEMA_VERSION,
      id: 'nar_loop',
      name: 'Boucle',
      entryNodeId: 'c1',
      nodes: [
        {
          id: 'c1',
          type: 'condition',
          position: { x: 0, y: 0 },
          title: 'Boucle',
          condition: 'true',
          trueNextNodeId: 'c1',
          falseNextNodeId: null,
        },
      ],
    };
    const loopRunner = new NarrativeRunner(loopGraph, { inventory: inv, variables: {} });
    expect(loopRunner.start().status).toBe('ended');
  });

  it('detects broken teleports, orphan narrative nodes, unknown items, missing assets, and out-of-bounds hit_frame (A4)', () => {
    const db = createDefaultRpgDatabase();
    const map = createEmptyTileMap({
      id: 'map_main',
      name: 'Village',
      width: 8,
      height: 8,
      tileSize: 32,
    });
    map.events.push({
      id: 'ev_bad_door',
      name: 'Porte Cassée',
      kind: 'zone',
      trigger: 'touch',
      x: 1,
      y: 1,
      spriteAssetId: 'sprite_manquant',
      narrativeId: 'dialogue_inexistant',
      battleEnemyId: 'dragon_inconnu',
      teleport: { targetMapId: 'map_inexistante', targetX: 0, targetY: 0 },
      isSolid: false,
      plane: 'below',
    });

    const graph: NarrativeGraph = {
      schemaVersion: NARRATIVE_SCHEMA_VERSION,
      id: 'nar_broken',
      name: 'Dialogue Bugué',
      entryNodeId: 'n1',
      nodes: [
        {
          id: 'n1',
          type: 'action',
          position: { x: 0, y: 0 },
          title: 'Donner objet inconnu',
          effects: [{ type: 'give_item', itemId: 'item_fantome', quantity: 1 }],
          nextNodeId: 'n_end',
        },
        { id: 'n_end', type: 'end', position: { x: 200, y: 0 }, title: 'Fin' },
        {
          id: 'n_orphan',
          type: 'dialogue',
          position: { x: 400, y: 0 },
          title: 'Orphelin',
          speaker: 'Fantôme',
          text: 'Personne ne vient ici.',
          nextNodeId: null,
        },
      ],
    };

    const manifest: ProjectManifest = {
      schemaVersion: PROJECT_SCHEMA_VERSION,
      id: 'proj_check',
      name: 'Test Vérificateur',
      createdAt: '2026-11-21T00:00:00Z',
      updatedAt: '2026-11-21T00:00:00Z',
      defaultTileSize: 32,
      assets: {
        hero_bad_clip: {
          schemaVersion: 1,
          id: 'hero_bad_clip',
          name: 'Héros',
          type: 'sprite',
          gridWidth: 32,
          gridHeight: 32,
          frameCount: 2,
          columns: 2,
          filePath: 'assets/hero.png',
          sourcePath: 'assets/hero.pxs.json',
          anchor: { x: 16, y: 32 },
          animations: {
            attack: {
              frames: [0, 1],
              fps: 8,
              loop: false,
              markers: [{ frameIndex: 5, event: 'hit_frame', payload: 'slash' }],
            },
          },
          hitboxes: [],
          tags: [],
        },
      },
      maps: {
        map_main: {
          id: 'map_main',
          name: 'Village',
          width: 8,
          height: 8,
          tileSize: 32,
          filePath: 'maps/map_main.map.json',
        },
      },
      narratives: {
        nar_broken: {
          id: 'nar_broken',
          name: 'Dialogue Bugué',
          filePath: 'narratives/nar_broken.narrative.json',
        },
      },
    };

    const issues = validateProjectConsistency({
      manifest,
      maps: { map_main: map },
      narratives: { nar_broken: graph },
      database: db,
    });

    expect(issues.some((i) => i.message.includes('map_inexistante'))).toBe(true);
    expect(issues.some((i) => i.message.includes('dialogue_inexistant'))).toBe(true);
    expect(issues.some((i) => i.message.includes('dragon_inconnu'))).toBe(true);
    expect(issues.some((i) => i.message.includes('sprite_manquant'))).toBe(true);
    expect(issues.some((i) => i.message.includes('item_fantome'))).toBe(true);
    expect(issues.some((i) => i.message.includes('Orphelin'))).toBe(true);
    expect(issues.some((i) => i.message.includes('hit_frame'))).toBe(true);
  });
});
