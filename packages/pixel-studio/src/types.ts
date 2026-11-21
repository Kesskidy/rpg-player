import type {
  AnchorPoint,
  AnimationClip,
  AnimationEventMarker,
  AssetMeta,
  AssetType,
  ColorRGBA,
  HexColor,
  Hitbox,
} from '@rpg-player/core-types';

/** Pixel Studio drawing tools (freehand + Paint-style draggable shapes). */
export type PixelShapeToolId = 'rect' | 'ellipse' | 'line';
export type PixelToolId = 'pencil' | 'eraser' | PixelShapeToolId;

export interface PixelPoint {
  x: number;
  y: number;
}

export type RgbaTuple = readonly [number, number, number, number];

export interface PixelChange {
  /** Pixel offset (y * width + x), not byte offset. */
  pixelIndex: number;
  before: RgbaTuple;
  after: RgbaTuple;
}

/**
 * In-memory representation of a layer for fast pixel manipulation.
 */
export interface PixelLayerRuntime {
  id: string;
  name: string;
  visible: boolean;
  /** Opacity in [0..1]. */
  opacity: number;
  locked: boolean;
  /** Raw RGBA buffer of length width * height * 4. */
  pixels: Uint8ClampedArray;
}

export interface PixelFrameRuntime {
  id: string;
  durationMs: number;
  /** Ordered bottom-to-top: index 0 is the background-most layer. */
  layers: PixelLayerRuntime[];
}

export interface PixelDocumentRuntime {
  schemaVersion: 1;
  assetId: string;
  width: number;
  height: number;
  palette: HexColor[];
  frames: PixelFrameRuntime[];
}

export interface CreateDocumentOptions {
  assetId: string;
  width: number;
  height: number;
  palette?: readonly HexColor[];
}

export interface PixelStudioState {
  activeTool: PixelToolId;
  activeColor: ColorRGBA;
  brushSize: number;
  shapeFilled: boolean;
  shapeLockAspect: boolean;
  activeFrameIndex: number;
  activeLayerId: string;
  showGrid: boolean;
}

/**
 * Command contract for headless Undo/Redo history.
 */
export interface HistoryCommand {
  readonly label: string;
  apply(doc: PixelDocumentRuntime): void;
  revert(doc: PixelDocumentRuntime): void;
}

export interface ExportAssetOptions {
  id?: string;
  name: string;
  type?: AssetType;
  columns?: number;
  anchor?: AnchorPoint;
  animations?: Record<string, AnimationClip>;
  hitboxes?: Hitbox[];
  tags?: string[];
}

export interface ExportAssetOutput {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
  pngBytes: Uint8Array;
  meta: AssetMeta;
}

export interface OnionSkinOptions {
  enabled: boolean;
  showPrevious: boolean;
  showNext: boolean;
  /** Opacity in [0..1] for ghost frames (default 0.3). */
  opacity: number;
}

export type TimelinePlaybackSpeed = 0.5 | 1 | 2;

export interface TimelineStepResult {
  /** Current 0-based position inside `clip.frames`. */
  frameIndex: number;
  /** Actual spritesheet frame index (`clip.frames[frameIndex]`). */
  spriteFrame: number;
  /** Event markers triggered on frames entered during this step. */
  triggeredMarkers: AnimationEventMarker[];
  /** True when a non-looping clip has reached the end of its last frame. */
  completed: boolean;
}

export type EngineChangeListener = () => void;
