import type { AssetMeta, ProjectStorageAdapter } from '@rpg-player/core-types';
import { ImageSource, Rectangle, Texture } from 'pixi.js';

interface LoadedAssetEntry {
  meta: AssetMeta;
  baseTexture: Texture;
  width: number;
  height: number;
  subTextures: Map<string, Texture>;
}

/**
 * Loads Phase 1 PNG assets into crisp nearest-neighbor PixiJS textures
 * and caches cropped tile/frame sub-textures on demand.
 */
export class AssetTextureRegistry {
  private readonly entries = new Map<string, LoadedAssetEntry>();

  async loadFromStorage(
    storage: ProjectStorageAdapter,
    assets: Record<string, AssetMeta>,
  ): Promise<void> {
    this.clear();

    const list = Object.values(assets);
    await Promise.all(
      list.map(async (meta) => {
        try {
          const exists = await storage.exists(meta.filePath);
          if (!exists) return;
          const bytes = await storage.readBinary(meta.filePath);
          await this.registerPngBytes(meta, bytes);
        } catch {
          // Skip broken or missing asset files gracefully without crashing the editor
        }
      }),
    );
  }

  async registerPngBytes(meta: AssetMeta, pngBytes: Uint8Array): Promise<void> {
    const copy = new Uint8Array(pngBytes);
    const blob = new Blob([copy], { type: 'image/png' });
    const bitmap = await createImageBitmap(blob);

    const source = new ImageSource({
      resource: bitmap,
      scaleMode: 'nearest',
    });
    const baseTexture = new Texture({ source });

    const previous = this.entries.get(meta.id);
    if (previous) {
      this.disposeEntry(previous);
    }

    this.entries.set(meta.id, {
      meta,
      baseTexture,
      width: bitmap.width,
      height: bitmap.height,
      subTextures: new Map(),
    });
  }

  getAssetEntry(assetId: string): { meta: AssetMeta; width: number; height: number } | null {
    const entry = this.entries.get(assetId);
    if (!entry) return null;
    return { meta: entry.meta, width: entry.width, height: entry.height };
  }

  getTileTexture(assetId: string, tileX: number, tileY: number, tileSize: number): Texture | null {
    const entry = this.entries.get(assetId);
    if (!entry) return null;

    const frameX = tileX * tileSize;
    const frameY = tileY * tileSize;
    const frameW = Math.min(tileSize, Math.max(1, entry.width - frameX));
    const frameH = Math.min(tileSize, Math.max(1, entry.height - frameY));

    if (frameX >= entry.width || frameY >= entry.height) {
      return entry.baseTexture;
    }

    const key = `tile:${tileX}:${tileY}:${tileSize}`;
    const cached = entry.subTextures.get(key);
    if (cached) return cached;

    const sub = new Texture({
      source: entry.baseTexture.source,
      frame: new Rectangle(frameX, frameY, frameW, frameH),
    });
    entry.subTextures.set(key, sub);
    return sub;
  }

  getSpriteFrameTexture(assetId: string, frameIndex = 0): Texture | null {
    const entry = this.entries.get(assetId);
    if (!entry) return null;

    const columns = Math.max(1, entry.meta.columns || 1);
    const col = frameIndex % columns;
    const row = Math.floor(frameIndex / columns);
    const frameX = col * entry.meta.gridWidth;
    const frameY = row * entry.meta.gridHeight;
    const frameW = Math.min(entry.meta.gridWidth, Math.max(1, entry.width - frameX));
    const frameH = Math.min(entry.meta.gridHeight, Math.max(1, entry.height - frameY));

    if (frameX >= entry.width || frameY >= entry.height) {
      return entry.baseTexture;
    }

    const key = `frame:${frameIndex}`;
    const cached = entry.subTextures.get(key);
    if (cached) return cached;

    const sub = new Texture({
      source: entry.baseTexture.source,
      frame: new Rectangle(frameX, frameY, frameW, frameH),
    });
    entry.subTextures.set(key, sub);
    return sub;
  }

  private disposeEntry(entry: LoadedAssetEntry): void {
    for (const sub of entry.subTextures.values()) {
      sub.destroy(false);
    }
    entry.subTextures.clear();
    entry.baseTexture.destroy(true);
  }

  clear(): void {
    for (const entry of this.entries.values()) {
      this.disposeEntry(entry);
    }
    this.entries.clear();
  }

  destroy(): void {
    this.clear();
  }
}
