import type { ColorRGBA, HexColor } from '@rpg-player/core-types';
import { applyPaletteSync, buildPaletteSync, utils } from 'image-q';
import { rgbaToHex } from './color.js';
import { MAX_GRID_DIMENSION, MIN_GRID_DIMENSION } from './document.js';

export interface RawRgbaImage {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
}

export interface ChromaKeyOptions {
  /** One or more background colors to remove. */
  colors: readonly ColorRGBA[];
  /** RGB Euclidean distance tolerance in [0..255]. */
  tolerance: number;
  /** If true, only removes pixels connected to the image edges via 4-way flood-fill. */
  contiguousOnly: boolean;
}

export interface ImageToPixelArtOptions {
  /** Target pixel-art height; width is computed automatically preserving aspect ratio. */
  targetHeight: number;
  chromaKey: ChromaKeyOptions;
  /**
   * Fraction in (0..1] of transparent/removed pixels in a cell above which
   * the resulting pixel becomes fully transparent. Default: 0.5 (50%).
   */
  transparencyThreshold?: number;
  /**
   * Optional RGB proximity grouping step (default: 10) used to group near-identical
   * compression shades when computing the dominant mode color of each cell.
   * Never blends across distinct colors (zero bilinear/bicubic smoothing).
   */
  dominantBucketStep?: number;
  /** Optional palette quantization cap (e.g. 16, 32, 64) via image-q. Null/undefined disables it. */
  paletteSize?: number | null;
}

export interface ImageToPixelArtResult {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
  extractedPalette: HexColor[];
  removedPixels: number;
}

function matchesAnyKeyColor(
  r: number,
  g: number,
  b: number,
  colors: readonly ColorRGBA[],
  toleranceSq: number,
): boolean {
  for (let i = 0; i < colors.length; i += 1) {
    const key = colors[i]!;
    const dr = r - key.r;
    const dg = g - key.g;
    const db = b - key.b;
    if (dr * dr + dg * dg + db * db <= toleranceSq) {
      return true;
    }
  }
  return false;
}

/**
 * Step 1: Removes selected background colors using either global RGB distance
 * or edge-seeded 4-way flood-fill (`contiguousOnly: true`) so interior pixels
 * matching the background color are preserved.
 */
export function applyChromaKey(
  src: RawRgbaImage,
  options: ChromaKeyOptions,
): { image: RawRgbaImage; removedPixels: number } {
  const out = new Uint8ClampedArray(src.rgba);
  if (options.colors.length === 0) {
    return {
      image: { width: src.width, height: src.height, rgba: out },
      removedPixels: 0,
    };
  }

  const tol = Math.max(0, Math.min(442, options.tolerance));
  const tolSq = tol * tol;
  const { width, height } = src;
  const totalPixels = width * height;
  let removedPixels = 0;

  if (!options.contiguousOnly) {
    for (let i = 0; i < totalPixels; i += 1) {
      const off = i * 4;
      if ((out[off + 3] ?? 0) < 128) continue;
      if (matchesAnyKeyColor(out[off]!, out[off + 1]!, out[off + 2]!, options.colors, tolSq)) {
        out[off] = 0;
        out[off + 1] = 0;
        out[off + 2] = 0;
        out[off + 3] = 0;
        removedPixels += 1;
      }
    }
    return { image: { width, height, rgba: out }, removedPixels };
  }

  // Contiguous edge-seeded 4-neighbor BFS flood-fill (zero recursion stack overflow)
  const visited = new Uint8Array(totalPixels);
  const queue = new Int32Array(totalPixels);
  let head = 0;
  let tail = 0;

  const trySeed = (x: number, y: number): void => {
    const idx = y * width + x;
    if (visited[idx]) return;
    const off = idx * 4;
    const a = out[off + 3] ?? 0;
    const alreadyTransparent = a < 128;
    const matchesKey =
      !alreadyTransparent &&
      matchesAnyKeyColor(out[off]!, out[off + 1]!, out[off + 2]!, options.colors, tolSq);

    if (alreadyTransparent || matchesKey) {
      visited[idx] = 1;
      queue[tail++] = idx;
      if (matchesKey) {
        out[off] = 0;
        out[off + 1] = 0;
        out[off + 2] = 0;
        out[off + 3] = 0;
        removedPixels += 1;
      }
    }
  };

  for (let x = 0; x < width; x += 1) {
    trySeed(x, 0);
    trySeed(x, height - 1);
  }
  for (let y = 1; y < height - 1; y += 1) {
    trySeed(0, y);
    trySeed(width - 1, y);
  }

  while (head < tail) {
    const idx = queue[head++]!;
    const x = idx % width;
    const y = (idx - x) / width;

    if (x > 0) trySeed(x - 1, y);
    if (x + 1 < width) trySeed(x + 1, y);
    if (y > 0) trySeed(x, y - 1);
    if (y + 1 < height) trySeed(x, y + 1);
  }

  return { image: { width, height, rgba: out }, removedPixels };
}

/**
 * Step 2: Strict cell-grid pixelation by dominant color (mode).
 * Never averages or smooths across distinct colors (no bilinear/bicubic blur).
 */
export function pixelateByDominantColor(
  src: RawRgbaImage,
  targetHeight: number,
  transparencyThreshold = 0.5,
  dominantBucketStep = 10,
): RawRgbaImage {
  const safeHeight = Math.max(
    MIN_GRID_DIMENSION,
    Math.min(MAX_GRID_DIMENSION, Math.trunc(targetHeight)),
  );
  const safeWidth = Math.max(
    MIN_GRID_DIMENSION,
    Math.min(MAX_GRID_DIMENSION, Math.round((src.width / Math.max(1, src.height)) * safeHeight)),
  );
  const threshold = Math.max(0.01, Math.min(1, transparencyThreshold));
  const step = Math.max(1, Math.trunc(dominantBucketStep));

  const out = new Uint8ClampedArray(safeWidth * safeHeight * 4);

  for (let ty = 0; ty < safeHeight; ty += 1) {
    const y0 = Math.floor((ty * src.height) / safeHeight);
    const y1 = Math.min(src.height, Math.max(y0 + 1, Math.floor(((ty + 1) * src.height) / safeHeight)));

    for (let tx = 0; tx < safeWidth; tx += 1) {
      const x0 = Math.floor((tx * src.width) / safeWidth);
      const x1 = Math.min(src.width, Math.max(x0 + 1, Math.floor(((tx + 1) * src.width) / safeWidth)));

      let total = 0;
      let transparentCount = 0;

      // Map bucketKey -> { count, exactCounts: Map<exactRgb24, number> }
      const buckets = new Map<number, { count: number; exacts: Map<number, number> }>();

      for (let sy = y0; sy < y1; sy += 1) {
        for (let sx = x0; sx < x1; sx += 1) {
          total += 1;
          const off = (sy * src.width + sx) * 4;
          const a = src.rgba[off + 3] ?? 0;
          if (a < 128) {
            transparentCount += 1;
            continue;
          }

          const r = src.rgba[off]!;
          const g = src.rgba[off + 1]!;
          const b = src.rgba[off + 2]!;

          const br = Math.min(255, Math.round(r / step));
          const bg = Math.min(255, Math.round(g / step));
          const bb = Math.min(255, Math.round(b / step));
          const bucketKey = (br << 16) | (bg << 8) | bb;
          const exactRgb = (r << 16) | (g << 8) | b;

          let bucket = buckets.get(bucketKey);
          if (!bucket) {
            bucket = { count: 0, exacts: new Map() };
            buckets.set(bucketKey, bucket);
          }
          bucket.count += 1;
          bucket.exacts.set(exactRgb, (bucket.exacts.get(exactRgb) ?? 0) + 1);
        }
      }

      const dstOff = (ty * safeWidth + tx) * 4;
      if (total === 0 || transparentCount / total >= threshold || buckets.size === 0) {
        out[dstOff] = 0;
        out[dstOff + 1] = 0;
        out[dstOff + 2] = 0;
        out[dstOff + 3] = 0;
        continue;
      }

      // Select dominant bucket, then its exact mode RGB (zero color averaging!)
      let bestBucketCount = -1;
      let bestBucket: { count: number; exacts: Map<number, number> } | null = null;
      for (const bucket of buckets.values()) {
        if (bucket.count > bestBucketCount) {
          bestBucketCount = bucket.count;
          bestBucket = bucket;
        }
      }

      let bestRgb = 0;
      let bestRgbCount = -1;
      if (bestBucket) {
        for (const [rgb, cnt] of bestBucket.exacts.entries()) {
          if (cnt > bestRgbCount) {
            bestRgbCount = cnt;
            bestRgb = rgb;
          }
        }
      }

      out[dstOff] = (bestRgb >>> 16) & 0xff;
      out[dstOff + 1] = (bestRgb >>> 8) & 0xff;
      out[dstOff + 2] = bestRgb & 0xff;
      out[dstOff + 3] = 255;
    }
  }

  return { width: safeWidth, height: safeHeight, rgba: out };
}

/**
 * Step 3 (optional): Quantizes opaque pixels down to `maxColors` using `image-q` (WuQuant + nearest),
 * preserving transparent pixels (`a === 0`) untouched and without wasting palette slots on alpha.
 */
export function quantizePixelBuffer(
  src: RawRgbaImage,
  maxColors: number,
): RawRgbaImage {
  const cap = Math.max(2, Math.min(256, Math.trunc(maxColors)));
  const totalPixels = src.width * src.height;

  // Gather opaque pixels only so transparent pixels do not consume palette slots
  const opaqueBytes: number[] = [];
  for (let i = 0; i < totalPixels; i += 1) {
    const off = i * 4;
    if ((src.rgba[off + 3] ?? 0) >= 128) {
      opaqueBytes.push(src.rgba[off]!, src.rgba[off + 1]!, src.rgba[off + 2]!, 255);
    }
  }

  if (opaqueBytes.length === 0) {
    return { width: src.width, height: src.height, rgba: new Uint8ClampedArray(src.rgba) };
  }

  const opaqueCount = opaqueBytes.length / 4;
  const opaqueContainer = utils.PointContainer.fromUint8Array(
    new Uint8Array(opaqueBytes),
    opaqueCount,
    1,
  );
  const palette = buildPaletteSync([opaqueContainer], {
    colorDistanceFormula: 'euclidean-bt709-noalpha',
    paletteQuantization: 'wuquant',
    colors: cap,
  });

  const fullContainer = utils.PointContainer.fromUint8Array(
    new Uint8Array(src.rgba.buffer, src.rgba.byteOffset, src.rgba.byteLength),
    src.width,
    src.height,
  );
  const quantized = applyPaletteSync(fullContainer, palette, {
    colorDistanceFormula: 'euclidean-bt709-noalpha',
    imageQuantization: 'nearest',
  });

  const mapped = quantized.toUint8Array();
  const out = new Uint8ClampedArray(totalPixels * 4);
  for (let i = 0; i < totalPixels; i += 1) {
    const off = i * 4;
    if ((src.rgba[off + 3] ?? 0) < 128) {
      out[off] = 0;
      out[off + 1] = 0;
      out[off + 2] = 0;
      out[off + 3] = 0;
    } else {
      out[off] = mapped[off] ?? 0;
      out[off + 1] = mapped[off + 1] ?? 0;
      out[off + 2] = mapped[off + 2] ?? 0;
      out[off + 3] = 255;
    }
  }

  return { width: src.width, height: src.height, rgba: out };
}

function extractTopPalette(rgba: Uint8ClampedArray, maxEntries = 32): HexColor[] {
  const counts = new Map<number, number>();
  for (let i = 0; i < rgba.length; i += 4) {
    if ((rgba[i + 3] ?? 0) < 128) continue;
    const rgb = (rgba[i]! << 16) | (rgba[i + 1]! << 8) | rgba[i + 2]!;
    counts.set(rgb, (counts.get(rgb) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxEntries)
    .map(([rgb]) =>
      rgbaToHex({
        r: (rgb >>> 16) & 0xff,
        g: (rgb >>> 8) & 0xff,
        b: rgb & 0xff,
        a: 255,
      }),
    );
}

/**
 * Complete pure-TS pipeline: Chroma Key -> Dominant-Color Grid Pixelation -> Optional Palette Quantization.
 */
export function convertImageToPixelArt(
  src: RawRgbaImage,
  options: ImageToPixelArtOptions,
): ImageToPixelArtResult {
  const { image: keyed, removedPixels } = applyChromaKey(src, options.chromaKey);
  const pixelated = pixelateByDominantColor(
    keyed,
    options.targetHeight,
    options.transparencyThreshold ?? 0.5,
    options.dominantBucketStep ?? 10,
  );
  const finalImg =
    options.paletteSize && options.paletteSize > 0
      ? quantizePixelBuffer(pixelated, options.paletteSize)
      : pixelated;

  return {
    width: finalImg.width,
    height: finalImg.height,
    rgba: finalImg.rgba,
    extractedPalette: extractTopPalette(finalImg.rgba, 32),
    removedPixels,
  };
}
