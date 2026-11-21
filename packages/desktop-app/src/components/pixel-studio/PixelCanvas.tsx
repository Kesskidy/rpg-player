import { useEffect, useRef, useState } from 'react';
import {
  computeShapePixels,
  constrainShapeEndPoint,
  type OnionSkinOptions,
  type PixelPoint,
  type PixelShapeToolId,
  type PixelStudioEngine,
  type PixelToolId,
} from '@rpg-player/pixel-studio';

interface PixelCanvasProps {
  engine: PixelStudioEngine;
  renderVersion: number;
  zoom: number;
  onZoomChange: (nextZoom: number) => void;
  onionSkin?: OnionSkinOptions;
}

function isShapeTool(tool: PixelToolId): tool is PixelShapeToolId {
  return tool === 'rect' || tool === 'ellipse' || tool === 'line';
}

interface ShapeDraft {
  tool: PixelShapeToolId;
  start: PixelPoint;
  end: PixelPoint;
  shiftHeld: boolean;
}

export function PixelCanvas({
  engine,
  renderVersion,
  zoom,
  onZoomChange,
  onionSkin,
}: PixelCanvasProps) {
  const artCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);

  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [hoverPoint, setHoverPoint] = useState<PixelPoint | null>(null);
  const [isSpaceHeld, setIsSpaceHeld] = useState(false);
  const [shapeDraft, setShapeDraft] = useState<ShapeDraft | null>(null);

  const isDrawingRef = useRef(false);
  const shapeDraftRef = useRef<ShapeDraft | null>(null);
  const isPanningRef = useRef(false);
  const panStartRef = useRef<{ clientX: number; clientY: number; originX: number; originY: number }>({
    clientX: 0,
    clientY: 0,
    originX: 0,
    originY: 0,
  });

  const doc = engine.getDocument();
  const state = engine.getState();
  const displayWidth = doc.width * zoom;
  const displayHeight = doc.height * zoom;

  // Reset pan when document dimensions change
  useEffect(() => {
    setPan({ x: 0, y: 0 });
  }, [doc.assetId, doc.width, doc.height]);

  // Spacebar pan toggle + live Shift key constraint updates while dragging a shape
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (
        event.code === 'Space' &&
        !(event.target instanceof HTMLInputElement) &&
        !(event.target instanceof HTMLTextAreaElement)
      ) {
        event.preventDefault();
        setIsSpaceHeld(true);
      }
      if (event.key === 'Shift' && shapeDraftRef.current) {
        const next = { ...shapeDraftRef.current, shiftHeld: true };
        shapeDraftRef.current = next;
        setShapeDraft(next);
      }
    }
    function handleKeyUp(event: KeyboardEvent) {
      if (event.code === 'Space') {
        setIsSpaceHeld(false);
      }
      if (event.key === 'Shift' && shapeDraftRef.current) {
        const next = { ...shapeDraftRef.current, shiftHeld: false };
        shapeDraftRef.current = next;
        setShapeDraft(next);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Paint composited pixels into 1:1 HTML5 Canvas via ImageData
  useEffect(() => {
    const canvas = artCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rgba = onionSkin?.enabled
      ? engine.renderActiveFrameWithOnionSkin(onionSkin)
      : engine.renderActiveFrame();
    const imageData = ctx.createImageData(doc.width, doc.height);
    imageData.data.set(rgba);
    ctx.putImageData(imageData, 0, 0);
  }, [
    engine,
    doc.width,
    doc.height,
    renderVersion,
    onionSkin?.enabled,
    onionSkin?.showPrevious,
    onionSkin?.showNext,
    onionSkin?.opacity,
  ]);

  // Paint crisp 1px screen-space grid, live draggable shape preview, and brush cursor overlay
  useEffect(() => {
    const overlay = overlayCanvasRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, displayWidth, displayHeight);

    if (state.showGrid && zoom >= 4) {
      ctx.strokeStyle = 'rgba(239, 230, 213, 0.11)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 1; x < doc.width; x += 1) {
        const px = x * zoom + 0.5;
        ctx.moveTo(px, 0);
        ctx.lineTo(px, displayHeight);
      }
      for (let y = 1; y < doc.height; y += 1) {
        const py = y * zoom + 0.5;
        ctx.moveTo(0, py);
        ctx.lineTo(displayWidth, py);
      }
      ctx.stroke();
    }

    // Live Paint-style pixel-perfect shape preview while dragging
    if (shapeDraft) {
      const lockAspect = state.shapeLockAspect || shapeDraft.shiftHeld;
      const points = computeShapePixels(shapeDraft.tool, shapeDraft.start, shapeDraft.end, {
        filled: state.shapeFilled,
        lockAspect,
      });
      const stampSize = state.shapeFilled && shapeDraft.tool !== 'line' ? 1 : state.brushSize;
      const startOffset = Math.floor((stampSize - 1) / 2);

      const c = state.activeColor;
      ctx.fillStyle = `rgba(${c.r}, ${c.g}, ${c.b}, ${Math.max(0.35, (c.a / 255) * 0.85)})`;
      for (const pt of points) {
        for (let dy = 0; dy < stampSize; dy += 1) {
          const py = pt.y - startOffset + dy;
          if (py < 0 || py >= doc.height) continue;
          for (let dx = 0; dx < stampSize; dx += 1) {
            const px = pt.x - startOffset + dx;
            if (px < 0 || px >= doc.width) continue;
            ctx.fillRect(px * zoom, py * zoom, zoom, zoom);
          }
        }
      }

      // Antique gold bounding box guide
      const resolvedEnd = constrainShapeEndPoint(
        shapeDraft.tool,
        shapeDraft.start,
        shapeDraft.end,
        lockAspect,
      );
      const minX = Math.min(shapeDraft.start.x, resolvedEnd.x);
      const maxX = Math.max(shapeDraft.start.x, resolvedEnd.x);
      const minY = Math.min(shapeDraft.start.y, resolvedEnd.y);
      const maxY = Math.max(shapeDraft.start.y, resolvedEnd.y);
      ctx.save();
      ctx.strokeStyle = '#DFA842';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(
        minX * zoom + 0.75,
        minY * zoom + 0.75,
        (maxX - minX + 1) * zoom - 1.5,
        (maxY - minY + 1) * zoom - 1.5,
      );
      ctx.restore();
    } else if (hoverPoint && !isSpaceHeld) {
      const size = isShapeTool(state.activeTool) ? 1 : Math.max(1, state.brushSize);
      const startOffset = Math.floor((size - 1) / 2);
      const rx = (hoverPoint.x - startOffset) * zoom;
      const ry = (hoverPoint.y - startOffset) * zoom;
      const rw = size * zoom;
      const rh = size * zoom;

      ctx.strokeStyle =
        state.activeTool === 'eraser'
          ? 'rgba(224, 67, 67, 0.95)'
          : isShapeTool(state.activeTool)
            ? '#DFA842'
            : 'rgba(239, 230, 213, 0.95)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(rx + 0.75, ry + 0.75, Math.max(1, rw - 1.5), Math.max(1, rh - 1.5));
    }
  }, [
    doc.width,
    doc.height,
    displayWidth,
    displayHeight,
    zoom,
    state.showGrid,
    state.brushSize,
    state.activeTool,
    state.activeColor,
    state.shapeFilled,
    state.shapeLockAspect,
    hoverPoint,
    isSpaceHeld,
    shapeDraft,
  ]);

  function clientToPixel(clientX: number, clientY: number, clampToBounds = false): PixelPoint | null {
    const canvas = artCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    let x = Math.floor(((clientX - rect.left) / rect.width) * doc.width);
    let y = Math.floor(((clientY - rect.top) / rect.height) * doc.height);
    if (clampToBounds) {
      x = Math.max(0, Math.min(doc.width - 1, x));
      y = Math.max(0, Math.min(doc.height - 1, y));
      return { x, y };
    }
    if (x < 0 || y < 0 || x >= doc.width || y >= doc.height) {
      return null;
    }
    return { x, y };
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    // Middle mouse button or Space + Left Click pans the viewport
    if (event.button === 1 || (event.button === 0 && isSpaceHeld)) {
      event.preventDefault();
      isPanningRef.current = true;
      panStartRef.current = {
        clientX: event.clientX,
        clientY: event.clientY,
        originX: pan.x,
        originY: pan.y,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    if (event.button !== 0) {
      return;
    }

    const pt = clientToPixel(event.clientX, event.clientY);
    if (!pt) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    setHoverPoint(pt);

    const activeTool = engine.getState().activeTool;
    if (isShapeTool(activeTool)) {
      const draft: ShapeDraft = {
        tool: activeTool,
        start: pt,
        end: pt,
        shiftHeld: event.shiftKey,
      };
      shapeDraftRef.current = draft;
      setShapeDraft(draft);
      return;
    }

    isDrawingRef.current = true;
    engine.beginStroke(pt);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (isPanningRef.current) {
      const dx = event.clientX - panStartRef.current.clientX;
      const dy = event.clientY - panStartRef.current.clientY;
      setPan({
        x: panStartRef.current.originX + dx,
        y: panStartRef.current.originY + dy,
      });
      return;
    }

    if (shapeDraftRef.current) {
      const clampedPt = clientToPixel(event.clientX, event.clientY, true);
      if (clampedPt) {
        setHoverPoint(clampedPt);
        const next: ShapeDraft = {
          ...shapeDraftRef.current,
          end: clampedPt,
          shiftHeld: event.shiftKey,
        };
        shapeDraftRef.current = next;
        setShapeDraft(next);
      }
      return;
    }

    const pt = clientToPixel(event.clientX, event.clientY);
    setHoverPoint(pt);

    if (isDrawingRef.current && pt) {
      engine.continueStroke(pt);
    }
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (isPanningRef.current) {
      isPanningRef.current = false;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      return;
    }

    if (shapeDraftRef.current) {
      const draft = shapeDraftRef.current;
      shapeDraftRef.current = null;
      setShapeDraft(null);
      const lockAspect = engine.getState().shapeLockAspect || event.shiftKey || draft.shiftHeld;
      engine.commitShape(draft.tool, draft.start, draft.end, { lockAspect });
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      return;
    }

    if (isDrawingRef.current) {
      isDrawingRef.current = false;
      engine.endStroke();
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    }
  }

  function handleWheel(event: React.WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    const delta = event.deltaY < 0 ? 1 : -1;
    const step = zoom >= 12 ? 2 : 1;
    const nextZoom = Math.max(1, Math.min(32, zoom + delta * step));
    if (nextZoom !== zoom) {
      onZoomChange(nextZoom);
    }
  }

  let shapeDimsLabel: string | null = null;
  if (shapeDraft) {
    const resolvedEnd = constrainShapeEndPoint(
      shapeDraft.tool,
      shapeDraft.start,
      shapeDraft.end,
      state.shapeLockAspect || shapeDraft.shiftHeld,
    );
    const w = Math.abs(resolvedEnd.x - shapeDraft.start.x) + 1;
    const h = Math.abs(resolvedEnd.y - shapeDraft.start.y) + 1;
    shapeDimsLabel = `Forme ${w}×${h}px`;
  }

  return (
    <div
      ref={viewportRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={() => {
        if (!isDrawingRef.current && !shapeDraftRef.current) setHoverPoint(null);
      }}
      onWheel={handleWheel}
      onContextMenu={(event) => event.preventDefault()}
      className={`relative flex flex-1 select-none items-center justify-center overflow-hidden bg-surface-950 ${
        isSpaceHeld ? 'cursor-grab' : 'cursor-crosshair'
      }`}
    >
      <div
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px)`,
          width: displayWidth,
          height: displayHeight,
        }}
        className="pixel-checkerboard relative border-2 border-dnd-border shadow-pixel-lg"
      >
        <canvas
          ref={artCanvasRef}
          width={doc.width}
          height={doc.height}
          style={{ width: displayWidth, height: displayHeight }}
          className="pixelated block"
        />
        <canvas
          ref={overlayCanvasRef}
          width={displayWidth}
          height={displayHeight}
          className="pointer-events-none absolute inset-0 block"
        />
      </div>

      <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-3 border-2 border-dnd-border bg-dnd-stone/95 px-3 py-1.5 text-[11px] text-dnd-parchment shadow-pixel-sm">
        <span className="font-mono">
          {doc.width}×{doc.height}px
        </span>
        <span className="text-slate-600">|</span>
        <span className="font-mono">Zoom {zoom}×</span>
        <span className="text-slate-600">|</span>
        <span className="font-mono">
          {shapeDimsLabel ?? (hoverPoint ? `X:${hoverPoint.x} Y:${hoverPoint.y}` : 'Hors canvas')}
        </span>
        <span className="text-slate-600">|</span>
        <span className="text-dnd-muted">
          {isShapeTool(state.activeTool)
            ? 'Glisser pour étendre · Shift : 1:1'
            : 'Espace + Glisser : déplacer'}
        </span>
      </div>
    </div>
  );
}
