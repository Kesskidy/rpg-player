import { describe, expect, it } from 'vitest';
import {
  applyChromaKey,
  convertImageToPixelArt,
  pixelateByDominantColor,
  PixelStudioEngine,
  type RawRgbaImage,
} from '../index.js';

function createSolidImage(
  width: number,
  height: number,
  r: number,
  g: number,
  b: number,
  a = 255,
): RawRgbaImage {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    rgba[i * 4] = r;
    rgba[i * 4 + 1] = g;
    rgba[i * 4 + 2] = b;
    rgba[i * 4 + 3] = a;
  }
  return { width, height, rgba };
}

function setPx(
  img: RawRgbaImage,
  x: number,
  y: number,
  r: number,
  g: number,
  b: number,
  a = 255,
): void {
  const off = (y * img.width + x) * 4;
  img.rgba[off] = r;
  img.rgba[off + 1] = g;
  img.rgba[off + 2] = b;
  img.rgba[off + 3] = a;
}

function getPx(img: RawRgbaImage, x: number, y: number): [number, number, number, number] {
  const off = (y * img.width + x) * 4;
  return [
    img.rgba[off] ?? 0,
    img.rgba[off + 1] ?? 0,
    img.rgba[off + 2] ?? 0,
    img.rgba[off + 3] ?? 0,
  ];
}

describe('ImageToPixelArt converter', () => {
  it('removes outer background with contiguous flood-fill while preserving identical interior pixels', () => {
    // 5x5 white background with a 3x3 black ring enclosing a white center pixel at (2,2)
    const img = createSolidImage(5, 5, 255, 255, 255, 255);
    for (let y = 1; y <= 3; y += 1) {
      for (let x = 1; x <= 3; x += 1) {
        if (x === 2 && y === 2) continue; // interior white eye!
        setPx(img, x, y, 20, 20, 20, 255);
      }
    }

    const whiteKey = { r: 255, g: 255, b: 255, a: 255 };

    // Contiguous flood-fill: outer white removed, interior white (2,2) preserved!
    const contiguous = applyChromaKey(img, {
      colors: [whiteKey],
      tolerance: 10,
      contiguousOnly: true,
    });
    expect(getPx(contiguous.image, 0, 0)[3]).toBe(0);
    expect(getPx(contiguous.image, 2, 2)).toEqual([255, 255, 255, 255]);
    expect(getPx(contiguous.image, 1, 1)).toEqual([20, 20, 20, 255]);

    // Global chroma key: both outer AND interior white removed
    const global = applyChromaKey(img, {
      colors: [whiteKey],
      tolerance: 10,
      contiguousOnly: false,
    });
    expect(getPx(global.image, 0, 0)[3]).toBe(0);
    expect(getPx(global.image, 2, 2)[3]).toBe(0);
  });

  it('pixelates by dominant color without blurring and applies transparency threshold', () => {
    // 8x4 source -> targetHeight 2 => 4x2 grid (each cell is 2x2 pixels)
    const img = createSolidImage(8, 4, 0, 0, 0, 0);

    // Cell (0,0) [0..1, 0..1]: 3 red pixels + 1 blue pixel => dominant MUST be exact red (no purple blur!)
    setPx(img, 0, 0, 220, 20, 20, 255);
    setPx(img, 1, 0, 220, 20, 20, 255);
    setPx(img, 0, 1, 220, 20, 20, 255);
    setPx(img, 1, 1, 20, 20, 220, 255);

    // Cell (1,0) [2..3, 0..1]: 3 transparent pixels + 1 green pixel => 75% transparent >= 50% => transparent!
    setPx(img, 2, 0, 20, 200, 20, 255);

    const out = pixelateByDominantColor(img, 2, 0.5, 10);
    expect(out.width).toBe(4);
    expect(out.height).toBe(2);
    expect(getPx(out, 0, 0)).toEqual([220, 20, 20, 255]);
    expect(getPx(out, 1, 0)).toEqual([0, 0, 0, 0]);
  });

  it('runs full pipeline with image-q palette quantization and injects an undoable layer into PixelStudioEngine', () => {
    // 32x32 synthetic gradient with magenta background border
    const src = createSolidImage(32, 32, 255, 0, 255, 255);
    for (let y = 4; y < 28; y += 1) {
      for (let x = 4; x < 28; x += 1) {
        setPx(src, x, y, (x * 8) % 256, (y * 8) % 256, 120, 255);
      }
    }

    const result = convertImageToPixelArt(src, {
      targetHeight: 16,
      chromaKey: {
        colors: [{ r: 255, g: 0, b: 255, a: 255 }],
        tolerance: 15,
        contiguousOnly: true,
      },
      transparencyThreshold: 0.5,
      paletteSize: 8,
    });

    expect(result.width).toBe(16);
    expect(result.height).toBe(16);
    // Border is transparent
    expect(getPx(result, 0, 0)[3]).toBe(0);
    // Center is opaque and total distinct opaque colors <= 8
    expect(getPx(result, 8, 8)[3]).toBe(255);
    expect(result.extractedPalette.length).toBeLessThanOrEqual(8);
    expect(result.extractedPalette.length).toBeGreaterThan(0);

    // Inject into a 32x32 PixelStudioEngine as a centered undoable layer
    const engine = new PixelStudioEngine({ assetId: 'imported_hero', width: 32, height: 32 });
    const layer = engine.importRgbaAsLayer('Hero Importé', result.width, result.height, result.rgba, 'center');
    expect(engine.getActiveFrame().layers).toHaveLength(2);
    expect(layer.name).toBe('Hero Importé');

    // Undo removes imported layer cleanly
    expect(engine.undo()).toBe(true);
    expect(engine.getActiveFrame().layers).toHaveLength(1);
  });
});
