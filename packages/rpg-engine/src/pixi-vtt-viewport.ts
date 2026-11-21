import type { VttRole, VttRoomState } from '@rpg-player/core-types';
import { Application, Container, Graphics, Sprite, Text } from 'pixi.js';
import { parseCellKey } from './map-editor-core.js';
import type { AssetTextureRegistry } from './texture-registry.js';
import type { CameraState, TileCoord } from './types.js';

function hexStringToNumber(hex: string, fallback = 0x38bdf8): number {
  const cleaned = hex.replace(/^#/, '');
  const parsed = Number.parseInt(cleaned.slice(0, 6), 16);
  return Number.isNaN(parsed) ? fallback : parsed;
}

/**
 * PixiJS v8 VTT Tabletop Renderer reusing the exact 3-plane depth pipeline (`below`, `y_sorted`, `above`)
 * and `AssetTextureRegistry` from Module 2, adding real-time tokens, dynamic light halos, and Fog of War.
 */
export class PixiVttViewport {
  private readonly app = new Application();
  private initialized = false;
  private destroyed = false;

  private readonly worldContainer = new Container();
  private readonly mapBackdrop = new Graphics();
  private readonly belowContainer = new Container();
  private readonly lightGraphics = new Graphics();
  private readonly ySortedContainer = new Container();
  private readonly aboveContainer = new Container();
  private readonly fogGraphics = new Graphics();
  private readonly gridGraphics = new Graphics();
  private readonly hoverGraphics = new Graphics();

  private readonly registry: AssetTextureRegistry;
  private roomState: VttRoomState | null = null;
  private role: VttRole = 'player';
  private participantId = '';
  private selectedTokenId: string | null = null;
  private hoverTile: TileCoord | null = null;
  private showGrid = true;

  private camera: CameraState = { x: 40, y: 40, zoom: 2 };
  private lastMapKey = '';

  constructor(registry: AssetTextureRegistry) {
    this.registry = registry;
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
      this.lightGraphics,
      this.ySortedContainer,
      this.aboveContainer,
      this.fogGraphics,
      this.gridGraphics,
      this.hoverGraphics,
    );

    this.app.stage.addChild(this.worldContainer);
    this.initialized = true;

    if (this.roomState) {
      this.rebuildAll();
      this.centerCameraOnMap();
    }
  }

  syncState(
    state: VttRoomState,
    role: VttRole,
    participantId: string,
    selectedTokenId: string | null,
    showGrid = true,
  ): void {
    const prevMapKey = this.lastMapKey;
    const nextMapKey = `${state.activeMap.id}:${state.activeMap.width}x${state.activeMap.height}:${state.activeMap.tileSize}`;

    this.roomState = state;
    this.role = role;
    this.participantId = participantId;
    this.selectedTokenId = selectedTokenId;
    this.showGrid = showGrid;

    if (!this.initialized) return;

    this.rebuildAll();
    if (prevMapKey !== nextMapKey) {
      this.lastMapKey = nextMapKey;
      this.centerCameraOnMap();
    }
    this.redrawHover();
  }

  forceRebuildMap(): void {
    if (!this.initialized || !this.roomState) return;
    this.rebuildAll();
  }

  setHoverTile(tile: TileCoord | null): void {
    this.hoverTile = tile;
    if (this.initialized) {
      this.redrawHover();
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
    if (!this.initialized || !this.roomState) return;
    const map = this.roomState.activeMap;
    const worldW = map.width * map.tileSize * this.camera.zoom;
    const worldH = map.height * map.tileSize * this.camera.zoom;
    this.camera.x = Math.round((this.app.screen.width - worldW) / 2);
    this.camera.y = Math.round((this.app.screen.height - worldH) / 2);
    this.applyCameraTransform();
  }

  private applyCameraTransform(): void {
    this.worldContainer.position.set(this.camera.x, this.camera.y);
    this.worldContainer.scale.set(this.camera.zoom, this.camera.zoom);
  }

  screenToTile(clientX: number, clientY: number): TileCoord | null {
    if (!this.initialized || !this.roomState) return null;
    const map = this.roomState.activeMap;
    const rect = this.app.canvas.getBoundingClientRect();
    const localX = (clientX - rect.left - this.camera.x) / this.camera.zoom;
    const localY = (clientY - rect.top - this.camera.y) / this.camera.zoom;
    const tx = Math.floor(localX / map.tileSize);
    const ty = Math.floor(localY / map.tileSize);
    if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return null;
    return { tx, ty };
  }

  private clearContainer(container: Container): void {
    const removed = container.removeChildren();
    for (const child of removed) {
      child.destroy({ children: true, texture: false });
    }
  }

  private rebuildAll(): void {
    if (!this.roomState) return;
    const state = this.roomState;
    const map = state.activeMap;
    const ts = map.tileSize;
    const worldW = map.width * ts;
    const worldH = map.height * ts;

    this.mapBackdrop.clear();
    this.mapBackdrop
      .rect(0, 0, worldW, worldH)
      .fill({ color: 0x161b26 })
      .stroke({ color: 0x334155, width: 1 });

    this.clearContainer(this.belowContainer);
    this.clearContainer(this.ySortedContainer);
    this.clearContainer(this.aboveContainer);

    const sortedLayers = [...map.layers].sort((a, b) => a.zOrder - b.zOrder);

    for (const layer of sortedLayers) {
      if (!layer.visible) continue;

      if (layer.plane === 'y_sorted') {
        for (const [key, stack] of Object.entries(layer.cells)) {
          const coord = parseCellKey(key);
          if (!coord) continue;
          for (let stackIdx = 0; stackIdx < stack.length; stackIdx += 1) {
            const cell = stack[stackIdx]!;
            const tex = this.registry.getTileTexture(cell.assetId, cell.tileX, cell.tileY, ts);
            if (!tex) continue;
            const sprite = new Sprite(tex);
            sprite.position.set(coord.x * ts, coord.y * ts);
            sprite.alpha = layer.opacity;
            sprite.zIndex = coord.y * ts + (cell.sortOffsetY ?? ts) + stackIdx * 0.01;
            this.ySortedContainer.addChild(sprite);
          }
        }
        continue;
      }

      const target = layer.plane === 'above' ? this.aboveContainer : this.belowContainer;
      const container = new Container();
      container.alpha = layer.opacity;
      for (const [key, stack] of Object.entries(layer.cells)) {
        const coord = parseCellKey(key);
        if (!coord) continue;
        for (const cell of stack) {
          const tex = this.registry.getTileTexture(cell.assetId, cell.tileX, cell.tileY, ts);
          if (!tex) continue;
          const sprite = new Sprite(tex);
          sprite.position.set(coord.x * ts, coord.y * ts);
          container.addChild(sprite);
        }
      }
      target.addChild(container);
    }

    // Dynamic lights
    this.lightGraphics.clear();
    for (const token of state.tokens) {
      if (token.lightRadius <= 0) continue;
      this.lightGraphics
        .circle((token.x + 0.5) * ts, (token.y + 0.5) * ts, token.lightRadius * ts)
        .fill({ color: 0xfef08a, alpha: 0.08 });
    }

    // Tokens inside ySortedContainer so they naturally pass behind/in front of Y-sorted decor!
    for (const token of state.tokens) {
      const container = new Container();
      const cx = (token.x + 0.5) * ts;
      const cy = (token.y + 0.5) * ts;
      const footY = (token.y + 0.9) * ts;
      const isSelected = token.id === this.selectedTokenId;
      const isControlled = this.role === 'gm' || token.ownerIds.includes(this.participantId);

      const ring = new Graphics();
      if (isSelected) {
        ring.circle(cx, cy, ts * 0.48).stroke({ color: 0xfbbf24, width: 2 });
      } else if (isControlled && token.kind === 'player') {
        ring.circle(cx, cy, ts * 0.45).stroke({ color: 0x38bdf8, alpha: 0.65, width: 1.5 });
      }
      container.addChild(ring);

      const tex = token.spriteAssetId
        ? this.registry.getSpriteFrameTexture(token.spriteAssetId, 0)
        : null;
      const entry = token.spriteAssetId ? this.registry.getAssetEntry(token.spriteAssetId) : null;

      if (tex && entry) {
        const sprite = new Sprite(tex);
        sprite.anchor.set(
          entry.meta.gridWidth > 0 ? entry.meta.anchor.x / entry.meta.gridWidth : 0.5,
          entry.meta.gridHeight > 0 ? entry.meta.anchor.y / entry.meta.gridHeight : 0.85,
        );
        sprite.position.set(Math.round(cx), Math.round(footY));
        if (!token.visibleToPlayers) sprite.alpha = 0.5;
        container.addChild(sprite);
      } else {
        const disc = new Graphics();
        disc
          .circle(cx, cy, ts * 0.36)
          .fill({
            color: hexStringToNumber(token.color),
            alpha: token.visibleToPlayers ? 0.95 : 0.45,
          })
          .stroke({ color: 0xf8fafc, width: 1.5 });
        container.addChild(disc);

        const initials = new Text({
          text: token.name.slice(0, 2).toUpperCase(),
          style: {
            fontFamily: 'monospace',
            fontSize: Math.max(8, Math.round(ts * 0.32)),
            fontWeight: 'bold',
            fill: 0x0b0d12,
          },
        });
        initials.anchor.set(0.5, 0.5);
        initials.position.set(cx, cy);
        container.addChild(initials);
      }

      if (token.maxHp > 0) {
        const pct = Math.max(0, Math.min(1, token.hp / token.maxHp));
        const barW = Math.max(ts * 0.76, entry ? entry.meta.gridWidth * 0.7 : ts * 0.76);
        const spriteH = entry ? entry.meta.gridHeight : ts;
        const barX = cx - barW / 2;
        const barY = Math.round(footY - spriteH - 6);
        const hpBar = new Graphics();
        hpBar
          .rect(barX - 1, barY - 1, barW + 2, 5)
          .fill({ color: 0x0b090e })
          .rect(barX, barY, barW * pct, 3)
          .fill({ color: pct > 0.4 ? 0x3d9956 : 0xc83232 });
        container.addChild(hpBar);
      }

      container.zIndex = footY;
      this.ySortedContainer.addChild(container);
    }

    // Fog of War
    this.fogGraphics.clear();
    if (state.fogEnabled) {
      const fogAlpha = this.role === 'gm' ? 0.5 : 0.96;
      const fogColor = this.role === 'gm' ? 0x0f172a : 0x04060a;
      const playerOwnedTokens =
        this.role === 'gm'
          ? []
          : state.tokens.filter((t) => t.ownerIds.includes(this.participantId));

      for (let ty = 0; ty < map.height; ty += 1) {
        for (let tx = 0; tx < map.width; tx += 1) {
          const isHidden = (state.fogOfWar[ty * map.width + tx] ?? 0) !== 0;
          if (!isHidden) continue;

          if (this.role === 'player') {
            const lit = playerOwnedTokens.some((pt) => {
              if (pt.lightRadius <= 0) return false;
              const dx = pt.x - tx;
              const dy = pt.y - ty;
              return dx * dx + dy * dy <= pt.lightRadius * pt.lightRadius;
            });
            if (lit) continue;
          }

          this.fogGraphics
            .rect(tx * ts, ty * ts, ts, ts)
            .fill({ color: fogColor, alpha: fogAlpha });
        }
      }
    }

    // Grid + GM independent collisionLayer hints
    this.gridGraphics.clear();
    if (this.showGrid) {
      for (let x = 1; x < map.width; x += 1) {
        this.gridGraphics
          .moveTo(x * ts, 0)
          .lineTo(x * ts, worldH)
          .stroke({ color: 0xffffff, alpha: 0.1, width: 1 });
      }
      for (let y = 1; y < map.height; y += 1) {
        this.gridGraphics
          .moveTo(0, y * ts)
          .lineTo(worldW, y * ts)
          .stroke({ color: 0xffffff, alpha: 0.1, width: 1 });
      }
    }

    if (this.role === 'gm') {
      for (let ty = 0; ty < map.height; ty += 1) {
        for (let tx = 0; tx < map.width; tx += 1) {
          if ((map.collisionLayer.cells[ty * map.width + tx] ?? 0) !== 0) {
            this.gridGraphics
              .rect(tx * ts + 1, ty * ts + 1, ts - 2, ts - 2)
              .stroke({ color: 0xf87171, alpha: 0.35, width: 1 });
          }
        }
      }
    }

    this.applyCameraTransform();
  }

  private redrawHover(): void {
    this.hoverGraphics.clear();
    if (!this.roomState || !this.hoverTile) return;
    const ts = this.roomState.activeMap.tileSize;
    this.hoverGraphics
      .rect(this.hoverTile.tx * ts + 0.5, this.hoverTile.ty * ts + 0.5, ts - 1, ts - 1)
      .stroke({ color: 0xfbbf24, width: 1.5 });
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.initialized) {
      this.app.destroy({ removeView: true }, { children: true, texture: false });
    }
  }
}
