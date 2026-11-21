export const RPG_DATABASE_SCHEMA_VERSION = 1 as const;

export type ItemCategory = 'consumable' | 'equipment' | 'quest';

export type EquipmentSlot = 'weapon' | 'armor' | 'accessory';

export type StatusEffectKind = 'poison' | 'burn' | 'shield' | 'stun';

export type CombatMode = 'simple' | 'turn_based_animated' | 'dynamic_ai';

export type AIBehaviorKind = 'melee' | 'ranged' | 'hybrid';

export interface StatBlock {
  maxHp: number;
  maxMp: number;
  atk: number;
  def: number;
}

export interface CombatAnimationBindings {
  idle?: string;
  move?: string;
  attack_melee?: string;
  attack_ranged?: string;
  cast?: string;
  hurt?: string;
  death?: string;
}

export interface AttackHitboxSpec {
  width: number;
  height: number;
  reachOffset: number;
}

/**
 * Configurable AI behavior profile for Mode 3 (`dynamic_ai`) combat.
 */
export interface AIProfile {
  behavior: AIBehaviorKind;
  /** Detection distance in pixels. */
  aggroRange: number;
  /** Melee strike reach in pixels. */
  attackRange: number;
  /** Ideal combat distance for ranged/hybrid enemies in pixels. */
  preferredRange: number;
  /** Distance below which ranged enemies retreat (kite) in pixels. */
  retreatRange: number;
  /** Movement speed in pixels per second. */
  moveSpeed: number;
  /** Cooldown between attacks in milliseconds. */
  attackCooldownMs: number;
  projectileVfxAssetId?: string | null;
  projectileSpeed?: number;
  attackHitbox?: AttackHitboxSpec;
}

export interface CombatConfig {
  defaultMode: CombatMode;
  allowModeSwitchInPreview: boolean;
  dynamicSettings: {
    heroAttackRange: number;
    heroAttackCooldownMs: number;
    defaultProjectileSpeed: number;
  };
}

export interface ItemDef {
  id: string;
  name: string;
  description: string;
  category: ItemCategory;
  iconAssetId?: string | null;
  stackable: boolean;
  weight: number;
  slot?: EquipmentSlot;
  statBonus?: Partial<StatBlock>;
  healHp?: number;
  healMp?: number;
}

export interface StatusEffectSpec {
  kind: StatusEffectKind;
  turns: number;
  potency: number;
}

export interface SkillDef {
  id: string;
  name: string;
  description: string;
  mpCost: number;
  power: number;
  isHeal?: boolean;
  statusEffect?: StatusEffectSpec;
  vfxAssetId?: string | null;
  vfxClipName?: string;
}

export interface EnemyDef {
  id: string;
  name: string;
  spriteAssetId?: string | null;
  stats: StatBlock;
  skillIds: string[];
  rewardItemId?: string | null;
  rewardGold?: number;
  combatAnimations?: CombatAnimationBindings;
  aiProfile?: AIProfile;
}

export interface InventorySlotEntry {
  itemId: string;
  quantity: number;
}

export interface HeroConfig {
  name: string;
  stats: StatBlock;
  skillIds: string[];
  startingItems: InventorySlotEntry[];
  maxSlots: number;
  maxWeight: number;
  combatAnimations?: CombatAnimationBindings;
}

export interface CharacterAttributes {
  str: number;
  dex: number;
  int: number;
  cha: number;
}

/**
 * Full RPG / JDR Character Sheet editable in Database & reusable in VTT / RPG Engine.
 */
export interface CharacterSheetDef {
  id: string;
  name: string;
  characterClass: string;
  role: 'hero' | 'companion' | 'npc' | 'player_template';
  level: number;
  spriteAssetId: string | null;
  stats: StatBlock;
  attributes: CharacterAttributes;
  skillIds: string[];
  equipment: Partial<Record<EquipmentSlot, string>>;
  inventory: InventorySlotEntry[];
  gold: number;
  bio: string;
  notes: string;
}

/**
 * Shared RPG database saved in `database/rpg.db.json`.
 * Consumed by RPG Engine (Phases 3 & 5) and VTT character/inventory sheets (Phase 4).
 */
export interface RpgDatabase {
  schemaVersion: typeof RPG_DATABASE_SCHEMA_VERSION;
  hero: HeroConfig;
  combatConfig?: CombatConfig;
  characterSheets?: Record<string, CharacterSheetDef>;
  items: Record<string, ItemDef>;
  skills: Record<string, SkillDef>;
  enemies: Record<string, EnemyDef>;
}
