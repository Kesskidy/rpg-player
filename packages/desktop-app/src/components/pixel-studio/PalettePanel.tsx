import { useState } from 'react';
import { hexToRgba, rgbaToHex, type PixelStudioEngine } from '@rpg-player/pixel-studio';

interface PalettePanelProps {
  engine: PixelStudioEngine;
}

export function PalettePanel({ engine }: PalettePanelProps) {
  const doc = engine.getDocument();
  const state = engine.getState();
  const activeHexRgb = rgbaToHex({ ...state.activeColor, a: 255 });
  const [customHex, setCustomHex] = useState<string>(activeHexRgb);

  function handlePickColor(hex: string) {
    setCustomHex(hex);
    const parsed = hexToRgba(hex);
    engine.setColor({ ...parsed, a: state.activeColor.a });
    if (state.activeTool === 'eraser') {
      engine.setTool('pencil');
    }
  }

  function handleAlphaChange(alphaPercent: number) {
    const a = Math.round((alphaPercent / 100) * 255);
    engine.setColor({ ...state.activeColor, a });
  }

  const alphaPercent = Math.round((state.activeColor.a / 255) * 100);

  return (
    <div className="space-y-3 border-b border-slate-800 p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Palette
        </h3>
        <span className="font-mono text-[11px] text-slate-300">{activeHexRgb}</span>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="color"
          value={activeHexRgb}
          onChange={(event) => handlePickColor(event.target.value)}
          aria-label="Sélecteur de couleur"
          className="h-8 w-10 cursor-pointer rounded border border-slate-700 bg-surface-800 p-0.5"
        />
        <button
          type="button"
          onClick={() => engine.addPaletteColor(customHex || activeHexRgb)}
          className="flex-1 rounded bg-surface-800 px-2 py-1.5 text-xs text-slate-200 transition hover:bg-surface-700"
        >
          + Ajouter couleur
        </button>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between text-[11px] text-slate-400">
          <span>Opacité pinceau</span>
          <span className="font-mono text-slate-300">{alphaPercent}%</span>
        </div>
        <input
          type="range"
          min={5}
          max={100}
          value={alphaPercent}
          onChange={(event) => handleAlphaChange(Number(event.target.value))}
          className="w-full accent-indigo-500"
        />
      </div>

      <div className="grid grid-cols-8 gap-1">
        {doc.palette.map((hex) => {
          const isSelected = hex.toLowerCase() === activeHexRgb.toLowerCase();
          return (
            <button
              key={hex}
              type="button"
              onClick={() => handlePickColor(hex)}
              title={hex}
              style={{ backgroundColor: hex }}
              className={`h-6 w-full rounded-sm transition ${
                isSelected
                  ? 'scale-105 ring-2 ring-white ring-offset-1 ring-offset-surface-900'
                  : 'ring-1 ring-black/40 hover:scale-105'
              }`}
            />
          );
        })}
      </div>
    </div>
  );
}
