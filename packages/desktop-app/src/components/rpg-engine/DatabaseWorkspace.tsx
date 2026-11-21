import { useState } from 'react';
import type {
  EnemyDef,
  ItemCategory,
  ItemDef,
  ProjectManifest,
  ProjectStorageAdapter,
  RpgDatabase,
  SkillDef,
} from '@rpg-player/core-types';
import { InventorySystem, TurnBasedCombatEngine } from '@rpg-player/rpg-engine';
import { saveRpgDatabase } from '../../storage/project-service';
import { CombatOverlay } from './CombatOverlay';

interface DatabaseWorkspaceProps {
  storage: ProjectStorageAdapter;
  project: ProjectManifest | null;
  database: RpgDatabase;
  onChangeDatabase: (next: RpgDatabase) => void;
  onProjectUpdated: (manifest: ProjectManifest) => void;
}

type DbSection = 'hero' | 'items' | 'skills' | 'enemies';

export function DatabaseWorkspace({
  storage,
  project,
  database,
  onChangeDatabase,
  onProjectUpdated,
}: DatabaseWorkspaceProps) {
  const [section, setSection] = useState<DbSection>('enemies');
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const [testBattle, setTestBattle] = useState<{
    combat: TurnBasedCombatEngine;
    inventory: InventorySystem;
  } | null>(null);

  async function handleSaveDb() {
    if (!project) {
      setFeedback({
        kind: 'error',
        text: 'Ouvrez ou créez un dossier projet en haut à droite pour sauvegarder.',
      });
      return;
    }
    setIsSaving(true);
    setFeedback(null);
    try {
      const updated = await saveRpgDatabase(storage, project, database);
      onProjectUpdated(updated);
      setFeedback({ kind: 'ok', text: 'Base de données RPG sauvegardée (database/rpg.db.json).' });
    } catch (error) {
      setFeedback({
        kind: 'error',
        text: error instanceof Error ? error.message : 'Erreur de sauvegarde.',
      });
    } finally {
      setIsSaving(false);
    }
  }

  function startTestCombat(enemyId: string) {
    const inv = new InventorySystem(database);
    // Equip starter weapon if available so test battle feels realistic
    if (inv.hasItem('epee_fer')) {
      inv.equipItem('epee_fer');
    }
    const combat = new TurnBasedCombatEngine(database, inv, enemyId);
    setTestBattle({ combat, inventory: inv });
  }

  function addNewItem() {
    const id = `item_${Date.now().toString(36)}`;
    const nextItem: ItemDef = {
      id,
      name: 'Nouvel objet',
      description: 'Description de l’objet.',
      category: 'consumable',
      stackable: true,
      weight: 1,
      healHp: 20,
    };
    onChangeDatabase({
      ...database,
      items: { ...database.items, [id]: nextItem },
    });
  }

  function addNewEnemy() {
    const id = `enemy_${Date.now().toString(36)}`;
    const nextEnemy: EnemyDef = {
      id,
      name: 'Nouveau monstre',
      spriteAssetId: null,
      stats: { maxHp: 40, maxMp: 10, atk: 10, def: 3 },
      skillIds: [],
      rewardItemId: 'potion_soin',
      rewardGold: 12,
    };
    onChangeDatabase({
      ...database,
      enemies: { ...database.enemies, [id]: nextEnemy },
    });
  }

  function addNewSkill() {
    const id = `skill_${Date.now().toString(36)}`;
    const nextSkill: SkillDef = {
      id,
      name: 'Nouvelle compétence',
      description: 'Inflige des dégâts élémentaires.',
      mpCost: 5,
      power: 15,
    };
    onChangeDatabase({
      ...database,
      skills: { ...database.skills, [id]: nextSkill },
    });
  }

  return (
    <div className="relative flex flex-1 overflow-hidden">
      {/* Left sections */}
      <aside className="flex w-60 flex-col border-r border-slate-800 bg-surface-900 p-3">
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Base de Données RPG
        </h3>

        <div className="space-y-1">
          {(
            [
              { id: 'hero', label: 'Héros & Inventaire' },
              { id: 'items', label: `Objets (${Object.keys(database.items).length})` },
              { id: 'skills', label: `Compétences (${Object.keys(database.skills).length})` },
              { id: 'enemies', label: `Monstres (${Object.keys(database.enemies).length})` },
            ] as Array<{ id: DbSection; label: string }>
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSection(item.id)}
              className={`w-full rounded px-3 py-2 text-left text-xs font-medium transition ${
                section === item.id
                  ? 'bg-indigo-600 text-white'
                  : 'bg-surface-800/50 text-slate-300 hover:bg-surface-800'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="mt-auto space-y-2 border-t border-slate-800 pt-3">
          <button
            type="button"
            disabled={isSaving}
            onClick={() => void handleSaveDb()}
            className="w-full rounded-md bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {isSaving ? 'Sauvegarde...' : 'Sauvegarder la BDD'}
          </button>
          {feedback && (
            <p
              className={`rounded border px-2 py-1 text-[11px] ${
                feedback.kind === 'ok'
                  ? 'border-emerald-500/40 bg-emerald-950/50 text-emerald-200'
                  : 'border-rose-500/40 bg-rose-950/50 text-rose-200'
              }`}
            >
              {feedback.text}
            </p>
          )}
        </div>
      </aside>

      {/* Content */}
      <div className="flex-1 overflow-y-auto bg-surface-950 p-6">
        {section === 'hero' && (
          <div className="mx-auto max-w-xl space-y-4 rounded-xl border border-slate-800 bg-surface-900 p-5">
            <h2 className="text-sm font-bold text-white">Statistiques de base du Héros</h2>
            <label className="block text-xs text-slate-400">
              Nom du Héros
              <input
                type="text"
                value={database.hero.name}
                onChange={(e) =>
                  onChangeDatabase({
                    ...database,
                    hero: { ...database.hero, name: e.target.value },
                  })
                }
                className="mt-1 w-full rounded border border-slate-700 bg-surface-800 px-3 py-1.5 text-sm text-white"
              />
            </label>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(['maxHp', 'maxMp', 'atk', 'def'] as const).map((stat) => (
                <label key={stat} className="block text-xs uppercase text-slate-400">
                  {stat}
                  <input
                    type="number"
                    min={1}
                    value={database.hero.stats[stat]}
                    onChange={(e) =>
                      onChangeDatabase({
                        ...database,
                        hero: {
                          ...database.hero,
                          stats: {
                            ...database.hero.stats,
                            [stat]: Math.max(1, Number(e.target.value)),
                          },
                        },
                      })
                    }
                    className="mt-1 w-full rounded border border-slate-700 bg-surface-800 px-2.5 py-1.5 font-mono text-sm text-white"
                  />
                </label>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs text-slate-400">
                Slots max inventaire
                <input
                  type="number"
                  min={1}
                  value={database.hero.maxSlots}
                  onChange={(e) =>
                    onChangeDatabase({
                      ...database,
                      hero: { ...database.hero, maxSlots: Math.max(1, Number(e.target.value)) },
                    })
                  }
                  className="mt-1 w-full rounded border border-slate-700 bg-surface-800 px-2.5 py-1.5 font-mono text-sm text-white"
                />
              </label>
              <label className="block text-xs text-slate-400">
                Poids max (kg)
                <input
                  type="number"
                  min={1}
                  value={database.hero.maxWeight}
                  onChange={(e) =>
                    onChangeDatabase({
                      ...database,
                      hero: { ...database.hero, maxWeight: Math.max(1, Number(e.target.value)) },
                    })
                  }
                  className="mt-1 w-full rounded border border-slate-700 bg-surface-800 px-2.5 py-1.5 font-mono text-sm text-white"
                />
              </label>
            </div>
          </div>
        )}

        {section === 'items' && (
          <div className="mx-auto max-w-3xl space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-white">Objets &amp; Équipements</h2>
              <button
                type="button"
                onClick={addNewItem}
                className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
              >
                + Nouvel objet
              </button>
            </div>

            {Object.values(database.items).map((item) => (
              <div
                key={item.id}
                className="grid grid-cols-1 gap-2 rounded-lg border border-slate-800 bg-surface-900 p-3 text-xs sm:grid-cols-12"
              >
                <div className="sm:col-span-3">
                  <div className="font-mono text-[10px] text-slate-500">{item.id}</div>
                  <input
                    type="text"
                    value={item.name}
                    onChange={(e) =>
                      onChangeDatabase({
                        ...database,
                        items: {
                          ...database.items,
                          [item.id]: { ...item, name: e.target.value },
                        },
                      })
                    }
                    className="mt-0.5 w-full rounded border border-slate-700 bg-surface-800 px-2 py-1 text-white"
                  />
                </div>
                <div className="sm:col-span-3">
                  <div className="text-[10px] text-slate-500">Catégorie</div>
                  <select
                    value={item.category}
                    onChange={(e) =>
                      onChangeDatabase({
                        ...database,
                        items: {
                          ...database.items,
                          [item.id]: { ...item, category: e.target.value as ItemCategory },
                        },
                      })
                    }
                    className="mt-0.5 w-full rounded border border-slate-700 bg-surface-800 px-2 py-1 text-white"
                  >
                    <option value="consumable">Consommable</option>
                    <option value="equipment">Équipement</option>
                    <option value="quest">Objet de quête</option>
                  </select>
                </div>
                <div className="sm:col-span-4">
                  <div className="text-[10px] text-slate-500">Description</div>
                  <input
                    type="text"
                    value={item.description}
                    onChange={(e) =>
                      onChangeDatabase({
                        ...database,
                        items: {
                          ...database.items,
                          [item.id]: { ...item, description: e.target.value },
                        },
                      })
                    }
                    className="mt-0.5 w-full rounded border border-slate-700 bg-surface-800 px-2 py-1 text-slate-200"
                  />
                </div>
                <div className="sm:col-span-2">
                  <div className="text-[10px] text-slate-500">Poids (kg)</div>
                  <input
                    type="number"
                    step={0.1}
                    min={0}
                    value={item.weight}
                    onChange={(e) =>
                      onChangeDatabase({
                        ...database,
                        items: {
                          ...database.items,
                          [item.id]: { ...item, weight: Math.max(0, Number(e.target.value)) },
                        },
                      })
                    }
                    className="mt-0.5 w-full rounded border border-slate-700 bg-surface-800 px-2 py-1 font-mono text-white"
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {section === 'skills' && (
          <div className="mx-auto max-w-3xl space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-white">Compétences &amp; Sorts</h2>
              <button
                type="button"
                onClick={addNewSkill}
                className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
              >
                + Nouvelle compétence
              </button>
            </div>
            {Object.values(database.skills).map((skill) => (
              <div
                key={skill.id}
                className="grid grid-cols-1 gap-2 rounded-lg border border-slate-800 bg-surface-900 p-3 text-xs sm:grid-cols-12"
              >
                <div className="sm:col-span-3">
                  <div className="font-mono text-[10px] text-slate-500">{skill.id}</div>
                  <input
                    type="text"
                    value={skill.name}
                    onChange={(e) =>
                      onChangeDatabase({
                        ...database,
                        skills: {
                          ...database.skills,
                          [skill.id]: { ...skill, name: e.target.value },
                        },
                      })
                    }
                    className="mt-0.5 w-full rounded border border-slate-700 bg-surface-800 px-2 py-1 text-white"
                  />
                </div>
                <div className="sm:col-span-2">
                  <div className="text-[10px] text-slate-500">Coût PM</div>
                  <input
                    type="number"
                    min={0}
                    value={skill.mpCost}
                    onChange={(e) =>
                      onChangeDatabase({
                        ...database,
                        skills: {
                          ...database.skills,
                          [skill.id]: { ...skill, mpCost: Math.max(0, Number(e.target.value)) },
                        },
                      })
                    }
                    className="mt-0.5 w-full rounded border border-slate-700 bg-surface-800 px-2 py-1 font-mono text-white"
                  />
                </div>
                <div className="sm:col-span-2">
                  <div className="text-[10px] text-slate-500">Puissance</div>
                  <input
                    type="number"
                    min={0}
                    value={skill.power}
                    onChange={(e) =>
                      onChangeDatabase({
                        ...database,
                        skills: {
                          ...database.skills,
                          [skill.id]: { ...skill, power: Math.max(0, Number(e.target.value)) },
                        },
                      })
                    }
                    className="mt-0.5 w-full rounded border border-slate-700 bg-surface-800 px-2 py-1 font-mono text-white"
                  />
                </div>
                <div className="sm:col-span-5">
                  <div className="text-[10px] text-slate-500">Description</div>
                  <input
                    type="text"
                    value={skill.description}
                    onChange={(e) =>
                      onChangeDatabase({
                        ...database,
                        skills: {
                          ...database.skills,
                          [skill.id]: { ...skill, description: e.target.value },
                        },
                      })
                    }
                    className="mt-0.5 w-full rounded border border-slate-700 bg-surface-800 px-2 py-1 text-slate-200"
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {section === 'enemies' && (
          <div className="mx-auto max-w-3xl space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-white">Monstres &amp; Prototype Combat</h2>
              <button
                type="button"
                onClick={addNewEnemy}
                className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
              >
                + Nouveau monstre
              </button>
            </div>
            {Object.values(database.enemies).map((enemy) => (
              <div
                key={enemy.id}
                className="flex flex-col gap-3 rounded-lg border border-slate-800 bg-surface-900 p-4 text-xs"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1">
                    <div className="font-mono text-[10px] text-slate-500">{enemy.id}</div>
                    <input
                      type="text"
                      value={enemy.name}
                      onChange={(e) =>
                        onChangeDatabase({
                          ...database,
                          enemies: {
                            ...database.enemies,
                            [enemy.id]: { ...enemy, name: e.target.value },
                          },
                        })
                      }
                      className="mt-0.5 w-full max-w-xs rounded border border-slate-700 bg-surface-800 px-2 py-1 text-sm font-semibold text-white"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => startTestCombat(enemy.id)}
                    className="rounded-md bg-rose-600 px-3.5 py-2 text-xs font-semibold text-white shadow hover:bg-rose-500"
                  >
                    ⚔ Tester le combat
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {(['maxHp', 'maxMp', 'atk', 'def'] as const).map((stat) => (
                    <label key={stat} className="text-[10px] uppercase text-slate-400">
                      {stat}
                      <input
                        type="number"
                        min={1}
                        value={enemy.stats[stat]}
                        onChange={(e) =>
                          onChangeDatabase({
                            ...database,
                            enemies: {
                              ...database.enemies,
                              [enemy.id]: {
                                ...enemy,
                                stats: {
                                  ...enemy.stats,
                                  [stat]: Math.max(1, Number(e.target.value)),
                                },
                              },
                            },
                          })
                        }
                        className="mt-0.5 w-full rounded border border-slate-700 bg-surface-800 px-2 py-1 font-mono text-xs text-white"
                      />
                    </label>
                  ))}
                  <label className="text-[10px] uppercase text-slate-400">
                    Butin Or
                    <input
                      type="number"
                      min={0}
                      value={enemy.rewardGold ?? 0}
                      onChange={(e) =>
                        onChangeDatabase({
                          ...database,
                          enemies: {
                            ...database.enemies,
                            [enemy.id]: {
                              ...enemy,
                              rewardGold: Math.max(0, Number(e.target.value)),
                            },
                          },
                        })
                      }
                      className="mt-0.5 w-full rounded border border-slate-700 bg-surface-800 px-2 py-1 font-mono text-xs text-white"
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {testBattle && (
        <CombatOverlay
          combat={testBattle.combat}
          database={database}
          inventory={testBattle.inventory}
          onFinish={() => setTestBattle(null)}
        />
      )}
    </div>
  );
}
