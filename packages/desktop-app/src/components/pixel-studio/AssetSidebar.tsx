import { useState } from 'react';
import {
  GRID_PRESETS,
  type AssetMeta,
  type AssetType,
  type ProjectManifest,
} from '@rpg-player/core-types';

export interface NewAssetRequest {
  name: string;
  type: AssetType;
  width: number;
  height: number;
}

interface AssetSidebarProps {
  project: ProjectManifest | null;
  activeAssetId: string;
  onCreateAsset: (request: NewAssetRequest) => void;
  onOpenAsset: (asset: AssetMeta) => void;
}

export function AssetSidebar({
  project,
  activeAssetId,
  onCreateAsset,
  onOpenAsset,
}: AssetSidebarProps) {
  const [name, setName] = useState('Chevalier');
  const [type, setType] = useState<AssetType>('sprite');
  const [width, setWidth] = useState<number>(32);
  const [height, setHeight] = useState<number>(32);

  const projectAssets = project ? Object.values(project.assets) : [];

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const safeW = Math.max(1, Math.min(1024, Math.trunc(width) || 32));
    const safeH = Math.max(1, Math.min(1024, Math.trunc(height) || 32));
    onCreateAsset({
      name: name.trim() || 'Nouvel Asset',
      type,
      width: safeW,
      height: safeH,
    });
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden p-3">
      <form onSubmit={handleSubmit} className="space-y-2.5 border-b border-slate-800 pb-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Nouvel Asset
        </h3>

        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Nom (ex: Chevalier)"
          className="w-full rounded border border-slate-700 bg-surface-800 px-2.5 py-1.5 text-xs text-white outline-none focus:border-indigo-500"
        />

        <select
          value={type}
          onChange={(event) => setType(event.target.value as AssetType)}
          className="w-full rounded border border-slate-700 bg-surface-800 px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-indigo-500"
        >
          <option value="sprite">Sprite (Personnage / PNJ / Objet)</option>
          <option value="tileset">Tileset (Décor / Sol / Murs)</option>
          <option value="ui">UI (Icône / Cadre)</option>
        </select>

        <div>
          <span className="mb-1 block text-[11px] text-slate-400">Presets de grille</span>
          <div className="grid grid-cols-3 gap-1">
            {GRID_PRESETS.map((preset) => {
              const active = width === preset && height === preset;
              return (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    setWidth(preset);
                    setHeight(preset);
                  }}
                  className={`rounded py-1 font-mono text-[11px] transition ${
                    active
                      ? 'bg-indigo-600 text-white'
                      : 'bg-surface-800 text-slate-300 hover:bg-surface-700'
                  }`}
                >
                  {preset}×{preset}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <label className="text-[11px] text-slate-400">
            Largeur (px)
            <input
              type="number"
              min={1}
              max={1024}
              value={width}
              onChange={(event) => setWidth(Number(event.target.value))}
              className="mt-0.5 w-full rounded border border-slate-700 bg-surface-800 px-2 py-1 font-mono text-xs text-white outline-none focus:border-indigo-500"
            />
          </label>
          <label className="text-[11px] text-slate-400">
            Hauteur (px)
            <input
              type="number"
              min={1}
              max={1024}
              value={height}
              onChange={(event) => setHeight(Number(event.target.value))}
              className="mt-0.5 w-full rounded border border-slate-700 bg-surface-800 px-2 py-1 font-mono text-xs text-white outline-none focus:border-indigo-500"
            />
          </label>
        </div>

        <button
          type="submit"
          className="w-full rounded bg-surface-700 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-600"
        >
          Créer le canvas ({width}×{height})
        </button>
      </form>

      <div className="mt-3 flex flex-1 flex-col overflow-hidden">
        <div className="mb-1.5 flex items-center justify-between">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Assets du projet
          </h3>
          <span className="font-mono text-[11px] text-slate-500">{projectAssets.length}</span>
        </div>

        {!project ? (
          <p className="rounded-md border border-dashed border-slate-800 p-2.5 text-[11px] text-slate-500">
            Ouvrez ou créez un dossier projet dans la barre du haut pour sauvegarder vos assets sur
            disque.
          </p>
        ) : projectAssets.length === 0 ? (
          <p className="rounded-md border border-dashed border-slate-800 p-2.5 text-[11px] text-slate-500">
            Aucun asset enregistré. Dessinez puis cliquez sur « Sauvegarder &amp; Exporter ».
          </p>
        ) : (
          <div className="flex-1 space-y-1 overflow-y-auto pr-0.5">
            {projectAssets.map((asset) => {
              const isActive = asset.id === activeAssetId;
              return (
                <button
                  key={asset.id}
                  type="button"
                  onClick={() => onOpenAsset(asset)}
                  className={`flex w-full items-center justify-between rounded-md border px-2.5 py-2 text-left text-xs transition ${
                    isActive
                      ? 'border-indigo-500/80 bg-indigo-600/20 text-white'
                      : 'border-slate-800 bg-surface-800/50 text-slate-300 hover:bg-surface-800'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">{asset.name}</div>
                    <div className="mt-0.5 font-mono text-[10px] text-slate-400">
                      {asset.gridWidth}×{asset.gridHeight} · {asset.type}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
