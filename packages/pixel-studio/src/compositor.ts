import { blendPixelOver, clampUnit } from './color.js';
import type { PixelDocumentRuntime, PixelFrameRuntime } from './types.js';

/**
 * Flattens all visible layers of a frame bottom-to-top into a single RGBA buffer.
 */
export function compositeFrame(
  frame: PixelFrameRuntime,
  width: number,
  height: number,
): Uint8ClampedArray {
  const output = new Uint8ClampedArray(width * height * 4);
  const pixelCount = width * height;

  for (const layer of frame.layers) {
    if (!layer.visible) continue;
    const opacity = clampUnit(layer.opacity);
    if (opacity <= 0) continue;

    const src = layer.pixels;
    for (let i = 0; i < pixelCount; i += 1) {
      const offset = i * 4;
      const srcA = src[offset + 3] ?? 0;
      if (srcA === 0) continue;

      blendPixelOver(
        output,
        offset,
        src[offset] ?? 0,
        src[offset + 1] ?? 0,
        src[offset + 2] ?? 0,
        srcA,
        opacity,
      );
    }
  }

  return output;
}

export interface CompositedSpritesheet {
  width: number;
  height: number;
  columns: number;
  rows: number;
  rgba: Uint8ClampedArray;
}

/**
 * Packs all frames of a document into a single RGBA spritesheet buffer.
 */
export function compositeSpritesheet(
  doc: PixelDocumentRuntime,
  requestedColumns?: number,
): CompositedSpritesheet {
  const frameCount = Math.max(1, doc.frames.length);
  const columns = requestedColumns
    ? Math.max(1, Math.min(frameCount, Math.trunc(requestedColumns)))
    : frameCount;
  const rows = Math.ceil(frameCount / columns);

  const sheetWidth = columns * doc.width;
  const sheetHeight = rows * doc.height;
  const sheetRgba = new Uint8ClampedArray(sheetWidth * sheetHeight * 4);

  for (let frameIdx = 0; frameIdx < doc.frames.length; frameIdx += 1) {
    const frame = doc.frames[frameIdx];
    if (!frame) continue;

    const frameRgba = compositeFrame(frame, doc.width, doc.height);
    const col = frameIdx % columns;
    const row = Math.floor(frameIdx / columns);
    const baseX = col * doc.width;
    const baseY = row * doc.height;

    for (let y = 0; y < doc.height; y += 1) {
      const srcRowStart = y * doc.width * 4;
      const dstRowStart = ((baseY + y) * sheetWidth + baseX) * 4;
      sheetRgba.set(
        frameRgba.subarray(srcRowStart, srcRowStart + doc.width * 4),
        dstRowStart,
      );
    }
  }

  return {
    width: sheetWidth,
    height: sheetHeight,
    columns,
    rows,
    rgba: sheetRgba,
  };
}
