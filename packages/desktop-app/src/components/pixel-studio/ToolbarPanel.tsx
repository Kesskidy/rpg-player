import type { PixelStudioEngine, PixelToolId } from '@rpg-player/pixel-studio';
import {
  PixelBrushIcon,
  PixelCircleIcon,
  PixelEraserIcon,
  PixelGridIcon,
  PixelLineIcon,
  PixelRectIcon,
  PixelRedoIcon,
  PixelUndoIcon,
} from '../ui/PixelIcons';

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
    return `pixel-btn flex flex-1 items-center justify-center gap-1.5 px-2 py-2 text-[11px] font-bold ${
      active ? 'pixel-btn-gold' : ''
    }`;
  }

  const isShapeTool =
    state.activeTool === 'rect' || state.activeTool === 'ellipse' || state.activeTool === 'line';

  return (
    <div className="space-y-3 border-b-2 border-dnd-border p-3">
      <div>
        <h3 className="mb-2 font-pixel text-[10px] font-bold uppercase tracking-wider text-dnd-gold">
          Outils
        </h3>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => engine.setTool('pencil')}
            className={toolButtonClass('pencil')}
            title="Crayon pixel-perfect (B)"
          >
            <PixelBrushIcon size={14} />
            <span>Crayon</span>
          </button>
          <button
            type="button"
            onClick={() => engine.setTool('eraser')}
            className={toolButtonClass('eraser')}
            title="Gomme (E)"
          >
            <PixelEraserIcon size={14} />
            <span>Gomme</span>
          </button>
        </div>

        {/* Paint-style Draggable Shapes */}
        <div className="mt-2">
          <span className="mb-1 block font-pixel text-[9px] uppercase tracking-wider text-dnd-muted">
            Formes (Cliquer-Glisser)
          </span>
          <div className="grid grid-cols-3 gap-1">
            <button
              type="button"
              onClick={() => engine.setTool('rect')}
              className={`pixel-btn flex flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-bold ${
                state.activeTool === 'rect' ? 'pixel-btn-gold' : ''
              }`}
              title="Rectangle / Carré (R)"
            >
              <PixelRectIcon size={14} />
              <span>Carré</span>
            </button>
            <button
              type="button"
              onClick={() => engine.setTool('ellipse')}
              className={`pixel-btn flex flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-bold ${
                state.activeTool === 'ellipse' ? 'pixel-btn-gold' : ''
              }`}
              title="Cercle / Ellipse (O)"
            >
              <PixelCircleIcon size={14} />
              <span>Cercle</span>
            </button>
            <button
              type="button"
              onClick={() => engine.setTool('line')}
              className={`pixel-btn flex flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-bold ${
                state.activeTool === 'line' ? 'pixel-btn-gold' : ''
              }`}
              title="Ligne droite (L)"
            >
              <PixelLineIcon size={14} />
              <span>Ligne</span>
            </button>
          </div>
        </div>

        {isShapeTool && (
          <div className="mt-2 space-y-1.5 border-2 border-dnd-border bg-dnd-obsidian p-2">
            {state.activeTool !== 'line' && (
              <div className="grid grid-cols-2 gap-1">
                <button
                  type="button"
                  onClick={() => engine.setShapeFilled(false)}
                  className={`pixel-btn py-1 text-[10px] font-bold ${
                    !state.shapeFilled ? 'pixel-btn-gold' : ''
                  }`}
                >
                  Contour
                </button>
                <button
                  type="button"
                  onClick={() => engine.setShapeFilled(true)}
                  className={`pixel-btn py-1 text-[10px] font-bold ${
                    state.shapeFilled ? 'pixel-btn-gold' : ''
                  }`}
                >
                  Rempli
                </button>
              </div>
            )}

            <div className="grid grid-cols-2 gap-1">
              <button
                type="button"
                onClick={() => engine.setShapeLockAspect(false)}
                title="Étendre librement en rectangle ou ovale"
                className={`pixel-btn py-1 text-[10px] font-bold ${
                  !state.shapeLockAspect ? 'pixel-btn-arcane' : ''
                }`}
              >
                Étendre libre
              </button>
              <button
                type="button"
                onClick={() => engine.setShapeLockAspect(true)}
                title="Verrouiller en 1:1 (carré ou cercle parfait — ou maintenez Shift)"
                className={`pixel-btn py-1 text-[10px] font-bold ${
                  state.shapeLockAspect ? 'pixel-btn-arcane' : ''
                }`}
              >
                1:1 (Shift)
              </button>
            </div>
          </div>
        )}
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between text-[11px]">
          <span className="font-pixel text-[10px] font-bold uppercase tracking-wider text-dnd-muted">
            Taille brosse
          </span>
          <span className="font-mono text-dnd-gold">{state.brushSize}px</span>
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {BRUSH_SIZES.map((size) => (
            <button
              key={size}
              type="button"
              onClick={() => engine.setBrushSize(size)}
              className={`pixel-btn py-1 font-mono text-xs ${
                state.brushSize === size ? 'pixel-btn-gold' : ''
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
          className="pixel-btn flex items-center justify-center gap-1 px-2 py-1.5 text-[10px] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <PixelUndoIcon size={13} />
          <span>Annuler</span>
        </button>
        <button
          type="button"
          onClick={() => engine.redo()}
          disabled={!engine.canRedo()}
          title="Rétablir (Ctrl+Y)"
          className="pixel-btn flex items-center justify-center gap-1 px-2 py-1.5 text-[10px] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <PixelRedoIcon size={13} />
          <span>Rétablir</span>
        </button>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-pixel text-[10px] font-bold uppercase tracking-wider text-dnd-muted">
            Affichage
          </span>
          <button
            type="button"
            onClick={() => engine.setShowGrid(!state.showGrid)}
            className={`pixel-btn flex items-center gap-1 px-2 py-0.5 text-[10px] ${
              state.showGrid ? 'border-dnd-gold text-dnd-gold' : 'text-dnd-muted'
            }`}
            title="Afficher / masquer la grille (G)"
          >
            <PixelGridIcon size={12} />
            <span>Grille : {state.showGrid ? 'ON' : 'OFF'}</span>
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onZoomChange(Math.max(1, zoom - 2))}
            className="pixel-btn px-2.5 py-1 text-xs"
          >
            −
          </button>
          <button
            type="button"
            onClick={onResetZoom}
            className="pixel-btn flex-1 py-1 font-mono text-xs text-dnd-gold"
            title="Réinitialiser le zoom"
          >
            {zoom}×
          </button>
          <button
            type="button"
            onClick={() => onZoomChange(Math.min(32, zoom + 2))}
            className="pixel-btn px-2.5 py-1 text-xs"
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}
