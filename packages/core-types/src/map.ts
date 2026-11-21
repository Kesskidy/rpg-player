import type { ColliderBox } from './asset.js';

export const MAP_SCHEMA_VERSION = 2 as const;
export const LEGACY_MAP_SCHEMA_VERSION = 1 as const;

export type CardinalDirection = 'up' | 'down' | 'left' | 'right';

/**
 * Visual depth plane separating rendering order from collision logic:
 * - `below`: always rendered under characters (ground, carpets, ground shadows)
 * - `y_sorted`: rendered alongside characters/entities sorted dynamically by feet Y coordinate
 * - `above`: always rendered above characters (canopies, roofs, arches)
 */
export type DepthPlane = 'below' | 'y_sorted' | 'above';

/**
 * Reference to a single tile/asset placement on a map cell.
 * Multiple placements can be stacked on the exact same cell, whether blocked or walkable.
 */
export interface TileCell {
  assetId: string;
  /** Column index inside the asset grid (0 for single-tile assets). */
  tileX: number;
  /** Row index inside the asset grid (0 for single-tile assets). */
  tileY: number;
  /** Optional Y-sort offset in pixels from tile top (defaults to tileSize for y_sorted layers). */
  sortOffsetY?: number;
}

export interface TileLayer {
  id: string;
  name: string;
  plane: DepthPlane;
  /** Ordering within the same depth plane (lower renders first). */
  zOrder: number;
  visible: boolean;
  /** Opacity in [0..1]. */
  opacity: number;
  /**
   * Sparse map keyed by `"x,y"` holding an ordered stack of assets on that cell.
   * Allows stacking Ground -> Furniture -> Item on top even on blocked cells.
   */
  cells: Record<string, TileCell[]>;
}

/**
 * Independent, freely editable collision grid dissociated from visual tile layers.
 */
export interface CollisionLayerData {
  visibleInEditor: boolean;
  /** Flat row-major array of length width * height (0 = walkable, 1 = blocked). */
  cells: number[];
}

export interface MapSpawnPoint {
  /** Tile column index. */
  x: number;
  /** Tile row index. */
  y: number;
  direction: CardinalDirection;
}

export type MapEventKind = 'npc' | 'chest' | 'zone' | 'prop';

export type MapEventTrigger = 'interact' | 'touch' | 'none';

export interface MapTeleportTarget {
  targetMapId: string;
  targetX: number;
  targetY: number;
  direction?: CardinalDirection;
}

/**
 * Interactive entity or volumetric prop placed on a map tile.
 * Supports independent solidity (`isSolid`), custom feet collider (`collider`),
 * depth plane (`below` | `y_sorted` | `above`), and map teleportation (`teleport`).
 */
export interface MapEvent {
  id: string;
  name: string;
  kind: MapEventKind;
  trigger: MapEventTrigger;
  /** Tile column index. */
  x: number;
  /** Tile row index. */
  y: number;
  spriteAssetId: string | null;
  narrativeId: string | null;
  battleEnemyId?: string | null;
  /** Optional portal/door destination to another map in the project. */
  teleport?: MapTeleportTarget | null;
  /** Whether this entity blocks character movement. */
  isSolid: boolean;
  /** Optional feet AABB collider relative to entity feet anchor (defaults to a feet footprint). */
  collider?: ColliderBox;
  /** Rendering depth plane (defaults to 'y_sorted' for NPCs/chests/props, 'below' for zones). */
  plane: DepthPlane;
  /** Fine-tuning offset added to feet Y during Y-sorting. */
  sortOffsetY?: number;
}

/**
 * Lightweight map summary indexed in `project.json`.
 */
export interface MapMeta {
  id: string;
  name: string;
  width: number;
  height: number;
  tileSize: number;
  /** Relative path to the full map file (e.g. "maps/village.map.json"). */
  filePath: string;
}

/**
 * Complete tilemap persisted in `maps/<id>.map.json` (schema v2).
 * Shared between RPG Engine (Phases 2/3) and VTT (Phase 4).
 */
export interface TileMapData {
  schemaVersion: typeof MAP_SCHEMA_VERSION;
  id: string;
  name: string;
  /** Map width in tiles. */
  width: number;
  /** Map height in tiles. */
  height: number;
  /** Base tile size in pixels (e.g. 16 or 32). */
  tileSize: number;
  /** Visual layers grouped into below / y_sorted / above planes. */
  layers: TileLayer[];
  /** Independent editable collision layer decoupled from visual tiles. */
  collisionLayer: CollisionLayerData;
  playerSpawn: MapSpawnPoint;
  /** Optional AssetMeta.id used as the playable character sprite in Preview mode. */
  playerAssetId: string | null;
  /** Optional custom feet collider for the playable character (e.g. 24x16px at feet for a 32x48 sprite). */
  playerCollider?: ColliderBox;
  /** Interactive entities / NPCs / volumetric props placed on the map. */
  events: MapEvent[];
}
