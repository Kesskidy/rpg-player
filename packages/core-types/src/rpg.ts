export const RPG_DATABASE_SCHEMA_VERSION = 1 as const;

export type ItemCategory = 'consumable' | 'equipment' | 'quest';

export type EquipmentSlot = 'weapon' | 'armor' | 'accessory';

export type StatusEffectKind = 'poison' | 'burn' | 'shield' | 'stun';

export interface StatBlock {
  maxHp: number;
  maxMp: number;
  atk: number;
  def: number;
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
}

export interface EnemyDef {
  id: string;
  name: string;
  spriteAssetId?: string | null;
  stats: StatBlock;
  skillIds: string[];
  rewardItemId?: string | null;
  rewardGold?: number;
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
}

/**
 * Shared RPG database saved in `database/rpg.db.json`.
 * Consumed by RPG Engine (Phase 3) and VTT character/inventory sheets (Phase 4).
 */
export interface RpgDatabase {
  schemaVersion: typeof RPG_DATABASE_SCHEMA_VERSION;
  hero: HeroConfig;
  items: Record<string, ItemDef>;
  skills: Record<string, SkillDef>;
  enemies: Record<string, EnemyDef>;
}
