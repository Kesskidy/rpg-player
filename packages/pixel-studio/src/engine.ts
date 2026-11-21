import type { ColorRGBA, HexColor, PixelDocumentSerialized } from '@rpg-player/core-types';
import { clampUnit, hexToRgba, TRANSPARENT_RGBA } from './color.js';
import { compositeFrame } from './compositor.js';
import {
  cloneLayer,
  createPixelDocument,
  createPixelLayer,
  deserializeDocument,
  serializeDocument,
} from './document.js';
import {
  bresenhamLine,
  finalizeStrokeChanges,
  stampBrush,
  type StrokeChangeMap,
} from './drawing.js';
import { exportPixelAsset } from './exporter.js';
import {
  FrameLayersSnapshotCommand,
  HistoryStack,
  PixelStrokeCommand,
} from './history.js';
import type {
  CreateDocumentOptions,
  EngineChangeListener,
  ExportAssetOptions,
  ExportAssetOutput,
  PixelDocumentRuntime,
  PixelFrameRuntime,
  PixelLayerRuntime,
  PixelPoint,
  PixelStudioState,
  PixelToolId,
} from './types.js';

interface ActiveStrokeSession {
  frameIndex: number;
  layerId: string;
  tool: PixelToolId;
  color: ColorRGBA;
  brushSize: number;
  lastPoint: PixelPoint;
  changes: StrokeChangeMap;
}

export class PixelStudioEngine {
  private document: PixelDocumentRuntime;
  private state: PixelStudioState;
  private readonly history: HistoryStack;
  private readonly listeners = new Set<EngineChangeListener>();
  private activeStroke: ActiveStrokeSession | null = null;

  constructor(options: CreateDocumentOptions, maxHistoryEntries = 100) {
    this.document = createPixelDocument(options);
    this.history = new HistoryStack(maxHistoryEntries);
    const firstLayer = this.document.frames[0]!.layers[0]!;
    const firstColor = this.document.palette[0] ?? '#141013';

    this.state = {
      activeTool: 'pencil',
      activeColor: hexToRgba(firstColor),
      brushSize: 1,
      activeFrameIndex: 0,
      activeLayerId: firstLayer.id,
      showGrid: true,
    };
  }

  static fromSerialized(
    serialized: PixelDocumentSerialized,
    maxHistoryEntries = 100,
  ): PixelStudioEngine {
    const doc = deserializeDocument(serialized);
    const engine = new PixelStudioEngine(
      {
        assetId: doc.assetId,
        width: doc.width,
        height: doc.height,
        palette: doc.palette,
      },
      maxHistoryEntries,
    );
    engine.loadDocument(doc);
    return engine;
  }

  subscribe(listener: EngineChangeListener): () => void {
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

  getDocument(): Readonly<PixelDocumentRuntime> {
    return this.document;
  }

  getState(): Readonly<PixelStudioState> {
    return this.state;
  }

  getActiveFrame(): PixelFrameRuntime {
    return this.document.frames[this.state.activeFrameIndex] ?? this.document.frames[0]!;
  }

  getActiveLayer(): PixelLayerRuntime | null {
    const frame = this.getActiveFrame();
    return frame.layers.find((layer) => layer.id === this.state.activeLayerId) ?? null;
  }

  loadDocument(doc: PixelDocumentRuntime): void {
    this.activeStroke = null;
    this.document = doc;
    this.history.clear();
    const firstFrame = doc.frames[0]!;
    const firstLayer = firstFrame.layers[0]!;
    this.state = {
      ...this.state,
      activeFrameIndex: 0,
      activeLayerId: firstLayer.id,
    };
    this.emitChange();
  }

  setTool(tool: PixelToolId): void {
    if (this.state.activeTool === tool) return;
    this.state = { ...this.state, activeTool: tool };
    this.emitChange();
  }

  setColor(color: ColorRGBA): void {
    this.state = { ...this.state, activeColor: { ...color } };
    this.emitChange();
  }

  setHexColor(hex: HexColor): void {
    this.setColor(hexToRgba(hex));
  }

  setBrushSize(size: number): void {
    const clamped = Math.max(1, Math.min(32, Math.trunc(size)));
    if (this.state.brushSize === clamped) return;
    this.state = { ...this.state, brushSize: clamped };
    this.emitChange();
  }

  setShowGrid(show: boolean): void {
    if (this.state.showGrid === show) return;
    this.state = { ...this.state, showGrid: show };
    this.emitChange();
  }

  setActiveLayer(layerId: string): void {
    const frame = this.getActiveFrame();
    if (!frame.layers.some((layer) => layer.id === layerId)) {
      return;
    }
    this.state = { ...this.state, activeLayerId: layerId };
    this.emitChange();
  }

  addPaletteColor(hex: HexColor): void {
    // Validates format before storing
    hexToRgba(hex);
    const normalized = hex.trim().toLowerCase();
    if (!this.document.palette.some((item) => item.toLowerCase() === normalized)) {
      this.document.palette.push(normalized);
      this.emitChange();
    }
  }

  beginStroke(point: PixelPoint): boolean {
    const layer = this.getActiveLayer();
    if (!layer || layer.locked || !layer.visible) {
      return false;
    }

    const color = this.state.activeTool === 'eraser' ? TRANSPARENT_RGBA : this.state.activeColor;
    const changes: StrokeChangeMap = new Map();
    const modified = stampBrush(
      layer,
      this.document.width,
      this.document.height,
      point,
      this.state.brushSize,
      color,
      changes,
    );

    this.activeStroke = {
      frameIndex: this.state.activeFrameIndex,
      layerId: layer.id,
      tool: this.state.activeTool,
      color,
      brushSize: this.state.brushSize,
      lastPoint: { x: Math.trunc(point.x), y: Math.trunc(point.y) },
      changes,
    };

    if (modified) {
      this.emitChange();
    }
    return true;
  }

  continueStroke(point: PixelPoint): boolean {
    if (!this.activeStroke) {
      return false;
    }
    const frame = this.document.frames[this.activeStroke.frameIndex];
    const layer = frame?.layers.find((item) => item.id === this.activeStroke!.layerId);
    if (!layer || layer.locked || !layer.visible) {
      return false;
    }

    const target = { x: Math.trunc(point.x), y: Math.trunc(point.y) };
    const linePoints = bresenhamLine(this.activeStroke.lastPoint, target);

    let modified = false;
    for (const pt of linePoints) {
      if (
        stampBrush(
          layer,
          this.document.width,
          this.document.height,
          pt,
          this.activeStroke.brushSize,
          this.activeStroke.color,
          this.activeStroke.changes,
        )
      ) {
        modified = true;
      }
    }

    this.activeStroke.lastPoint = target;
    if (modified) {
      this.emitChange();
    }
    return modified;
  }

  endStroke(): boolean {
    if (!this.activeStroke) {
      return false;
    }
    const session = this.activeStroke;
    this.activeStroke = null;

    const changes = finalizeStrokeChanges(session.changes);
    if (changes.length === 0) {
      return false;
    }

    const label = session.tool === 'eraser' ? 'Gomme' : 'Crayon';
    const command = new PixelStrokeCommand(label, session.frameIndex, session.layerId, changes);
    this.history.pushExecuted(command);
    this.emitChange();
    return true;
  }

  private mutateActiveFrameLayers(
    label: string,
    mutator: (layers: PixelLayerRuntime[]) => boolean,
  ): boolean {
    const frame = this.getActiveFrame();
    const before = frame.layers.map(cloneLayer);
    const changed = mutator(frame.layers);
    if (!changed) {
      return false;
    }

    const command = new FrameLayersSnapshotCommand(
      label,
      this.state.activeFrameIndex,
      before,
      frame.layers,
    );
    this.history.pushExecuted(command);
    this.ensureValidActiveLayer();
    this.emitChange();
    return true;
  }

  private ensureValidActiveLayer(): void {
    const frame = this.getActiveFrame();
    if (!frame.layers.some((layer) => layer.id === this.state.activeLayerId)) {
      const topLayer = frame.layers[frame.layers.length - 1];
      if (topLayer) {
        this.state = { ...this.state, activeLayerId: topLayer.id };
      }
    }
  }

  addLayer(name?: string): PixelLayerRuntime {
    const frame = this.getActiveFrame();
    const layerName = name?.trim() || `Calque ${frame.layers.length + 1}`;
    const newLayer = createPixelLayer(this.document.width, this.document.height, layerName);

    this.mutateActiveFrameLayers(`Ajouter calque "${layerName}"`, (layers) => {
      layers.push(newLayer);
      return true;
    });

    this.state = { ...this.state, activeLayerId: newLayer.id };
    this.emitChange();
    return newLayer;
  }

  removeLayer(layerId: string): boolean {
    return this.mutateActiveFrameLayers('Supprimer calque', (layers) => {
      if (layers.length <= 1) {
        return false;
      }
      const index = layers.findIndex((layer) => layer.id === layerId);
      if (index === -1) {
        return false;
      }
      layers.splice(index, 1);
      return true;
    });
  }

  reorderLayer(fromIndex: number, toIndex: number): boolean {
    return this.mutateActiveFrameLayers('Réordonner calques', (layers) => {
      if (
        fromIndex === toIndex ||
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= layers.length ||
        toIndex >= layers.length
      ) {
        return false;
      }
      const [moved] = layers.splice(fromIndex, 1);
      if (!moved) return false;
      layers.splice(toIndex, 0, moved);
      return true;
    });
  }

  setLayerVisibility(layerId: string, visible: boolean): boolean {
    return this.mutateActiveFrameLayers('Visibilité calque', (layers) => {
      const target = layers.find((layer) => layer.id === layerId);
      if (!target || target.visible === visible) return false;
      target.visible = visible;
      return true;
    });
  }

  setLayerOpacity(layerId: string, opacity: number): boolean {
    const clamped = clampUnit(opacity);
    return this.mutateActiveFrameLayers('Opacité calque', (layers) => {
      const target = layers.find((layer) => layer.id === layerId);
      if (!target || target.opacity === clamped) return false;
      target.opacity = clamped;
      return true;
    });
  }

  setLayerLocked(layerId: string, locked: boolean): boolean {
    return this.mutateActiveFrameLayers('Verrouillage calque', (layers) => {
      const target = layers.find((layer) => layer.id === layerId);
      if (!target || target.locked === locked) return false;
      target.locked = locked;
      return true;
    });
  }

  renameLayer(layerId: string, name: string): boolean {
    const trimmed = name.trim();
    if (!trimmed) return false;
    return this.mutateActiveFrameLayers('Renommer calque', (layers) => {
      const target = layers.find((layer) => layer.id === layerId);
      if (!target || target.name === trimmed) return false;
      target.name = trimmed;
      return true;
    });
  }

  canUndo(): boolean {
    return this.history.canUndo;
  }

  canRedo(): boolean {
    return this.history.canRedo;
  }

  undo(): boolean {
    if (this.activeStroke) {
      this.endStroke();
    }
    const undone = this.history.undo(this.document);
    if (undone) {
      this.ensureValidActiveLayer();
      this.emitChange();
    }
    return undone;
  }

  redo(): boolean {
    const redone = this.history.redo(this.document);
    if (redone) {
      this.ensureValidActiveLayer();
      this.emitChange();
    }
    return redone;
  }

  renderActiveFrame(): Uint8ClampedArray {
    return compositeFrame(this.getActiveFrame(), this.document.width, this.document.height);
  }

  serialize(): PixelDocumentSerialized {
    return serializeDocument(this.document);
  }

  exportAsset(options: ExportAssetOptions): ExportAssetOutput {
    return exportPixelAsset(this.document, options);
  }
}
