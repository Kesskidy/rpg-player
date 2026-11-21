import { useState } from 'react';
import type { RpgDatabase, StatusEffectKind } from '@rpg-player/core-types';
import type { CombatSnapshot, InventorySystem, TurnBasedCombatEngine } from '@rpg-player/rpg-engine';

interface CombatOverlayProps {
  combat: TurnBasedCombatEngine;
  database: RpgDatabase;
  inventory: InventorySystem;
  onFinish: (finalSnapshot: CombatSnapshot) => void;
}

const STATUS_LABELS: Record<StatusEffectKind, string> = {
  burn: 'Brûlure',
  poison: 'Poison',
  shield: 'Bouclier',
  stun: 'Étourdi',
};

function StatBar({
  label,
  current,
  max,
  colorClass,
}: {
  label: string;
  current: number;
  max: number;
  colorClass: string;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (current / max) * 100)) : 0;
  return (
    <div>
      <div className="mb-0.5 flex justify-between font-mono text-[11px] text-slate-300">
        <span>{label}</span>
        <span>
          {current}/{max}
        </span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-800">
        <div
          className={`h-full transition-all duration-200 ${colorClass}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function CombatOverlay({
  combat,
  database,
  inventory,
  onFinish,
}: CombatOverlayProps) {
  const [snap, setSnap] = useState<CombatSnapshot>(() => combat.getSnapshot());
  const [subMenu, setSubMenu] = useState<'main' | 'skills' | 'items'>('main');

  const consumables = inventory
    .getSlots()
    .filter((entry) => database.items[entry.itemId]?.category === 'consumable');

  const isFinished = snap.phase !== 'player_turn';

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="flex w-full max-w-2xl flex-col overflow-hidden rounded-xl border-2 border-rose-500/60 bg-surface-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 bg-rose-950/30 px-4 py-2.5">
          <span className="text-xs font-bold uppercase tracking-wider text-rose-200">
            ⚔ Combat Tour par Tour — Tour {snap.turn}
          </span>
          <span className="font-mono text-[11px] text-slate-400">
            {snap.phase === 'player_turn'
              ? 'Votre tour'
              : snap.phase === 'victory'
                ? 'Victoire !'
                : snap.phase === 'defeat'
                  ? 'Défaite...'
                  : 'Fuite'}
          </span>
        </div>

        {/* Combatants */}
        <div className="grid grid-cols-2 gap-4 border-b border-slate-800 p-4">
          {/* Hero */}
          <div className="space-y-2 rounded-lg border border-indigo-500/40 bg-surface-950/70 p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-indigo-200">{snap.hero.name}</span>
              <span className="font-mono text-[10px] text-slate-400">
                ATK {snap.hero.stats.atk} · DEF {snap.hero.stats.def}
              </span>
            </div>
            <StatBar label="PV" current={snap.hero.hp} max={snap.hero.stats.maxHp} colorClass="bg-emerald-500" />
            <StatBar label="PM" current={snap.hero.mp} max={snap.hero.stats.maxMp} colorClass="bg-sky-500" />
            {snap.hero.statuses.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {snap.hero.statuses.map((st) => (
                  <span
                    key={st.kind}
                    className="rounded bg-indigo-500/20 px-1.5 py-0.5 text-[10px] text-indigo-200"
                  >
                    {STATUS_LABELS[st.kind]} ({st.turnsRemaining}t)
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Enemy */}
          <div className="space-y-2 rounded-lg border border-rose-500/40 bg-surface-950/70 p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-rose-200">{snap.enemy.name}</span>
              <span className="font-mono text-[10px] text-slate-400">
                ATK {snap.enemy.stats.atk} · DEF {snap.enemy.stats.def}
              </span>
            </div>
            <StatBar label="PV" current={snap.enemy.hp} max={snap.enemy.stats.maxHp} colorClass="bg-rose-500" />
            <StatBar label="PM" current={snap.enemy.mp} max={snap.enemy.stats.maxMp} colorClass="bg-purple-500" />
            {snap.enemy.statuses.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {snap.enemy.statuses.map((st) => (
                  <span
                    key={st.kind}
                    className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-200"
                  >
                    {STATUS_LABELS[st.kind]} ({st.turnsRemaining}t)
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Combat Log */}
        <div className="h-32 space-y-1 overflow-y-auto border-b border-slate-800 bg-surface-950/80 px-4 py-2.5 font-mono text-[11px] text-slate-300">
          {snap.log.slice(-8).map((line, i) => (
            <div key={i}>▸ {line}</div>
          ))}
        </div>

        {/* Actions */}
        <div className="p-4">
          {isFinished ? (
            <div className="flex items-center justify-between">
              <div className="text-xs text-slate-200">
                {snap.phase === 'victory' && (
                  <span className="font-semibold text-emerald-300">
                    Récompenses : {snap.rewardSummary}
                  </span>
                )}
                {snap.phase === 'defeat' && (
                  <span className="font-semibold text-rose-300">
                    Vous êtes vaincu. Vous repartez avec 50% de vos PV.
                  </span>
                )}
                {snap.phase === 'fled' && (
                  <span className="text-amber-200">Vous avez fui le combat.</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => onFinish(snap)}
                className="rounded-md bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500"
              >
                Retourner à la carte
              </button>
            </div>
          ) : subMenu === 'main' ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              <button
                type="button"
                onClick={() => setSnap(combat.playerAttack())}
                className="rounded-md bg-rose-600 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-500"
              >
                Attaquer
              </button>
              <button
                type="button"
                onClick={() => setSubMenu('skills')}
                className="rounded-md bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-500"
              >
                Compétences
              </button>
              <button
                type="button"
                onClick={() => setSubMenu('items')}
                className="rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500"
              >
                Objets ({consumables.length})
              </button>
              <button
                type="button"
                onClick={() => setSnap(combat.playerDefend())}
                className="rounded-md bg-surface-700 px-3 py-2 text-xs font-semibold text-slate-100 hover:bg-surface-600"
              >
                Défendre
              </button>
              <button
                type="button"
                onClick={() => setSnap(combat.playerFlee())}
                className="rounded-md border border-slate-700 bg-surface-800 px-3 py-2 text-xs text-slate-300 hover:bg-surface-700"
              >
                Fuir
              </button>
            </div>
          ) : subMenu === 'skills' ? (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                {snap.heroSkillIds.map((skillId) => {
                  const skill = database.skills[skillId];
                  if (!skill) return null;
                  const canAfford = snap.hero.mp >= skill.mpCost;
                  return (
                    <button
                      key={skill.id}
                      type="button"
                      disabled={!canAfford}
                      onClick={() => {
                        setSnap(combat.playerUseSkill(skill.id));
                        setSubMenu('main');
                      }}
                      className="flex flex-col rounded-md border border-slate-700 bg-surface-800 px-3 py-2 text-left text-xs hover:border-indigo-400 disabled:opacity-40"
                    >
                      <div className="flex items-center justify-between font-semibold text-white">
                        <span>{skill.name}</span>
                        <span className="font-mono text-[10px] text-sky-300">
                          {skill.mpCost} PM
                        </span>
                      </div>
                      <span className="mt-0.5 text-[10px] text-slate-400">{skill.description}</span>
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => setSubMenu('main')}
                className="text-xs text-slate-400 hover:text-white"
              >
                ← Retour
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {consumables.length === 0 ? (
                <p className="text-xs italic text-slate-500">Aucun consommable disponible.</p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {consumables.map((entry, idx) => {
                    const item = database.items[entry.itemId];
                    if (!item) return null;
                    return (
                      <button
                        key={`${entry.itemId}_${idx}`}
                        type="button"
                        onClick={() => {
                          setSnap(combat.playerUseItem(item.id));
                          setSubMenu('main');
                        }}
                        className="flex items-center justify-between rounded-md border border-slate-700 bg-surface-800 px-3 py-2 text-left text-xs hover:border-emerald-400"
                      >
                        <div>
                          <div className="font-semibold text-white">
                            {item.name} ×{entry.quantity}
                          </div>
                          <div className="text-[10px] text-slate-400">{item.description}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
              <button
                type="button"
                onClick={() => setSubMenu('main')}
                className="text-xs text-slate-400 hover:text-white"
              >
                ← Retour
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
