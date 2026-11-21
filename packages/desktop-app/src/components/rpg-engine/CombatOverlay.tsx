import { useEffect, useState } from 'react';
import type {
  CombatMode,
  RpgDatabase,
  StatusEffectKind,
  TileMapData,
} from '@rpg-player/core-types';
import {
  TurnBasedCombatStrategy,
  type AnimatedTurnState,
  type CombatSnapshot,
  type InventorySystem,
} from '@rpg-player/rpg-engine';
import { DynamicCombatArena } from './DynamicCombatArena';
import { PixelPotionIcon, PixelShieldIcon, PixelSwordIcon } from '../ui/PixelIcons';

export interface CombatOverlayProps {
  enemyId: string;
  database: RpgDatabase;
  inventory: InventorySystem;
  initialMode?: CombatMode;
  initialHeroHp?: number;
  initialHeroMp?: number;
  map?: TileMapData | null;
  onFinish: (finalSnapshot: CombatSnapshot) => void;
}

const STATUS_LABELS: Record<StatusEffectKind, string> = {
  burn: 'Brûlure',
  poison: 'Poison',
  shield: 'Bouclier',
  stun: 'Étourdi',
};

const MODE_OPTIONS: Array<{ id: CombatMode; label: string }> = [
  { id: 'simple', label: '1. Simple' },
  { id: 'turn_based_animated', label: '2. Tour par tour animé' },
  { id: 'dynamic_ai', label: '3. Dynamique IA' },
];

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
  enemyId,
  database,
  inventory,
  initialMode,
  initialHeroHp,
  initialHeroMp,
  map,
  onFinish,
}: CombatOverlayProps) {
  const defaultMode: CombatMode =
    initialMode ?? database.combatConfig?.defaultMode ?? 'turn_based_animated';
  const [activeMode, setActiveMode] = useState<CombatMode>(defaultMode);

  const [strategy, setStrategy] = useState<TurnBasedCombatStrategy>(
    () =>
      new TurnBasedCombatStrategy(
        defaultMode === 'simple' ? 'simple' : 'turn_based_animated',
        database,
        inventory,
        enemyId,
        { initialHeroHp, initialHeroMp },
      ),
  );
  const [turnState, setTurnState] = useState<AnimatedTurnState>(() => strategy.getState());
  const [subMenu, setSubMenu] = useState<'main' | 'skills' | 'items'>('main');

  // Re-initialize turn strategy when switching between Mode 1 and Mode 2
  function handleSwitchMode(nextMode: CombatMode) {
    setActiveMode(nextMode);
    setSubMenu('main');
    if (nextMode === 'simple' || nextMode === 'turn_based_animated') {
      const nextStrat = new TurnBasedCombatStrategy(nextMode, database, inventory, enemyId, {
        initialHeroHp,
        initialHeroMp,
      });
      setStrategy(nextStrat);
      setTurnState(nextStrat.getState());
    }
  }

  // Step Mode 1/2 animations & `hit_frame` triggers via requestAnimationFrame
  useEffect(() => {
    if (activeMode === 'dynamic_ai') return;
    let rafId = 0;
    let lastTime = performance.now();

    function tick(now: number) {
      const dt = Math.min(64, now - lastTime);
      lastTime = now;
      const next = strategy.step(dt);
      setTurnState(next);
      rafId = requestAnimationFrame(tick);
    }

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [strategy, activeMode]);

  const snap = turnState.displayedSnapshot;
  const consumables = inventory
    .getSlots()
    .filter((entry) => database.items[entry.itemId]?.category === 'consumable');

  const isFinished = snap.phase !== 'player_turn';
  const shakeOffset =
    turnState.cameraShakeMs > 0 ? Math.sin(turnState.cameraShakeMs * 0.15) * 6 : 0;

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/85 p-4">
      <div
        style={{ transform: `translateX(${shakeOffset}px)` }}
        className="pixel-panel flex w-full max-w-2xl flex-col overflow-hidden border-dnd-dragon transition-transform"
      >
        {/* Header + Combat Mode Switcher */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-dnd-border bg-rose-950/50 px-4 py-2">
          <span className="flex items-center gap-2 font-pixel text-xs font-bold uppercase tracking-wider text-dnd-gold">
            <PixelSwordIcon size={16} />
            <span>
              Combat{' '}
              {activeMode === 'dynamic_ai'
                ? 'Dynamique IA'
                : activeMode === 'turn_based_animated'
                  ? `Animé (hit_frame) — Tour ${snap.turn}`
                  : `Minimaliste — Tour ${snap.turn}`}
            </span>
          </span>

          {(database.combatConfig?.allowModeSwitchInPreview ?? true) && (
            <div className="flex items-center gap-1 rounded border border-slate-700 bg-surface-950/80 p-0.5">
              {MODE_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleSwitchMode(opt.id)}
                  className={`rounded px-2 py-0.5 text-[10px] font-semibold transition ${
                    activeMode === opt.id
                      ? 'bg-rose-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Mode 3: Dynamic Real-Time Arena */}
        {activeMode === 'dynamic_ai' ? (
          <div className="p-4">
            <DynamicCombatArena
              enemyId={enemyId}
              database={database}
              inventory={inventory}
              initialHeroHp={initialHeroHp}
              initialHeroMp={initialHeroMp}
              map={map}
              onFinish={onFinish}
            />
          </div>
        ) : (
          <>
            {/* Mode 2 JRPG Animated Stage */}
            {activeMode === 'turn_based_animated' && (
              <div className="relative flex h-36 items-center justify-around overflow-hidden border-b border-slate-800 bg-gradient-to-b from-slate-900 via-indigo-950/40 to-surface-950 px-8">
                {/* Hero Sprite Actor */}
                <div
                  className={`relative flex flex-col items-center transition-transform duration-150 ${
                    turnState.heroVisual === 'attack_melee'
                      ? 'translate-x-12 scale-110'
                      : turnState.heroVisual === 'cast'
                        ? '-translate-y-2 scale-105'
                        : turnState.heroVisual === 'hurt'
                          ? '-translate-x-3 opacity-75'
                          : ''
                  }`}
                >
                  <div className="flex h-16 w-16 items-center justify-center rounded-xl border-2 border-indigo-400 bg-indigo-600/40 text-2xl shadow-lg">
                    🛡️
                  </div>
                  <span className="mt-1 font-mono text-[10px] text-indigo-200">
                    {turnState.heroVisual}
                  </span>

                  {/* Floating numbers on Hero */}
                  {turnState.floatingEvents
                    .filter((f) => f.target === 'hero')
                    .map((f) => (
                      <span
                        key={f.id}
                        className={`pointer-events-none absolute -top-5 animate-bounce font-mono text-sm font-extrabold ${
                          f.kind === 'heal' ? 'text-emerald-300' : 'text-rose-400'
                        }`}
                      >
                        {f.text}
                      </span>
                    ))}

                  {turnState.activeVfx
                    .filter((v) => v.target === 'hero')
                    .map((v) => (
                      <span
                        key={v.id}
                        className="pointer-events-none absolute inset-0 flex items-center justify-center text-3xl animate-ping"
                      >
                        ✨
                      </span>
                    ))}
                </div>

                <div className="font-mono text-[11px] uppercase tracking-widest text-slate-500">
                  {turnState.busy ? '⚡ Animation…' : 'VS'}
                </div>

                {/* Enemy Sprite Actor */}
                <div
                  className={`relative flex flex-col items-center transition-transform duration-150 ${
                    turnState.enemyVisual === 'attack_melee'
                      ? '-translate-x-12 scale-110'
                      : turnState.enemyVisual === 'hurt'
                        ? 'translate-x-3 brightness-150'
                        : turnState.enemyVisual === 'death'
                          ? 'scale-75 opacity-30'
                          : ''
                  }`}
                >
                  <div className="flex h-16 w-16 items-center justify-center rounded-xl border-2 border-rose-400 bg-rose-600/40 text-2xl shadow-lg">
                    👹
                  </div>
                  <span className="mt-1 font-mono text-[10px] text-rose-200">
                    {turnState.enemyVisual}
                  </span>

                  {/* Floating numbers on Enemy */}
                  {turnState.floatingEvents
                    .filter((f) => f.target === 'enemy')
                    .map((f) => (
                      <span
                        key={f.id}
                        className="pointer-events-none absolute -top-5 animate-bounce font-mono text-sm font-extrabold text-amber-300"
                      >
                        {f.text}
                      </span>
                    ))}

                  {/* Hit-Frame Impact VFX Burst */}
                  {turnState.activeVfx
                    .filter((v) => v.target === 'enemy')
                    .map((v) => (
                      <span
                        key={v.id}
                        className="pointer-events-none absolute inset-0 flex items-center justify-center text-3xl animate-ping"
                      >
                        💥
                      </span>
                    ))}
                </div>
              </div>
            )}

            {/* Combatants Stat Bars */}
            <div className="grid grid-cols-2 gap-4 border-b border-slate-800 p-4">
              <div className="space-y-2 rounded-lg border border-indigo-500/40 bg-surface-950/70 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-indigo-200">{snap.hero.name}</span>
                  <span className="font-mono text-[10px] text-slate-400">
                    ATK {snap.hero.stats.atk} · DEF {snap.hero.stats.def}
                  </span>
                </div>
                <StatBar
                  label="PV"
                  current={snap.hero.hp}
                  max={snap.hero.stats.maxHp}
                  colorClass="bg-emerald-500"
                />
                <StatBar
                  label="PM"
                  current={snap.hero.mp}
                  max={snap.hero.stats.maxMp}
                  colorClass="bg-sky-500"
                />
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

              <div className="space-y-2 rounded-lg border border-rose-500/40 bg-surface-950/70 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-rose-200">{snap.enemy.name}</span>
                  <span className="font-mono text-[10px] text-slate-400">
                    ATK {snap.enemy.stats.atk} · DEF {snap.enemy.stats.def}
                  </span>
                </div>
                <StatBar
                  label="PV"
                  current={snap.enemy.hp}
                  max={snap.enemy.stats.maxHp}
                  colorClass="bg-rose-500"
                />
                <StatBar
                  label="PM"
                  current={snap.enemy.mp}
                  max={snap.enemy.stats.maxMp}
                  colorClass="bg-purple-500"
                />
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
            <div className="h-28 space-y-1 overflow-y-auto border-b border-slate-800 bg-surface-950/80 px-4 py-2 font-mono text-[11px] text-slate-300">
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
                    disabled={turnState.busy}
                    onClick={() => setTurnState(strategy.playerAttack())}
                    className="pixel-btn pixel-btn-dragon flex items-center justify-center gap-1 px-2 py-2 text-[11px] font-bold disabled:opacity-40"
                  >
                    <PixelSwordIcon size={13} />
                    <span>Attaquer</span>
                  </button>
                  <button
                    type="button"
                    disabled={turnState.busy}
                    onClick={() => setSubMenu('skills')}
                    className="pixel-btn pixel-btn-arcane px-2 py-2 text-[11px] font-bold disabled:opacity-40"
                  >
                    Sorts
                  </button>
                  <button
                    type="button"
                    disabled={turnState.busy}
                    onClick={() => setSubMenu('items')}
                    className="pixel-btn pixel-btn-emerald flex items-center justify-center gap-1 px-2 py-2 text-[11px] font-bold disabled:opacity-40"
                  >
                    <PixelPotionIcon size={13} />
                    <span>Objets ({consumables.length})</span>
                  </button>
                  <button
                    type="button"
                    disabled={turnState.busy}
                    onClick={() => setTurnState(strategy.playerDefend())}
                    className="pixel-btn pixel-btn-gold flex items-center justify-center gap-1 px-2 py-2 text-[11px] font-bold disabled:opacity-40"
                  >
                    <PixelShieldIcon size={13} />
                    <span>Défendre</span>
                  </button>
                  <button
                    type="button"
                    disabled={turnState.busy}
                    onClick={() => setTurnState(strategy.playerFlee())}
                    className="pixel-btn px-2 py-2 text-[11px] disabled:opacity-40"
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
                      const canAfford = snap.hero.mp >= skill.mpCost && !turnState.busy;
                      return (
                        <button
                          key={skill.id}
                          type="button"
                          disabled={!canAfford}
                          onClick={() => {
                            setTurnState(strategy.playerUseSkill(skill.id));
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
                          <span className="mt-0.5 text-[10px] text-slate-400">
                            {skill.description}
                          </span>
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
                            disabled={turnState.busy}
                            onClick={() => {
                              setTurnState(strategy.playerUseItem(item.id));
                              setSubMenu('main');
                            }}
                            className="flex items-center justify-between rounded-md border border-slate-700 bg-surface-800 px-3 py-2 text-left text-xs hover:border-emerald-400 disabled:opacity-40"
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
          </>
        )}
      </div>
    </div>
  );
}
