import type { PixelStudioEngine, PixelToolId } from '@rpg-player/pixel-studio';

interface ToolbarPanelProps {
  engine: PixelStudioEngine;
  zoom: number;
  onZoomChange: (nextZoom: number) => void;
  onResetZoom: () => void;
}

const BRUSH_SIZES = [1, 2, 3, 4] as const;

export function ToolbarPanel({
  engine,
  zoom,
  onZoomChange,
  onResetZoom,
}: ToolbarPanelProps) {
  const state = engine.getState();

  function toolButtonClass(tool: PixelToolId): string {
    const active = state.activeTool === tool;
    return `flex-1 rounded-md px-2.5 py-2 text-xs font-medium transition ${
      active
        ? 'bg-indigo-600 text-white shadow'
        : 'bg-surface-800 text-slate-300 hover:bg-surface-700'
    }`;
  }

  return (
    <div className="space-y-4 border-b border-slate-800 p-3">
      <div>
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Outils
        </h3>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => engine.setTool('pencil')}
            className={toolButtonClass('pencil')}
            title="Crayon pixel-perfect (B)"
          >
            Crayon (B)
          </button>
          <button
            type="button"
            onClick={() => engine.setTool('eraser')}
            className={toolButtonClass('eraser')}
            title="Gomme (E)"
          >
            Gomme (E)
          </button>
        </div>
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between text-[11px]">
          <span className="font-semibold uppercase tracking-wider text-slate-400">
            Taille brosse
          </span>
          <span className="font-mono text-slate-300">{state.brushSize}px</span>
        </div>
        <div className="grid grid-cols-4 gap-1">
          {BRUSH_SIZES.map((size) => (
            <button
              key={size}
              type="button"
              onClick={() => engine.setBrushSize(size)}
              className={`rounded py-1 text-xs font-mono transition ${
                state.brushSize === size
                  ? 'bg-indigo-600 text-white'
                  : 'bg-surface-800 text-slate-300 hover:bg-surface-700'
              }`}
            >
              {size}px
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <button
          type="button"
          onClick={() => engine.undo()}
          disabled={!engine.canUndo()}
          title="Annuler (Ctrl+Z)"
          className="rounded bg-surface-800 px-2 py-1.5 text-xs text-slate-200 transition hover:bg-surface-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={() => engine.redo()}
          disabled={!engine.canRedo()}
          title="Rétablir (Ctrl+Y)"
          className="rounded bg-surface-800 px-2 py-1.5 text-xs text-slate-200 transition hover:bg-surface-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Rétablir
        </button>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Affichage
          </span>
          <button
            type="button"
            onClick={() => engine.setShowGrid(!state.showGrid)}
            className={`rounded px-2 py-0.5 text-[11px] font-medium transition ${
              state.showGrid
                ? 'bg-indigo-600/30 text-indigo-200 ring-1 ring-indigo-500/60'
                : 'bg-surface-800 text-slate-400 hover:bg-surface-700'
            }`}
            title="Afficher / masquer la grille (G)"
          >
            Grille : {state.showGrid ? 'ON' : 'OFF'}
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onZoomChange(Math.max(1, zoom - 2))}
            className="rounded bg-surface-800 px-2.5 py-1 text-xs text-slate-200 hover:bg-surface-700"
          >
            −
          </button>
          <button
            type="button"
            onClick={onResetZoom}
            className="flex-1 rounded bg-surface-800 py-1 font-mono text-xs text-slate-200 hover:bg-surface-700"
            title="Réinitialiser le zoom"
          >
            {zoom}×
          </button>
          <button
            type="button"
            onClick={() => onZoomChange(Math.min(32, zoom + 2))}
            className="rounded bg-surface-800 px-2.5 py-1 text-xs text-slate-200 hover:bg-surface-700"
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}
