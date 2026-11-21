import type {
  EnemyDef,
  RpgDatabase,
  SkillDef,
  StatBlock,
  StatusEffectKind,
} from '@rpg-player/core-types';
import type { InventorySystem } from './inventory.js';

export interface ActiveStatusEffect {
  kind: StatusEffectKind;
  turnsRemaining: number;
  potency: number;
}

export interface CombatantState {
  name: string;
  hp: number;
  mp: number;
  stats: StatBlock;
  defending: boolean;
  statuses: ActiveStatusEffect[];
}

export type CombatPhase = 'player_turn' | 'victory' | 'defeat' | 'fled';

export interface CombatSnapshot {
  phase: CombatPhase;
  turn: number;
  hero: CombatantState;
  enemy: CombatantState;
  enemyId: string;
  heroSkillIds: readonly string[];
  log: readonly string[];
  rewardSummary: string | null;
}

/**
 * Headless turn-based RPG combat engine supporting stats (HP/MP/ATK/DEF),
 * skills, status effects (poison/burn/shield/stun), consumable items, and loot rewards.
 */
export class TurnBasedCombatEngine {
  private readonly db: RpgDatabase;
  private readonly inventory: InventorySystem;
  private readonly enemyDef: EnemyDef;

  private phase: CombatPhase = 'player_turn';
  private turn = 1;
  private hero: CombatantState;
  private enemy: CombatantState;
  private readonly log: string[] = [];
  private rewardSummary: string | null = null;

  constructor(
    db: RpgDatabase,
    inventory: InventorySystem,
    enemyId: string,
    initialHeroHp?: number,
    initialHeroMp?: number,
  ) {
    const enemyDef = db.enemies[enemyId];
    if (!enemyDef) {
      throw new Error(`Ennemi introuvable dans la base RPG : "${enemyId}"`);
    }
    this.db = db;
    this.inventory = inventory;
    this.enemyDef = enemyDef;

    const effectiveHeroStats = inventory.computeEffectiveStats(db.hero.stats);
    this.hero = {
      name: db.hero.name,
      hp: Math.min(effectiveHeroStats.maxHp, initialHeroHp ?? effectiveHeroStats.maxHp),
      mp: Math.min(effectiveHeroStats.maxMp, initialHeroMp ?? effectiveHeroStats.maxMp),
      stats: effectiveHeroStats,
      defending: false,
      statuses: [],
    };

    this.enemy = {
      name: enemyDef.name,
      hp: enemyDef.stats.maxHp,
      mp: enemyDef.stats.maxMp,
      stats: { ...enemyDef.stats },
      defending: false,
      statuses: [],
    };

    this.log.push(`Un ${enemyDef.name} apparaît !`);
  }

  getSnapshot(): CombatSnapshot {
    return {
      phase: this.phase,
      turn: this.turn,
      hero: {
        ...this.hero,
        stats: { ...this.hero.stats },
        statuses: this.hero.statuses.map((s) => ({ ...s })),
      },
      enemy: {
        ...this.enemy,
        stats: { ...this.enemy.stats },
        statuses: this.enemy.statuses.map((s) => ({ ...s })),
      },
      enemyId: this.enemyDef.id,
      heroSkillIds: this.db.hero.skillIds,
      log: [...this.log],
      rewardSummary: this.rewardSummary,
    };
  }

  private computeDamage(rawPower: number, defender: CombatantState): number {
    const shieldBonus = defender.statuses
      .filter((s) => s.kind === 'shield')
      .reduce((sum, s) => sum + s.potency, 0);
    const mitigation = defender.stats.def + shieldBonus;
    let dmg = Math.max(1, Math.round(rawPower - mitigation * 0.6));
    if (defender.defending) {
      dmg = Math.max(1, Math.floor(dmg * 0.5));
    }
    return dmg;
  }

  private applyStatus(target: CombatantState, kind: StatusEffectKind, turns: number, potency: number): void {
    const existing = target.statuses.find((s) => s.kind === kind);
    if (existing) {
      existing.turnsRemaining = Math.max(existing.turnsRemaining, turns);
      existing.potency = Math.max(existing.potency, potency);
    } else {
      target.statuses.push({ kind, turnsRemaining: turns, potency });
    }
  }

  private tickStatuses(target: CombatantState): { stunned: boolean } {
    let stunned = false;
    for (let i = target.statuses.length - 1; i >= 0; i -= 1) {
      const status = target.statuses[i]!;
      if (status.kind === 'poison' || status.kind === 'burn') {
        const dmg = Math.max(1, status.potency);
        target.hp = Math.max(0, target.hp - dmg);
        this.log.push(
          `${target.name} subit ${dmg} dégâts de ${status.kind === 'burn' ? 'brûlure' : 'poison'}.`,
        );
      } else if (status.kind === 'stun') {
        stunned = true;
      }

      status.turnsRemaining -= 1;
      if (status.turnsRemaining <= 0) {
        target.statuses.splice(i, 1);
      }
    }
    return { stunned };
  }

  private checkVictoryOrDefeat(): boolean {
    if (this.enemy.hp <= 0) {
      this.phase = 'victory';
      const rewards: string[] = [];
      if (this.enemyDef.rewardGold && this.enemyDef.rewardGold > 0) {
        this.inventory.addGold(this.enemyDef.rewardGold);
        rewards.push(`+${this.enemyDef.rewardGold} or`);
      }
      if (this.enemyDef.rewardItemId) {
        const added = this.inventory.addItem(this.enemyDef.rewardItemId, 1);
        const itemName =
          this.db.items[this.enemyDef.rewardItemId]?.name ?? this.enemyDef.rewardItemId;
        if (added.ok) {
          rewards.push(itemName);
        }
      }
      this.rewardSummary = rewards.length > 0 ? rewards.join(' · ') : 'Aucune récompense';
      this.log.push(`Victoire ! ${this.enemy.name} est vaincu (${this.rewardSummary}).`);
      return true;
    }

    if (this.hero.hp <= 0) {
      this.phase = 'defeat';
      this.log.push(`${this.hero.name} est tombé au combat...`);
      return true;
    }

    return false;
  }

  private runEnemyTurn(): void {
    if (this.checkVictoryOrDefeat()) return;

    this.enemy.defending = false;
    const { stunned } = this.tickStatuses(this.enemy);
    if (this.checkVictoryOrDefeat()) return;

    if (stunned) {
      this.log.push(`${this.enemy.name} est étourdi et passe son tour !`);
    } else {
      const usableSkills = this.enemyDef.skillIds
        .map((id) => this.db.skills[id])
        .filter((s): s is SkillDef => s !== undefined && this.enemy.mp >= s.mpCost);

      // Deterministic alternating AI: uses a skill on even turns if MP permits
      const chosenSkill =
        usableSkills.length > 0 && this.turn % 2 === 0
          ? usableSkills[this.turn % usableSkills.length]!
          : null;

      if (chosenSkill) {
        this.enemy.mp -= chosenSkill.mpCost;
        if (chosenSkill.isHeal) {
          const healed = Math.min(this.enemy.stats.maxHp - this.enemy.hp, chosenSkill.power);
          this.enemy.hp += healed;
          this.log.push(`${this.enemy.name} utilise ${chosenSkill.name} (+${healed} PV).`);
        } else {
          const dmg = this.computeDamage(this.enemy.stats.atk + chosenSkill.power * 0.6, this.hero);
          this.hero.hp = Math.max(0, this.hero.hp - dmg);
          this.log.push(`${this.enemy.name} lance ${chosenSkill.name} et inflige ${dmg} PV !`);
          if (chosenSkill.statusEffect) {
            const target = chosenSkill.statusEffect.kind === 'shield' ? this.enemy : this.hero;
            this.applyStatus(
              target,
              chosenSkill.statusEffect.kind,
              chosenSkill.statusEffect.turns,
              chosenSkill.statusEffect.potency,
            );
          }
        }
      } else {
        const dmg = this.computeDamage(this.enemy.stats.atk, this.hero);
        this.hero.hp = Math.max(0, this.hero.hp - dmg);
        this.log.push(`${this.enemy.name} attaque et inflige ${dmg} PV !`);
      }
    }

    if (this.checkVictoryOrDefeat()) return;

    // Tick hero statuses at end of round
    this.tickStatuses(this.hero);
    if (this.checkVictoryOrDefeat()) return;

    this.hero.defending = false;
    this.turn += 1;
  }

  playerAttack(): CombatSnapshot {
    if (this.phase !== 'player_turn') return this.getSnapshot();
    this.hero.defending = false;
    const dmg = this.computeDamage(this.hero.stats.atk, this.enemy);
    this.enemy.hp = Math.max(0, this.enemy.hp - dmg);
    this.log.push(`${this.hero.name} attaque et inflige ${dmg} PV à ${this.enemy.name}.`);
    this.runEnemyTurn();
    return this.getSnapshot();
  }

  playerUseSkill(skillId: string): CombatSnapshot {
    if (this.phase !== 'player_turn') return this.getSnapshot();
    const skill = this.db.skills[skillId];
    if (!skill) {
      this.log.push(`Compétence inconnue : ${skillId}`);
      return this.getSnapshot();
    }
    if (this.hero.mp < skill.mpCost) {
      this.log.push(`PM insuffisants pour ${skill.name} (${skill.mpCost} PM requis).`);
      return this.getSnapshot();
    }

    this.hero.defending = false;
    this.hero.mp -= skill.mpCost;

    if (skill.isHeal) {
      const healed = Math.min(this.hero.stats.maxHp - this.hero.hp, skill.power);
      this.hero.hp += healed;
      this.log.push(`${this.hero.name} lance ${skill.name} et récupère ${healed} PV.`);
    } else if (skill.power > 0) {
      const dmg = this.computeDamage(this.hero.stats.atk * 0.6 + skill.power, this.enemy);
      this.enemy.hp = Math.max(0, this.enemy.hp - dmg);
      this.log.push(`${this.hero.name} lance ${skill.name} et inflige ${dmg} PV !`);
    } else {
      this.log.push(`${this.hero.name} active ${skill.name} !`);
    }

    if (skill.statusEffect) {
      const target = skill.statusEffect.kind === 'shield' ? this.hero : this.enemy;
      this.applyStatus(
        target,
        skill.statusEffect.kind,
        skill.statusEffect.turns,
        skill.statusEffect.potency,
      );
    }

    this.runEnemyTurn();
    return this.getSnapshot();
  }

  playerUseItem(itemId: string): CombatSnapshot {
    if (this.phase !== 'player_turn') return this.getSnapshot();
    const itemName = this.db.items[itemId]?.name ?? itemId;
    const used = this.inventory.useConsumable(itemId);
    if (!used.ok) {
      this.log.push(`Impossible d’utiliser ${itemName} : ${used.reason ?? 'erreur'}`);
      return this.getSnapshot();
    }

    this.hero.defending = false;
    const healedHp = Math.min(this.hero.stats.maxHp - this.hero.hp, used.healHp);
    const healedMp = Math.min(this.hero.stats.maxMp - this.hero.mp, used.healMp);
    this.hero.hp += healedHp;
    this.hero.mp += healedMp;

    const parts: string[] = [];
    if (healedHp > 0) parts.push(`+${healedHp} PV`);
    if (healedMp > 0) parts.push(`+${healedMp} PM`);
    this.log.push(`${this.hero.name} utilise ${itemName} (${parts.join(', ') || 'sans effet'}).`);

    this.runEnemyTurn();
    return this.getSnapshot();
  }

  playerDefend(): CombatSnapshot {
    if (this.phase !== 'player_turn') return this.getSnapshot();
    this.hero.defending = true;
    const mpGain = Math.min(this.hero.stats.maxMp - this.hero.mp, 4);
    this.hero.mp += mpGain;
    this.log.push(`${this.hero.name} se met en garde (-50% dégâts, +${mpGain} PM).`);
    this.runEnemyTurn();
    return this.getSnapshot();
  }

  playerFlee(): CombatSnapshot {
    if (this.phase !== 'player_turn') return this.getSnapshot();
    this.phase = 'fled';
    this.log.push(`${this.hero.name} prend la fuite !`);
    return this.getSnapshot();
  }
}
