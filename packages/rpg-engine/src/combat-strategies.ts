import type {
  AIProfile,
  AnimationClip,
  CombatMode,
  EnemyDef,
  RpgDatabase,
  StatBlock,
  TileMapData,
} from '@rpg-player/core-types';
import { AnimationTimelinePlayer } from '@rpg-player/pixel-studio';
import { TurnBasedCombatEngine, type CombatPhase, type CombatSnapshot } from './combat.js';
import type { InventorySystem } from './inventory.js';
import type { InputState } from './types.js';

export type CombatVisualAction =
  | 'idle'
  | 'move'
  | 'attack_melee'
  | 'attack_ranged'
  | 'cast'
  | 'hurt'
  | 'death';

export interface FloatingDamageEvent {
  id: string;
  target: 'hero' | 'enemy';
  text: string;
  kind: 'damage' | 'heal' | 'status';
  remainingMs: number;
}

export interface ActiveVfxBurst {
  id: string;
  target: 'hero' | 'enemy' | 'world';
  x: number;
  y: number;
  vfxId: string;
  remainingMs: number;
}

export interface AnimatedTurnState {
  mode: 'simple' | 'turn_based_animated';
  busy: boolean;
  /** Displayed snapshot (HP only updates on `hit_frame` in `turn_based_animated` mode!). */
  displayedSnapshot: CombatSnapshot;
  heroVisual: CombatVisualAction;
  enemyVisual: CombatVisualAction;
  heroFrame: number;
  enemyFrame: number;
  cameraShakeMs: number;
  floatingEvents: FloatingDamageEvent[];
  activeVfx: ActiveVfxBurst[];
}

interface PendingAnimatedStep {
  actor: 'hero' | 'enemy';
  visual: CombatVisualAction;
  player: AnimationTimelinePlayer;
  hitApplied: boolean;
  vfxPayload: string | null;
  onHit: () => { damageText?: string; healText?: string; target: 'hero' | 'enemy' };
}

const DEFAULT_ATTACK_CLIP: AnimationClip = {
  category: 'combat',
  frames: [0, 1, 2, 3, 4],
  fps: 10,
  frameDurationsMs: [70, 70, 60, 110, 90],
  loop: false,
  markers: [{ frameIndex: 2, event: 'hit_frame', payload: 'impact' }],
};

let burstSeq = 0;
function nextBurstId(prefix: string): string {
  burstSeq += 1;
  return `${prefix}_${burstSeq}`;
}

/**
 * Strategy Pattern wrapper for Mode 1 (`simple`) and Mode 2 (`turn_based_animated`).
 * In Mode 2, damage & VFX are strictly deferred until the animation clip's `hit_frame` marker triggers!
 */
export class TurnBasedCombatStrategy {
  readonly mode: 'simple' | 'turn_based_animated';
  private readonly core: TurnBasedCombatEngine;
  private displayedSnapshot: CombatSnapshot;

  private heroVisual: CombatVisualAction = 'idle';
  private enemyVisual: CombatVisualAction = 'idle';
  private heroFrame = 0;
  private enemyFrame = 0;
  private hurtHeroMs = 0;
  private hurtEnemyMs = 0;
  private cameraShakeMs = 0;
  private floatingEvents: FloatingDamageEvent[] = [];
  private activeVfx: ActiveVfxBurst[] = [];

  private pendingQueue: PendingAnimatedStep[] = [];
  private activeStep: PendingAnimatedStep | null = null;
  private readonly heroAttackClip: AnimationClip;
  private readonly enemyAttackClip: AnimationClip;

  constructor(
    mode: 'simple' | 'turn_based_animated',
    db: RpgDatabase,
    inventory: InventorySystem,
    enemyId: string,
    options?: {
      initialHeroHp?: number;
      initialHeroMp?: number;
      heroAttackClip?: AnimationClip;
      enemyAttackClip?: AnimationClip;
    },
  ) {
    this.mode = mode;
    this.core = new TurnBasedCombatEngine(
      db,
      inventory,
      enemyId,
      options?.initialHeroHp,
      options?.initialHeroMp,
    );
    this.displayedSnapshot = this.core.getSnapshot();
    this.heroAttackClip = options?.heroAttackClip ?? DEFAULT_ATTACK_CLIP;
    this.enemyAttackClip = options?.enemyAttackClip ?? DEFAULT_ATTACK_CLIP;
  }

  getState(): AnimatedTurnState {
    return {
      mode: this.mode,
      busy: this.activeStep !== null || this.pendingQueue.length > 0,
      displayedSnapshot: this.displayedSnapshot,
      heroVisual: this.displayedSnapshot.hero.hp <= 0 ? 'death' : this.heroVisual,
      enemyVisual: this.displayedSnapshot.enemy.hp <= 0 ? 'death' : this.enemyVisual,
      heroFrame: this.heroFrame,
      enemyFrame: this.enemyFrame,
      cameraShakeMs: this.cameraShakeMs,
      floatingEvents: this.floatingEvents.map((e) => ({ ...e })),
      activeVfx: this.activeVfx.map((v) => ({ ...v })),
    };
  }

  private enqueueTurn(
    heroVisual: CombatVisualAction,
    vfxPayload: string | null,
    executeCore: () => CombatSnapshot,
  ): AnimatedTurnState {
    if (this.displayedSnapshot.phase !== 'player_turn') return this.getState();

    if (this.mode === 'simple') {
      const before = this.displayedSnapshot;
      const after = executeCore();
      this.displayedSnapshot = after;
      const enemyDmg = before.enemy.hp - after.enemy.hp;
      const heroDmg = before.hero.hp - after.hero.hp;
      if (enemyDmg > 0) this.pushFloat('enemy', `-${enemyDmg}`, 'damage');
      if (heroDmg > 0) this.pushFloat('hero', `-${heroDmg}`, 'damage');
      return this.getState();
    }

    if (this.activeStep || this.pendingQueue.length > 0) {
      return this.getState();
    }

    const before = this.displayedSnapshot;
    // Pre-compute authoritative outcome, but withhold visual HP update until exact `hit_frame`!
    const afterFullRound = executeCore();
    const enemyDmg = before.enemy.hp - afterFullRound.enemy.hp;
    const heroDelta = afterFullRound.hero.hp - before.hero.hp;

    // Step 1: Hero animation -> at `hit_frame`, enemy HP drops (or hero heals)
    const clipToPlay = this.heroAttackClip;
    this.pendingQueue.push({
      actor: 'hero',
      visual: heroVisual,
      player: new AnimationTimelinePlayer({ ...clipToPlay, loop: false }, true),
      hitApplied: false,
      vfxPayload,
      onHit: () => {
        // Apply hero's impact to displayed snapshot while holding enemy retaliation for Step 2
        const intermediateHeroHp =
          heroDelta > 0 ? Math.min(afterFullRound.hero.stats.maxHp, before.hero.hp + heroDelta) : before.hero.hp;
        this.displayedSnapshot = {
          ...afterFullRound,
          hero: { ...afterFullRound.hero, hp: intermediateHeroHp },
          phase: afterFullRound.enemy.hp <= 0 ? 'victory' : 'player_turn',
        };
        if (enemyDmg > 0) {
          this.hurtEnemyMs = 280;
          this.cameraShakeMs = 180;
          return { damageText: `-${enemyDmg}`, target: 'enemy' };
        }
        if (heroDelta > 0) {
          return { healText: `+${heroDelta} PV`, target: 'hero' };
        }
        return { target: 'enemy' };
      },
    });

    // Step 2: Enemy retaliation animation (only if enemy survived & battle didn't end)
    if (afterFullRound.enemy.hp > 0 && afterFullRound.phase !== 'fled') {
      this.pendingQueue.push({
        actor: 'enemy',
        visual: 'attack_melee',
        player: new AnimationTimelinePlayer({ ...this.enemyAttackClip, loop: false }, true),
        hitApplied: false,
        vfxPayload: 'enemy_strike',
        onHit: () => {
          this.displayedSnapshot = afterFullRound;
          const dmgToHero = Math.max(0, before.hero.hp - afterFullRound.hero.hp);
          if (dmgToHero > 0) {
            this.hurtHeroMs = 280;
            this.cameraShakeMs = 180;
            return { damageText: `-${dmgToHero}`, target: 'hero' };
          }
          return { target: 'hero' };
        },
      });
    }

    this.startNextPending();
    return this.getState();
  }

  private startNextPending(): void {
    this.activeStep = this.pendingQueue.shift() ?? null;
    if (!this.activeStep) {
      this.heroVisual = 'idle';
      this.enemyVisual = 'idle';
      this.displayedSnapshot = this.core.getSnapshot();
      return;
    }
    if (this.activeStep.actor === 'hero') {
      this.heroVisual = this.activeStep.visual;
    } else {
      this.enemyVisual = this.activeStep.visual;
    }
  }

  private pushFloat(target: 'hero' | 'enemy', text: string, kind: 'damage' | 'heal' | 'status'): void {
    this.floatingEvents.push({
      id: nextBurstId('flt'),
      target,
      text,
      kind,
      remainingMs: 900,
    });
  }

  private triggerStepHit(step: PendingAnimatedStep): void {
    if (step.hitApplied) return;
    step.hitApplied = true;
    const res = step.onHit();
    if (res.damageText) this.pushFloat(res.target, res.damageText, 'damage');
    if (res.healText) this.pushFloat(res.target, res.healText, 'heal');
    if (step.vfxPayload) {
      this.activeVfx.push({
        id: nextBurstId('vfx'),
        target: res.target,
        x: 0,
        y: 0,
        vfxId: step.vfxPayload,
        remainingMs: 360,
      });
    }
  }

  step(dtMs: number): AnimatedTurnState {
    const dt = Math.max(0, dtMs);
    this.cameraShakeMs = Math.max(0, this.cameraShakeMs - dt);
    this.hurtHeroMs = Math.max(0, this.hurtHeroMs - dt);
    this.hurtEnemyMs = Math.max(0, this.hurtEnemyMs - dt);

    for (let i = this.floatingEvents.length - 1; i >= 0; i -= 1) {
      this.floatingEvents[i]!.remainingMs -= dt;
      if (this.floatingEvents[i]!.remainingMs <= 0) this.floatingEvents.splice(i, 1);
    }
    for (let i = this.activeVfx.length - 1; i >= 0; i -= 1) {
      this.activeVfx[i]!.remainingMs -= dt;
      if (this.activeVfx[i]!.remainingMs <= 0) this.activeVfx.splice(i, 1);
    }

    if (this.activeStep) {
      const res = this.activeStep.player.step(dt);
      if (this.activeStep.actor === 'hero') {
        this.heroFrame = res.spriteFrame;
      } else {
        this.enemyFrame = res.spriteFrame;
      }

      const hasHitMarker = res.triggeredMarkers.some((m) => m.event === 'hit_frame');
      if (hasHitMarker) {
        this.triggerStepHit(this.activeStep);
      }

      if (res.completed) {
        // Fallback if clip didn't define a hit_frame marker
        if (!this.activeStep.hitApplied) {
          this.triggerStepHit(this.activeStep);
        }
        this.startNextPending();
      }
    }

    if (!this.activeStep) {
      this.heroVisual = this.hurtHeroMs > 0 ? 'hurt' : 'idle';
      this.enemyVisual = this.hurtEnemyMs > 0 ? 'hurt' : 'idle';
    } else if (this.activeStep.actor === 'hero' && this.hurtEnemyMs > 0) {
      this.enemyVisual = 'hurt';
    } else if (this.activeStep.actor === 'enemy' && this.hurtHeroMs > 0) {
      this.heroVisual = 'hurt';
    }

    return this.getState();
  }

  playerAttack(): AnimatedTurnState {
    return this.enqueueTurn('attack_melee', 'slash_impact', () => this.core.playerAttack());
  }

  playerUseSkill(skillId: string): AnimatedTurnState {
    return this.enqueueTurn('cast', `vfx_${skillId}`, () => this.core.playerUseSkill(skillId));
  }

  playerUseItem(itemId: string): AnimatedTurnState {
    return this.enqueueTurn('cast', 'heal_spark', () => this.core.playerUseItem(itemId));
  }

  playerDefend(): AnimatedTurnState {
    return this.enqueueTurn('idle', 'shield_aura', () => this.core.playerDefend());
  }

  playerFlee(): AnimatedTurnState {
    this.pendingQueue.length = 0;
    this.activeStep = null;
    this.displayedSnapshot = this.core.playerFlee();
    return this.getState();
  }
}

// ============================================================================
// Mode 3: Dynamic Real-Time Combat with AI Profiles (melee / ranged / hybrid)
// ============================================================================

export interface DynamicProjectile {
  id: string;
  owner: 'hero' | 'enemy';
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  color: string;
  vfxAssetId: string | null;
  remainingMs: number;
}

export interface DynamicActorState {
  name: string;
  x: number;
  y: number;
  facingX: number;
  facingY: number;
  hp: number;
  mp: number;
  stats: StatBlock;
  visual: CombatVisualAction;
  attackCooldownMs: number;
  hurtTimerMs: number;
  attackAnimMs: number;
}

export interface DynamicCombatSnapshot {
  mode: 'dynamic_ai';
  phase: CombatPhase;
  arenaWidth: number;
  arenaHeight: number;
  hero: DynamicActorState;
  enemy: DynamicActorState;
  enemyId: string;
  aiProfile: AIProfile;
  projectiles: DynamicProjectile[];
  floatingEvents: FloatingDamageEvent[];
  activeVfx: ActiveVfxBurst[];
  log: string[];
  rewardSummary: string | null;
}

export function getDefaultAIProfile(enemy: EnemyDef): AIProfile {
  return (
    enemy.aiProfile ?? {
      behavior: 'melee',
      aggroRange: 340,
      attackRange: 44,
      preferredRange: 140,
      retreatRange: 75,
      moveSpeed: 78,
      attackCooldownMs: 1200,
      projectileSpeed: 210,
      attackHitbox: { width: 32, height: 24, reachOffset: 22 },
    }
  );
}

/**
 * Mode 3 (`dynamic_ai`) real-time arena combat engine (100% pure TS, testable headless).
 * Supports `melee`, `ranged` (kiting + projectiles), and `hybrid` AI profiles
 * while respecting optional `TileMapData.collisionLayer` obstacles.
 */
export class DynamicCombatEngine {
  private readonly db: RpgDatabase;
  private readonly inventory: InventorySystem;
  private readonly enemyDef: EnemyDef;
  private readonly aiProfile: AIProfile;
  private readonly map: TileMapData | null;

  private readonly arenaWidth: number;
  private readonly arenaHeight: number;
  private phase: CombatPhase = 'player_turn';
  private hero: DynamicActorState;
  private enemy: DynamicActorState;
  private input: InputState = { up: false, down: false, left: false, right: false };

  private projectiles: DynamicProjectile[] = [];
  private floatingEvents: FloatingDamageEvent[] = [];
  private activeVfx: ActiveVfxBurst[] = [];
  private readonly log: string[] = [];
  private rewardSummary: string | null = null;

  constructor(
    db: RpgDatabase,
    inventory: InventorySystem,
    enemyId: string,
    options?: {
      initialHeroHp?: number;
      initialHeroMp?: number;
      arenaWidth?: number;
      arenaHeight?: number;
      map?: TileMapData | null;
    },
  ) {
    const enemyDef = db.enemies[enemyId];
    if (!enemyDef) {
      throw new Error(`Ennemi introuvable : "${enemyId}"`);
    }
    this.db = db;
    this.inventory = inventory;
    this.enemyDef = enemyDef;
    this.aiProfile = getDefaultAIProfile(enemyDef);
    this.map = options?.map ?? null;

    this.arenaWidth = options?.arenaWidth ?? 520;
    this.arenaHeight = options?.arenaHeight ?? 300;

    const effStats = inventory.computeEffectiveStats(db.hero.stats);
    this.hero = {
      name: db.hero.name,
      x: Math.round(this.arenaWidth * 0.25),
      y: Math.round(this.arenaHeight * 0.5),
      facingX: 1,
      facingY: 0,
      hp: Math.min(effStats.maxHp, options?.initialHeroHp ?? effStats.maxHp),
      mp: Math.min(effStats.maxMp, options?.initialHeroMp ?? effStats.maxMp),
      stats: effStats,
      visual: 'idle',
      attackCooldownMs: 0,
      hurtTimerMs: 0,
      attackAnimMs: 0,
    };

    this.enemy = {
      name: enemyDef.name,
      x: Math.round(this.arenaWidth * 0.75),
      y: Math.round(this.arenaHeight * 0.5),
      facingX: -1,
      facingY: 0,
      hp: enemyDef.stats.maxHp,
      mp: enemyDef.stats.maxMp,
      stats: { ...enemyDef.stats },
      visual: 'idle',
      attackCooldownMs: 500,
      hurtTimerMs: 0,
      attackAnimMs: 0,
    };

    this.log.push(`Combat dynamique engagé contre ${enemyDef.name} (IA : ${this.aiProfile.behavior}) !`);
  }

  getSnapshot(): DynamicCombatSnapshot {
    return {
      mode: 'dynamic_ai',
      phase: this.phase,
      arenaWidth: this.arenaWidth,
      arenaHeight: this.arenaHeight,
      hero: { ...this.hero, stats: { ...this.hero.stats } },
      enemy: { ...this.enemy, stats: { ...this.enemy.stats } },
      enemyId: this.enemyDef.id,
      aiProfile: { ...this.aiProfile },
      projectiles: this.projectiles.map((p) => ({ ...p })),
      floatingEvents: this.floatingEvents.map((e) => ({ ...e })),
      activeVfx: this.activeVfx.map((v) => ({ ...v })),
      log: [...this.log],
      rewardSummary: this.rewardSummary,
    };
  }

  setInput(next: Partial<InputState>): void {
    this.input = { ...this.input, ...next };
  }

  private canMoveTo(x: number, y: number): boolean {
    const margin = 16;
    if (x < margin || y < margin || x > this.arenaWidth - margin || y > this.arenaHeight - margin) {
      return false;
    }
    if (this.map) {
      const tx = Math.floor(x / this.map.tileSize);
      const ty = Math.floor(y / this.map.tileSize);
      if (tx >= 0 && ty >= 0 && tx < this.map.width && ty < this.map.height) {
        if ((this.map.collisionLayer.cells[ty * this.map.width + tx] ?? 0) !== 0) {
          return false;
        }
      }
    }
    return true;
  }

  private moveWithCollision(actor: DynamicActorState, vx: number, vy: number, dtSec: number): boolean {
    let moved = false;
    const nx = actor.x + vx * dtSec;
    if (vx !== 0 && this.canMoveTo(nx, actor.y)) {
      actor.x = nx;
      moved = true;
    }
    const ny = actor.y + vy * dtSec;
    if (vy !== 0 && this.canMoveTo(actor.x, ny)) {
      actor.y = ny;
      moved = true;
    }
    return moved;
  }

  private calcDamage(power: number, def: number): number {
    return Math.max(1, Math.round(power - def * 0.55));
  }

  private checkEndConditions(): void {
    if (this.phase !== 'player_turn') return;
    if (this.enemy.hp <= 0) {
      this.enemy.hp = 0;
      this.enemy.visual = 'death';
      this.phase = 'victory';
      const rewards: string[] = [];
      if (this.enemyDef.rewardGold && this.enemyDef.rewardGold > 0) {
        this.inventory.addGold(this.enemyDef.rewardGold);
        rewards.push(`+${this.enemyDef.rewardGold} or`);
      }
      if (this.enemyDef.rewardItemId) {
        const res = this.inventory.addItem(this.enemyDef.rewardItemId, 1);
        const itemName = this.db.items[this.enemyDef.rewardItemId]?.name ?? this.enemyDef.rewardItemId;
        if (res.ok) rewards.push(itemName);
      }
      this.rewardSummary = rewards.join(' · ') || 'Victoire';
      this.log.push(`Victoire ! ${this.enemy.name} vaincu (${this.rewardSummary}).`);
    } else if (this.hero.hp <= 0) {
      this.hero.hp = 0;
      this.hero.visual = 'death';
      this.phase = 'defeat';
      this.log.push(`${this.hero.name} est vaincu...`);
    }
  }

  heroMeleeAttack(): boolean {
    if (this.phase !== 'player_turn' || this.hero.attackCooldownMs > 0) return false;
    const settings = this.db.combatConfig?.dynamicSettings ?? {
      heroAttackRange: 48,
      heroAttackCooldownMs: 420,
      defaultProjectileSpeed: 220,
    };

    this.hero.attackCooldownMs = settings.heroAttackCooldownMs;
    this.hero.attackAnimMs = 240;
    this.hero.visual = 'attack_melee';

    // Oriented slash VFX in front of hero
    const slashX = this.hero.x + this.hero.facingX * 26;
    const slashY = this.hero.y + this.hero.facingY * 26;
    this.activeVfx.push({
      id: nextBurstId('vfx'),
      target: 'world',
      x: slashX,
      y: slashY,
      vfxId: 'slash',
      remainingMs: 220,
    });

    const dx = this.enemy.x - this.hero.x;
    const dy = this.enemy.y - this.hero.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= settings.heroAttackRange + 16) {
      const dmg = this.calcDamage(this.hero.stats.atk, this.enemy.stats.def);
      this.enemy.hp = Math.max(0, this.enemy.hp - dmg);
      this.enemy.hurtTimerMs = 200;
      this.floatingEvents.push({
        id: nextBurstId('flt'),
        target: 'enemy',
        text: `-${dmg}`,
        kind: 'damage',
        remainingMs: 700,
      });
      this.log.push(`${this.hero.name} frappe (${dmg} PV) !`);
      this.checkEndConditions();
    }
    return true;
  }

  heroCastSkill(skillId: string): boolean {
    if (this.phase !== 'player_turn' || this.hero.attackCooldownMs > 0) return false;
    const skill = this.db.skills[skillId];
    if (!skill || this.hero.mp < skill.mpCost) return false;

    this.hero.mp -= skill.mpCost;
    this.hero.attackCooldownMs = 520;
    this.hero.attackAnimMs = 260;
    this.hero.visual = 'cast';

    if (skill.isHeal) {
      const healed = Math.min(this.hero.stats.maxHp - this.hero.hp, skill.power);
      this.hero.hp += healed;
      this.floatingEvents.push({
        id: nextBurstId('flt'),
        target: 'hero',
        text: `+${healed} PV`,
        kind: 'heal',
        remainingMs: 800,
      });
      this.log.push(`${this.hero.name} lance ${skill.name} (+${healed} PV).`);
      return true;
    }

    // Launch aimed skill projectile toward enemy
    const dx = this.enemy.x - this.hero.x;
    const dy = this.enemy.y - this.hero.y;
    const len = Math.max(1, Math.hypot(dx, dy));
    const speed = this.db.combatConfig?.dynamicSettings.defaultProjectileSpeed ?? 230;
    this.projectiles.push({
      id: nextBurstId('proj'),
      owner: 'hero',
      x: this.hero.x + (dx / len) * 18,
      y: this.hero.y + (dy / len) * 18,
      vx: (dx / len) * speed,
      vy: (dy / len) * speed,
      radius: 9,
      damage: this.calcDamage(this.hero.stats.atk * 0.5 + skill.power, this.enemy.stats.def),
      color: '#f97316',
      vfxAssetId: skill.vfxAssetId ?? null,
      remainingMs: 2500,
    });
    this.log.push(`${this.hero.name} lance ${skill.name} !`);
    return true;
  }

  heroUseItem(itemId: string): boolean {
    if (this.phase !== 'player_turn') return false;
    const used = this.inventory.useConsumable(itemId);
    if (!used.ok) return false;
    const healedHp = Math.min(this.hero.stats.maxHp - this.hero.hp, used.healHp);
    const healedMp = Math.min(this.hero.stats.maxMp - this.hero.mp, used.healMp);
    this.hero.hp += healedHp;
    this.hero.mp += healedMp;
    if (healedHp > 0) {
      this.floatingEvents.push({
        id: nextBurstId('flt'),
        target: 'hero',
        text: `+${healedHp} PV`,
        kind: 'heal',
        remainingMs: 800,
      });
    }
    return true;
  }

  flee(): void {
    if (this.phase === 'player_turn') {
      this.phase = 'fled';
      this.log.push(`${this.hero.name} fuit l’arène.`);
    }
  }

  private fireEnemyProjectile(dx: number, dy: number, dist: number): void {
    const speed = this.aiProfile.projectileSpeed ?? 200;
    const nx = dx / Math.max(1, dist);
    const ny = dy / Math.max(1, dist);
    this.enemy.attackCooldownMs = this.aiProfile.attackCooldownMs;
    this.enemy.attackAnimMs = 280;
    this.enemy.visual = 'attack_ranged';
    this.projectiles.push({
      id: nextBurstId('proj'),
      owner: 'enemy',
      x: this.enemy.x + nx * 18,
      y: this.enemy.y + ny * 18,
      vx: nx * speed,
      vy: ny * speed,
      radius: 8,
      damage: this.calcDamage(this.enemy.stats.atk, this.hero.stats.def),
      color: '#ef4444',
      vfxAssetId: this.aiProfile.projectileVfxAssetId ?? null,
      remainingMs: 2600,
    });
    this.log.push(`${this.enemy.name} tire un projectile !`);
  }

  private performEnemyMelee(): void {
    this.enemy.attackCooldownMs = this.aiProfile.attackCooldownMs;
    this.enemy.attackAnimMs = 280;
    this.enemy.visual = 'attack_melee';
    const dmg = this.calcDamage(this.enemy.stats.atk, this.hero.stats.def);
    this.hero.hp = Math.max(0, this.hero.hp - dmg);
    this.hero.hurtTimerMs = 220;
    this.floatingEvents.push({
      id: nextBurstId('flt'),
      target: 'hero',
      text: `-${dmg}`,
      kind: 'damage',
      remainingMs: 750,
    });
    this.log.push(`${this.enemy.name} attaque au corps à corps (${dmg} PV) !`);
    this.checkEndConditions();
  }

  /**
   * Advances real-time hero movement, AI behavior (`melee` / `ranged` / `hybrid`),
   * projectiles, and collisions by `dtMs` milliseconds.
   */
  step(rawDtMs: number): DynamicCombatSnapshot {
    const dtMs = Math.max(0, Math.min(50, rawDtMs));
    const dtSec = dtMs / 1000;

    // Decay VFX & floating damage numbers
    for (let i = this.floatingEvents.length - 1; i >= 0; i -= 1) {
      this.floatingEvents[i]!.remainingMs -= dtMs;
      if (this.floatingEvents[i]!.remainingMs <= 0) this.floatingEvents.splice(i, 1);
    }
    for (let i = this.activeVfx.length - 1; i >= 0; i -= 1) {
      this.activeVfx[i]!.remainingMs -= dtMs;
      if (this.activeVfx[i]!.remainingMs <= 0) this.activeVfx.splice(i, 1);
    }

    if (this.phase !== 'player_turn') {
      return this.getSnapshot();
    }

    this.hero.attackCooldownMs = Math.max(0, this.hero.attackCooldownMs - dtMs);
    this.hero.hurtTimerMs = Math.max(0, this.hero.hurtTimerMs - dtMs);
    this.hero.attackAnimMs = Math.max(0, this.hero.attackAnimMs - dtMs);

    this.enemy.attackCooldownMs = Math.max(0, this.enemy.attackCooldownMs - dtMs);
    this.enemy.hurtTimerMs = Math.max(0, this.enemy.hurtTimerMs - dtMs);
    this.enemy.attackAnimMs = Math.max(0, this.enemy.attackAnimMs - dtMs);

    // 1. Hero smooth movement
    let hdx = 0;
    let hdy = 0;
    if (this.input.left) hdx -= 1;
    if (this.input.right) hdx += 1;
    if (this.input.up) hdy -= 1;
    if (this.input.down) hdy += 1;
    if (hdx !== 0 || hdy !== 0) {
      const inv = 1 / Math.hypot(hdx, hdy);
      hdx *= inv;
      hdy *= inv;
      this.hero.facingX = hdx;
      this.hero.facingY = hdy;
      this.moveWithCollision(this.hero, hdx * 145, hdy * 145, dtSec);
      if (this.hero.attackAnimMs <= 0) {
        this.hero.visual = 'move';
      }
    } else if (this.hero.attackAnimMs <= 0) {
      this.hero.visual = this.hero.hurtTimerMs > 0 ? 'hurt' : 'idle';
    }

    // 2. Enemy AI Profile Steering (`melee` | `ranged` | `hybrid`)
    const dx = this.hero.x - this.enemy.x;
    const dy = this.hero.y - this.enemy.y;
    const dist = Math.hypot(dx, dy);
    const nx = dx / Math.max(1, dist);
    const ny = dy / Math.max(1, dist);
    this.enemy.facingX = nx;
    this.enemy.facingY = ny;

    const ai = this.aiProfile;
    let enemyMoved = false;

    if (dist <= ai.aggroRange) {
      if (ai.behavior === 'melee') {
        if (dist > ai.attackRange) {
          enemyMoved = this.moveWithCollision(this.enemy, nx * ai.moveSpeed, ny * ai.moveSpeed, dtSec);
        } else if (this.enemy.attackCooldownMs <= 0) {
          this.performEnemyMelee();
        }
      } else if (ai.behavior === 'ranged') {
        if (dist < ai.retreatRange) {
          // Kiting: retreat away from hero while respecting arena/map collisions!
          enemyMoved = this.moveWithCollision(
            this.enemy,
            -nx * ai.moveSpeed,
            -ny * ai.moveSpeed,
            dtSec,
          );
        } else if (dist > ai.preferredRange) {
          enemyMoved = this.moveWithCollision(this.enemy, nx * ai.moveSpeed, ny * ai.moveSpeed, dtSec);
        }
        if (this.enemy.attackCooldownMs <= 0 && dist <= ai.aggroRange) {
          this.fireEnemyProjectile(dx, dy, dist);
        }
      } else {
        // Hybrid: melee if close, ranged + positioning if mid-distance
        if (dist <= ai.attackRange) {
          if (this.enemy.attackCooldownMs <= 0) {
            this.performEnemyMelee();
          }
        } else if (dist <= ai.preferredRange) {
          if (this.enemy.attackCooldownMs <= 0) {
            this.fireEnemyProjectile(dx, dy, dist);
          } else if (dist < ai.retreatRange) {
            enemyMoved = this.moveWithCollision(
              this.enemy,
              -nx * ai.moveSpeed * 0.8,
              -ny * ai.moveSpeed * 0.8,
              dtSec,
            );
          }
        } else {
          enemyMoved = this.moveWithCollision(this.enemy, nx * ai.moveSpeed, ny * ai.moveSpeed, dtSec);
        }
      }
    }

    if (this.enemy.attackAnimMs <= 0) {
      this.enemy.visual = this.enemy.hurtTimerMs > 0 ? 'hurt' : enemyMoved ? 'move' : 'idle';
    }

    // 3. Projectiles & Hit Detection
    for (let i = this.projectiles.length - 1; i >= 0; i -= 1) {
      const proj = this.projectiles[i]!;
      proj.remainingMs -= dtMs;
      proj.x += proj.vx * dtSec;
      proj.y += proj.vy * dtSec;

      if (proj.remainingMs <= 0 || !this.canMoveTo(proj.x, proj.y)) {
        this.projectiles.splice(i, 1);
        continue;
      }

      const targetActor = proj.owner === 'hero' ? this.enemy : this.hero;
      const targetKey = proj.owner === 'hero' ? 'enemy' : 'hero';
      const hitDist = Math.hypot(proj.x - targetActor.x, proj.y - targetActor.y);
      if (hitDist <= proj.radius + 16) {
        targetActor.hp = Math.max(0, targetActor.hp - proj.damage);
        targetActor.hurtTimerMs = 200;
        this.floatingEvents.push({
          id: nextBurstId('flt'),
          target: targetKey,
          text: `-${proj.damage}`,
          kind: 'damage',
          remainingMs: 750,
        });
        this.activeVfx.push({
          id: nextBurstId('vfx'),
          target: 'world',
          x: proj.x,
          y: proj.y,
          vfxId: proj.vfxAssetId ?? 'impact',
          remainingMs: 240,
        });
        this.projectiles.splice(i, 1);
        this.checkEndConditions();
      }
    }

    return this.getSnapshot();
  }
}

export function resolveCombatMode(db: RpgDatabase, override?: CombatMode): CombatMode {
  return override ?? db.combatConfig?.defaultMode ?? 'turn_based_animated';
}
