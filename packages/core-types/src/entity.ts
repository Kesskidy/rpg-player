import type { ColliderBox } from './asset.js';
import type { CardinalDirection, DepthPlane } from './map.js';

export const ENTITY_SCHEMA_VERSION = 1 as const;

export type EntityKind = 'player' | 'npc' | 'enemy' | 'chest' | 'prop' | 'zone';

export interface EntityTransform {
  /** World-space X coordinate of the entity anchor (feet). */
  x: number;
  /** World-space Y coordinate of the entity anchor (feet), used as primary Y-sorting key. */
  y: number;
  direction: CardinalDirection;
  plane: DepthPlane;
  /** Fine-tuning offset added to transform.y during Y-sorting. */
  sortOffsetY: number;
}

export interface EntityCollisionConfig {
  /** Whether this entity dynamically blocks passage. */
  isSolid: boolean;
  /** Optional AABB footprint relative to the entity's feet anchor (inherits AssetMeta.defaultCollider if omitted). */
  collider?: ColliderBox;
}

export interface EntityInteractionConfig {
  trigger: 'interact' | 'touch' | 'none';
  narrativeId: string | null;
  battleEnemyId?: string | null;
}

export interface EntityVttConfig {
  ownerIds: string[];
  lightRadius: number;
  visibleToPlayers: boolean;
}

/**
 * Unified entity schema shared across RPG Engine (player, NPCs, enemies, large props)
 * and VTT Mode (multiplayer tokens).
 */
export interface EntityData {
  schemaVersion: typeof ENTITY_SCHEMA_VERSION;
  id: string;
  name: string;
  kind: EntityKind;
  assetId: string | null;
  transform: EntityTransform;
  collision: EntityCollisionConfig;
  interaction?: EntityInteractionConfig;
  vtt?: EntityVttConfig;
}
