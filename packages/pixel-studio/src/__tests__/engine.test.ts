import { describe, expect, it } from 'vitest';
import { GRID_PRESETS } from '@rpg-player/core-types';
import {
  bresenhamLine,
  hexToRgba,
  PixelStudioEngine,
  rgbaToHex,
} from '../index.js';

function pixelAt(
  rgba: Uint8ClampedArray,
  width: number,
  x: number,
  y: number,
): [number, number, number, number] {
  const offset = (y * width + x) * 4;
  return [
    rgba[offset] ?? 0,
    rgba[offset + 1] ?? 0,
    rgba[offset + 2] ?? 0,
    rgba[offset + 3] ?? 0,
  ];
}

describe('pixel-studio core engine', () => {
  it('supports grid presets and custom rectangular dimensions', () => {
    for (const preset of GRID_PRESETS) {
      const engine = new PixelStudioEngine({
        assetId: `asset_${preset}`,
        width: preset,
        height: preset,
      });
      expect(engine.getDocument().width).toBe(preset);
      expect(engine.getDocument().height).toBe(preset);
      expect(engine.renderActiveFrame().length).toBe(preset * preset * 4);
    }

    const custom = new PixelStudioEngine({
      assetId: 'hero_tall',
      width: 32,
      height: 48,
    });
    expect(custom.getDocument().width).toBe(32);
    expect(custom.getDocument().height).toBe(48);
  });

  it('draws pixel-perfect Bresenham lines, erases, and supports Undo/Redo', () => {
    const pts = bresenhamLine({ x: 0, y: 0 }, { x: 4, y: 2 });
    expect(pts).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 1 },
      { x: 3, y: 1 },
      { x: 4, y: 2 },
    ]);

    const engine = new PixelStudioEngine({ assetId: 'sword', width: 8, height: 8 });
    engine.setHexColor('#ff0000');

    engine.beginStroke({ x: 0, y: 0 });
    engine.continueStroke({ x: 3, y: 3 });
    expect(engine.endStroke()).toBe(true);

    let rendered = engine.renderActiveFrame();
    expect(pixelAt(rendered, 8, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(pixelAt(rendered, 8, 2, 2)).toEqual([255, 0, 0, 255]);
    expect(pixelAt(rendered, 8, 3, 3)).toEqual([255, 0, 0, 255]);
    expect(pixelAt(rendered, 8, 0, 3)).toEqual([0, 0, 0, 0]);

    // Erase a pixel
    engine.setTool('eraser');
    engine.beginStroke({ x: 2, y: 2 });
    engine.endStroke();

    rendered = engine.renderActiveFrame();
    expect(pixelAt(rendered, 8, 2, 2)).toEqual([0, 0, 0, 0]);
    expect(pixelAt(rendered, 8, 3, 3)).toEqual([255, 0, 0, 255]);

    // Undo eraser -> pixel returns
    expect(engine.undo()).toBe(true);
    rendered = engine.renderActiveFrame();
    expect(pixelAt(rendered, 8, 2, 2)).toEqual([255, 0, 0, 255]);

    // Undo pencil stroke -> canvas becomes empty
    expect(engine.undo()).toBe(true);
    rendered = engine.renderActiveFrame();
    expect(pixelAt(rendered, 8, 0, 0)).toEqual([0, 0, 0, 0]);

    // Redo restores pencil stroke
    expect(engine.redo()).toBe(true);
    rendered = engine.renderActiveFrame();
    expect(pixelAt(rendered, 8, 3, 3)).toEqual([255, 0, 0, 255]);
  });

  it('composites layers respecting order, visibility, opacity, and undoable layer edits', () => {
    const engine = new PixelStudioEngine({ assetId: 'shield', width: 4, height: 4 });
    const baseLayerId = engine.getActiveLayer()!.id;

    // Paint opaque blue on base layer
    engine.setHexColor('#0000ff');
    engine.beginStroke({ x: 1, y: 1 });
    engine.endStroke();

    // Add top layer and paint 50% opacity red over the same pixel
    const topLayer = engine.addLayer('Reflets');
    engine.setLayerOpacity(topLayer.id, 0.5);
    engine.setHexColor('#ff0000');
    engine.beginStroke({ x: 1, y: 1 });
    engine.endStroke();

    let rendered = engine.renderActiveFrame();
    const blended = pixelAt(rendered, 4, 1, 1);
    expect(blended[0]).toBeGreaterThanOrEqual(127);
    expect(blended[0]).toBeLessThanOrEqual(128);
    expect(blended[1]).toBe(0);
    expect(blended[2]).toBeGreaterThanOrEqual(127);
    expect(blended[2]).toBeLessThanOrEqual(128);
    expect(blended[3]).toBe(255);

    // Hide top layer -> pure blue shows through
    engine.setLayerVisibility(topLayer.id, false);
    rendered = engine.renderActiveFrame();
    expect(pixelAt(rendered, 4, 1, 1)).toEqual([0, 0, 255, 255]);

    // Cannot delete last layer, can delete second layer
    expect(engine.removeLayer(topLayer.id)).toBe(true);
    expect(engine.removeLayer(baseLayerId)).toBe(false);
  });

  it('roundtrips editable .pxs.json serialization without losing pixels or layers', () => {
    const engine = new PixelStudioEngine({ assetId: 'chevalier', width: 16, height: 24 });
    engine.setHexColor('#249fde');
    engine.beginStroke({ x: 5, y: 10 });
    engine.endStroke();

    const secondLayer = engine.addLayer('Armure');
    engine.setLayerOpacity(secondLayer.id, 0.75);
    engine.setHexColor('#ffd541');
    engine.beginStroke({ x: 5, y: 10 });
    engine.endStroke();

    const serialized = engine.serialize();
    const json = JSON.stringify(serialized);
    const restored = PixelStudioEngine.fromSerialized(JSON.parse(json));

    expect(restored.getDocument().width).toBe(16);
    expect(restored.getDocument().height).toBe(24);
    expect(restored.getActiveFrame().layers).toHaveLength(2);
    expect(restored.getActiveFrame().layers[1]?.opacity).toBe(0.75);
    expect(restored.renderActiveFrame()).toEqual(engine.renderActiveFrame());
  });

  it('exports valid PNG binary bytes and complete AssetMeta', () => {
    const engine = new PixelStudioEngine({ assetId: 'asset_hero_01', width: 32, height: 48 });
    engine.setHexColor('#fa6a0a');
    engine.beginStroke({ x: 16, y: 24 });
    engine.endStroke();

    const exported = engine.exportAsset({
      name: 'Chevalier',
      type: 'sprite',
      tags: ['hero', 'playable'],
    });

    // Verify PNG signature (8 bytes) + IHDR dimensions
    expect(Array.from(exported.pngBytes.slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    const view = new DataView(exported.pngBytes.buffer, exported.pngBytes.byteOffset);
    expect(view.getUint32(16, false)).toBe(32); // IHDR width
    expect(view.getUint32(20, false)).toBe(48); // IHDR height

    // Verify AssetMeta contract
    expect(exported.meta).toMatchObject({
      schemaVersion: 1,
      id: 'asset_hero_01',
      name: 'Chevalier',
      type: 'sprite',
      gridWidth: 32,
      gridHeight: 48,
      frameCount: 1,
      columns: 1,
      filePath: 'assets/asset_hero_01.png',
      sourcePath: 'assets/asset_hero_01.pxs.json',
      anchor: { x: 16, y: 48 },
      tags: ['hero', 'playable'],
    });
    expect(exported.meta.animations['idle']).toEqual({
      frames: [0],
      fps: 4,
      loop: true,
    });
  });

  it('converts hex and RGBA colors cleanly', () => {
    expect(hexToRgba('#f0a')).toEqual({ r: 255, g: 0, b: 170, a: 255 });
    expect(hexToRgba('#14a02e80')).toEqual({ r: 20, g: 160, b: 46, a: 128 });
    expect(rgbaToHex({ r: 20, g: 160, b: 46, a: 255 })).toBe('#14a02e');
  });
});
