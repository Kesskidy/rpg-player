import type { ColorRGBA } from '@rpg-player/core-types';
import { clampByte } from './color.js';
import type { PixelChange, PixelLayerRuntime, PixelPoint, RgbaTuple } from './types.js';

/**
 * Pixel-perfect integer Bresenham line algorithm (inclusive of both endpoints).
 */
export function bresenhamLine(from: PixelPoint, to: PixelPoint): PixelPoint[] {
  let x0 = Math.trunc(from.x);
  let y0 = Math.trunc(from.y);
  const x1 = Math.trunc(to.x);
  const y1 = Math.trunc(to.y);

  const points: PixelPoint[] = [];
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  for (;;) {
    points.push({ x: x0, y: y0 });
    if (x0 === x1 && y0 === y1) {
      break;
    }
    const e2 = err * 2;
    if (e2 > -dy) {
      err -= dy;
      x0 += sx;
    }
    if (e2 < dx) {
      err += dx;
      y0 += sy;
    }
  }

  return points;
}

export function readPixel(
  layer: PixelLayerRuntime,
  width: number,
  height: number,
  x: number,
  y: number,
): RgbaTuple | null {
  if (x < 0 || y < 0 || x >= width || y >= height) {
    return null;
  }
  const offset = (y * width + x) * 4;
  return [
    layer.pixels[offset] ?? 0,
    layer.pixels[offset + 1] ?? 0,
    layer.pixels[offset + 2] ?? 0,
    layer.pixels[offset + 3] ?? 0,
  ];
}

function tuplesEqual(a: RgbaTuple, b: RgbaTuple): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
}

export type StrokeChangeMap = Map<number, { before: RgbaTuple; after: RgbaTuple }>;

/**
 * Stamps a square pixel brush of size `brushSize` centered at `center` onto `layer`,
 * recording minimal pre/post pixel diffs in `changeMap` for exact Undo/Redo.
 */
export function stampBrush(
  layer: PixelLayerRuntime,
  width: number,
  height: number,
  center: PixelPoint,
  brushSize: number,
  color: ColorRGBA,
  changeMap: StrokeChangeMap,
): boolean {
  const size = Math.max(1, Math.trunc(brushSize));
  const startOffset = Math.floor((size - 1) / 2);
  const target: RgbaTuple = [
    clampByte(color.r),
    clampByte(color.g),
    clampByte(color.b),
    clampByte(color.a),
  ];

  let modified = false;
  const cx = Math.trunc(center.x);
  const cy = Math.trunc(center.y);

  for (let dy = 0; dy < size; dy += 1) {
    const py = cy - startOffset + dy;
    if (py < 0 || py >= height) continue;

    for (let dx = 0; dx < size; dx += 1) {
      const px = cx - startOffset + dx;
      if (px < 0 || px >= width) continue;

      const pixelIndex = py * width + px;
      const byteOffset = pixelIndex * 4;
      const current: RgbaTuple = [
        layer.pixels[byteOffset] ?? 0,
        layer.pixels[byteOffset + 1] ?? 0,
        layer.pixels[byteOffset + 2] ?? 0,
        layer.pixels[byteOffset + 3] ?? 0,
      ];

      if (tuplesEqual(current, target)) {
        continue;
      }

      const existing = changeMap.get(pixelIndex);
      if (existing) {
        existing.after = target;
      } else {
        changeMap.set(pixelIndex, { before: current, after: target });
      }

      layer.pixels[byteOffset] = target[0];
      layer.pixels[byteOffset + 1] = target[1];
      layer.pixels[byteOffset + 2] = target[2];
      layer.pixels[byteOffset + 3] = target[3];
      modified = true;
    }
  }

  return modified;
}

export function finalizeStrokeChanges(changeMap: StrokeChangeMap): PixelChange[] {
  const changes: PixelChange[] = [];
  for (const [pixelIndex, entry] of changeMap.entries()) {
    if (!tuplesEqual(entry.before, entry.after)) {
      changes.push({
        pixelIndex,
        before: entry.before,
        after: entry.after,
      });
    }
  }
  return changes;
}
