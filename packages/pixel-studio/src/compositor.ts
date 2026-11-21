import { blendPixelOver, clampUnit } from './color.js';
import type { OnionSkinOptions, PixelDocumentRuntime, PixelFrameRuntime } from './types.js';

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

function blendTintedGhost(
  dst: Uint8ClampedArray,
  ghostRgba: Uint8ClampedArray,
  tintR: number,
  tintG: number,
  tintB: number,
  opacity: number,
): void {
  const pixelCount = dst.length / 4;
  const alphaScale = clampUnit(opacity);
  for (let i = 0; i < pixelCount; i += 1) {
    const off = i * 4;
    const ga = ghostRgba[off + 3] ?? 0;
    if (ga === 0) continue;
    const gr = Math.round(((ghostRgba[off] ?? 0) * 0.45 + tintR * 0.55));
    const gg = Math.round(((ghostRgba[off + 1] ?? 0) * 0.45 + tintG * 0.55));
    const gb = Math.round(((ghostRgba[off + 2] ?? 0) * 0.45 + tintB * 0.55));
    blendPixelOver(dst, off, gr, gg, gb, ga, alphaScale);
  }
}

/**
 * Renders the active frame with optional previous (red-tinted) and next (blue-tinted)
 * onion-skin ghost frames underneath for smooth frame-by-frame animation drawing.
 */
export function compositeFrameWithOnionSkin(
  doc: PixelDocumentRuntime,
  activeFrameIndex: number,
  options: OnionSkinOptions,
): Uint8ClampedArray {
  const activeFrame = doc.frames[activeFrameIndex] ?? doc.frames[0];
  if (!activeFrame) {
    return new Uint8ClampedArray(doc.width * doc.height * 4);
  }

  const activeRgba = compositeFrame(activeFrame, doc.width, doc.height);
  if (!options.enabled || options.opacity <= 0) {
    return activeRgba;
  }

  const output = new Uint8ClampedArray(doc.width * doc.height * 4);
  if (options.showPrevious && activeFrameIndex > 0) {
    const prevFrame = doc.frames[activeFrameIndex - 1];
    if (prevFrame) {
      const prevRgba = compositeFrame(prevFrame, doc.width, doc.height);
      blendTintedGhost(output, prevRgba, 239, 68, 68, options.opacity);
    }
  }
  if (options.showNext && activeFrameIndex + 1 < doc.frames.length) {
    const nextFrame = doc.frames[activeFrameIndex + 1];
    if (nextFrame) {
      const nextRgba = compositeFrame(nextFrame, doc.width, doc.height);
      blendTintedGhost(output, nextRgba, 56, 189, 248, options.opacity);
    }
  }

  const pixelCount = doc.width * doc.height;
  for (let i = 0; i < pixelCount; i += 1) {
    const off = i * 4;
    const a = activeRgba[off + 3] ?? 0;
    if (a === 0) continue;
    blendPixelOver(
      output,
      off,
      activeRgba[off] ?? 0,
      activeRgba[off + 1] ?? 0,
      activeRgba[off + 2] ?? 0,
      a,
      1,
    );
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
