import type { AssetMeta, MapEvent, TileMapData } from '@rpg-player/core-types';
import { Application, Container, Graphics, Sprite, type Ticker } from 'pixi.js';
import { parseCellKey } from './map-editor-core.js';
import {
  getMapEventColliderRect,
  getMapEventFootPosition,
  resolveColliderRect,
  RpgSimulation,
} from './simulation.js';
import type { AssetTextureRegistry } from './texture-registry.js';
import type { CameraState, InputState, TileCoord, ViewportMode } from './types.js';

export interface ViewportOverlayOptions {
  showGrid: boolean;
  showCollisions: boolean;
  hoverTile: TileCoord | null;
}

/**
 * PixiJS v8 WebGL viewport implementing the 3-plane depth rendering pipeline:
 * 1. `belowContainer` — ground, carpets, ground shadows (ordered by layer zOrder + cell stack)
 * 2. `ySortedContainer` (`sortableChildren = true`) — volumetric decor + NPCs/entities + Player sorted live by feet Y
 * 3. `aboveContainer` — canopies, roofs, arches always rendered above characters
 * 4. `overlayContainer` — editor-only independent `collisionLayer`, feet AABB hitboxes, grid & spawn
 */
export class PixiMapViewport {
  private readonly app = new Application();
  private initialized = false;
  private destroyed = false;
  private resizeObserver: ResizeObserver | null = null;
  private hasAutoCentered = false;

  private readonly worldContainer = new Container();
  private readonly mapBackdrop = new Graphics();
  private readonly belowContainer = new Container();
  private readonly ySortedContainer = new Container();
  private readonly aboveContainer = new Container();
  private readonly overlayContainer = new Container();

  private readonly gridGraphics = new Graphics();
  private readonly collisionGraphics = new Graphics();
  private readonly hitboxGraphics = new Graphics();
  private readonly spawnGraphics = new Graphics();
  private readonly hoverGraphics = new Graphics();

  private playerVisualNode: Container | null = null;
  private playerSpriteRef: Sprite | null = null;
  private animatedEventSprites: Array<{ sprite: Sprite; assetId: string }> = [];
  private animElapsedSec = 0;

  private map: TileMapData;
  private readonly registry: AssetTextureRegistry;
  private readonly simulation: RpgSimulation;

  private mode: ViewportMode = 'editor';
  private paused = false;
  private lastTouchedEventId: string | null = null;
  private onTouchEventCallback: ((event: MapEvent) => void) | null = null;
  private camera: CameraState = { x: 48, y: 48, zoom: 2 };
  private overlayOptions: ViewportOverlayOptions = {
    showGrid: true,
    showCollisions: true,
    hoverTile: null,
  };

  private readonly onTick = (ticker: Ticker): void => {
    if (this.destroyed || !this.initialized) return;
    const dtSeconds = ticker.deltaMS / 1000;
    this.animElapsedSec += dtSeconds;

    if (this.mode === 'preview' && !this.paused) {
      this.simulation.step(dtSeconds);
      this.updatePlayerVisual();
      this.updateAnimatedSprites();
      this.centerCameraOnPlayer();

      const touched = this.simulation.findTouchedEvent();
      if (touched && touched.id !== this.lastTouchedEventId) {
        this.lastTouchedEventId = touched.id;
        this.onTouchEventCallback?.(touched);
      } else if (!touched) {
        this.lastTouchedEventId = null;
      }
    }
  };

  constructor(map: TileMapData, registry: AssetTextureRegistry) {
    this.map = map;
    this.registry = registry;
    this.simulation = new RpgSimulation(map);
    this.ySortedContainer.sortableChildren = true;
  }

  async init(container: HTMLElement): Promise<void> {
    const baseOpts = {
      antialias: false,
      roundPixels: true,
      background: '#141218',
      resizeTo: container,
    };

    try {
      await this.app.init({ ...baseOpts, preference: 'webgl' });
    } catch {
      await this.app.init({ ...baseOpts, preference: 'canvas' });
    }

    if (this.destroyed) {
      this.app.destroy({ removeView: true });
      return;
    }

    container.appendChild(this.app.canvas);
    this.app.canvas.style.display = 'block';
    this.app.canvas.style.width = '100%';
    this.app.canvas.style.height = '100%';
    this.app.canvas.style.imageRendering = 'pixelated';

    this.worldContainer.addChild(
      this.mapBackdrop,
      this.belowContainer,
      this.ySortedContainer,
      this.aboveContainer,
      this.overlayContainer,
    );

    this.overlayContainer.addChild(
      this.collisionGraphics,
      this.hitboxGraphics,
      this.gridGraphics,
      this.spawnGraphics,
      this.hoverGraphics,
    );

    this.app.stage.addChild(this.worldContainer);
    this.initialized = true;

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        if (this.destroyed || !this.initialized) return;
        this.app.resize();
        if (!this.hasAutoCentered && this.app.screen.width > 0 && this.app.screen.height > 0) {
          this.hasAutoCentered = true;
          this.centerCameraOnMap();
        }
      });
      this.resizeObserver.observe(container);
    }

    if (this.app.screen.width > 0 && this.app.screen.height > 0) {
      this.hasAutoCentered = true;
    }
    this.centerCameraOnMap();
    this.rebuildScene();
    this.app.ticker.add(this.onTick);
  }

  clearScene(): void {
    if (!this.initialized) return;
    this.clearContainer(this.belowContainer);
    this.clearContainer(this.ySortedContainer);
    this.clearContainer(this.aboveContainer);
    this.playerVisualNode = null;
    this.playerSpriteRef = null;
    this.animatedEventSprites = [];
  }

  getCanvas(): HTMLCanvasElement | null {
    return this.initialized ? this.app.canvas : null;
  }

  setMode(mode: ViewportMode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    this.simulation.clearInput();

    if (mode === 'preview') {
      this.simulation.updateMap(this.map, true);
      this.overlayContainer.visible = false;
      this.rebuildScene();
      this.updatePlayerVisual();
      this.centerCameraOnPlayer();
    } else {
      this.overlayContainer.visible = true;
      this.rebuildScene();
    }
  }

  getMode(): ViewportMode {
    return this.mode;
  }

  setInput(input: Partial<InputState>): void {
    this.simulation.setInput(input);
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    if (paused) {
      this.simulation.clearInput();
    }
  }

  setOnTouchEvent(callback: ((event: MapEvent) => void) | null): void {
    this.onTouchEventCallback = callback;
  }

  findInteractableEvent(): MapEvent | null {
    return this.simulation.findInteractableEvent();
  }

  syncMap(map: TileMapData): void {
    this.map = map;
    this.simulation.updateMap(map, this.mode === 'preview');
    if (this.initialized) {
      this.rebuildScene();
    }
  }

  setOverlayOptions(options: Partial<ViewportOverlayOptions>): void {
    this.overlayOptions = { ...this.overlayOptions, ...options };
    if (this.initialized) {
      this.redrawOverlays();
    }
  }

  getCamera(): Readonly<CameraState> {
    return this.camera;
  }

  setCamera(next: Partial<CameraState>): void {
    this.camera = {
      x: next.x ?? this.camera.x,
      y: next.y ?? this.camera.y,
      zoom: Math.max(0.5, Math.min(6, next.zoom ?? this.camera.zoom)),
    };
    this.applyCameraTransform();
  }

  centerCameraOnMap(): void {
    if (!this.initialized) return;
    const worldW = this.map.width * this.map.tileSize * this.camera.zoom;
    const worldH = this.map.height * this.map.tileSize * this.camera.zoom;
    this.camera.x = Math.round((this.app.screen.width - worldW) / 2);
    this.camera.y = Math.round((this.app.screen.height - worldH) / 2);
    this.applyCameraTransform();
  }

  private centerCameraOnPlayer(): void {
    if (!this.initialized) return;
    const player = this.simulation.getPlayerState();
    this.camera.x = Math.round(this.app.screen.width / 2 - player.x * this.camera.zoom);
    this.camera.y = Math.round(this.app.screen.height / 2 - player.y * this.camera.zoom);
    this.applyCameraTransform();
  }

  private applyCameraTransform(): void {
    this.worldContainer.position.set(this.camera.x, this.camera.y);
    this.worldContainer.scale.set(this.camera.zoom, this.camera.zoom);
  }

  screenToTile(clientX: number, clientY: number): TileCoord | null {
    if (!this.initialized) return null;
    const rect = this.app.canvas.getBoundingClientRect();
    const localX = (clientX - rect.left - this.camera.x) / this.camera.zoom;
    const localY = (clientY - rect.top - this.camera.y) / this.camera.zoom;
    const tx = Math.floor(localX / this.map.tileSize);
    const ty = Math.floor(localY / this.map.tileSize);
    if (tx < 0 || ty < 0 || tx >= this.map.width || ty >= this.map.height) {
      return null;
    }
    return { tx, ty };
  }

  rebuildScene(): void {
    if (!this.initialized) return;

    const ts = this.map.tileSize;
    const worldW = this.map.width * ts;
    const worldH = this.map.height * ts;

    this.mapBackdrop.clear();
    this.mapBackdrop
      .rect(0, 0, worldW, worldH)
      .fill({ color: 0x161b26 })
      .stroke({ color: 0x334155, width: 1 });

    this.clearContainer(this.belowContainer);
    this.clearContainer(this.ySortedContainer);
    this.clearContainer(this.aboveContainer);
    this.playerVisualNode = null;
    this.playerSpriteRef = null;
    this.animatedEventSprites = [];

    // Sort visual layers by zOrder within each depth plane
    const sortedLayers = [...this.map.layers].sort((a, b) => a.zOrder - b.zOrder);

    for (const layer of sortedLayers) {
      if (!layer.visible) continue;

      if (layer.plane === 'y_sorted') {
        // Each tile placement goes directly into ySortedContainer with its own zIndex = sortY
        for (const [key, stack] of Object.entries(layer.cells)) {
          const coord = parseCellKey(key);
          if (!coord) continue;
          for (let stackIdx = 0; stackIdx < stack.length; stackIdx += 1) {
            const cell = stack[stackIdx]!;
            const node = this.createTileVisual(cell.assetId, cell.tileX, cell.tileY, coord.x, coord.y, ts);
            node.alpha = layer.opacity;
            node.zIndex = coord.y * ts + (cell.sortOffsetY ?? ts) + stackIdx * 0.01 + layer.zOrder * 0.001;
            this.ySortedContainer.addChild(node);
          }
        }
        continue;
      }

      const targetContainer = layer.plane === 'above' ? this.aboveContainer : this.belowContainer;
      const layerContainer = new Container();
      layerContainer.alpha = layer.opacity;

      for (const [key, stack] of Object.entries(layer.cells)) {
        const coord = parseCellKey(key);
        if (!coord) continue;
        for (const cell of stack) {
          const node = this.createTileVisual(cell.assetId, cell.tileX, cell.tileY, coord.x, coord.y, ts);
          layerContainer.addChild(node);
        }
      }

      targetContainer.addChild(layerContainer);
    }

    // Add Map Events (NPCs, chests, props, zones) into their assigned depth plane
    for (const ev of this.map.events) {
      const visual = this.createEventVisual(ev, ts);
      const foot = getMapEventFootPosition(ev, ts);
      visual.position.set(Math.round(foot.x), Math.round(foot.y));

      if (ev.plane === 'below') {
        this.belowContainer.addChild(visual);
      } else if (ev.plane === 'above') {
        this.aboveContainer.addChild(visual);
      } else {
        visual.zIndex = foot.y + (ev.sortOffsetY ?? 0);
        this.ySortedContainer.addChild(visual);
      }
    }

    // Add Player directly into ySortedContainer in Preview mode so Y-sorting works live!
    if (this.mode === 'preview') {
      const playerNode = this.createPlayerVisual(ts);
      this.playerVisualNode = playerNode;
      this.ySortedContainer.addChild(playerNode);
      this.updatePlayerVisual();
    }

    this.overlayContainer.visible = this.mode === 'editor';
    this.redrawOverlays();
    this.applyCameraTransform();
  }

  private createTileVisual(
    assetId: string,
    tileX: number,
    tileY: number,
    tx: number,
    ty: number,
    ts: number,
  ): Container {
    const tex = this.registry.getTileTexture(assetId, tileX, tileY, ts);
    if (tex) {
      const sprite = new Sprite(tex);
      sprite.position.set(tx * ts, ty * ts);
      return sprite;
    }
    const placeholder = new Graphics();
    placeholder
      .rect(tx * ts, ty * ts, ts, ts)
      .fill({ color: 0xd946ef, alpha: 0.45 })
      .stroke({ color: 0xf5d0fe, width: 1 });
    return placeholder;
  }

  private createEventVisual(ev: MapEvent, ts: number): Container {
    const wrapper = new Container();
    const tex = ev.spriteAssetId ? this.registry.getSpriteFrameTexture(ev.spriteAssetId, 0) : null;
    const entry = ev.spriteAssetId ? this.registry.getAssetEntry(ev.spriteAssetId) : null;

    if (tex && entry) {
      const sprite = new Sprite(tex);
      const anchor = this.resolveSpriteAnchor(entry.meta);
      sprite.anchor.set(anchor.ax, anchor.ay);
      wrapper.addChild(sprite);
      if (entry.meta.frameCount > 1 && ev.spriteAssetId) {
        this.animatedEventSprites.push({ sprite, assetId: ev.spriteAssetId });
      }
    } else {
      const color =
        ev.kind === 'npc'
          ? 0x06b6d4
          : ev.kind === 'chest'
            ? 0xf59e0b
            : ev.kind === 'prop'
              ? 0x22c55e
              : 0xa855f7;
      const badge = new Graphics();
      if (ev.kind === 'zone') {
        badge
          .rect(-ts * 0.45, -ts * 0.85, ts * 0.9, ts * 0.9)
          .fill({ color, alpha: 0.25 })
          .stroke({ color, width: 1.5 });
      } else {
        badge
          .rect(-ts * 0.3, -ts * 0.85, ts * 0.6, ts * 0.85)
          .fill({ color })
          .stroke({ color: 0xf8fafc, width: 1.5 });
      }
      wrapper.addChild(badge);
    }
    return wrapper;
  }

  private createPlayerVisual(ts: number): Container {
    const wrapper = new Container();
    const assetId = this.map.playerAssetId;
    const entry = assetId ? this.registry.getAssetEntry(assetId) : null;
    const texture = assetId ? this.registry.getSpriteFrameTexture(assetId, 0) : null;

    if (texture && entry) {
      const sprite = new Sprite(texture);
      const anchor = this.resolveSpriteAnchor(entry.meta);
      sprite.anchor.set(anchor.ax, anchor.ay);
      this.playerSpriteRef = sprite;
      wrapper.addChild(sprite);
    } else {
      // 32x44-like tall pixel hero silhouette anchored at feet so Y-sorting & head overlap are immediately visible!
      const fallback = new Graphics();
      fallback
        .rect(-ts * 0.32, -ts * 1.15, ts * 0.64, ts * 1.15)
        .fill({ color: 0x38bdf8 })
        .stroke({ color: 0xf8fafc, width: 1.5 })
        .rect(-ts * 0.18, -ts * 0.98, ts * 0.36, ts * 0.28)
        .fill({ color: 0xfef08a });
      wrapper.addChild(fallback);
    }
    return wrapper;
  }

  private resolveSpriteAnchor(meta: AssetMeta): { ax: number; ay: number } {
    const ax = meta.gridWidth > 0 ? meta.anchor.x / meta.gridWidth : 0.5;
    const ay = meta.gridHeight > 0 ? meta.anchor.y / meta.gridHeight : 1;
    return { ax, ay };
  }

  private updatePlayerVisual(): void {
    if (!this.playerVisualNode) return;
    const player = this.simulation.getPlayerState();
    this.playerVisualNode.position.set(Math.round(player.x), Math.round(player.y));
    // Live Y-Sorting key = feet Y coordinate
    this.playerVisualNode.zIndex = player.y;
  }

  private updateAnimatedSprites(): void {
    // Animate player idle/walk clip
    if (this.playerSpriteRef && this.map.playerAssetId) {
      const entry = this.registry.getAssetEntry(this.map.playerAssetId);
      if (entry) {
        const player = this.simulation.getPlayerState();
        const anim =
          (player.isMoving
            ? entry.meta.animations['walk'] ?? entry.meta.animations['walk_down']
            : entry.meta.animations['idle']) ?? entry.meta.animations['idle'];
        if (anim && anim.frames.length > 0) {
          const fps = Math.max(1, anim.fps || 4);
          const idx = Math.floor(this.animElapsedSec * fps) % anim.frames.length;
          const frameNumber = anim.frames[idx] ?? 0;
          const tex = this.registry.getSpriteFrameTexture(this.map.playerAssetId, frameNumber);
          if (tex) this.playerSpriteRef.texture = tex;
        }
      }
    }

    // Animate NPC / Monster idle clips
    for (const item of this.animatedEventSprites) {
      const entry = this.registry.getAssetEntry(item.assetId);
      if (!entry) continue;
      const anim = entry.meta.animations['idle'];
      if (!anim || anim.frames.length === 0) continue;
      const fps = Math.max(1, anim.fps || 3);
      const idx = Math.floor(this.animElapsedSec * fps) % anim.frames.length;
      const frameNumber = anim.frames[idx] ?? 0;
      const tex = this.registry.getSpriteFrameTexture(item.assetId, frameNumber);
      if (tex) item.sprite.texture = tex;
    }
  }

  private redrawOverlays(): void {
    const ts = this.map.tileSize;
    const worldW = this.map.width * ts;
    const worldH = this.map.height * ts;

    // 1. Independent Collision Layer overlay
    this.collisionGraphics.clear();
    if (this.overlayOptions.showCollisions) {
      for (let ty = 0; ty < this.map.height; ty += 1) {
        for (let tx = 0; tx < this.map.width; tx += 1) {
          if ((this.map.collisionLayer.cells[ty * this.map.width + tx] ?? 0) !== 0) {
            this.collisionGraphics
              .rect(tx * ts + 1, ty * ts + 1, ts - 2, ts - 2)
              .fill({ color: 0xef4444, alpha: 0.35 })
              .stroke({ color: 0xf87171, alpha: 0.85, width: 1 });
          }
        }
      }
    }

    // 2. Entity & Player feet AABB hitbox wireframes (visible when Show Collisions is ON)
    this.hitboxGraphics.clear();
    if (this.overlayOptions.showCollisions) {
      for (const ev of this.map.events) {
        if (!ev.isSolid) continue;
        const rect = getMapEventColliderRect(ev, ts);
        this.hitboxGraphics
          .rect(rect.x, rect.y, rect.width, rect.height)
          .fill({ color: 0xf97316, alpha: 0.3 })
          .stroke({ color: 0xfdba74, width: 1.5 });
      }

      const spawnFootX = (this.map.playerSpawn.x + 0.5) * ts;
      const spawnFootY = (this.map.playerSpawn.y + 0.9) * ts;
      if (this.map.playerCollider) {
        const pRect = resolveColliderRect(spawnFootX, spawnFootY, this.map.playerCollider);
        this.hitboxGraphics
          .rect(pRect.x, pRect.y, pRect.width, pRect.height)
          .stroke({ color: 0x34d399, width: 1.5 });
      }
    }

    // 3. Tile grid
    this.gridGraphics.clear();
    if (this.overlayOptions.showGrid) {
      for (let x = 1; x < this.map.width; x += 1) {
        this.gridGraphics
          .moveTo(x * ts, 0)
          .lineTo(x * ts, worldH)
          .stroke({ color: 0xffffff, alpha: 0.1, width: 1 });
      }
      for (let y = 1; y < this.map.height; y += 1) {
        this.gridGraphics
          .moveTo(0, y * ts)
          .lineTo(worldW, y * ts)
          .stroke({ color: 0xffffff, alpha: 0.1, width: 1 });
      }
    }

    // 4. Spawn marker
    this.spawnGraphics.clear();
    const sx = this.map.playerSpawn.x * ts;
    const sy = this.map.playerSpawn.y * ts;
    this.spawnGraphics
      .rect(sx + 2, sy + 2, ts - 4, ts - 4)
      .fill({ color: 0x10b981, alpha: 0.2 })
      .stroke({ color: 0x34d399, width: 2 });

    // 5. Hover highlight
    this.hoverGraphics.clear();
    const hover = this.overlayOptions.hoverTile;
    if (hover && this.mode === 'editor') {
      this.hoverGraphics
        .rect(hover.tx * ts + 0.5, hover.ty * ts + 0.5, ts - 1, ts - 1)
        .stroke({ color: 0xfbbf24, width: 1.5 });
    }
  }

  private clearContainer(container: Container): void {
    const removed = container.removeChildren();
    for (const child of removed) {
      child.destroy({ children: true, texture: false });
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (this.initialized) {
      this.app.ticker.remove(this.onTick);
      this.app.destroy({ removeView: true }, { children: true, texture: false });
    }
  }
}
