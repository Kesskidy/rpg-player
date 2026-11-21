import type { ColorRGBA, HexColor, PixelDocumentSerialized } from '@rpg-player/core-types';
import { clampUnit, hexToRgba, TRANSPARENT_RGBA } from './color.js';
import { compositeFrame, compositeFrameWithOnionSkin } from './compositor.js';
import {
  cloneLayer,
  createPixelDocument,
  createPixelLayer,
  deserializeDocument,
  generateStudioId,
  serializeDocument,
} from './document.js';
import {
  bresenhamLine,
  computeShapePixels,
  finalizeStrokeChanges,
  stampBrush,
  type StrokeChangeMap,
} from './drawing.js';
import { exportPixelAsset } from './exporter.js';
import { encodeAnimatedGif } from './gif-encoder.js';
import {
  DocumentFramesSnapshotCommand,
  FrameDurationCommand,
  FrameLayersSnapshotCommand,
  HistoryStack,
  LayerMetadataCommand,
  PixelStrokeCommand,
} from './history.js';
import type {
  CreateDocumentOptions,
  EngineChangeListener,
  ExportAssetOptions,
  ExportAssetOutput,
  OnionSkinOptions,
  PixelDocumentRuntime,
  PixelFrameRuntime,
  PixelLayerRuntime,
  PixelPoint,
  PixelShapeToolId,
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
      shapeFilled: false,
      shapeLockAspect: false,
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

  setShapeFilled(filled: boolean): void {
    if (this.state.shapeFilled === filled) return;
    this.state = { ...this.state, shapeFilled: filled };
    this.emitChange();
  }

  setShapeLockAspect(locked: boolean): void {
    if (this.state.shapeLockAspect === locked) return;
    this.state = { ...this.state, shapeLockAspect: locked };
    this.emitChange();
  }

  /**
   * Commits a pixel-perfect shape (rectangle/square, ellipse/circle, or line)
   * onto the active layer as a single atomic Undo/Redo command.
   */
  commitShape(
    shape: PixelShapeToolId,
    start: PixelPoint,
    end: PixelPoint,
    overrideOptions?: { filled?: boolean; lockAspect?: boolean },
  ): boolean {
    const layer = this.getActiveLayer();
    if (!layer || layer.locked || !layer.visible) {
      return false;
    }

    const filled = overrideOptions?.filled ?? this.state.shapeFilled;
    const lockAspect = overrideOptions?.lockAspect ?? this.state.shapeLockAspect;
    const points = computeShapePixels(shape, start, end, { filled, lockAspect });
    const stampSize = filled && shape !== 'line' ? 1 : this.state.brushSize;
    const changes: StrokeChangeMap = new Map();

    for (const pt of points) {
      stampBrush(
        layer,
        this.document.width,
        this.document.height,
        pt,
        stampSize,
        this.state.activeColor,
        changes,
      );
    }

    const finalized = finalizeStrokeChanges(changes);
    if (finalized.length === 0) {
      return false;
    }

    const label =
      shape === 'rect'
        ? filled
          ? 'Rectangle rempli'
          : 'Rectangle'
        : shape === 'ellipse'
          ? filled
            ? 'Cercle/Ellipse rempli'
            : 'Cercle/Ellipse'
          : 'Ligne';

    this.history.pushExecuted(
      new PixelStrokeCommand(label, this.state.activeFrameIndex, layer.id, finalized),
    );
    this.emitChange();
    return true;
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
    const clampedFrameIdx = Math.max(
      0,
      Math.min(this.document.frames.length - 1, this.state.activeFrameIndex),
    );
    if (clampedFrameIdx !== this.state.activeFrameIndex) {
      this.state = { ...this.state, activeFrameIndex: clampedFrameIdx };
    }
    const frame = this.getActiveFrame();
    if (!frame.layers.some((layer) => layer.id === this.state.activeLayerId)) {
      const topLayer = frame.layers[frame.layers.length - 1];
      if (topLayer) {
        this.state = { ...this.state, activeLayerId: topLayer.id };
      }
    }
  }

  private mutateDocumentFrames(
    label: string,
    mutator: (frames: PixelFrameRuntime[]) => boolean,
  ): boolean {
    const before = this.document.frames.map((f) => ({
      id: f.id,
      durationMs: f.durationMs,
      layers: f.layers.map(cloneLayer),
    }));
    const changed = mutator(this.document.frames);
    if (!changed) return false;
    const command = new DocumentFramesSnapshotCommand(label, before, this.document.frames);
    this.history.pushExecuted(command);
    this.ensureValidActiveLayer();
    this.emitChange();
    return true;
  }

  getFrames(): readonly PixelFrameRuntime[] {
    return this.document.frames;
  }

  getActiveFrameIndex(): number {
    return this.state.activeFrameIndex;
  }

  setActiveFrame(index: number): void {
    const clamped = Math.max(0, Math.min(this.document.frames.length - 1, Math.trunc(index)));
    if (clamped === this.state.activeFrameIndex) return;
    const nextFrame = this.document.frames[clamped]!;
    const nextLayerId = nextFrame.layers[nextFrame.layers.length - 1]?.id ?? '';
    this.state = {
      ...this.state,
      activeFrameIndex: clamped,
      activeLayerId: nextLayerId,
    };
    this.emitChange();
  }

  addFrame(durationMs = 125): PixelFrameRuntime {
    const newFrame: PixelFrameRuntime = {
      id: generateStudioId('frame'),
      durationMs: Math.max(16, Math.trunc(durationMs)),
      layers: [createPixelLayer(this.document.width, this.document.height, 'Calque 1')],
    };
    const insertAt = this.state.activeFrameIndex + 1;
    this.mutateDocumentFrames('Ajouter frame', (frames) => {
      frames.splice(insertAt, 0, newFrame);
      return true;
    });
    this.setActiveFrame(insertAt);
    return newFrame;
  }

  duplicateFrame(sourceIndex = this.state.activeFrameIndex): PixelFrameRuntime | null {
    const source = this.document.frames[sourceIndex];
    if (!source) return null;
    const copy: PixelFrameRuntime = {
      id: generateStudioId('frame'),
      durationMs: source.durationMs,
      layers: source.layers.map((layer) => ({
        ...cloneLayer(layer),
        id: generateStudioId('layer'),
      })),
    };
    const insertAt = sourceIndex + 1;
    this.mutateDocumentFrames('Dupliquer frame', (frames) => {
      frames.splice(insertAt, 0, copy);
      return true;
    });
    this.setActiveFrame(insertAt);
    return copy;
  }

  removeFrame(index: number): boolean {
    if (this.document.frames.length <= 1) return false;
    return this.mutateDocumentFrames('Supprimer frame', (frames) => {
      if (index < 0 || index >= frames.length) return false;
      frames.splice(index, 1);
      return true;
    });
  }

  reorderFrame(fromIndex: number, toIndex: number): boolean {
    return this.mutateDocumentFrames('Réordonner frames', (frames) => {
      if (
        fromIndex === toIndex ||
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= frames.length ||
        toIndex >= frames.length
      ) {
        return false;
      }
      const [moved] = frames.splice(fromIndex, 1);
      if (!moved) return false;
      frames.splice(toIndex, 0, moved);
      return true;
    });
  }

  setFrameDuration(index: number, durationMs: number): boolean {
    const clamped = Math.max(16, Math.min(5000, Math.trunc(durationMs)));
    const target = this.document.frames[index];
    if (!target || target.durationMs === clamped) return false;
    const before = target.durationMs;
    target.durationMs = clamped;
    this.history.pushExecuted(new FrameDurationCommand(target.id, before, clamped));
    this.emitChange();
    return true;
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

  /**
   * Imports an RGBA pixel buffer (e.g. from ImageToPixelArt) as a new editable layer
   * inside the active frame, centered or aligned to top-left, with full Undo/Redo support.
   */
  importRgbaAsLayer(
    name: string,
    srcWidth: number,
    srcHeight: number,
    srcRgba: Uint8ClampedArray,
    placement: 'center' | 'top-left' = 'center',
  ): PixelLayerRuntime {
    const layerName = name.trim() || 'Import Pixel Art';
    const newLayer = createPixelLayer(this.document.width, this.document.height, layerName);

    const offsetX =
      placement === 'center' ? Math.floor((this.document.width - srcWidth) / 2) : 0;
    const offsetY =
      placement === 'center' ? Math.floor((this.document.height - srcHeight) / 2) : 0;

    for (let sy = 0; sy < srcHeight; sy += 1) {
      const dy = sy + offsetY;
      if (dy < 0 || dy >= this.document.height) continue;
      for (let sx = 0; sx < srcWidth; sx += 1) {
        const dx = sx + offsetX;
        if (dx < 0 || dx >= this.document.width) continue;
        const srcOff = (sy * srcWidth + sx) * 4;
        const dstOff = (dy * this.document.width + dx) * 4;
        newLayer.pixels[dstOff] = srcRgba[srcOff] ?? 0;
        newLayer.pixels[dstOff + 1] = srcRgba[srcOff + 1] ?? 0;
        newLayer.pixels[dstOff + 2] = srcRgba[srcOff + 2] ?? 0;
        newLayer.pixels[dstOff + 3] = srcRgba[srcOff + 3] ?? 0;
      }
    }

    this.mutateActiveFrameLayers(`Importer "${layerName}"`, (layers) => {
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
    const target = this.getActiveFrame().layers.find((layer) => layer.id === layerId);
    if (!target || target.visible === visible) return false;
    const before = target.visible;
    target.visible = visible;
    this.history.pushExecuted(
      new LayerMetadataCommand(
        'Visibilité calque',
        this.state.activeFrameIndex,
        layerId,
        'visible',
        before,
        visible,
      ),
    );
    this.emitChange();
    return true;
  }

  setLayerOpacity(layerId: string, opacity: number): boolean {
    const clamped = clampUnit(opacity);
    const target = this.getActiveFrame().layers.find((layer) => layer.id === layerId);
    if (!target || target.opacity === clamped) return false;
    const before = target.opacity;
    target.opacity = clamped;
    this.history.pushExecuted(
      new LayerMetadataCommand(
        'Opacité calque',
        this.state.activeFrameIndex,
        layerId,
        'opacity',
        before,
        clamped,
      ),
    );
    this.emitChange();
    return true;
  }

  setLayerLocked(layerId: string, locked: boolean): boolean {
    const target = this.getActiveFrame().layers.find((layer) => layer.id === layerId);
    if (!target || target.locked === locked) return false;
    const before = target.locked;
    target.locked = locked;
    this.history.pushExecuted(
      new LayerMetadataCommand(
        'Verrouillage calque',
        this.state.activeFrameIndex,
        layerId,
        'locked',
        before,
        locked,
      ),
    );
    this.emitChange();
    return true;
  }

  renameLayer(layerId: string, name: string): boolean {
    const trimmed = name.trim();
    if (!trimmed) return false;
    const target = this.getActiveFrame().layers.find((layer) => layer.id === layerId);
    if (!target || target.name === trimmed) return false;
    const before = target.name;
    target.name = trimmed;
    this.history.pushExecuted(
      new LayerMetadataCommand(
        'Renommer calque',
        this.state.activeFrameIndex,
        layerId,
        'name',
        before,
        trimmed,
      ),
    );
    this.emitChange();
    return true;
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

  renderFrame(frameIndex: number): Uint8ClampedArray {
    const frame = this.document.frames[frameIndex] ?? this.getActiveFrame();
    return compositeFrame(frame, this.document.width, this.document.height);
  }

  renderActiveFrame(): Uint8ClampedArray {
    return compositeFrame(this.getActiveFrame(), this.document.width, this.document.height);
  }

  renderActiveFrameWithOnionSkin(options: OnionSkinOptions): Uint8ClampedArray {
    return compositeFrameWithOnionSkin(this.document, this.state.activeFrameIndex, options);
  }

  serialize(): PixelDocumentSerialized {
    return serializeDocument(this.document);
  }

  exportAsset(options: ExportAssetOptions): ExportAssetOutput {
    return exportPixelAsset(this.document, options);
  }

  exportGif(options?: { scale?: number; loop?: boolean }): Uint8Array {
    const frames = this.document.frames.map((frame) => ({
      rgba: compositeFrame(frame, this.document.width, this.document.height),
      durationMs: frame.durationMs,
    }));
    return encodeAnimatedGif({
      width: this.document.width,
      height: this.document.height,
      frames,
      scale: options?.scale ?? 1,
      loop: options?.loop ?? true,
    });
  }
}
