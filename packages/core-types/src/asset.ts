export const ASSET_SCHEMA_VERSION = 1 as const;

export type AssetType = 'sprite' | 'tileset' | 'ui' | 'vfx' | 'cutscene';

export type AnimationCategory = 'vfx' | 'combat' | 'cutscene';

export type AnimationMarkerEvent =
  | 'hit_frame'
  | 'vfx_spawn'
  | 'sfx'
  | 'camera_shake'
  | 'custom';

export interface AnimationEventMarker {
  /** Index inside `AnimationClip.frames` (0-based position in the clip timeline). */
  frameIndex: number;
  event: AnimationMarkerEvent;
  /** Optional identifier (e.g. VFX asset id, SFX key, shake intensity). */
  payload?: string;
}

/**
 * Anchor point in pixels relative to the frame's top-left corner.
 * Default for characters is bottom-center (feet) so a 32x48 sprite stands cleanly on a 32x32 tile
 * and Y-sorts accurately against decor and other characters.
 */
export interface AnchorPoint {
  x: number;
  y: number;
}

/**
 * Axis-aligned collision footprint relative to an entity/asset anchor (feet).
 * Example for a 32x48 character: { offsetX: -12, offsetY: -16, width: 24, height: 16 }
 * blocks only the 16px feet area while letting the upper 32px overlap the tile above.
 */
export interface ColliderBox {
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
}

export interface Hitbox {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Unified animation clip shared across Pixel Studio, Animation Studio,
 * RPG Engine (combat, VFX, cutscenes) and VTT.
 */
export interface AnimationClip {
  category?: AnimationCategory;
  frames: number[];
  fps: number;
  /** Optional per-frame durations in ms (overrides `1000 / fps` when provided). */
  frameDurationsMs?: number[];
  loop?: boolean;
  /** Frame-accurate event markers (e.g. `hit_frame`, `vfx_spawn`, `camera_shake`). */
  markers?: AnimationEventMarker[];
}

/**
 * Shared metadata for every visual asset exported by Pixel Studio / Animation Studio
 * and consumed by RPG Engine and VTT.
 */
export interface AssetMeta {
  schemaVersion: typeof ASSET_SCHEMA_VERSION;
  id: string;
  name: string;
  type: AssetType;
  gridWidth: number;
  gridHeight: number;
  frameCount: number;
  columns: number;
  /** Relative path to the baked PNG spritesheet (e.g. "assets/chevalier.png") */
  filePath: string;
  /** Relative path to the editable Pixel Studio document (e.g. "assets/chevalier.pxs.json") */
  sourcePath: string;
  anchor: AnchorPoint;
  /** Optional default collision footprint inherited by entities/props using this asset. */
  defaultCollider?: ColliderBox;
  animations: Record<string, AnimationClip>;
  hitboxes: Hitbox[];
  tags: string[];
}
