export const ASSET_SCHEMA_VERSION = 1 as const;

export type AssetType = 'sprite' | 'tileset' | 'ui';

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

export interface AnimationClip {
  frames: number[];
  fps: number;
  loop?: boolean;
}

/**
 * Shared metadata for every visual asset exported by Pixel Studio
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
