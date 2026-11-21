import {
  LEGACY_MAP_SCHEMA_VERSION,
  MAP_SCHEMA_VERSION,
  type CardinalDirection,
  type ColliderBox,
  type DepthPlane,
  type MapEvent,
  type TileCell,
  type TileLayer,
  type TileMapData,
} from '@rpg-player/core-types';
import type {
  CreateMapOptions,
  MapChangeListener,
  MapEditorState,
  MapEditorTool,
  TilePaintMode,
} from './types.js';

export const MIN_MAP_TILES = 4;
export const MAX_MAP_TILES = 256;

export function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

export function parseCellKey(key: string): { x: number; y: number } | null {
  const parts = key.split(',');
  if (parts.length !== 2) return null;
  const x = Number.parseInt(parts[0]!, 10);
  const y = Number.parseInt(parts[1]!, 10);
  if (Number.isNaN(x) || Number.isNaN(y)) return null;
  return { x, y };
}

export function createDefaultFeetCollider(tileSize: number): ColliderBox {
  const width = Math.max(8, Math.round(tileSize * 0.72));
  const height = Math.max(8, Math.min(16, Math.round(tileSize * 0.45)));
  return {
    offsetX: -Math.floor(width / 2),
    offsetY: -height,
    width,
    height,
  };
}

export function createEmptyTileMap(options: CreateMapOptions): TileMapData {
  const width = Math.max(MIN_MAP_TILES, Math.min(MAX_MAP_TILES, Math.trunc(options.width)));
  const height = Math.max(MIN_MAP_TILES, Math.min(MAX_MAP_TILES, Math.trunc(options.height)));
  const tileSize = Math.max(8, Math.min(128, Math.trunc(options.tileSize ?? 32)));
  const total = width * height;

  const makeLayer = (
    id: string,
    name: string,
    plane: DepthPlane,
    zOrder: number,
  ): TileLayer => ({
    id,
    name,
    plane,
    zOrder,
    visible: true,
    opacity: 1,
    cells: {},
  });

  return {
    schemaVersion: MAP_SCHEMA_VERSION,
    id: options.id,
    name: options.name.trim() || options.id,
    width,
    height,
    tileSize,
    layers: [
      makeLayer('layer_ground', 'Sol', 'below', 0),
      makeLayer('layer_ground_detail', 'Tapis & Ombres', 'below', 1),
      makeLayer('layer_ysorted', 'Décors & Meubles (Y-Sort)', 'y_sorted', 0),
      makeLayer('layer_above', 'Cimes & Toits', 'above', 0),
    ],
    collisionLayer: {
      visibleInEditor: true,
      cells: Array<number>(total).fill(0),
    },
    playerSpawn: {
      x: Math.floor(width / 2),
      y: Math.floor(height / 2),
      direction: 'down',
    },
    playerAssetId: null,
    playerCollider: createDefaultFeetCollider(tileSize),
    events: [],
  };
}

function cloneCells(cells: Record<string, TileCell[]>): Record<string, TileCell[]> {
  const copy: Record<string, TileCell[]> = {};
  for (const [key, stack] of Object.entries(cells)) {
    if (stack.length > 0) {
      copy[key] = stack.map((cell) => ({ ...cell }));
    }
  }
  return copy;
}

export function cloneTileMap(map: TileMapData): TileMapData {
  return {
    ...map,
    layers: map.layers.map((layer) => ({
      ...layer,
      cells: cloneCells(layer.cells),
    })),
    collisionLayer: {
      visibleInEditor: map.collisionLayer.visibleInEditor,
      cells: [...map.collisionLayer.cells],
    },
    playerSpawn: { ...map.playerSpawn },
    playerCollider: map.playerCollider ? { ...map.playerCollider } : undefined,
    events: map.events.map((ev) => ({
      ...ev,
      collider: ev.collider ? { ...ev.collider } : undefined,
    })),
  };
}

/**
 * Seamlessly migrates legacy v1 maps (`tiles[]`, `collisions[]`, `event.solid`)
 * to v2 (`plane`, stacked `cells`, independent `collisionLayer`, `event.isSolid` & `collider`).
 */
export function normalizeTileMapData(raw: unknown): TileMapData {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Données de map invalides.');
  }
  const obj = raw as Record<string, unknown>;
  const version = Number(obj['schemaVersion']);

  if (version === MAP_SCHEMA_VERSION) {
    const v2 = raw as TileMapData;
    const total = v2.width * v2.height;
    const collisionCells =
      Array.isArray(v2.collisionLayer?.cells) && v2.collisionLayer.cells.length === total
        ? [...v2.collisionLayer.cells]
        : Array<number>(total).fill(0);

    return {
      ...v2,
      schemaVersion: MAP_SCHEMA_VERSION,
      layers: (v2.layers ?? []).map((layer, idx) => ({
        id: layer.id,
        name: layer.name,
        plane: layer.plane ?? 'below',
        zOrder: layer.zOrder ?? idx,
        visible: layer.visible ?? true,
        opacity: layer.opacity ?? 1,
        cells: cloneCells(layer.cells ?? {}),
      })),
      collisionLayer: {
        visibleInEditor: v2.collisionLayer?.visibleInEditor ?? true,
        cells: collisionCells,
      },
      playerCollider: v2.playerCollider
        ? { ...v2.playerCollider }
        : createDefaultFeetCollider(v2.tileSize),
      events: (v2.events ?? []).map((ev) => ({
        ...ev,
        isSolid: ev.isSolid ?? true,
        plane: ev.plane ?? (ev.kind === 'zone' ? 'below' : 'y_sorted'),
        collider: ev.collider ? { ...ev.collider } : undefined,
      })),
    };
  }

  if (version === LEGACY_MAP_SCHEMA_VERSION) {
    const width = Number(obj['width'] ?? 16);
    const height = Number(obj['height'] ?? 12);
    const tileSize = Number(obj['tileSize'] ?? 32);
    const legacyLayers = (obj['layers'] as Array<Record<string, unknown>>) ?? [];

    const migratedLayers: TileLayer[] = legacyLayers.map((layer, idx) => {
      const kind = String(layer['kind'] ?? 'ground');
      const plane: DepthPlane =
        kind === 'foreground' ? 'above' : kind === 'decor' ? 'y_sorted' : 'below';
      const tiles = (layer['tiles'] as Array<TileCell | null>) ?? [];
      const cells: Record<string, TileCell[]> = {};
      for (let i = 0; i < tiles.length; i += 1) {
        const cell = tiles[i];
        if (!cell) continue;
        const tx = i % width;
        const ty = Math.floor(i / width);
        cells[cellKey(tx, ty)] = [{ ...cell }];
      }
      return {
        id: String(layer['id'] ?? `layer_${idx}`),
        name: String(layer['name'] ?? `Calque ${idx + 1}`),
        plane,
        zOrder: idx,
        visible: Boolean(layer['visible'] ?? true),
        opacity: Number(layer['opacity'] ?? 1),
        cells,
      };
    });

    const legacyCollisions = (obj['collisions'] as number[]) ?? Array<number>(width * height).fill(0);
    const legacyEvents = (obj['events'] as Array<Record<string, unknown>>) ?? [];
    const migratedEvents: MapEvent[] = legacyEvents.map((ev) => {
      const kind = (ev['kind'] as MapEvent['kind']) ?? 'npc';
      return {
        id: String(ev['id']),
        name: String(ev['name'] ?? 'Événement'),
        kind,
        trigger: (ev['trigger'] as MapEvent['trigger']) ?? 'interact',
        x: Number(ev['x'] ?? 0),
        y: Number(ev['y'] ?? 0),
        spriteAssetId: (ev['spriteAssetId'] as string | null) ?? null,
        narrativeId: (ev['narrativeId'] as string | null) ?? null,
        battleEnemyId: (ev['battleEnemyId'] as string | null) ?? null,
        isSolid: Boolean(ev['isSolid'] ?? ev['solid'] ?? kind !== 'zone'),
        plane: kind === 'zone' ? 'below' : 'y_sorted',
        collider: kind === 'zone' ? undefined : createDefaultFeetCollider(tileSize),
      };
    });

    return {
      schemaVersion: MAP_SCHEMA_VERSION,
      id: String(obj['id'] ?? 'map_migrated'),
      name: String(obj['name'] ?? 'Map migrée'),
      width,
      height,
      tileSize,
      layers: migratedLayers,
      collisionLayer: {
        visibleInEditor: true,
        cells: [...legacyCollisions],
      },
      playerSpawn: (obj['playerSpawn'] as TileMapData['playerSpawn']) ?? {
        x: Math.floor(width / 2),
        y: Math.floor(height / 2),
        direction: 'down',
      },
      playerAssetId: (obj['playerAssetId'] as string | null) ?? null,
      playerCollider: createDefaultFeetCollider(tileSize),
      events: migratedEvents,
    };
  }

  throw new Error(
    `Version de map non supportée : ${String(version)} (attendu: ${MAP_SCHEMA_VERSION})`,
  );
}

function tileCellsEqual(a: TileCell | undefined, b: TileCell | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.assetId === b.assetId && a.tileX === b.tileX && a.tileY === b.tileY;
}

/**
 * Headless tilemap editor core (pure TypeScript, zero PixiJS/DOM dependency).
 * Dissociates visual rendering (multi-layer + per-cell asset stacking + 3 depth planes)
 * from collisions (independent editable `collisionLayer` + entity `isSolid` / `collider`).
 */
export class MapEditorEngine {
  private map: TileMapData;
  private state: MapEditorState;
  private readonly listeners = new Set<MapChangeListener>();
  private readonly undoStack: TileMapData[] = [];
  private readonly redoStack: TileMapData[] = [];
  private readonly maxHistory: number;

  private pendingEditSnapshot: TileMapData | null = null;
  private pendingEditMutated = false;

  constructor(initialMap: TileMapData, maxHistory = 60) {
    this.map = cloneTileMap(initialMap);
    this.maxHistory = Math.max(1, maxHistory);
    this.state = {
      activeLayerId: this.map.layers[0]?.id ?? 'layer_ground',
      activeTool: 'paint-tile',
      paintMode: 'replace',
      selectedTile: null,
      showGrid: true,
      showCollisions: this.map.collisionLayer.visibleInEditor,
    };
  }

  subscribe(listener: MapChangeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emitChange(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  getMap(): Readonly<TileMapData> {
    return this.map;
  }

  getState(): Readonly<MapEditorState> {
    return this.state;
  }

  loadMap(map: TileMapData): void {
    this.map = cloneTileMap(map);
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.pendingEditSnapshot = null;
    this.pendingEditMutated = false;
    this.state = {
      ...this.state,
      activeLayerId: this.map.layers[0]?.id ?? 'layer_ground',
      showCollisions: this.map.collisionLayer.visibleInEditor,
    };
    this.emitChange();
  }

  setTool(tool: MapEditorTool): void {
    if (this.state.activeTool === tool) return;
    this.state = { ...this.state, activeTool: tool };
    this.emitChange();
  }

  setPaintMode(paintMode: TilePaintMode): void {
    if (this.state.paintMode === paintMode) return;
    this.state = { ...this.state, paintMode };
    this.emitChange();
  }

  setActiveLayer(layerId: string): void {
    if (!this.map.layers.some((layer) => layer.id === layerId)) return;
    this.state = { ...this.state, activeLayerId: layerId };
    this.emitChange();
  }

  setSelectedTile(cell: TileCell | null): void {
    this.state = { ...this.state, selectedTile: cell ? { ...cell } : null };
    if (cell && this.state.activeTool === 'erase-tile') {
      this.state = { ...this.state, activeTool: 'paint-tile' };
    }
    this.emitChange();
  }

  setShowGrid(show: boolean): void {
    if (this.state.showGrid === show) return;
    this.state = { ...this.state, showGrid: show };
    this.emitChange();
  }

  setShowCollisions(show: boolean): void {
    if (this.state.showCollisions === show) return;
    this.map.collisionLayer.visibleInEditor = show;
    this.state = { ...this.state, showCollisions: show };
    this.emitChange();
  }

  addLayer(name: string, plane: DepthPlane): TileLayer {
    this.pushSnapshot();
    const samePlaneCount = this.map.layers.filter((l) => l.plane === plane).length;
    const layer: TileLayer = {
      id: `layer_${plane}_${Date.now().toString(36)}`,
      name: name.trim() || `Calque ${this.map.layers.length + 1}`,
      plane,
      zOrder: samePlaneCount,
      visible: true,
      opacity: 1,
      cells: {},
    };
    this.map.layers.push(layer);
    this.state = { ...this.state, activeLayerId: layer.id };
    this.emitChange();
    return layer;
  }

  removeLayer(layerId: string): boolean {
    if (this.map.layers.length <= 1) return false;
    const idx = this.map.layers.findIndex((l) => l.id === layerId);
    if (idx === -1) return false;
    this.pushSnapshot();
    this.map.layers.splice(idx, 1);
    if (this.state.activeLayerId === layerId) {
      this.state = { ...this.state, activeLayerId: this.map.layers[0]!.id };
    }
    this.emitChange();
    return true;
  }

  setLayerPlane(layerId: string, plane: DepthPlane): void {
    const layer = this.map.layers.find((item) => item.id === layerId);
    if (!layer || layer.plane === plane) return;
    this.pushSnapshot();
    layer.plane = plane;
    this.emitChange();
  }

  setLayerVisibility(layerId: string, visible: boolean): void {
    const layer = this.map.layers.find((item) => item.id === layerId);
    if (!layer || layer.visible === visible) return;
    layer.visible = visible;
    this.emitChange();
  }

  setMapName(name: string): void {
    const trimmed = name.trim();
    if (!trimmed || trimmed === this.map.name) return;
    this.map.name = trimmed;
    this.emitChange();
  }

  setPlayerAssetId(assetId: string | null): void {
    if (this.map.playerAssetId === assetId) return;
    this.pushSnapshot();
    this.map.playerAssetId = assetId;
    this.emitChange();
  }

  setPlayerCollider(collider: ColliderBox): void {
    this.pushSnapshot();
    this.map.playerCollider = { ...collider };
    this.emitChange();
  }

  setSpawnDirection(direction: CardinalDirection): void {
    if (this.map.playerSpawn.direction === direction) return;
    this.pushSnapshot();
    this.map.playerSpawn = { ...this.map.playerSpawn, direction };
    this.emitChange();
  }

  getEventAt(tx: number, ty: number): MapEvent | null {
    return this.map.events.find((ev) => ev.x === tx && ev.y === ty) ?? null;
  }

  upsertEvent(event: MapEvent): void {
    this.pushSnapshot();
    const existingIdx = this.map.events.findIndex(
      (item) => item.id === event.id || (item.x === event.x && item.y === event.y),
    );
    const cloned: MapEvent = {
      ...event,
      collider: event.collider ? { ...event.collider } : undefined,
    };
    if (existingIdx >= 0) {
      this.map.events[existingIdx] = cloned;
    } else {
      this.map.events.push(cloned);
    }
    this.emitChange();
  }

  removeEventById(eventId: string): boolean {
    const idx = this.map.events.findIndex((item) => item.id === eventId);
    if (idx === -1) return false;
    this.pushSnapshot();
    this.map.events.splice(idx, 1);
    this.emitChange();
    return true;
  }

  private pushSnapshot(snapshot?: TileMapData): void {
    this.undoStack.push(snapshot ?? cloneTileMap(this.map));
    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }
    this.redoStack.length = 0;
  }

  beginEdit(): void {
    if (!this.pendingEditSnapshot) {
      this.pendingEditSnapshot = cloneTileMap(this.map);
      this.pendingEditMutated = false;
    }
  }

  endEdit(): boolean {
    if (!this.pendingEditSnapshot) return false;
    const snapshot = this.pendingEditSnapshot;
    const mutated = this.pendingEditMutated;
    this.pendingEditSnapshot = null;
    this.pendingEditMutated = false;

    if (mutated) {
      this.pushSnapshot(snapshot);
      this.emitChange();
    }
    return mutated;
  }

  private recordSingleOrBatchMutation(): void {
    if (this.pendingEditSnapshot) {
      this.pendingEditMutated = true;
    } else {
      this.pushSnapshot();
    }
  }

  applyAtTile(tx: number, ty: number): boolean {
    const x = Math.trunc(tx);
    const y = Math.trunc(ty);
    if (x < 0 || y < 0 || x >= this.map.width || y >= this.map.height) {
      return false;
    }
    const flatIdx = y * this.map.width + x;
    const key = cellKey(x, y);

    switch (this.state.activeTool) {
      case 'paint-tile': {
        if (!this.state.selectedTile) return false;
        const layer = this.map.layers.find((item) => item.id === this.state.activeLayerId);
        if (!layer) return false;

        const existingStack = layer.cells[key] ?? [];
        if (this.state.paintMode === 'stack') {
          const top = existingStack[existingStack.length - 1];
          if (tileCellsEqual(top, this.state.selectedTile)) return false;
          this.recordSingleOrBatchMutation();
          layer.cells[key] = [
            ...existingStack,
            {
              ...this.state.selectedTile,
              sortOffsetY:
                this.state.selectedTile.sortOffsetY ??
                (layer.plane === 'y_sorted' ? this.map.tileSize + existingStack.length : undefined),
            },
          ];
          this.emitChange();
          return true;
        }

        // Replace mode
        if (
          existingStack.length === 1 &&
          tileCellsEqual(existingStack[0], this.state.selectedTile)
        ) {
          return false;
        }
        this.recordSingleOrBatchMutation();
        layer.cells[key] = [{ ...this.state.selectedTile }];
        this.emitChange();
        return true;
      }

      case 'erase-tile': {
        const layer = this.map.layers.find((item) => item.id === this.state.activeLayerId);
        const existingStack = layer?.cells[key];
        if (!layer || !existingStack || existingStack.length === 0) return false;
        this.recordSingleOrBatchMutation();
        if (this.state.paintMode === 'stack' && existingStack.length > 1) {
          layer.cells[key] = existingStack.slice(0, -1);
        } else {
          delete layer.cells[key];
        }
        this.emitChange();
        return true;
      }

      case 'paint-collision': {
        if (this.map.collisionLayer.cells[flatIdx] === 1) return false;
        this.recordSingleOrBatchMutation();
        this.map.collisionLayer.cells[flatIdx] = 1;
        this.emitChange();
        return true;
      }

      case 'erase-collision': {
        if (this.map.collisionLayer.cells[flatIdx] === 0) return false;
        this.recordSingleOrBatchMutation();
        this.map.collisionLayer.cells[flatIdx] = 0;
        this.emitChange();
        return true;
      }

      case 'set-spawn': {
        if (this.map.playerSpawn.x === x && this.map.playerSpawn.y === y) {
          return false;
        }
        this.recordSingleOrBatchMutation();
        this.map.playerSpawn = { ...this.map.playerSpawn, x, y };
        this.emitChange();
        return true;
      }

      case 'place-event': {
        const existing = this.map.events.find((ev) => ev.x === x && ev.y === y);
        if (existing) {
          return false;
        }
        this.recordSingleOrBatchMutation();
        this.map.events.push({
          id: `ev_${x}_${y}_${Date.now().toString(36)}`,
          name: `PNJ (${x},${y})`,
          kind: 'npc',
          trigger: 'interact',
          x,
          y,
          spriteAssetId: null,
          narrativeId: null,
          battleEnemyId: null,
          isSolid: true,
          plane: 'y_sorted',
          collider: createDefaultFeetCollider(this.map.tileSize),
        });
        this.emitChange();
        return true;
      }

      case 'erase-event': {
        const idx = this.map.events.findIndex((ev) => ev.x === x && ev.y === y);
        if (idx === -1) return false;
        this.recordSingleOrBatchMutation();
        this.map.events.splice(idx, 1);
        this.emitChange();
        return true;
      }
    }
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  undo(): boolean {
    if (this.pendingEditSnapshot) {
      this.endEdit();
    }
    const previous = this.undoStack.pop();
    if (!previous) return false;
    this.redoStack.push(cloneTileMap(this.map));
    this.map = previous;
    this.emitChange();
    return true;
  }

  redo(): boolean {
    const next = this.redoStack.pop();
    if (!next) return false;
    this.undoStack.push(cloneTileMap(this.map));
    this.map = next;
    this.emitChange();
    return true;
  }

  serialize(): TileMapData {
    return cloneTileMap(this.map);
  }
}
