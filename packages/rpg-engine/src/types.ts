import type { CardinalDirection, ColliderBox, TileCell } from '@rpg-player/core-types';

export type MapEditorTool =
  | 'paint-tile'
  | 'erase-tile'
  | 'paint-collision'
  | 'erase-collision'
  | 'set-spawn'
  | 'place-event'
  | 'erase-event';

export type TilePaintMode = 'replace' | 'stack';

export type ViewportMode = 'editor' | 'preview';

export interface TileCoord {
  tx: number;
  ty: number;
}

export interface CreateMapOptions {
  id: string;
  name: string;
  width: number;
  height: number;
  tileSize?: number;
}

export interface MapEditorState {
  activeLayerId: string;
  activeTool: MapEditorTool;
  paintMode: TilePaintMode;
  selectedTile: TileCell | null;
  showGrid: boolean;
  showCollisions: boolean;
}

export interface InputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

export interface WorldRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PlayerRuntimeState {
  /** World-space X coordinate of the player's feet/anchor in pixels. */
  x: number;
  /** World-space Y coordinate of the player's feet/anchor in pixels (also the Y-Sorting key). */
  y: number;
  direction: CardinalDirection;
  isMoving: boolean;
  speedPxPerSec: number;
  /** Feet collision footprint relative to (x, y). */
  collider: ColliderBox;
}

export interface CameraState {
  x: number;
  y: number;
  zoom: number;
}

export type MapChangeListener = () => void;
