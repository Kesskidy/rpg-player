import { useEffect, useRef, useState } from 'react';
import type { RpgDatabase, TileMapData } from '@rpg-player/core-types';
import {
  DynamicCombatEngine,
  type CombatSnapshot,
  type DynamicCombatSnapshot,
  type InventorySystem,
} from '@rpg-player/rpg-engine';

interface DynamicCombatArenaProps {
  enemyId: string;
  database: RpgDatabase;
  inventory: InventorySystem;
  initialHeroHp?: number;
  initialHeroMp?: number;
  map?: TileMapData | null;
  onFinish: (finalSnapshot: CombatSnapshot) => void;
}

function toCombatSnapshot(snap: DynamicCombatSnapshot, heroSkillIds: readonly string[]): CombatSnapshot {
  return {
    phase: snap.phase,
    turn: 1,
    hero: {
      name: snap.hero.name,
      hp: snap.hero.hp,
      mp: snap.hero.mp,
      stats: snap.hero.stats,
      defending: false,
      statuses: [],
    },
    enemy: {
      name: snap.enemy.name,
      hp: snap.enemy.hp,
      mp: snap.enemy.mp,
      stats: snap.enemy.stats,
      defending: false,
      statuses: [],
    },
    enemyId: snap.enemyId,
    heroSkillIds,
    log: snap.log,
    rewardSummary: snap.rewardSummary,
  };
}

export function DynamicCombatArena({
  enemyId,
  database,
  inventory,
  initialHeroHp,
  initialHeroMp,
  map,
  onFinish,
}: DynamicCombatArenaProps) {
  const [engine] = useState(
    () =>
      new DynamicCombatEngine(database, inventory, enemyId, {
        initialHeroHp,
        initialHeroMp,
        arenaWidth: 560,
        arenaHeight: 280,
        map: map ?? null,
      }),
  );
  const [snap, setSnap] = useState<DynamicCombatSnapshot>(() => engine.getSnapshot());
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Keyboard controls: ZQSD / WASD / Arrows to move, Space to melee attack, 1-3 for skills
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }
      const k = e.key.toLowerCase();
      if (k === 'arrowup' || k === 'z' || k === 'w') {
        e.preventDefault();
        engine.setInput({ up: true });
      } else if (k === 'arrowdown' || k === 's') {
        e.preventDefault();
        engine.setInput({ down: true });
      } else if (k === 'arrowleft' || k === 'q' || k === 'a') {
        e.preventDefault();
        engine.setInput({ left: true });
      } else if (k === 'arrowright' || k === 'd') {
        e.preventDefault();
        engine.setInput({ right: true });
      } else if (e.code === 'Space') {
        e.preventDefault();
        engine.heroMeleeAttack();
      } else if (k === '1' || k === '2' || k === '3') {
        const idx = Number(k) - 1;
        const skillId = database.hero.skillIds[idx];
        if (skillId) {
          engine.heroCastSkill(skillId);
        }
      }
    }

    function handleKeyUp(e: KeyboardEvent) {
      const k = e.key.toLowerCase();
      if (k === 'arrowup' || k === 'z' || k === 'w') engine.setInput({ up: false });
      else if (k === 'arrowdown' || k === 's') engine.setInput({ down: false });
      else if (k === 'arrowleft' || k === 'q' || k === 'a') engine.setInput({ left: false });
      else if (k === 'arrowright' || k === 'd') engine.setInput({ right: false });
    }

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [engine, database.hero.skillIds]);

  // Real-time simulation + HTML5 Canvas arena renderer
  useEffect(() => {
    let rafId = 0;
    let lastTime = performance.now();

    function drawArena(state: DynamicCombatSnapshot) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const w = state.arenaWidth;
      const h = state.arenaHeight;

      // Arena floor grid
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, w, h);

      ctx.strokeStyle = 'rgba(148, 163, 184, 0.1)';
      ctx.lineWidth = 1;
      for (let gx = 0; gx <= w; gx += 32) {
        ctx.beginPath();
        ctx.moveTo(gx + 0.5, 0);
        ctx.lineTo(gx + 0.5, h);
        ctx.stroke();
      }
      for (let gy = 0; gy <= h; gy += 32) {
        ctx.beginPath();
        ctx.moveTo(0, gy + 0.5);
        ctx.lineTo(w, gy + 0.5);
        ctx.stroke();
      }

      // Draw optional map collision obstacles inside arena bounds
      if (map) {
        ctx.fillStyle = 'rgba(244, 63, 94, 0.22)';
        ctx.strokeStyle = 'rgba(244, 63, 94, 0.55)';
        const ts = map.tileSize;
        for (let ty = 0; ty < map.height; ty += 1) {
          if (ty * ts > h) break;
          for (let tx = 0; tx < map.width; tx += 1) {
            if (tx * ts > w) break;
            if ((map.collisionLayer.cells[ty * map.width + tx] ?? 0) !== 0) {
              ctx.fillRect(tx * ts, ty * ts, ts, ts);
              ctx.strokeRect(tx * ts + 0.5, ty * ts + 0.5, ts - 1, ts - 1);
            }
          }
        }
      }

      // AI Preferred/Aggro range indicator (subtle ring around enemy)
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(251, 113, 133, 0.25)';
      ctx.beginPath();
      ctx.arc(state.enemy.x, state.enemy.y, state.aiProfile.attackRange, 0, Math.PI * 2);
      ctx.stroke();
      if (state.aiProfile.behavior !== 'melee') {
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.22)';
        ctx.beginPath();
        ctx.arc(state.enemy.x, state.enemy.y, state.aiProfile.preferredRange, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();

      // Active VFX bursts (slash arcs)
      for (const vfx of state.activeVfx) {
        const alpha = Math.max(0.15, Math.min(1, vfx.remainingMs / 240));
        ctx.save();
        ctx.fillStyle = `rgba(56, 189, 248, ${alpha * 0.45})`;
        ctx.strokeStyle = `rgba(186, 230, 253, ${alpha})`;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(vfx.x, vfx.y, 18 + (1 - alpha) * 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }

      // Draw Actor Helper
      const drawActor = (
        actor: DynamicCombatSnapshot['hero'],
        baseColor: string,
        borderColor: string,
      ) => {
        ctx.save();
        const isHurt = actor.hurtTimerMs > 0;
        const isAttacking = actor.attackAnimMs > 0;

        // Ground shadow
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.beginPath();
        ctx.ellipse(actor.x, actor.y + 13, 14, 6, 0, 0, Math.PI * 2);
        ctx.fill();

        // Body
        ctx.fillStyle = isHurt ? '#ffffff' : baseColor;
        ctx.strokeStyle = isAttacking ? '#fde047' : borderColor;
        ctx.lineWidth = isAttacking ? 3 : 2;
        ctx.beginPath();
        ctx.arc(actor.x, actor.y, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Facing pointer
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(actor.x, actor.y);
        ctx.lineTo(actor.x + actor.facingX * 18, actor.y + actor.facingY * 18);
        ctx.stroke();

        // Label
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#e2e8f0';
        ctx.fillText(actor.name, actor.x, actor.y - 20);
        ctx.restore();
      };

      drawActor(state.hero, '#4f46e5', '#a5b4fc');
      drawActor(state.enemy, '#be123c', '#fda4af');

      // Projectiles
      for (const proj of state.projectiles) {
        ctx.save();
        ctx.fillStyle = proj.color;
        ctx.shadowColor = proj.color;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(proj.x, proj.y, proj.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Floating damage/heal numbers
      for (const flt of state.floatingEvents) {
        const target = flt.target === 'hero' ? state.hero : state.enemy;
        const progress = 1 - Math.max(0, Math.min(1, flt.remainingMs / 800));
        ctx.save();
        ctx.font = 'bold 13px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = flt.kind === 'heal' ? '#34d399' : '#fb7185';
        ctx.fillText(flt.text, target.x, target.y - 28 - progress * 22);
        ctx.restore();
      }
    }

    function tick(now: number) {
      const dt = Math.min(50, now - lastTime);
      lastTime = now;
      const next = engine.step(dt);
      setSnap(next);
      drawArena(next);
      rafId = requestAnimationFrame(tick);
    }

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [engine, map]);

  const consumables = inventory
    .getSlots()
    .filter((entry) => database.items[entry.itemId]?.category === 'consumable');

  const isFinished = snap.phase !== 'player_turn';

  return (
    <div className="space-y-3">
      {/* Top HUD */}
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="rounded-lg border border-indigo-500/40 bg-surface-950/70 p-2.5">
          <div className="flex items-center justify-between">
            <span className="font-bold text-indigo-200">{snap.hero.name}</span>
            <span className="font-mono text-[10px] text-slate-400">
              PV {snap.hero.hp}/{snap.hero.stats.maxHp} · PM {snap.hero.mp}/{snap.hero.stats.maxMp}
            </span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full bg-emerald-500 transition-all"
              style={{
                width: `${Math.max(0, (snap.hero.hp / Math.max(1, snap.hero.stats.maxHp)) * 100)}%`,
              }}
            />
          </div>
        </div>

        <div className="rounded-lg border border-rose-500/40 bg-surface-950/70 p-2.5">
          <div className="flex items-center justify-between">
            <span className="font-bold text-rose-200">{snap.enemy.name}</span>
            <span className="rounded bg-amber-500/20 px-1.5 py-0.5 font-mono text-[10px] text-amber-200">
              IA : {snap.aiProfile.behavior}
            </span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full bg-rose-500 transition-all"
              style={{
                width: `${Math.max(0, (snap.enemy.hp / Math.max(1, snap.enemy.stats.maxHp)) * 100)}%`,
              }}
            />
          </div>
        </div>
      </div>

      {/* Real-Time Interactive Arena Canvas */}
      <div className="flex flex-col items-center">
        <canvas
          ref={canvasRef}
          width={snap.arenaWidth}
          height={snap.arenaHeight}
          onClick={() => engine.heroMeleeAttack()}
          className="w-full max-w-[560px] cursor-crosshair rounded-lg border border-slate-700 bg-slate-950 shadow-inner"
        />
        <p className="mt-1 text-[11px] text-slate-400">
          ZQSD / Flèches : esquiver &amp; se déplacer ·{' '}
          <span className="text-rose-300">Espace / Clic : Frappe mêlée</span> ·{' '}
          <span className="text-sky-300">1–3 : Sorts &amp; Projectiles</span>
        </p>
      </div>

      {/* Action Bar / End Screen */}
      {isFinished ? (
        <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-surface-950/80 p-3">
          <div className="text-xs">
            {snap.phase === 'victory' && (
              <span className="font-semibold text-emerald-300">
                Victoire en arène ! Butin : {snap.rewardSummary}
              </span>
            )}
            {snap.phase === 'defeat' && (
              <span className="font-semibold text-rose-300">
                Vous êtes vaincu. Retour avec 50% de PV.
              </span>
            )}
            {snap.phase === 'fled' && (
              <span className="text-amber-200">Vous avez quitté l’arène.</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => onFinish(toCombatSnapshot(snap, database.hero.skillIds))}
            className="rounded-md bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500"
          >
            Continuer ▸
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => engine.heroMeleeAttack()}
              className="rounded bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-500"
            >
              ⚔ Frappe (Espace)
            </button>
            {database.hero.skillIds.map((skillId, idx) => {
              const sk = database.skills[skillId];
              if (!sk) return null;
              return (
                <button
                  key={sk.id}
                  type="button"
                  disabled={snap.hero.mp < sk.mpCost}
                  onClick={() => engine.heroCastSkill(sk.id)}
                  className="rounded bg-indigo-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
                >
                  [{idx + 1}] {sk.name} ({sk.mpCost} PM)
                </button>
              );
            })}
            {consumables.slice(0, 2).map((entry) => {
              const it = database.items[entry.itemId];
              if (!it) return null;
              return (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => engine.heroUseItem(it.id)}
                  className="rounded bg-emerald-700 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-600"
                >
                  🧪 {it.name} (×{entry.quantity})
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => engine.flee()}
            className="rounded border border-slate-700 bg-surface-800 px-3 py-1.5 text-xs text-slate-300 hover:bg-surface-700"
          >
            Fuir
          </button>
        </div>
      )}
    </div>
  );
}
