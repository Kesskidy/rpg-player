import { useState } from 'react';
import type {
  CharacterSheetDef,
  EquipmentSlot,
  ProjectManifest,
  RpgDatabase,
} from '@rpg-player/core-types';

interface CharacterSheetsPanelProps {
  database: RpgDatabase;
  project: ProjectManifest | null;
  onChangeDatabase: (next: RpgDatabase) => void;
  onNotify: (msg: string) => void;
}

const ROLE_LABELS: Record<CharacterSheetDef['role'], string> = {
  hero: 'Héros jouable',
  companion: 'Compagnon',
  npc: 'PNJ majeur',
  player_template: 'Modèle Joueur (JDR/VTT)',
};

function triggerJsonDownload(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function CharacterSheetsPanel({
  database,
  project,
  onChangeDatabase,
  onNotify,
}: CharacterSheetsPanelProps) {
  const sheets = database.characterSheets ?? {};
  const sheetList = Object.values(sheets);
  const [selectedId, setSelectedId] = useState<string>(() => sheetList[0]?.id ?? '');
  const [itemToAdd, setItemToAdd] = useState<string>(
    () => Object.keys(database.items)[0] ?? 'potion_soin',
  );

  const activeSheet = sheets[selectedId] ?? sheetList[0] ?? null;
  const spriteAssets = project
    ? Object.values(project.assets).filter((a) => a.type === 'sprite')
    : [];
  const equipmentItemsBySlot = (slot: EquipmentSlot) =>
    Object.values(database.items).filter(
      (item) => item.category === 'equipment' && item.slot === slot,
    );

  function updateSheet(next: CharacterSheetDef) {
    onChangeDatabase({
      ...database,
      characterSheets: {
        ...sheets,
        [next.id]: next,
      },
    });
  }

  function createSheet() {
    const id = `sheet_${Date.now().toString(36)}`;
    const created: CharacterSheetDef = {
      id,
      name: 'Nouvel Aventurier',
      characterClass: 'Rôdeur',
      role: 'player_template',
      level: 1,
      spriteAssetId: null,
      stats: { maxHp: 75, maxMp: 25, atk: 12, def: 6 },
      attributes: { str: 12, dex: 14, int: 10, cha: 11 },
      skillIds: Object.keys(database.skills).slice(0, 1),
      equipment: {},
      inventory: [{ itemId: 'potion_soin', quantity: 2 }],
      gold: 30,
      bio: 'Histoire, origines et motivations du personnage...',
      notes: '',
    };
    onChangeDatabase({
      ...database,
      characterSheets: { ...sheets, [id]: created },
    });
    setSelectedId(id);
    onNotify(`Fiche personnage « ${created.name} » créée.`);
  }

  function duplicateSheet(src: CharacterSheetDef) {
    const id = `sheet_${Date.now().toString(36)}`;
    const copy: CharacterSheetDef = {
      ...src,
      id,
      name: `${src.name} (Copie)`,
      stats: { ...src.stats },
      attributes: { ...src.attributes },
      skillIds: [...src.skillIds],
      equipment: { ...src.equipment },
      inventory: src.inventory.map((e) => ({ ...e })),
    };
    onChangeDatabase({
      ...database,
      characterSheets: { ...sheets, [id]: copy },
    });
    setSelectedId(id);
    onNotify(`Fiche « ${copy.name} » dupliquée.`);
  }

  function deleteSheet(id: string) {
    const next = { ...sheets };
    delete next[id];
    onChangeDatabase({
      ...database,
      characterSheets: next,
    });
    const remaining = Object.keys(next);
    setSelectedId(remaining[0] ?? '');
  }

  function applyAsActiveHero(sheet: CharacterSheetDef) {
    onChangeDatabase({
      ...database,
      hero: {
        ...database.hero,
        name: sheet.name,
        stats: { ...sheet.stats },
        skillIds: [...sheet.skillIds],
        startingItems: sheet.inventory.map((e) => ({ ...e })),
      },
    });
    onNotify(`« ${sheet.name} » est maintenant le Héros actif du jeu RPG.`);
  }

  function toggleSkill(sheet: CharacterSheetDef, skillId: string) {
    const has = sheet.skillIds.includes(skillId);
    const nextSkillIds = has
      ? sheet.skillIds.filter((id) => id !== skillId)
      : [...sheet.skillIds, skillId];
    updateSheet({ ...sheet, skillIds: nextSkillIds });
  }

  function addInventoryItem(sheet: CharacterSheetDef) {
    if (!itemToAdd) return;
    const nextInv = sheet.inventory.map((e) => ({ ...e }));
    const existing = nextInv.find((e) => e.itemId === itemToAdd);
    if (existing) existing.quantity += 1;
    else nextInv.push({ itemId: itemToAdd, quantity: 1 });
    updateSheet({ ...sheet, inventory: nextInv });
  }

  function removeInventoryItem(sheet: CharacterSheetDef, idx: number) {
    const nextInv = sheet.inventory.map((e) => ({ ...e }));
    const entry = nextInv[idx];
    if (!entry) return;
    if (entry.quantity > 1) entry.quantity -= 1;
    else nextInv.splice(idx, 1);
    updateSheet({ ...sheet, inventory: nextInv });
  }

  return (
    <div className="mx-auto grid max-w-5xl grid-cols-1 gap-4 lg:grid-cols-12">
      {/* Left column: List of character sheets */}
      <div className="space-y-2 rounded-xl border border-slate-800 bg-surface-900 p-3 lg:col-span-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-indigo-300">
            Fiches Personnages ({sheetList.length})
          </h2>
          <button
            type="button"
            onClick={createSheet}
            className="rounded bg-indigo-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-indigo-500"
          >
            + Nouvelle fiche
          </button>
        </div>

        {sheetList.length === 0 ? (
          <p className="rounded border border-dashed border-slate-700 p-4 text-center text-xs text-slate-500">
            Aucune fiche personnage. Créez-en une pour vos héros, PNJ ou modèles de joueurs JDR.
          </p>
        ) : (
          <div className="space-y-1.5">
            {sheetList.map((sheet) => {
              const selected = activeSheet?.id === sheet.id;
              return (
                <button
                  key={sheet.id}
                  type="button"
                  onClick={() => setSelectedId(sheet.id)}
                  className={`flex w-full flex-col rounded-lg border px-3 py-2 text-left transition ${
                    selected
                      ? 'border-indigo-400 bg-indigo-950/50 text-white'
                      : 'border-slate-800 bg-surface-950/60 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-bold">{sheet.name}</span>
                    <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-amber-300">
                      Niv. {sheet.level}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between text-[10px] text-slate-400">
                    <span>
                      {sheet.characterClass} · {ROLE_LABELS[sheet.role]}
                    </span>
                    <span className="font-mono text-emerald-300">
                      {sheet.stats.maxHp} PV
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Right column: Full character sheet editor */}
      <div className="rounded-xl border border-slate-800 bg-surface-900 p-4 lg:col-span-8">
        {!activeSheet ? (
          <div className="flex h-64 items-center justify-center text-xs text-slate-500">
            Sélectionnez ou créez une fiche personnage à gauche.
          </div>
        ) : (
          <div className="space-y-4 text-xs">
            {/* Sheet Header & Actions */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div>
                <div className="font-mono text-[10px] text-slate-500">{activeSheet.id}</div>
                <h3 className="text-base font-bold text-white">
                  {activeSheet.name}{' '}
                  <span className="text-xs font-normal text-indigo-300">
                    — {activeSheet.characterClass} (Niv. {activeSheet.level})
                  </span>
                </h3>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => applyAsActiveHero(activeSheet)}
                  className="rounded bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-500"
                >
                  ★ Appliquer comme Héros actif
                </button>
                <button
                  type="button"
                  onClick={() => duplicateSheet(activeSheet)}
                  className="rounded bg-surface-800 px-2.5 py-1 text-[11px] text-slate-200 hover:bg-surface-700"
                >
                  Dupliquer
                </button>
                <button
                  type="button"
                  onClick={() => triggerJsonDownload(`${activeSheet.id}.sheet.json`, activeSheet)}
                  className="rounded bg-surface-800 px-2.5 py-1 text-[11px] text-cyan-300 hover:bg-surface-700"
                >
                  Exporter JSON
                </button>
                <button
                  type="button"
                  onClick={() => deleteSheet(activeSheet.id)}
                  className="rounded bg-rose-950/70 px-2.5 py-1 text-[11px] text-rose-200 hover:bg-rose-800"
                >
                  Supprimer
                </button>
              </div>
            </div>

            {/* Identity */}
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-4">
              <label className="text-slate-400 sm:col-span-2">
                Nom du personnage
                <input
                  type="text"
                  value={activeSheet.name}
                  onChange={(e) => updateSheet({ ...activeSheet, name: e.target.value })}
                  className="mt-0.5 w-full rounded border border-slate-700 bg-surface-800 px-2.5 py-1.5 text-white"
                />
              </label>
              <label className="text-slate-400">
                Classe / Archétype
                <input
                  type="text"
                  value={activeSheet.characterClass}
                  onChange={(e) =>
                    updateSheet({ ...activeSheet, characterClass: e.target.value })
                  }
                  className="mt-0.5 w-full rounded border border-slate-700 bg-surface-800 px-2.5 py-1.5 text-white"
                />
              </label>
              <label className="text-slate-400">
                Niveau
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={activeSheet.level}
                  onChange={(e) =>
                    updateSheet({
                      ...activeSheet,
                      level: Math.max(1, Number(e.target.value)),
                    })
                  }
                  className="mt-0.5 w-full rounded border border-slate-700 bg-surface-800 px-2.5 py-1.5 font-mono text-white"
                />
              </label>
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              <label className="text-slate-400">
                Rôle
                <select
                  value={activeSheet.role}
                  onChange={(e) =>
                    updateSheet({
                      ...activeSheet,
                      role: e.target.value as CharacterSheetDef['role'],
                    })
                  }
                  className="mt-0.5 w-full rounded border border-slate-700 bg-surface-800 px-2 py-1.5 text-white"
                >
                  <option value="hero">Héros jouable</option>
                  <option value="companion">Compagnon</option>
                  <option value="npc">PNJ majeur</option>
                  <option value="player_template">Modèle Joueur (JDR/VTT)</option>
                </select>
              </label>
              <label className="text-slate-400">
                Sprite / Portrait (Phase 1)
                <select
                  value={activeSheet.spriteAssetId ?? ''}
                  onChange={(e) =>
                    updateSheet({ ...activeSheet, spriteAssetId: e.target.value || null })
                  }
                  className="mt-0.5 w-full rounded border border-slate-700 bg-surface-800 px-2 py-1.5 text-white"
                >
                  <option value="">(Aucun sprite lié)</option>
                  {spriteAssets.map((sp) => (
                    <option key={sp.id} value={sp.id}>
                      {sp.name} ({sp.id})
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-slate-400">
                Pièces d’or de départ
                <input
                  type="number"
                  min={0}
                  value={activeSheet.gold}
                  onChange={(e) =>
                    updateSheet({ ...activeSheet, gold: Math.max(0, Number(e.target.value)) })
                  }
                  className="mt-0.5 w-full rounded border border-slate-700 bg-surface-800 px-2.5 py-1.5 font-mono text-amber-200"
                />
              </label>
            </div>

            {/* Combat Stats & JDR Attributes */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-slate-800 bg-surface-950/60 p-3">
                <h4 className="mb-2 text-[11px] font-semibold uppercase text-emerald-300">
                  Statistiques RPG
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      ['maxHp', 'PV Max'],
                      ['maxMp', 'PM Max'],
                      ['atk', 'Attaque (ATK)'],
                      ['def', 'Défense (DEF)'],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="text-[10px] text-slate-400">
                      {label}
                      <input
                        type="number"
                        min={0}
                        value={activeSheet.stats[key]}
                        onChange={(e) =>
                          updateSheet({
                            ...activeSheet,
                            stats: {
                              ...activeSheet.stats,
                              [key]: Math.max(0, Number(e.target.value)),
                            },
                          })
                        }
                        className="mt-0.5 w-full rounded border border-slate-700 bg-surface-800 px-2 py-1 font-mono text-xs text-white"
                      />
                    </label>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-slate-800 bg-surface-950/60 p-3">
                <h4 className="mb-2 text-[11px] font-semibold uppercase text-amber-300">
                  Attributs JDR (Jets de dés)
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      ['str', 'Force (FOR)'],
                      ['dex', 'Dextérité (DEX)'],
                      ['int', 'Intelligence (INT)'],
                      ['cha', 'Charisme (CHA)'],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="text-[10px] text-slate-400">
                      {label}
                      <input
                        type="number"
                        min={1}
                        max={30}
                        value={activeSheet.attributes[key]}
                        onChange={(e) =>
                          updateSheet({
                            ...activeSheet,
                            attributes: {
                              ...activeSheet.attributes,
                              [key]: Math.max(1, Number(e.target.value)),
                            },
                          })
                        }
                        className="mt-0.5 w-full rounded border border-slate-700 bg-surface-800 px-2 py-1 font-mono text-xs text-white"
                      />
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* Equipment Slots */}
            <div className="rounded-lg border border-slate-800 bg-surface-950/60 p-3">
              <h4 className="mb-2 text-[11px] font-semibold uppercase text-indigo-300">
                Équipement équipé
              </h4>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {(
                  [
                    ['weapon', 'Arme'],
                    ['armor', 'Armure'],
                    ['accessory', 'Accessoire'],
                  ] as const
                ).map(([slot, label]) => (
                  <label key={slot} className="text-[10px] text-slate-400">
                    {label}
                    <select
                      value={activeSheet.equipment[slot] ?? ''}
                      onChange={(e) =>
                        updateSheet({
                          ...activeSheet,
                          equipment: {
                            ...activeSheet.equipment,
                            [slot]: e.target.value || undefined,
                          },
                        })
                      }
                      className="mt-0.5 w-full rounded border border-slate-700 bg-surface-800 px-2 py-1 text-xs text-white"
                    >
                      <option value="">(Vide)</option>
                      {equipmentItemsBySlot(slot).map((it) => (
                        <option key={it.id} value={it.id}>
                          {it.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </div>

            {/* Skills & Starting Inventory */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-slate-800 bg-surface-950/60 p-3">
                <h4 className="mb-2 text-[11px] font-semibold uppercase text-sky-300">
                  Compétences &amp; Sorts ({activeSheet.skillIds.length})
                </h4>
                <div className="space-y-1">
                  {Object.values(database.skills).map((sk) => {
                    const checked = activeSheet.skillIds.includes(sk.id);
                    return (
                      <label
                        key={sk.id}
                        className="flex cursor-pointer items-center justify-between rounded bg-surface-800/60 px-2 py-1 hover:bg-surface-800"
                      >
                        <span className="flex items-center gap-2 text-slate-200">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleSkill(activeSheet, sk.id)}
                            className="accent-indigo-500"
                          />
                          {sk.name}
                        </span>
                        <span className="font-mono text-[10px] text-sky-300">
                          {sk.mpCost} PM
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-lg border border-slate-800 bg-surface-950/60 p-3">
                <h4 className="mb-2 text-[11px] font-semibold uppercase text-amber-200">
                  Inventaire de départ ({activeSheet.inventory.length})
                </h4>
                <div className="mb-2 flex gap-1">
                  <select
                    value={itemToAdd}
                    onChange={(e) => setItemToAdd(e.target.value)}
                    className="min-w-0 flex-1 rounded border border-slate-700 bg-surface-800 px-2 py-1 text-xs text-white"
                  >
                    {Object.values(database.items).map((it) => (
                      <option key={it.id} value={it.id}>
                        {it.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => addInventoryItem(activeSheet)}
                    className="rounded bg-amber-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-amber-500"
                  >
                    + Ajouter
                  </button>
                </div>
                <div className="space-y-1">
                  {activeSheet.inventory.length === 0 ? (
                    <p className="italic text-slate-500">Aucun objet.</p>
                  ) : (
                    activeSheet.inventory.map((entry, idx) => (
                      <div
                        key={`${entry.itemId}_${idx}`}
                        className="flex items-center justify-between rounded bg-surface-800/70 px-2 py-1"
                      >
                        <span className="text-slate-200">
                          {database.items[entry.itemId]?.name ?? entry.itemId}{' '}
                          <strong className="font-mono text-indigo-300">×{entry.quantity}</strong>
                        </span>
                        <button
                          type="button"
                          onClick={() => removeInventoryItem(activeSheet, idx)}
                          className="rounded px-1.5 text-[10px] text-rose-300 hover:bg-rose-950/60"
                        >
                          −1
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Biography & RP Notes */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block text-slate-400">
                Biographie / Background
                <textarea
                  rows={3}
                  value={activeSheet.bio}
                  onChange={(e) => updateSheet({ ...activeSheet, bio: e.target.value })}
                  className="mt-1 w-full rounded border border-slate-700 bg-surface-800 p-2 text-xs text-white"
                />
              </label>
              <label className="block text-slate-400">
                Notes de MJ / Quêtes personnelles
                <textarea
                  rows={3}
                  value={activeSheet.notes}
                  onChange={(e) => updateSheet({ ...activeSheet, notes: e.target.value })}
                  className="mt-1 w-full rounded border border-slate-700 bg-surface-800 p-2 text-xs text-white"
                />
              </label>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
