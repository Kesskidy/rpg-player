import { useState } from 'react';
import type {
  AIBehaviorKind,
  CombatConfig,
  CombatMode,
  EnemyDef,
  ItemCategory,
  ItemDef,
  ProjectManifest,
  ProjectStorageAdapter,
  RpgDatabase,
  SkillDef,
} from '@rpg-player/core-types';
import { getDefaultAIProfile, InventorySystem } from '@rpg-player/rpg-engine';
import { formatSaveFeedback, saveRpgDatabase } from '../../storage/project-service';
import { CharacterSheetsPanel } from './CharacterSheetsPanel';
import { CombatOverlay } from './CombatOverlay';
import { PixelSaveIcon } from '../ui/PixelIcons';

interface DatabaseWorkspaceProps {
  storage: ProjectStorageAdapter;
  project: ProjectManifest | null;
  database: RpgDatabase;
  onChangeDatabase: (next: RpgDatabase) => void;
  onProjectUpdated: (manifest: ProjectManifest) => void;
}

type DbSection = 'sheets' | 'hero' | 'combat-settings' | 'items' | 'skills' | 'enemies';

const DEFAULT_COMBAT_CONFIG: CombatConfig = {
  defaultMode: 'turn_based_animated',
  allowModeSwitchInPreview: true,
  dynamicSettings: {
    heroAttackRange: 48,
    heroAttackCooldownMs: 420,
    defaultProjectileSpeed: 230,
  },
};

export function DatabaseWorkspace({
  storage,
  project,
  database,
  onChangeDatabase,
  onProjectUpdated,
}: DatabaseWorkspaceProps) {
  const [section, setSection] = useState<DbSection>('sheets');
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const [testBattle, setTestBattle] = useState<{
    enemyId: string;
    inventory: InventorySystem;
    mode: CombatMode;
  } | null>(null);

  const combatConfig = database.combatConfig ?? DEFAULT_COMBAT_CONFIG;

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
      setFeedback({
        kind: 'ok',
        text: formatSaveFeedback(
          storage,
          'Base de données RPG sauvegardée (database/rpg.db.json).',
        ),
      });
    } catch (error) {
      setFeedback({
        kind: 'error',
        text: error instanceof Error ? error.message : 'Erreur de sauvegarde.',
      });
    } finally {
      setIsSaving(false);
    }
  }

  function startTestCombat(enemyId: string, mode?: CombatMode) {
    const inv = new InventorySystem(database);
    if (inv.hasItem('epee_fer')) {
      inv.equipItem('epee_fer');
    }
    setTestBattle({
      enemyId,
      inventory: inv,
      mode: mode ?? combatConfig.defaultMode,
    });
  }

  function updateCombatConfig(patch: Partial<CombatConfig>) {
    onChangeDatabase({
      ...database,
      combatConfig: { ...combatConfig, ...patch },
    });
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
      aiProfile: {
        behavior: 'melee',
        aggroRange: 260,
        attackRange: 44,
        preferredRange: 140,
        retreatRange: 75,
        moveSpeed: 80,
        attackCooldownMs: 1100,
        projectileSpeed: 210,
      },
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

  const sheetCount = Object.keys(database.characterSheets ?? {}).length;

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
              { id: 'sheets', label: `Fiches Personnages (${sheetCount})` },
              { id: 'combat-settings', label: 'Paramètres Combat (3 Modes)' },
              { id: 'hero', label: 'Héros & Inventaire' },
              { id: 'items', label: `Objets (${Object.keys(database.items).length})` },
              { id: 'skills', label: `Compétences (${Object.keys(database.skills).length})` },
              { id: 'enemies', label: `Monstres & IA (${Object.keys(database.enemies).length})` },
            ] as Array<{ id: DbSection; label: string }>
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSection(item.id)}
              className={`pixel-btn w-full px-3 py-2 text-left text-[11px] font-bold ${
                section === item.id ? 'pixel-btn-gold' : ''
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="mt-auto space-y-2 border-t-2 border-dnd-border pt-3">
          <button
            type="button"
            disabled={isSaving}
            onClick={() => void handleSaveDb()}
            className="pixel-btn pixel-btn-emerald flex w-full items-center justify-center gap-1.5 px-3 py-2 text-[11px] font-bold disabled:opacity-50"
          >
            <PixelSaveIcon size={14} />
            <span>{isSaving ? 'Sauvegarde...' : 'Sauvegarder la BDD'}</span>
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
        {section === 'sheets' && (
          <CharacterSheetsPanel
            database={database}
            project={project}
            onChangeDatabase={onChangeDatabase}
            onNotify={(text) => setFeedback({ kind: 'ok', text })}
          />
        )}

        {section === 'combat-settings' && (
          <div className="mx-auto max-w-2xl space-y-4 rounded-xl border border-slate-800 bg-surface-900 p-5 text-xs">
            <div>
              <h2 className="text-sm font-bold text-white">
                Configuration Modulaire du Système de Combat (3 Modes)
              </h2>
              <p className="mt-1 text-slate-400">
                Choisissez le mode par défaut de votre RPG. Le joueur ou créateur peut aussi tester
                chaque mode en direct.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              {(
                [
                  {
                    id: 'simple',
                    title: '1. Minimaliste',
                    desc: 'Stats, barres de PV/PM et dégâts instantanés.',
                  },
                  {
                    id: 'turn_based_animated',
                    title: '2. Tour par tour animé',
                    desc: 'Animations JRPG + VFX synchronisés sur hit_frame.',
                  },
                  {
                    id: 'dynamic_ai',
                    title: '3. Dynamique IA',
                    desc: 'Temps réel en arène avec IA mêlée, distance (kiting) & hybride.',
                  },
                ] as Array<{ id: CombatMode; title: string; desc: string }>
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => updateCombatConfig({ defaultMode: opt.id })}
                  className={`flex flex-col rounded-lg border p-3 text-left transition ${
                    combatConfig.defaultMode === opt.id
                      ? 'border-rose-400 bg-rose-950/40 text-white ring-1 ring-rose-500/60'
                      : 'border-slate-800 bg-surface-950/60 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <span className="font-bold">{opt.title}</span>
                  <span className="mt-1 text-[11px] text-slate-400">{opt.desc}</span>
                </button>
              ))}
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-slate-200">
              <input
                type="checkbox"
                checked={combatConfig.allowModeSwitchInPreview}
                onChange={(e) =>
                  updateCombatConfig({ allowModeSwitchInPreview: e.target.checked })
                }
                className="accent-indigo-500"
              />
              Autoriser le changement de mode de combat à la volée pendant le Play Preview
            </label>

            <div className="grid grid-cols-1 gap-3 border-t border-slate-800 pt-3 sm:grid-cols-3">
              <label className="text-slate-400">
                Portée mêlée Héros (px)
                <input
                  type="number"
                  min={16}
                  max={200}
                  value={combatConfig.dynamicSettings.heroAttackRange}
                  onChange={(e) =>
                    updateCombatConfig({
                      dynamicSettings: {
                        ...combatConfig.dynamicSettings,
                        heroAttackRange: Math.max(16, Number(e.target.value)),
                      },
                    })
                  }
                  className="mt-1 w-full rounded border border-slate-700 bg-surface-800 px-2.5 py-1.5 font-mono text-white"
                />
              </label>
              <label className="text-slate-400">
                Cooldown attaque (ms)
                <input
                  type="number"
                  min={100}
                  max={3000}
                  step={20}
                  value={combatConfig.dynamicSettings.heroAttackCooldownMs}
                  onChange={(e) =>
                    updateCombatConfig({
                      dynamicSettings: {
                        ...combatConfig.dynamicSettings,
                        heroAttackCooldownMs: Math.max(100, Number(e.target.value)),
                      },
                    })
                  }
                  className="mt-1 w-full rounded border border-slate-700 bg-surface-800 px-2.5 py-1.5 font-mono text-white"
                />
              </label>
              <label className="text-slate-400">
                Vitesse projectile (px/s)
                <input
                  type="number"
                  min={60}
                  max={600}
                  step={10}
                  value={combatConfig.dynamicSettings.defaultProjectileSpeed}
                  onChange={(e) =>
                    updateCombatConfig({
                      dynamicSettings: {
                        ...combatConfig.dynamicSettings,
                        defaultProjectileSpeed: Math.max(60, Number(e.target.value)),
                      },
                    })
                  }
                  className="mt-1 w-full rounded border border-slate-700 bg-surface-800 px-2.5 py-1.5 font-mono text-white"
                />
              </label>
            </div>
          </div>
        )}

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
              <h2 className="text-sm font-bold text-white">
                Monstres, Profils IA &amp; Test Combat (3 Modes)
              </h2>
              <button
                type="button"
                onClick={addNewEnemy}
                className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
              >
                + Nouveau monstre
              </button>
            </div>
            {Object.values(database.enemies).map((enemy) => {
              const ai = getDefaultAIProfile(enemy);
              const updateAi = (patch: Partial<typeof ai>) =>
                onChangeDatabase({
                  ...database,
                  enemies: {
                    ...database.enemies,
                    [enemy.id]: {
                      ...enemy,
                      aiProfile: { ...ai, ...patch },
                    },
                  },
                });

              return (
                <div
                  key={enemy.id}
                  className="flex flex-col gap-3 rounded-lg border border-slate-800 bg-surface-900 p-4 text-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
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
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => startTestCombat(enemy.id, 'turn_based_animated')}
                        className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white shadow hover:bg-rose-500"
                      >
                        ⚔ Tester Animé
                      </button>
                      <button
                        type="button"
                        onClick={() => startTestCombat(enemy.id, 'dynamic_ai')}
                        className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white shadow hover:bg-amber-500"
                      >
                        ⚡ Tester IA Dynamique
                      </button>
                    </div>
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

                  {/* AI Profile (Mode 3 Dynamic Combat) */}
                  <div className="rounded-md border border-amber-500/25 bg-surface-950/60 p-2.5">
                    <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300">
                      Profil IA (Mode 3 — Combat Dynamique)
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
                      <label className="text-[10px] text-slate-400 sm:col-span-2">
                        Comportement
                        <select
                          value={ai.behavior}
                          onChange={(e) =>
                            updateAi({ behavior: e.target.value as AIBehaviorKind })
                          }
                          className="mt-0.5 w-full rounded border border-slate-700 bg-surface-800 px-1.5 py-1 text-xs text-white"
                        >
                          <option value="melee">Mêlée (Poursuite + Frappe)</option>
                          <option value="ranged">Distance (Kiting + Projectiles)</option>
                          <option value="hybrid">Hybride (Mêlée + Distance)</option>
                        </select>
                      </label>
                      <label className="text-[10px] text-slate-400">
                        Vitesse
                        <input
                          type="number"
                          min={10}
                          max={300}
                          value={ai.moveSpeed}
                          onChange={(e) => updateAi({ moveSpeed: Math.max(10, Number(e.target.value)) })}
                          className="mt-0.5 w-full rounded border border-slate-700 bg-surface-800 px-1.5 py-1 font-mono text-white"
                        />
                      </label>
                      <label className="text-[10px] text-slate-400">
                        Portée dist.
                        <input
                          type="number"
                          min={40}
                          max={400}
                          value={ai.preferredRange}
                          onChange={(e) =>
                            updateAi({ preferredRange: Math.max(40, Number(e.target.value)) })
                          }
                          className="mt-0.5 w-full rounded border border-slate-700 bg-surface-800 px-1.5 py-1 font-mono text-white"
                        />
                      </label>
                      <label className="text-[10px] text-slate-400">
                        Fuite (Kite)
                        <input
                          type="number"
                          min={20}
                          max={300}
                          value={ai.retreatRange}
                          onChange={(e) =>
                            updateAi({ retreatRange: Math.max(20, Number(e.target.value)) })
                          }
                          className="mt-0.5 w-full rounded border border-slate-700 bg-surface-800 px-1.5 py-1 font-mono text-white"
                        />
                      </label>
                      <label className="text-[10px] text-slate-400">
                        Cooldown ms
                        <input
                          type="number"
                          min={200}
                          max={5000}
                          step={50}
                          value={ai.attackCooldownMs}
                          onChange={(e) =>
                            updateAi({ attackCooldownMs: Math.max(200, Number(e.target.value)) })
                          }
                          className="mt-0.5 w-full rounded border border-slate-700 bg-surface-800 px-1.5 py-1 font-mono text-white"
                        />
                      </label>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {testBattle && (
        <CombatOverlay
          enemyId={testBattle.enemyId}
          database={database}
          inventory={testBattle.inventory}
          initialMode={testBattle.mode}
          onFinish={() => setTestBattle(null)}
        />
      )}
    </div>
  );
}
