import { useEffect, useRef, useState } from 'react';
import type {
  AssetMeta,
  AssetType,
  ProjectManifest,
  ProjectStorageAdapter,
} from '@rpg-player/core-types';
import { PixelStudioEngine, type ImageToPixelArtResult } from '@rpg-player/pixel-studio';
import { loadPixelAssetSource, savePixelAsset } from '../../storage/project-service';
import { AssetSidebar, type NewAssetRequest } from './AssetSidebar';
import { ImageToPixelArtModal } from './ImageToPixelArtModal';
import { LayersPanel } from './LayersPanel';
import { PalettePanel } from './PalettePanel';
import { PixelCanvas } from './PixelCanvas';
import { ToolbarPanel } from './ToolbarPanel';

interface PixelStudioWorkspaceProps {
  storage: ProjectStorageAdapter;
  project: ProjectManifest | null;
  onProjectUpdated: (manifest: ProjectManifest) => void;
}

function slugifyId(name: string): string {
  const cleaned = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || `asset_${Date.now().toString(36)}`;
}

function recommendedZoom(width: number, height: number): number {
  const maxDim = Math.max(width, height);
  if (maxDim <= 16) return 20;
  if (maxDim <= 32) return 14;
  if (maxDim <= 64) return 8;
  if (maxDim <= 128) return 4;
  return 2;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function PixelStudioWorkspace({
  storage,
  project,
  onProjectUpdated,
}: PixelStudioWorkspaceProps) {
  const [engine, setEngine] = useState<PixelStudioEngine>(
    () =>
      new PixelStudioEngine({
        assetId: 'asset_hero_01',
        width: 32,
        height: 32,
      }),
  );
  const [renderVersion, setRenderVersion] = useState(0);
  const [zoom, setZoom] = useState(() => recommendedZoom(32, 32));

  const [assetId, setAssetId] = useState('asset_hero_01');
  const [assetName, setAssetName] = useState('Héros');
  const [assetType, setAssetType] = useState<AssetType>('sprite');
  const [tagsInput, setTagsInput] = useState('hero');

  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [converterOpen, setConverterOpen] = useState(false);

  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Subscribe to headless engine updates
  useEffect(() => {
    const unsubscribe = engine.subscribe(() => {
      setRenderVersion((version) => version + 1);
    });
    return unsubscribe;
  }, [engine]);

  // Paint live 1:1 preview thumbnail
  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const doc = engine.getDocument();
    const rgba = engine.renderActiveFrame();
    const imageData = ctx.createImageData(doc.width, doc.height);
    imageData.data.set(rgba);
    ctx.putImageData(imageData, 0, 0);
  }, [engine, renderVersion]);

  // Productivity keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement
      ) {
        return;
      }

      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === 'z') {
        event.preventDefault();
        if (event.shiftKey) {
          engine.redo();
        } else {
          engine.undo();
        }
        return;
      }
      if ((event.ctrlKey || event.metaKey) && key === 'y') {
        event.preventDefault();
        engine.redo();
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }

      if (key === 'b') {
        engine.setTool('pencil');
      } else if (key === 'e') {
        engine.setTool('eraser');
      } else if (key === 'g') {
        engine.setShowGrid(!engine.getState().showGrid);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [engine]);

  const doc = engine.getDocument();

  function parseTags(): string[] {
    return tagsInput
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);
  }

  function handleCreateAsset(request: NewAssetRequest) {
    const id = slugifyId(request.name);
    const nextEngine = new PixelStudioEngine({
      assetId: id,
      width: request.width,
      height: request.height,
    });
    setEngine(nextEngine);
    setAssetId(id);
    setAssetName(request.name);
    setAssetType(request.type);
    setTagsInput(request.type);
    setZoom(recommendedZoom(request.width, request.height));
    setRenderVersion((version) => version + 1);
    setFeedback({
      kind: 'ok',
      text: `Nouveau canvas ${request.width}×${request.height} créé pour « ${request.name} ».`,
    });
  }

  async function handleOpenAsset(meta: AssetMeta) {
    setFeedback(null);
    try {
      const serialized = await loadPixelAssetSource(storage, meta);
      const loadedEngine = PixelStudioEngine.fromSerialized(serialized);
      setEngine(loadedEngine);
      setAssetId(meta.id);
      setAssetName(meta.name);
      setAssetType(meta.type);
      setTagsInput(meta.tags.join(', '));
      setZoom(recommendedZoom(meta.gridWidth, meta.gridHeight));
      setRenderVersion((version) => version + 1);
      setFeedback({ kind: 'ok', text: `Asset « ${meta.name} » chargé (${meta.sourcePath}).` });
    } catch (error) {
      setFeedback({
        kind: 'error',
        text: error instanceof Error ? error.message : 'Impossible de charger cet asset.',
      });
    }
  }

  async function handleSaveToProject() {
    if (!project) {
      setFeedback({
        kind: 'error',
        text: 'Ouvrez ou créez d’abord un dossier projet en haut à droite pour sauvegarder.',
      });
      return;
    }

    setIsSaving(true);
    setFeedback(null);
    try {
      const result = await savePixelAsset(storage, project, engine, {
        id: assetId,
        name: assetName,
        type: assetType,
        tags: parseTags(),
      });
      setAssetId(result.meta.id);
      onProjectUpdated(result.manifest);
      setFeedback({
        kind: 'ok',
        text: `Exporté : ${result.meta.filePath} + ${result.meta.sourcePath} + AssetMeta.`,
      });
    } catch (error) {
      setFeedback({
        kind: 'error',
        text: error instanceof Error ? error.message : 'Échec de la sauvegarde.',
      });
    } finally {
      setIsSaving(false);
    }
  }

  function handleDownloadFiles() {
    const exported = engine.exportAsset({
      id: assetId,
      name: assetName,
      type: assetType,
      tags: parseTags(),
    });
    const pngCopy = new Uint8Array(exported.pngBytes);
    triggerDownload(new Blob([pngCopy], { type: 'image/png' }), `${exported.meta.id}.png`);
    triggerDownload(
      new Blob([JSON.stringify(exported.meta, null, 2)], { type: 'application/json' }),
      `${exported.meta.id}.meta.json`,
    );
    setFeedback({
      kind: 'ok',
      text: `Téléchargé : ${exported.meta.id}.png et ${exported.meta.id}.meta.json.`,
    });
  }

  function handleImportConvertedAsLayer(
    name: string,
    result: ImageToPixelArtResult,
    placement: 'center' | 'top-left',
  ) {
    engine.importRgbaAsLayer(name, result.width, result.height, result.rgba, placement);
    for (const hex of result.extractedPalette.slice(0, 16)) {
      engine.addPaletteColor(hex);
    }
    setFeedback({
      kind: 'ok',
      text: `Image « ${name} » (${result.width}×${result.height}) importée dans un nouveau calque.`,
    });
  }

  function handleImportConvertedAsNewAsset(name: string, result: ImageToPixelArtResult) {
    const id = slugifyId(name);
    const nextEngine = new PixelStudioEngine({
      assetId: id,
      width: result.width,
      height: result.height,
      palette: result.extractedPalette.length > 0 ? result.extractedPalette : undefined,
    });
    const baseLayer = nextEngine.getActiveLayer();
    if (baseLayer) {
      baseLayer.pixels.set(result.rgba);
      baseLayer.name = name;
    }
    setEngine(nextEngine);
    setAssetId(id);
    setAssetName(name);
    setAssetType('sprite');
    setTagsInput('imported, sprite');
    setZoom(recommendedZoom(result.width, result.height));
    setRenderVersion((version) => version + 1);
    setFeedback({
      kind: 'ok',
      text: `Nouvel asset « ${name} » (${result.width}×${result.height}) créé depuis l’image.`,
    });
  }

  const previewScale = Math.max(1, Math.min(4, Math.floor(96 / Math.max(doc.width, doc.height))));

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Left Dock: Tools, Palette & Project Assets */}
      <aside className="flex w-64 flex-col border-r border-slate-800 bg-surface-900">
        <div className="border-b border-slate-800 p-2.5">
          <button
            type="button"
            onClick={() => setConverterOpen(true)}
            className="w-full rounded-md bg-gradient-to-r from-indigo-600 to-cyan-600 px-3 py-2 text-xs font-semibold text-white shadow transition hover:from-indigo-500 hover:to-cyan-500"
          >
            Importer Image → Pixel Art
          </button>
        </div>
        <ToolbarPanel
          engine={engine}
          zoom={zoom}
          onZoomChange={setZoom}
          onResetZoom={() => setZoom(recommendedZoom(doc.width, doc.height))}
        />
        <PalettePanel engine={engine} />
        <AssetSidebar
          project={project}
          activeAssetId={assetId}
          onCreateAsset={handleCreateAsset}
          onOpenAsset={(meta) => void handleOpenAsset(meta)}
        />
      </aside>

      {/* Center Viewport: Pixel-Perfect HTML5 Canvas */}
      <PixelCanvas
        engine={engine}
        renderVersion={renderVersion}
        zoom={zoom}
        onZoomChange={setZoom}
      />

      {/* Right Dock: Preview, Layers & Export */}
      <aside className="flex w-72 flex-col border-l border-slate-800 bg-surface-900">
        <div className="border-b border-slate-800 p-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Prévisualisation ({previewScale}×)
            </h3>
            <span className="font-mono text-[11px] text-slate-500">
              {doc.width}×{doc.height}
            </span>
          </div>
          <div className="pixel-checkerboard flex h-28 items-center justify-center rounded-md border border-slate-800">
            <canvas
              ref={previewCanvasRef}
              width={doc.width}
              height={doc.height}
              style={{
                width: doc.width * previewScale,
                height: doc.height * previewScale,
              }}
              className="pixelated"
            />
          </div>
        </div>

        <LayersPanel engine={engine} />

        <div className="space-y-2.5 p-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Métadonnées &amp; Export
          </h3>

          <div className="grid grid-cols-2 gap-1.5">
            <label className="text-[11px] text-slate-400">
              Nom
              <input
                type="text"
                value={assetName}
                onChange={(event) => setAssetName(event.target.value)}
                className="mt-0.5 w-full rounded border border-slate-700 bg-surface-800 px-2 py-1 text-xs text-white outline-none focus:border-indigo-500"
              />
            </label>
            <label className="text-[11px] text-slate-400">
              ID fichier
              <input
                type="text"
                value={assetId}
                onChange={(event) => setAssetId(event.target.value)}
                className="mt-0.5 w-full rounded border border-slate-700 bg-surface-800 px-2 py-1 font-mono text-xs text-white outline-none focus:border-indigo-500"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <label className="text-[11px] text-slate-400">
              Type
              <select
                value={assetType}
                onChange={(event) => setAssetType(event.target.value as AssetType)}
                className="mt-0.5 w-full rounded border border-slate-700 bg-surface-800 px-2 py-1 text-xs text-slate-200 outline-none focus:border-indigo-500"
              >
                <option value="sprite">sprite</option>
                <option value="tileset">tileset</option>
                <option value="ui">ui</option>
              </select>
            </label>
            <label className="text-[11px] text-slate-400">
              Tags
              <input
                type="text"
                value={tagsInput}
                onChange={(event) => setTagsInput(event.target.value)}
                placeholder="hero, pnj"
                className="mt-0.5 w-full rounded border border-slate-700 bg-surface-800 px-2 py-1 text-xs text-white outline-none focus:border-indigo-500"
              />
            </label>
          </div>

          <button
            type="button"
            disabled={isSaving}
            onClick={() => void handleSaveToProject()}
            className="w-full rounded-md bg-indigo-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
          >
            {isSaving ? 'Sauvegarde...' : 'Sauvegarder & Exporter (PNG + AssetMeta)'}
          </button>

          <button
            type="button"
            onClick={handleDownloadFiles}
            className="w-full rounded-md border border-slate-700 bg-surface-800 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-surface-700"
          >
            Télécharger PNG + JSON
          </button>

          {feedback && (
            <p
              className={`rounded-md border px-2.5 py-1.5 text-[11px] leading-snug ${
                feedback.kind === 'ok'
                  ? 'border-emerald-500/40 bg-emerald-950/50 text-emerald-200'
                  : 'border-rose-500/40 bg-rose-950/50 text-rose-200'
              }`}
            >
              {feedback.text}
            </p>
          )}
        </div>
      </aside>

      <ImageToPixelArtModal
        open={converterOpen}
        activeCanvasWidth={doc.width}
        activeCanvasHeight={doc.height}
        onClose={() => setConverterOpen(false)}
        onImportAsLayer={handleImportConvertedAsLayer}
        onImportAsNewAsset={handleImportConvertedAsNewAsset}
      />
    </div>
  );
}
