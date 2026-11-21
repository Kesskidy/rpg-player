import { useState } from 'react';
import type { PixelStudioEngine } from '@rpg-player/pixel-studio';

interface LayersPanelProps {
  engine: PixelStudioEngine;
}

export function LayersPanel({ engine }: LayersPanelProps) {
  const frame = engine.getActiveFrame();
  const state = engine.getState();
  const activeLayer = engine.getActiveLayer();

  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState<string>('');

  // Display top-most layer first (engine stores layers bottom-to-top)
  const layersTopDown = frame.layers
    .map((layer, index) => ({ layer, index }))
    .reverse();

  function commitRename(layerId: string) {
    if (draftName.trim()) {
      engine.renameLayer(layerId, draftName);
    }
    setEditingLayerId(null);
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden border-b border-slate-800 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Calques ({frame.layers.length})
        </h3>
        <button
          type="button"
          onClick={() => engine.addLayer()}
          className="rounded bg-indigo-600 px-2 py-1 text-[11px] font-medium text-white transition hover:bg-indigo-500"
        >
          + Calque
        </button>
      </div>

      {activeLayer && (
        <div className="mb-2.5 rounded-md bg-surface-800/80 px-2.5 py-2">
          <div className="mb-1 flex items-center justify-between text-[11px] text-slate-400">
            <span>Opacité — {activeLayer.name}</span>
            <span className="font-mono text-slate-200">
              {Math.round(activeLayer.opacity * 100)}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(activeLayer.opacity * 100)}
            onChange={(event) =>
              engine.setLayerOpacity(activeLayer.id, Number(event.target.value) / 100)
            }
            className="w-full accent-indigo-500"
          />
        </div>
      )}

      <div className="flex-1 space-y-1 overflow-y-auto pr-0.5">
        {layersTopDown.map(({ layer, index }) => {
          const isSelected = layer.id === state.activeLayerId;
          const canMoveUp = index < frame.layers.length - 1;
          const canMoveDown = index > 0;
          const canDelete = frame.layers.length > 1;

          return (
            <div
              key={layer.id}
              onClick={() => engine.setActiveLayer(layer.id)}
              className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs transition ${
                isSelected
                  ? 'border-indigo-500/80 bg-indigo-600/20 text-white'
                  : 'border-slate-800 bg-surface-800/50 text-slate-300 hover:bg-surface-800'
              }`}
            >
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  engine.setLayerVisibility(layer.id, !layer.visible);
                }}
                title={layer.visible ? 'Masquer le calque' : 'Afficher le calque'}
                className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                  layer.visible
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'bg-slate-800 text-slate-500'
                }`}
              >
                {layer.visible ? 'VIS' : 'OFF'}
              </button>

              <div className="min-w-0 flex-1">
                {editingLayerId === layer.id ? (
                  <input
                    type="text"
                    value={draftName}
                    autoFocus
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) => setDraftName(event.target.value)}
                    onBlur={() => commitRename(layer.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') commitRename(layer.id);
                      if (event.key === 'Escape') setEditingLayerId(null);
                    }}
                    className="w-full rounded border border-indigo-500 bg-surface-950 px-1.5 py-0.5 text-xs text-white outline-none"
                  />
                ) : (
                  <span
                    onDoubleClick={(event) => {
                      event.stopPropagation();
                      setEditingLayerId(layer.id);
                      setDraftName(layer.name);
                    }}
                    title="Double-cliquer pour renommer"
                    className="block truncate font-medium"
                  >
                    {layer.name}
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  engine.setLayerLocked(layer.id, !layer.locked);
                }}
                title={layer.locked ? 'Déverrouiller' : 'Verrouiller'}
                className={`rounded px-1 py-0.5 text-[10px] ${
                  layer.locked ? 'bg-amber-500/20 text-amber-300' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {layer.locked ? 'LCK' : '○'}
              </button>

              <button
                type="button"
                disabled={!canMoveUp}
                onClick={(event) => {
                  event.stopPropagation();
                  engine.reorderLayer(index, index + 1);
                }}
                title="Monter le calque"
                className="rounded px-1 text-[11px] text-slate-400 hover:bg-surface-700 hover:text-white disabled:opacity-25"
              >
                ↑
              </button>
              <button
                type="button"
                disabled={!canMoveDown}
                onClick={(event) => {
                  event.stopPropagation();
                  engine.reorderLayer(index, index - 1);
                }}
                title="Descendre le calque"
                className="rounded px-1 text-[11px] text-slate-400 hover:bg-surface-700 hover:text-white disabled:opacity-25"
              >
                ↓
              </button>
              <button
                type="button"
                disabled={!canDelete}
                onClick={(event) => {
                  event.stopPropagation();
                  engine.removeLayer(layer.id);
                }}
                title="Supprimer le calque"
                className="rounded px-1 text-[11px] text-rose-400 hover:bg-rose-950/60 disabled:opacity-25"
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
