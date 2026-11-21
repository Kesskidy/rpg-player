export const PIXEL_DOCUMENT_SCHEMA_VERSION = 1 as const;

export const GRID_PRESETS = [16, 24, 32, 48, 64, 128] as const;
export type GridPreset = (typeof GRID_PRESETS)[number];

export interface GridSize {
  width: number;
  height: number;
}

/** RGBA color with channels in [0..255]. */
export interface ColorRGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** Hex color string (#RRGGBB or #RRGGBBAA). */
export type HexColor = string;

export interface PixelLayerSerialized {
  id: string;
  name: string;
  visible: boolean;
  /** Layer opacity in [0..1]. */
  opacity: number;
  locked: boolean;
  /** Base64-encoded raw RGBA pixel buffer of length width * height * 4. */
  pixelsBase64: string;
}

export interface PixelFrameSerialized {
  id: string;
  durationMs: number;
  layers: PixelLayerSerialized[];
}

/**
 * Editable source document saved as `assets/<id>.pxs.json`.
 * Preserves layers, frames, and palette so assets can always be re-opened in Pixel Studio.
 */
export interface PixelDocumentSerialized {
  schemaVersion: typeof PIXEL_DOCUMENT_SCHEMA_VERSION;
  assetId: string;
  width: number;
  height: number;
  palette: HexColor[];
  frames: PixelFrameSerialized[];
}

/** Curated 16-color fantasy RPG starter palette (Endesga-inspired). */
export const DEFAULT_PALETTE: readonly HexColor[] = [
  '#141013',
  '#3b1725',
  '#73172d',
  '#b4202a',
  '#df3e23',
  '#fa6a0a',
  '#f9a31b',
  '#ffd541',
  '#fffc40',
  '#d6f264',
  '#59c135',
  '#14a02e',
  '#1a7a3e',
  '#249fde',
  '#285cc4',
  '#f5ffe8',
] as const;
