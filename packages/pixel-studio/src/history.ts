import { cloneLayer } from './document.js';
import type {
  HistoryCommand,
  PixelChange,
  PixelDocumentRuntime,
  PixelLayerRuntime,
} from './types.js';

export class PixelStrokeCommand implements HistoryCommand {
  readonly label: string;
  private readonly frameIndex: number;
  private readonly layerId: string;
  private readonly changes: readonly PixelChange[];

  constructor(
    label: string,
    frameIndex: number,
    layerId: string,
    changes: readonly PixelChange[],
  ) {
    this.label = label;
    this.frameIndex = frameIndex;
    this.layerId = layerId;
    this.changes = changes;
  }

  private findLayer(doc: PixelDocumentRuntime): PixelLayerRuntime | null {
    const frame = doc.frames[this.frameIndex];
    if (!frame) return null;
    return frame.layers.find((layer) => layer.id === this.layerId) ?? null;
  }

  apply(doc: PixelDocumentRuntime): void {
    const layer = this.findLayer(doc);
    if (!layer) return;
    for (const change of this.changes) {
      const offset = change.pixelIndex * 4;
      layer.pixels[offset] = change.after[0];
      layer.pixels[offset + 1] = change.after[1];
      layer.pixels[offset + 2] = change.after[2];
      layer.pixels[offset + 3] = change.after[3];
    }
  }

  revert(doc: PixelDocumentRuntime): void {
    const layer = this.findLayer(doc);
    if (!layer) return;
    for (const change of this.changes) {
      const offset = change.pixelIndex * 4;
      layer.pixels[offset] = change.before[0];
      layer.pixels[offset + 1] = change.before[1];
      layer.pixels[offset + 2] = change.before[2];
      layer.pixels[offset + 3] = change.before[3];
    }
  }
}

export class FrameLayersSnapshotCommand implements HistoryCommand {
  readonly label: string;
  private readonly frameIndex: number;
  private readonly beforeLayers: PixelLayerRuntime[];
  private readonly afterLayers: PixelLayerRuntime[];

  constructor(
    label: string,
    frameIndex: number,
    beforeLayers: readonly PixelLayerRuntime[],
    afterLayers: readonly PixelLayerRuntime[],
  ) {
    this.label = label;
    this.frameIndex = frameIndex;
    this.beforeLayers = beforeLayers.map(cloneLayer);
    this.afterLayers = afterLayers.map(cloneLayer);
  }

  apply(doc: PixelDocumentRuntime): void {
    const frame = doc.frames[this.frameIndex];
    if (!frame) return;
    frame.layers = this.afterLayers.map(cloneLayer);
  }

  revert(doc: PixelDocumentRuntime): void {
    const frame = doc.frames[this.frameIndex];
    if (!frame) return;
    frame.layers = this.beforeLayers.map(cloneLayer);
  }
}

export class HistoryStack {
  private readonly maxEntries: number;
  private readonly undoStack: HistoryCommand[] = [];
  private readonly redoStack: HistoryCommand[] = [];

  constructor(maxEntries = 100) {
    this.maxEntries = Math.max(1, maxEntries);
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  get undoCount(): number {
    return this.undoStack.length;
  }

  get redoCount(): number {
    return this.redoStack.length;
  }

  pushExecuted(command: HistoryCommand): void {
    this.undoStack.push(command);
    if (this.undoStack.length > this.maxEntries) {
      this.undoStack.shift();
    }
    this.redoStack.length = 0;
  }

  undo(doc: PixelDocumentRuntime): boolean {
    const command = this.undoStack.pop();
    if (!command) return false;
    command.revert(doc);
    this.redoStack.push(command);
    return true;
  }

  redo(doc: PixelDocumentRuntime): boolean {
    const command = this.redoStack.pop();
    if (!command) return false;
    command.apply(doc);
    this.undoStack.push(command);
    return true;
  }

  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }
}
