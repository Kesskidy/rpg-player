import { useEffect, useState } from 'react';
import type {
  AssetMeta,
  ProjectManifest,
  ProjectStorageAdapter,
  TileCell,
} from '@rpg-player/core-types';

interface TileAssetPickerProps {
  storage: ProjectStorageAdapter;
  project: ProjectManifest | null;
  tileSize: number;
  selectedTile: TileCell | null;
  onSelectTile: (cell: TileCell) => void;
  onGoToPixelStudio: () => void;
}

interface PreviewEntry {
  url: string;
  width: number;
  height: number;
}

export function TileAssetPicker({
  storage,
  project,
  tileSize,
  selectedTile,
  onSelectTile,
  onGoToPixelStudio,
}: TileAssetPickerProps) {
  const [previews, setPreviews] = useState<Record<string, PreviewEntry>>({});
  const [inspectedAssetId, setInspectedAssetId] = useState<string | null>(null);

  const assets = project ? Object.values(project.assets) : [];

  useEffect(() => {
    let cancelled = false;
    const createdUrls: string[] = [];

    async function loadPreviews() {
      if (!project) {
        setPreviews({});
        return;
      }

      const next: Record<string, PreviewEntry> = {};
      for (const meta of Object.values(project.assets)) {
        try {
          const exists = await storage.exists(meta.filePath);
          if (!exists) continue;
          const bytes = await storage.readBinary(meta.filePath);
          const copy = new Uint8Array(bytes);
          const blob = new Blob([copy], { type: 'image/png' });
          const url = URL.createObjectURL(blob);
          createdUrls.push(url);
          next[meta.id] = {
            url,
            width: meta.gridWidth * Math.max(1, meta.columns),
            height: meta.gridHeight * Math.max(1, Math.ceil(meta.frameCount / Math.max(1, meta.columns))),
          };
        } catch {
          // Ignore unreadable assets
        }
      }

      if (!cancelled) {
        setPreviews(next);
      }
    }

    void loadPreviews();

    return () => {
      cancelled = true;
      for (const url of createdUrls) {
        URL.revokeObjectURL(url);
      }
    };
  }, [storage, project]);

  const inspectedAsset: AssetMeta | null =
    assets.find((asset) => asset.id === (inspectedAssetId ?? selectedTile?.assetId)) ??
    assets[0] ??
    null;

  const inspectedPreview = inspectedAsset ? previews[inspectedAsset.id] : null;
  const cols = inspectedPreview ? Math.max(1, Math.floor(inspectedPreview.width / tileSize)) : 1;
  const rows = inspectedPreview ? Math.max(1, Math.floor(inspectedPreview.height / tileSize)) : 1;

  if (!project || assets.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-4 text-center">
        <p className="text-xs text-slate-400">
          {!project
            ? 'Ouvrez ou créez un dossier projet pour importer vos assets Pixel Studio.'
            : 'Aucun asset trouvé dans le projet.'}
        </p>
        <button
          type="button"
          onClick={onGoToPixelStudio}
          className="mt-3 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-500"
        >
          Créer des tuiles dans Pixel Studio
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Assets Phase 1 ({assets.length})
        </h3>
        <span className="font-mono text-[10px] text-slate-500">Tuile {tileSize}px</span>
      </div>

      {/* Asset list */}
      <div className="mb-3 max-h-36 space-y-1 overflow-y-auto pr-0.5">
        {assets.map((asset) => {
          const preview = previews[asset.id];
          const isInspected = inspectedAsset?.id === asset.id;
          return (
            <button
              key={asset.id}
              type="button"
              onClick={() => {
                setInspectedAssetId(asset.id);
                onSelectTile({ assetId: asset.id, tileX: 0, tileY: 0 });
              }}
              className={`flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs transition ${
                isInspected
                  ? 'border-indigo-500/80 bg-indigo-600/20 text-white'
                  : 'border-slate-800 bg-surface-800/60 text-slate-300 hover:bg-surface-800'
              }`}
            >
              <div className="pixel-checkerboard flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded border border-slate-700">
                {preview ? (
                  <img
                    src={preview.url}
                    alt={asset.name}
                    className="pixelated max-h-full max-w-full object-contain"
                  />
                ) : (
                  <span className="text-[9px] text-slate-500">PNG</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{asset.name}</div>
                <div className="font-mono text-[10px] text-slate-400">
                  {asset.gridWidth}×{asset.gridHeight} · {asset.type}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Interactive tile sub-grid slicer */}
      {inspectedAsset && inspectedPreview && (
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="mb-1.5 flex items-center justify-between text-[11px] text-slate-400">
            <span className="truncate font-medium text-slate-200">{inspectedAsset.name}</span>
            <span className="font-mono text-[10px]">
              {cols}×{rows} case{cols * rows > 1 ? 's' : ''}
            </span>
          </div>

          <div className="pixel-checkerboard flex-1 overflow-auto rounded-md border border-slate-800 p-2">
            <div
              className="relative inline-block"
              style={{
                width: inspectedPreview.width * 2,
                height: inspectedPreview.height * 2,
              }}
            >
              <img
                src={inspectedPreview.url}
                alt={inspectedAsset.name}
                className="pixelated block h-full w-full select-none"
                draggable={false}
              />

              <div
                className="absolute inset-0 grid"
                style={{
                  gridTemplateColumns: `repeat(${cols}, ${tileSize * 2}px)`,
                  gridTemplateRows: `repeat(${rows}, ${tileSize * 2}px)`,
                }}
              >
                {Array.from({ length: cols * rows }, (_, idx) => {
                  const tx = idx % cols;
                  const ty = Math.floor(idx / cols);
                  const isActive =
                    selectedTile?.assetId === inspectedAsset.id &&
                    selectedTile.tileX === tx &&
                    selectedTile.tileY === ty;
                  return (
                    <button
                      key={`${tx}_${ty}`}
                      type="button"
                      onClick={() =>
                        onSelectTile({ assetId: inspectedAsset.id, tileX: tx, tileY: ty })
                      }
                      title={`Tuile (${tx}, ${ty})`}
                      className={`border transition ${
                        isActive
                          ? 'border-amber-400 bg-amber-400/20 ring-1 ring-amber-300'
                          : 'border-white/15 hover:border-white/60 hover:bg-white/10'
                      }`}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
