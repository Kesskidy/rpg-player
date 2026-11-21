import {
  ASSET_SCHEMA_VERSION,
  PROJECT_DIRS,
  type AnchorPoint,
  type AnimationClip,
  type AssetMeta,
  type AssetType,
  type ColliderBox,
} from '@rpg-player/core-types';
import { compositeSpritesheet } from './compositor.js';
import { encodeRgbaToPng } from './png-encoder.js';
import type { ExportAssetOptions, ExportAssetOutput, PixelDocumentRuntime } from './types.js';

function sanitizeAssetId(raw: string): string {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || 'asset_unnamed';
}

function defaultAnchorForType(type: AssetType, width: number, height: number): AnchorPoint {
  if (type === 'sprite') {
    return { x: Math.floor(width / 2), y: height };
  }
  return { x: 0, y: 0 };
}

function defaultAnimations(type: AssetType, frameCount: number): Record<string, AnimationClip> {
  if (type !== 'sprite' || frameCount <= 0) {
    return {};
  }
  const frames = Array.from({ length: frameCount }, (_, index) => index);
  return {
    idle: {
      frames,
      fps: 4,
      loop: true,
    },
  };
}

function defaultColliderForType(
  type: AssetType,
  width: number,
  height: number,
): ColliderBox | undefined {
  if (type !== 'sprite') return undefined;
  const colW = Math.max(8, Math.min(width, Math.round(width * 0.75)));
  const colH = Math.max(8, Math.min(16, Math.round(height * 0.35)));
  return {
    offsetX: -Math.floor(colW / 2),
    offsetY: -colH,
    width: colW,
    height: colH,
  };
}

/**
 * Bakes a PixelDocumentRuntime into a PNG spritesheet and its matching AssetMeta contract.
 */
export function exportPixelAsset(
  doc: PixelDocumentRuntime,
  options: ExportAssetOptions,
): ExportAssetOutput {
  const type: AssetType = options.type ?? 'sprite';
  const id = sanitizeAssetId(options.id ?? doc.assetId);
  const sheet = compositeSpritesheet(doc, options.columns);
  const pngBytes = encodeRgbaToPng(sheet.rgba, sheet.width, sheet.height);

  const meta: AssetMeta = {
    schemaVersion: ASSET_SCHEMA_VERSION,
    id,
    name: options.name.trim() || id,
    type,
    gridWidth: doc.width,
    gridHeight: doc.height,
    frameCount: doc.frames.length,
    columns: sheet.columns,
    filePath: `${PROJECT_DIRS.assets}/${id}.png`,
    sourcePath: `${PROJECT_DIRS.assets}/${id}.pxs.json`,
    anchor: options.anchor ?? defaultAnchorForType(type, doc.width, doc.height),
    defaultCollider: defaultColliderForType(type, doc.width, doc.height),
    animations: options.animations ?? defaultAnimations(type, doc.frames.length),
    hitboxes: options.hitboxes ?? [],
    tags: options.tags ?? [],
  };

  return {
    width: sheet.width,
    height: sheet.height,
    rgba: sheet.rgba,
    pngBytes,
    meta,
  };
}
