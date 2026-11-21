import { useState } from 'react';
import type {
  RpgDatabase,
  VttCharacterSheet,
  VttRole,
  VttRoomState,
} from '@rpg-player/core-types';

interface VttSheetPanelProps {
  roomState: VttRoomState;
  role: VttRole;
  participantId: string;
  database: RpgDatabase;
  onUpdateSheet: (
    targetParticipantId: string,
    patch: Partial<Omit<VttCharacterSheet, 'participantId'>>,
  ) => void;
}

export function VttSheetPanel({
  roomState,
  role,
  participantId,
  database,
  onUpdateSheet,
}: VttSheetPanelProps) {
  const sheetIds = Object.keys(roomState.sheets);
  const [selectedId, setSelectedId] = useState<string>(
    role === 'player' ? participantId : (sheetIds[0] ?? ''),
  );
  const [itemToGive, setItemToGive] = useState<string>(
    Object.keys(database.items)[0] ?? 'potion_soin',
  );

  const effectiveId =
    role === 'player'
      ? participantId
      : roomState.sheets[selectedId]
        ? selectedId
        : (sheetIds[0] ?? '');

  const sheet = effectiveId ? roomState.sheets[effectiveId] : null;
  const isGm = role === 'gm';
  const dbTemplates = Object.values(database.characterSheets ?? {});
  const [templateId, setTemplateId] = useState<string>(() => dbTemplates[0]?.id ?? '');

  if (!sheet) {
    return (
      <div className="flex flex-1 items-center justify-center p-4 text-center text-xs text-slate-400">
        {isGm
          ? 'En attente qu’un joueur rejoigne la table pour éditer sa fiche en direct.'
          : 'Fiche personnage introuvable.'}
      </div>
    );
  }

  function handleAddItem() {
    if (!sheet || !itemToGive) return;
    const nextInv = sheet.inventory.map((entry) => ({ ...entry }));
    const existing = nextInv.find((entry) => entry.itemId === itemToGive);
    if (existing) {
      existing.quantity += 1;
    } else {
      nextInv.push({ itemId: itemToGive, quantity: 1 });
    }
    onUpdateSheet(sheet.participantId, { inventory: nextInv });
  }

  function handleRemoveItem(index: number) {
    if (!sheet) return;
    const nextInv = sheet.inventory.map((entry) => ({ ...entry }));
    const target = nextInv[index];
    if (!target) return;
    if (target.quantity > 1) {
      target.quantity -= 1;
    } else {
      nextInv.splice(index, 1);
    }
    onUpdateSheet(sheet.participantId, { inventory: nextInv });
  }

  function handleApplyTemplate() {
    if (!sheet || !templateId) return;
    const tpl = database.characterSheets?.[templateId];
    if (!tpl) return;
    const attrsSummary = `FOR ${tpl.attributes.str} · DEX ${tpl.attributes.dex} · INT ${tpl.attributes.int} · CHA ${tpl.attributes.cha}`;
    const noteText = [
      `${tpl.characterClass} (Niv. ${tpl.level}) — ${attrsSummary}`,
      tpl.bio,
      tpl.notes,
    ]
      .filter((s) => s.trim().length > 0)
      .join('\n');

    onUpdateSheet(sheet.participantId, {
      characterName: tpl.name,
      hp: tpl.stats.maxHp,
      maxHp: tpl.stats.maxHp,
      mp: tpl.stats.maxMp,
      maxMp: tpl.stats.maxMp,
      atk: tpl.stats.atk,
      def: tpl.stats.def,
      gold: tpl.gold,
      inventory: tpl.inventory.map((e) => ({ ...e })),
      notes: noteText,
    });
  }

  return (
    <div className="flex flex-1 flex-col space-y-3 overflow-y-auto p-3 text-xs">
      {isGm && (
        <div className="space-y-2">
          <label className="block text-[11px] text-amber-300">
            Édition live MJ — Joueur ciblé
            <select
              value={effectiveId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="mt-1 w-full rounded border border-amber-500/40 bg-surface-800 px-2 py-1.5 text-xs text-white"
            >
              {sheetIds.map((id) => (
                <option key={id} value={id}>
                  {roomState.sheets[id]?.characterName ?? id}
                </option>
              ))}
            </select>
          </label>

          {dbTemplates.length > 0 && (
            <div className="flex gap-1">
              <select
                value={templateId || dbTemplates[0]?.id || ''}
                onChange={(e) => setTemplateId(e.target.value)}
                className="min-w-0 flex-1 rounded border border-indigo-500/40 bg-surface-800 px-1.5 py-1 text-[11px] text-white"
              >
                {dbTemplates.map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>
                    Modèle : {tpl.name} ({tpl.characterClass})
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleApplyTemplate}
                className="rounded bg-indigo-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-indigo-500"
              >
                Appliquer
              </button>
            </div>
          )}
        </div>
      )}

      <div className="rounded-lg border border-slate-800 bg-surface-950/60 p-3 space-y-2.5">
        <div className="flex items-center justify-between">
          <input
            type="text"
            value={sheet.characterName}
            onChange={(e) =>
              onUpdateSheet(sheet.participantId, { characterName: e.target.value })
            }
            className="w-full rounded border border-slate-700 bg-surface-800 px-2 py-1 text-sm font-bold text-white"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="text-[10px] text-emerald-300">
            PV ({sheet.hp}/{sheet.maxHp})
            <input
              type="number"
              disabled={!isGm}
              value={sheet.hp}
              onChange={(e) =>
                onUpdateSheet(sheet.participantId, {
                  hp: Math.max(0, Math.min(sheet.maxHp, Number(e.target.value))),
                })
              }
              className="mt-0.5 w-full rounded border border-slate-700 bg-surface-800 px-2 py-1 font-mono text-xs text-white disabled:opacity-70"
            />
          </label>
          <label className="text-[10px] text-sky-300">
            PM ({sheet.mp}/{sheet.maxMp})
            <input
              type="number"
              disabled={!isGm}
              value={sheet.mp}
              onChange={(e) =>
                onUpdateSheet(sheet.participantId, {
                  mp: Math.max(0, Math.min(sheet.maxMp, Number(e.target.value))),
                })
              }
              className="mt-0.5 w-full rounded border border-slate-700 bg-surface-800 px-2 py-1 font-mono text-xs text-white disabled:opacity-70"
            />
          </label>
          <label className="text-[10px] text-amber-300">
            ATK
            <input
              type="number"
              disabled={!isGm}
              value={sheet.atk}
              onChange={(e) =>
                onUpdateSheet(sheet.participantId, { atk: Math.max(0, Number(e.target.value)) })
              }
              className="mt-0.5 w-full rounded border border-slate-700 bg-surface-800 px-2 py-1 font-mono text-xs text-white disabled:opacity-70"
            />
          </label>
          <label className="text-[10px] text-indigo-300">
            DEF
            <input
              type="number"
              disabled={!isGm}
              value={sheet.def}
              onChange={(e) =>
                onUpdateSheet(sheet.participantId, { def: Math.max(0, Number(e.target.value)) })
              }
              className="mt-0.5 w-full rounded border border-slate-700 bg-surface-800 px-2 py-1 font-mono text-xs text-white disabled:opacity-70"
            />
          </label>
        </div>

        <label className="block text-[10px] text-amber-200">
          Pièces d’or
          <input
            type="number"
            disabled={!isGm}
            value={sheet.gold}
            onChange={(e) =>
              onUpdateSheet(sheet.participantId, { gold: Math.max(0, Number(e.target.value)) })
            }
            className="mt-0.5 w-full rounded border border-slate-700 bg-surface-800 px-2 py-1 font-mono text-xs text-white disabled:opacity-70"
          />
        </label>
      </div>

      {/* Inventory */}
      <div className="rounded-lg border border-slate-800 bg-surface-950/60 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-[11px] font-semibold uppercase text-slate-400">
            Inventaire ({sheet.inventory.length})
          </h4>
        </div>

        {isGm && (
          <div className="flex gap-1">
            <select
              value={itemToGive}
              onChange={(e) => setItemToGive(e.target.value)}
              className="min-w-0 flex-1 rounded border border-slate-700 bg-surface-800 px-1.5 py-1 text-[11px] text-white"
            >
              {Object.values(database.items).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleAddItem}
              className="rounded bg-amber-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-amber-500"
            >
              + Donner
            </button>
          </div>
        )}

        {sheet.inventory.length === 0 ? (
          <p className="italic text-slate-500">Sac vide.</p>
        ) : (
          <div className="space-y-1">
            {sheet.inventory.map((entry, idx) => {
              const def = database.items[entry.itemId];
              return (
                <div
                  key={`${entry.itemId}_${idx}`}
                  className="flex items-center justify-between rounded bg-surface-800/70 px-2 py-1.5"
                >
                  <span className="truncate text-slate-200">
                    {def?.name ?? entry.itemId}{' '}
                    <strong className="font-mono text-indigo-300">×{entry.quantity}</strong>
                  </span>
                  {isGm && (
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(idx)}
                      className="rounded px-1.5 py-0.5 text-[10px] text-rose-300 hover:bg-rose-950/60"
                    >
                      −1
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* RP Notes */}
      <label className="block text-[11px] text-slate-400">
        Notes de personnage
        <textarea
          rows={3}
          value={sheet.notes}
          onChange={(e) => onUpdateSheet(sheet.participantId, { notes: e.target.value })}
          placeholder="Compétences, background, quêtes en cours..."
          className="mt-1 w-full rounded border border-slate-700 bg-surface-800 p-2 text-xs text-white"
        />
      </label>
    </div>
  );
}
