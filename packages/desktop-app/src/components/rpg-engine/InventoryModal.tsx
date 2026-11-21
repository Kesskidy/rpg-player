import type {
  EquipmentSlot,
  NarrativeVariableValue,
  RpgDatabase,
} from '@rpg-player/core-types';
import type { InventorySystem } from '@rpg-player/rpg-engine';

interface InventoryModalProps {
  open: boolean;
  database: RpgDatabase;
  inventory: InventorySystem;
  heroHp: number;
  heroMp: number;
  variables: Record<string, NarrativeVariableValue>;
  onUseConsumable: (itemId: string) => void;
  onEquipItem: (itemId: string) => void;
  onUnequipSlot: (slot: EquipmentSlot) => void;
  onClose: () => void;
}

const SLOT_LABELS: Record<EquipmentSlot, string> = {
  weapon: 'Arme',
  armor: 'Armure',
  accessory: 'Accessoire',
};

export function InventoryModal({
  open,
  database,
  inventory,
  heroHp,
  heroMp,
  variables,
  onUseConsumable,
  onEquipItem,
  onUnequipSlot,
  onClose,
}: InventoryModalProps) {
  if (!open) return null;

  const effective = inventory.computeEffectiveStats(database.hero.stats);
  const equipped = inventory.getEquipped();
  const slots = inventory.getSlots();
  const varEntries = Object.entries(variables);

  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-slate-700 bg-surface-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <div>
            <h2 className="text-sm font-bold text-white">
              Inventaire &amp; Fiche — {database.hero.name}
            </h2>
            <p className="text-[11px] text-slate-400">
              Or : <strong className="text-amber-300">{inventory.getGold()}</strong> · Slots :{' '}
              {slots.length}/{inventory.getMaxSlots()} · Poids : {inventory.getTotalWeight()}/
              {inventory.getMaxWeight()} kg
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-surface-800 hover:text-white"
          >
            Fermer (I)
          </button>
        </div>

        <div className="grid flex-1 grid-cols-1 gap-4 overflow-y-auto p-4 md:grid-cols-2">
          {/* Stats & Equipment */}
          <div className="space-y-4">
            <div className="rounded-lg border border-slate-800 bg-surface-950/60 p-3">
              <h3 className="mb-2 text-[11px] font-semibold uppercase text-slate-400">
                Statistiques effectives
              </h3>
              <div className="grid grid-cols-2 gap-2 font-mono text-xs">
                <div className="rounded bg-surface-800/80 px-2.5 py-1.5 text-emerald-300">
                  PV : {heroHp} / {effective.maxHp}
                </div>
                <div className="rounded bg-surface-800/80 px-2.5 py-1.5 text-sky-300">
                  PM : {heroMp} / {effective.maxMp}
                </div>
                <div className="rounded bg-surface-800/80 px-2.5 py-1.5 text-amber-300">
                  ATK : {effective.atk}
                </div>
                <div className="rounded bg-surface-800/80 px-2.5 py-1.5 text-indigo-300">
                  DEF : {effective.def}
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-slate-800 bg-surface-950/60 p-3">
              <h3 className="mb-2 text-[11px] font-semibold uppercase text-slate-400">
                Équipement
              </h3>
              <div className="space-y-1.5">
                {(['weapon', 'armor', 'accessory'] as EquipmentSlot[]).map((slot) => {
                  const eqId = equipped[slot];
                  const def = eqId ? database.items[eqId] : null;
                  return (
                    <div
                      key={slot}
                      className="flex items-center justify-between rounded border border-slate-800 bg-surface-800/60 px-2.5 py-1.5 text-xs"
                    >
                      <div>
                        <span className="text-[10px] uppercase text-slate-500">
                          {SLOT_LABELS[slot]} :{' '}
                        </span>
                        <span className={def ? 'font-medium text-white' : 'italic text-slate-500'}>
                          {def ? def.name : 'Vide'}
                        </span>
                      </div>
                      {def && (
                        <button
                          type="button"
                          onClick={() => onUnequipSlot(slot)}
                          className="rounded bg-surface-700 px-2 py-0.5 text-[10px] text-slate-200 hover:bg-rose-700"
                        >
                          Retirer
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {varEntries.length > 0 && (
              <div className="rounded-lg border border-slate-800 bg-surface-950/60 p-3">
                <h3 className="mb-1.5 text-[11px] font-semibold uppercase text-slate-400">
                  Variables narratives
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {varEntries.map(([k, v]) => (
                    <span
                      key={k}
                      className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[10px] text-indigo-200"
                    >
                      {k}={String(v)}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Bag slots */}
          <div className="rounded-lg border border-slate-800 bg-surface-950/60 p-3">
            <h3 className="mb-2 text-[11px] font-semibold uppercase text-slate-400">
              Sac ({slots.length})
            </h3>
            {slots.length === 0 ? (
              <p className="text-xs italic text-slate-500">Votre sac est vide.</p>
            ) : (
              <div className="space-y-1.5">
                {slots.map((entry, idx) => {
                  const def = database.items[entry.itemId];
                  if (!def) return null;
                  return (
                    <div
                      key={`${entry.itemId}_${idx}`}
                      className="flex items-center justify-between gap-2 rounded border border-slate-800 bg-surface-800/70 px-2.5 py-2 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-medium text-white">
                          {def.name}{' '}
                          {entry.quantity > 1 && (
                            <span className="font-mono text-indigo-300">×{entry.quantity}</span>
                          )}
                        </div>
                        <div className="truncate text-[10px] text-slate-400">
                          {def.description} ({def.weight} kg)
                        </div>
                      </div>

                      <div className="shrink-0">
                        {def.category === 'consumable' && (
                          <button
                            type="button"
                            onClick={() => onUseConsumable(def.id)}
                            className="rounded bg-emerald-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-emerald-500"
                          >
                            Utiliser
                          </button>
                        )}
                        {def.category === 'equipment' && (
                          <button
                            type="button"
                            onClick={() => onEquipItem(def.id)}
                            className="rounded bg-indigo-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-indigo-500"
                          >
                            Équiper
                          </button>
                        )}
                        {def.category === 'quest' && (
                          <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-300">
                            Quête
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
