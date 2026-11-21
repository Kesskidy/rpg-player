import type {
  EquipmentSlot,
  InventorySlotEntry,
  ItemDef,
  RpgDatabase,
  StatBlock,
} from '@rpg-player/core-types';

export interface InventoryActionResult {
  ok: boolean;
  reason?: string;
}

export interface UseConsumableResult extends InventoryActionResult {
  healHp: number;
  healMp: number;
}

/**
 * Headless RPG inventory & equipment system (slots, weight limit, stackable items, stat bonuses).
 */
export class InventorySystem {
  private readonly db: RpgDatabase;
  private readonly maxSlots: number;
  private readonly maxWeight: number;
  private readonly slots: InventorySlotEntry[] = [];
  private readonly equipped: Partial<Record<EquipmentSlot, string>> = {};
  private gold = 0;

  constructor(db: RpgDatabase) {
    this.db = db;
    this.maxSlots = Math.max(1, db.hero.maxSlots);
    this.maxWeight = Math.max(1, db.hero.maxWeight);

    for (const start of db.hero.startingItems) {
      this.addItem(start.itemId, start.quantity);
    }
  }

  getGold(): number {
    return this.gold;
  }

  addGold(delta: number): void {
    this.gold = Math.max(0, Math.round(this.gold + delta));
  }

  getMaxSlots(): number {
    return this.maxSlots;
  }

  getMaxWeight(): number {
    return this.maxWeight;
  }

  getSlots(): readonly InventorySlotEntry[] {
    return this.slots;
  }

  getEquipped(): Readonly<Partial<Record<EquipmentSlot, string>>> {
    return this.equipped;
  }

  getItemDef(itemId: string): ItemDef | null {
    return this.db.items[itemId] ?? null;
  }

  getTotalWeight(): number {
    let total = 0;
    for (const entry of this.slots) {
      const def = this.db.items[entry.itemId];
      if (def) {
        total += def.weight * entry.quantity;
      }
    }
    for (const itemId of Object.values(this.equipped)) {
      if (!itemId) continue;
      const def = this.db.items[itemId];
      if (def) {
        total += def.weight;
      }
    }
    return Math.round(total * 100) / 100;
  }

  /**
   * Replaces bag slots, gold, and optional equipment cleanly from an external snapshot
   * (e.g. VTT character sheet) without mutating while iterating.
   */
  replaceFromSnapshot(
    slots: readonly InventorySlotEntry[],
    gold: number,
    equipped?: Partial<Record<EquipmentSlot, string>>,
  ): void {
    this.slots.length = 0;
    for (const key of Object.keys(this.equipped) as EquipmentSlot[]) {
      delete this.equipped[key];
    }
    this.gold = Math.max(0, Math.round(gold));

    for (const entry of slots) {
      const qty = Math.trunc(entry.quantity);
      if (qty <= 0) continue;
      const def = this.db.items[entry.itemId];
      if (def?.stackable) {
        const existing = this.slots.find((s) => s.itemId === entry.itemId);
        if (existing) {
          existing.quantity += qty;
        } else {
          this.slots.push({ itemId: entry.itemId, quantity: qty });
        }
      } else {
        for (let i = 0; i < qty; i += 1) {
          this.slots.push({ itemId: entry.itemId, quantity: 1 });
        }
      }
    }

    if (equipped) {
      for (const [slotKey, itemId] of Object.entries(equipped) as Array<[EquipmentSlot, string | undefined]>) {
        if (itemId && this.db.items[itemId]) {
          this.equipped[slotKey] = itemId;
        }
      }
    }
  }

  /**
   * Returns a flat list of all owned items (bag + equipped) for serialization back to
   * simple slot-based sheets (e.g. VTT character sheet) without losing equipped gear.
   */
  toFlatSlots(): InventorySlotEntry[] {
    const result: InventorySlotEntry[] = this.slots.map((s) => ({ ...s }));
    for (const itemId of Object.values(this.equipped)) {
      if (!itemId) continue;
      const def = this.db.items[itemId];
      if (def?.stackable) {
        const existing = result.find((s) => s.itemId === itemId);
        if (existing) {
          existing.quantity += 1;
        } else {
          result.push({ itemId, quantity: 1 });
        }
      } else {
        result.push({ itemId, quantity: 1 });
      }
    }
    return result;
  }

  getItemCount(itemId: string): number {
    let count = 0;
    for (const entry of this.slots) {
      if (entry.itemId === itemId) {
        count += entry.quantity;
      }
    }
    // Equipped items still count as owned by the hero
    for (const equippedId of Object.values(this.equipped)) {
      if (equippedId === itemId) {
        count += 1;
      }
    }
    return count;
  }

  hasItem(itemId: string, minQuantity = 1): boolean {
    return this.getItemCount(itemId) >= Math.max(1, minQuantity);
  }

  addItem(itemId: string, quantity = 1): InventoryActionResult {
    const qty = Math.trunc(quantity);
    if (qty <= 0) return { ok: false, reason: 'Quantité invalide.' };

    const def = this.db.items[itemId];
    if (!def) {
      return { ok: false, reason: `Objet inconnu : "${itemId}".` };
    }

    const addedWeight = def.weight * qty;
    if (this.getTotalWeight() + addedWeight > this.maxWeight + 0.0001) {
      return { ok: false, reason: 'Inventaire trop lourd.' };
    }

    if (def.stackable) {
      const existing = this.slots.find((slot) => slot.itemId === itemId);
      if (existing) {
        existing.quantity += qty;
        return { ok: true };
      }
      if (this.slots.length >= this.maxSlots) {
        return { ok: false, reason: 'Plus de slots disponibles.' };
      }
      this.slots.push({ itemId, quantity: qty });
      return { ok: true };
    }

    if (this.slots.length + qty > this.maxSlots) {
      return { ok: false, reason: 'Plus de slots disponibles.' };
    }
    for (let i = 0; i < qty; i += 1) {
      this.slots.push({ itemId, quantity: 1 });
    }
    return { ok: true };
  }

  removeItem(itemId: string, quantity = 1): InventoryActionResult {
    let remaining = Math.trunc(quantity);
    if (remaining <= 0) return { ok: false, reason: 'Quantité invalide.' };
    if (this.getItemCount(itemId) < remaining) {
      return { ok: false, reason: 'Quantité insuffisante.' };
    }

    for (let i = this.slots.length - 1; i >= 0 && remaining > 0; i -= 1) {
      const slot = this.slots[i]!;
      if (slot.itemId !== itemId) continue;

      if (slot.quantity <= remaining) {
        remaining -= slot.quantity;
        this.slots.splice(i, 1);
      } else {
        slot.quantity -= remaining;
        remaining = 0;
      }
    }

    // If still remaining, remove from equipped slots (e.g. quest turn-in)
    if (remaining > 0) {
      for (const slotKey of Object.keys(this.equipped) as EquipmentSlot[]) {
        if (this.equipped[slotKey] === itemId && remaining > 0) {
          delete this.equipped[slotKey];
          remaining -= 1;
        }
      }
    }

    return { ok: true };
  }

  equipItem(itemId: string): InventoryActionResult {
    const def = this.db.items[itemId];
    if (!def || def.category !== 'equipment' || !def.slot) {
      return { ok: false, reason: 'Cet objet ne peut pas être équipé.' };
    }

    const bagIdx = this.slots.findIndex((entry) => entry.itemId === itemId);
    if (bagIdx === -1) {
      return { ok: false, reason: 'Objet absent du sac.' };
    }

    const entry = this.slots[bagIdx]!;
    const previousEquipped = this.equipped[def.slot];

    // Check slot capacity BEFORE mutating when equipping from a multi-item stack while swapping
    if (previousEquipped && entry.quantity > 1) {
      const prevDef = this.db.items[previousEquipped];
      const canStackPrevious =
        Boolean(prevDef?.stackable) && this.slots.some((s) => s.itemId === previousEquipped);
      if (!canStackPrevious && this.slots.length >= this.maxSlots) {
        return { ok: false, reason: 'Plus de slots disponibles pour échanger cet équipement.' };
      }
    }

    // Remove one from bag
    if (entry.quantity > 1) {
      entry.quantity -= 1;
    } else {
      this.slots.splice(bagIdx, 1);
    }

    this.equipped[def.slot] = itemId;

    if (previousEquipped) {
      const prevDef = this.db.items[previousEquipped];
      const existingPrev = prevDef?.stackable
        ? this.slots.find((s) => s.itemId === previousEquipped)
        : undefined;
      if (existingPrev) {
        existingPrev.quantity += 1;
      } else {
        this.slots.push({ itemId: previousEquipped, quantity: 1 });
      }
    }

    return { ok: true };
  }

  unequipSlot(slot: EquipmentSlot): InventoryActionResult {
    const itemId = this.equipped[slot];
    if (!itemId) {
      return { ok: false, reason: 'Aucun équipement dans cet emplacement.' };
    }
    const def = this.db.items[itemId];
    const existingStack = def?.stackable
      ? this.slots.find((s) => s.itemId === itemId)
      : undefined;
    if (!existingStack && this.slots.length >= this.maxSlots) {
      return { ok: false, reason: 'Inventaire plein.' };
    }
    delete this.equipped[slot];
    if (existingStack) {
      existingStack.quantity += 1;
    } else {
      this.slots.push({ itemId, quantity: 1 });
    }
    return { ok: true };
  }

  useConsumable(itemId: string): UseConsumableResult {
    const def = this.db.items[itemId];
    if (!def || def.category !== 'consumable') {
      return { ok: false, reason: 'Objet non consommable.', healHp: 0, healMp: 0 };
    }
    const removed = this.removeItem(itemId, 1);
    if (!removed.ok) {
      return { ok: false, reason: removed.reason, healHp: 0, healMp: 0 };
    }
    return {
      ok: true,
      healHp: def.healHp ?? 0,
      healMp: def.healMp ?? 0,
    };
  }

  computeEffectiveStats(base: StatBlock): StatBlock {
    const result: StatBlock = { ...base };
    for (const itemId of Object.values(this.equipped)) {
      if (!itemId) continue;
      const bonus = this.db.items[itemId]?.statBonus;
      if (!bonus) continue;
      result.maxHp += bonus.maxHp ?? 0;
      result.maxMp += bonus.maxMp ?? 0;
      result.atk += bonus.atk ?? 0;
      result.def += bonus.def ?? 0;
    }
    return result;
  }
}
