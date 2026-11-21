import { useEffect, useRef, useState } from 'react';
import type { PixelPoint, PixelStudioEngine } from '@rpg-player/pixel-studio';

interface PixelCanvasProps {
  engine: PixelStudioEngine;
  renderVersion: number;
  zoom: number;
  onZoomChange: (nextZoom: number) => void;
}

export function PixelCanvas({
  engine,
  renderVersion,
  zoom,
  onZoomChange,
}: PixelCanvasProps) {
  const artCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);

  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [hoverPoint, setHoverPoint] = useState<PixelPoint | null>(null);
  const [isSpaceHeld, setIsSpaceHeld] = useState(false);

  const isDrawingRef = useRef(false);
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

  // Spacebar pan toggle
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
    }
    function handleKeyUp(event: KeyboardEvent) {
      if (event.code === 'Space') {
        setIsSpaceHeld(false);
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

    const rgba = engine.renderActiveFrame();
    const imageData = ctx.createImageData(doc.width, doc.height);
    imageData.data.set(rgba);
    ctx.putImageData(imageData, 0, 0);
  }, [engine, doc.width, doc.height, renderVersion]);

  // Paint crisp 1px screen-space grid and brush preview overlay
  useEffect(() => {
    const overlay = overlayCanvasRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, displayWidth, displayHeight);

    if (state.showGrid && zoom >= 4) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
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

    if (hoverPoint && !isSpaceHeld) {
      const size = Math.max(1, state.brushSize);
      const startOffset = Math.floor((size - 1) / 2);
      const rx = (hoverPoint.x - startOffset) * zoom;
      const ry = (hoverPoint.y - startOffset) * zoom;
      const rw = size * zoom;
      const rh = size * zoom;

      ctx.strokeStyle =
        state.activeTool === 'eraser' ? 'rgba(248, 113, 113, 0.95)' : 'rgba(255, 255, 255, 0.95)';
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
    hoverPoint,
    isSpaceHeld,
  ]);

  function clientToPixel(clientX: number, clientY: number): PixelPoint | null {
    const canvas = artCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor(((clientX - rect.left) / rect.width) * doc.width);
    const y = Math.floor(((clientY - rect.top) / rect.height) * doc.height);
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
    isDrawingRef.current = true;
    setHoverPoint(pt);
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

  return (
    <div
      ref={viewportRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={() => {
        if (!isDrawingRef.current) setHoverPoint(null);
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
        className="pixel-checkerboard relative shadow-2xl ring-1 ring-slate-600/80"
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

      <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-3 rounded-md border border-slate-800 bg-surface-900/90 px-3 py-1.5 text-[11px] text-slate-300 backdrop-blur">
        <span className="font-mono">
          {doc.width}×{doc.height}px
        </span>
        <span className="text-slate-600">|</span>
        <span className="font-mono">Zoom {zoom}×</span>
        <span className="text-slate-600">|</span>
        <span className="font-mono">
          {hoverPoint ? `X:${hoverPoint.x} Y:${hoverPoint.y}` : 'Hors canvas'}
        </span>
        <span className="text-slate-600">|</span>
        <span className="text-slate-400">Espace + Glisser : déplacer</span>
      </div>
    </div>
  );
}
