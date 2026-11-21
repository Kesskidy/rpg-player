import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  AnimationCategory,
  AnimationClip,
  AnimationEventMarker,
  AssetMeta,
  AssetType,
  ProjectManifest,
  ProjectStorageAdapter,
} from '@rpg-player/core-types';
import {
  AnimationTimelinePlayer,
  PixelStudioEngine,
  type OnionSkinOptions,
  type TimelinePlaybackSpeed,
} from '@rpg-player/pixel-studio';
import {
  formatSaveFeedback,
  loadPixelAssetSource,
  savePixelAsset,
} from '../../storage/project-service';
import { LayersPanel } from '../pixel-studio/LayersPanel';
import { PalettePanel } from '../pixel-studio/PalettePanel';
import { PixelCanvas } from '../pixel-studio/PixelCanvas';
import { ToolbarPanel } from '../pixel-studio/ToolbarPanel';
import { PixelDownloadIcon, PixelSaveIcon } from '../ui/PixelIcons';
import { AnimationTimeline } from './AnimationTimeline';

interface AnimationStudioWorkspaceProps {
  storage: ProjectStorageAdapter;
  project: ProjectManifest | null;
  onProjectUpdated: (manifest: ProjectManifest) => void;
}

const CLIP_PRESETS: Record<AnimationCategory, string[]> = {
  combat: ['attack_melee', 'attack_ranged', 'cast', 'hurt', 'death', 'idle', 'move'],
  vfx: ['vfx_loop', 'impact', 'fireball', 'torch', 'water'],
  cutscene: ['cutscene_main', 'intro', 'boss_reveal'],
};

function slugifyId(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '') || `anim_${Date.now().toString(36)}`
  );
}

function recommendedZoom(width: number, height: number): number {
  const maxDim = Math.max(width, height);
  if (maxDim <= 16) return 18;
  if (maxDim <= 32) return 11;
  if (maxDim <= 64) return 6;
  if (maxDim <= 128) return 3;
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

function createStarterAnimatedEngine(): PixelStudioEngine {
  const engine = new PixelStudioEngine({
    assetId: 'anim_slash_vfx',
    width: 32,
    height: 32,
  });
  // Add 3 starter frames so user immediately sees a 4-frame timeline
  engine.addFrame(100);
  engine.addFrame(90);
  engine.addFrame(110);
  engine.setActiveFrame(0);
  return engine;
}

export function AnimationStudioWorkspace({
  storage,
  project,
  onProjectUpdated,
}: AnimationStudioWorkspaceProps) {
  const [engine, setEngine] = useState<PixelStudioEngine>(() => createStarterAnimatedEngine());
  const [renderVersion, setRenderVersion] = useState(0);
  const [zoom, setZoom] = useState(() => recommendedZoom(32, 32));

  // Animation Metadata
  const [assetId, setAssetId] = useState('anim_slash_vfx');
  const [assetName, setAssetName] = useState('Coup d’Épée VFX');
  const [category, setCategory] = useState<AnimationCategory>('combat');
  const [clipName, setClipName] = useState('attack_melee');
  const [fps, setFps] = useState(10);
  const [loop, setLoop] = useState(true);
  const [markers, setMarkers] = useState<AnimationEventMarker[]>([
    { frameIndex: 2, event: 'hit_frame', payload: 'slash_impact' },
  ]);

  // New animated asset form
  const [newName, setNewName] = useState('Sort de Feu');
  const [newWidth, setNewWidth] = useState(32);
  const [newHeight, setNewHeight] = useState(32);
  const [newCategory, setNewCategory] = useState<AnimationCategory>('vfx');

  // Onion skinning & playback state
  const [onionSkin, setOnionSkin] = useState<OnionSkinOptions>({
    enabled: true,
    showPrevious: true,
    showNext: true,
    opacity: 0.35,
  });
  const [isPlaying, setIsPlaying] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState<TimelinePlaybackSpeed>(1);
  const [previewFrameIndex, setPreviewFrameIndex] = useState(0);
  const [lastTriggeredMarkers, setLastTriggeredMarkers] = useState<AnimationEventMarker[]>([]);
  const [gifScale, setGifScale] = useState<number>(4);

  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    return engine.subscribe(() => {
      setRenderVersion((v) => v + 1);
    });
  }, [engine]);

  // Build unified AnimationClip from current timeline state
  const frames = engine.getFrames();
  const frameDurationsKey = frames.map((f) => f.durationMs).join(',');

  const currentClip: AnimationClip = useMemo(() => {
    const count = frames.length;
    return {
      category,
      frames: Array.from({ length: count }, (_, idx) => idx),
      fps,
      frameDurationsMs: frames.map((f) => f.durationMs),
      loop,
      markers: markers.filter((m) => m.frameIndex >= 0 && m.frameIndex < count),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, frames.length, frameDurationsKey, fps, loop, markers]);

  // Real-time preview loop using headless AnimationTimelinePlayer
  useEffect(() => {
    const player = new AnimationTimelinePlayer(currentClip, isPlaying);
    player.setSpeed(playbackSpeed);

    let rafId = 0;
    let lastTime = performance.now();
    let clearMarkerTimeout: ReturnType<typeof setTimeout> | null = null;

    function paintPreview(frameIndex: number) {
      const canvas = previewCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const doc = engine.getDocument();
      const clamped = Math.max(0, Math.min(engine.getFrames().length - 1, frameIndex));
      const rgba = engine.renderFrame(clamped);
      const imageData = ctx.createImageData(doc.width, doc.height);
      imageData.data.set(rgba);
      ctx.putImageData(imageData, 0, 0);
    }

    paintPreview(isPlaying ? 0 : engine.getActiveFrameIndex());

    function tick(now: number) {
      const dt = Math.min(100, now - lastTime);
      lastTime = now;

      if (isPlaying) {
        const res = player.step(dt);
        setPreviewFrameIndex(res.spriteFrame);
        paintPreview(res.spriteFrame);
        if (res.triggeredMarkers.length > 0) {
          setLastTriggeredMarkers(res.triggeredMarkers);
          if (clearMarkerTimeout) clearTimeout(clearMarkerTimeout);
          clearMarkerTimeout = setTimeout(() => setLastTriggeredMarkers([]), 380);
        }
        if (res.completed) {
          setIsPlaying(false);
        }
      } else {
        const activeIdx = engine.getActiveFrameIndex();
        setPreviewFrameIndex(activeIdx);
        paintPreview(activeIdx);
      }
      rafId = requestAnimationFrame(tick);
    }

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      if (clearMarkerTimeout) clearTimeout(clearMarkerTimeout);
    };
  }, [engine, currentClip, isPlaying, playbackSpeed, renderVersion]);

  // Keyboard shortcuts (Ctrl+Z/Y, B, E, G)
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
        if (event.shiftKey) engine.redo();
        else engine.undo();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && key === 'y') {
        event.preventDefault();
        engine.redo();
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (key === 'b') engine.setTool('pencil');
      else if (key === 'e') engine.setTool('eraser');
      else if (key === 'r') engine.setTool('rect');
      else if (key === 'o') engine.setTool('ellipse');
      else if (key === 'l') engine.setTool('line');
      else if (key === 'g') engine.setShowGrid(!engine.getState().showGrid);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [engine]);

  function resolveAssetType(cat: AnimationCategory): AssetType {
    if (cat === 'vfx') return 'vfx';
    if (cat === 'cutscene') return 'cutscene';
    return 'sprite';
  }

  function handleCreateAnimatedAsset(e: React.FormEvent) {
    e.preventDefault();
    const id = slugifyId(newName);
    const nextEngine = new PixelStudioEngine({
      assetId: id,
      width: Math.max(8, Math.min(256, newWidth)),
      height: Math.max(8, Math.min(256, newHeight)),
    });
    nextEngine.addFrame(120);
    nextEngine.addFrame(120);
    nextEngine.setActiveFrame(0);

    setEngine(nextEngine);
    setAssetId(id);
    setAssetName(newName.trim() || 'Nouvelle Animation');
    setCategory(newCategory);
    setClipName(CLIP_PRESETS[newCategory][0] ?? 'default');
    setMarkers(
      newCategory === 'combat' ? [{ frameIndex: 1, event: 'hit_frame', payload: 'impact' }] : [],
    );
    setZoom(recommendedZoom(newWidth, newHeight));
    setRenderVersion((v) => v + 1);
    setFeedback({
      kind: 'ok',
      text: `Animation « ${newName} » (${newWidth}×${newHeight}, 3 frames) créée.`,
    });
  }

  async function handleOpenProjectAsset(meta: AssetMeta) {
    setFeedback(null);
    try {
      const serialized = await loadPixelAssetSource(storage, meta);
      const loadedEngine = PixelStudioEngine.fromSerialized(serialized);
      setEngine(loadedEngine);
      setAssetId(meta.id);
      setAssetName(meta.name);
      const firstClipEntry = Object.entries(meta.animations)[0];
      if (firstClipEntry) {
        const [name, clip] = firstClipEntry;
        setClipName(name);
        setCategory(
          clip.category ??
            (meta.type === 'vfx' ? 'vfx' : meta.type === 'cutscene' ? 'cutscene' : 'combat'),
        );
        setFps(clip.fps || 8);
        setLoop(clip.loop ?? true);
        setMarkers(clip.markers ? [...clip.markers] : []);
      } else {
        setClipName('idle');
        setCategory(meta.type === 'vfx' ? 'vfx' : meta.type === 'cutscene' ? 'cutscene' : 'combat');
        setMarkers([]);
      }
      setZoom(recommendedZoom(meta.gridWidth, meta.gridHeight));
      setRenderVersion((v) => v + 1);
      setFeedback({
        kind: 'ok',
        text: `Animation « ${meta.name} » chargée (${loadedEngine.getFrames().length} frames).`,
      });
    } catch (error) {
      setFeedback({
        kind: 'error',
        text: error instanceof Error ? error.message : 'Impossible de charger cet asset.',
      });
    }
  }

  async function handleExportToProject() {
    if (!project) {
      setFeedback({
        kind: 'error',
        text: 'Ouvrez ou créez un dossier projet (ou chargez la démo) en haut à droite pour sauvegarder.',
      });
      return;
    }
    setIsSaving(true);
    setFeedback(null);
    try {
      const existingMeta = project.assets[assetId];
      const mergedAnimations: Record<string, AnimationClip> = {
        ...(existingMeta?.animations ?? {}),
        [clipName.trim() || 'default']: currentClip,
      };
      const result = await savePixelAsset(storage, project, engine, {
        id: assetId,
        name: assetName,
        type: resolveAssetType(category),
        animations: mergedAnimations,
        tags: [category, 'animated', clipName.trim() || 'clip'],
      });
      setAssetId(result.meta.id);
      onProjectUpdated(result.manifest);
      setFeedback({
        kind: 'ok',
        text: formatSaveFeedback(
          storage,
          `Spritesheet & AnimationClip « ${clipName} » exportés (${result.meta.frameCount} frames → ${result.meta.filePath}).`,
        ),
      });
    } catch (error) {
      setFeedback({
        kind: 'error',
        text: error instanceof Error ? error.message : 'Échec de l’export.',
      });
    } finally {
      setIsSaving(false);
    }
  }

  function handleDownloadBundle() {
    const exported = engine.exportAsset({
      id: assetId,
      name: assetName,
      type: resolveAssetType(category),
      animations: { [clipName.trim() || 'default']: currentClip },
      tags: [category, 'animated'],
    });
    const pngCopy = new Uint8Array(exported.pngBytes);
    triggerDownload(new Blob([pngCopy], { type: 'image/png' }), `${exported.meta.id}.png`);
    triggerDownload(
      new Blob([JSON.stringify(exported.meta, null, 2)], { type: 'application/json' }),
      `${exported.meta.id}.meta.json`,
    );
    setFeedback({
      kind: 'ok',
      text: `Téléchargé : ${exported.meta.id}.png + ${exported.meta.id}.meta.json.`,
    });
  }

  function handleDownloadGif() {
    try {
      const gifBytes = engine.exportGif({ scale: gifScale, loop });
      const gifCopy = new Uint8Array(gifBytes);
      const safeName = slugifyId(assetId || assetName);
      triggerDownload(new Blob([gifCopy], { type: 'image/gif' }), `${safeName}.gif`);
      setFeedback({
        kind: 'ok',
        text: `GIF animé téléchargé : ${safeName}.gif (${doc.width * gifScale}×${doc.height * gifScale}px, ${frames.length} frames).`,
      });
    } catch (error) {
      setFeedback({
        kind: 'error',
        text: error instanceof Error ? error.message : 'Échec de l’export GIF.',
      });
    }
  }

  const doc = engine.getDocument();
  const previewScale = Math.max(1, Math.min(4, Math.floor(110 / Math.max(doc.width, doc.height))));
  const projectAssets = project ? Object.values(project.assets) : [];

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Left Dock: Drawing tools, palette & Animation asset browser */}
      <aside className="flex w-64 flex-col overflow-y-auto border-r border-slate-800 bg-surface-900">
        <ToolbarPanel
          engine={engine}
          zoom={zoom}
          onZoomChange={setZoom}
          onResetZoom={() => setZoom(recommendedZoom(doc.width, doc.height))}
        />
        <PalettePanel engine={engine} />

        {/* New Animated Asset Form */}
        <form
          onSubmit={handleCreateAnimatedAsset}
          className="space-y-2 border-b border-slate-800 p-3 text-xs"
        >
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-cyan-300">
            Nouvelle Animation
          </h3>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nom de l’animation"
            className="w-full rounded border border-slate-700 bg-surface-800 px-2 py-1 text-white"
          />
          <select
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value as AnimationCategory)}
            className="w-full rounded border border-slate-700 bg-surface-800 px-2 py-1 text-slate-200"
          >
            <option value="vfx">VFX / Asset animé</option>
            <option value="combat">Animation de Combat</option>
            <option value="cutscene">Cinématique (Cutscene)</option>
          </select>
          <div className="grid grid-cols-2 gap-1.5">
            <input
              type="number"
              min={8}
              max={256}
              value={newWidth}
              onChange={(e) => setNewWidth(Number(e.target.value))}
              title="Largeur (px)"
              className="rounded border border-slate-700 bg-surface-800 px-2 py-1 font-mono text-white"
            />
            <input
              type="number"
              min={8}
              max={256}
              value={newHeight}
              onChange={(e) => setNewHeight(Number(e.target.value))}
              title="Hauteur (px)"
              className="rounded border border-slate-700 bg-surface-800 px-2 py-1 font-mono text-white"
            />
          </div>
          <button
            type="submit"
            className="w-full rounded bg-cyan-600 py-1.5 font-semibold text-white hover:bg-cyan-500"
          >
            + Créer séquence
          </button>
        </form>

        {/* Project Assets List */}
        <div className="space-y-1 p-3">
          <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Assets du projet ({projectAssets.length})
          </h3>
          {projectAssets.length === 0 ? (
            <p className="text-[11px] italic text-slate-500">
              Ouvrez un projet ou chargez la démo pour animer vos assets existants.
            </p>
          ) : (
            <div className="max-h-48 space-y-1 overflow-y-auto">
              {projectAssets.map((meta) => (
                <button
                  key={meta.id}
                  type="button"
                  onClick={() => void handleOpenProjectAsset(meta)}
                  className={`flex w-full items-center justify-between rounded border px-2 py-1 text-left text-[11px] ${
                    meta.id === assetId
                      ? 'border-cyan-500/80 bg-cyan-600/20 text-white'
                      : 'border-slate-800 bg-surface-800/50 text-slate-300 hover:bg-surface-800'
                  }`}
                >
                  <span className="truncate font-medium">{meta.name}</span>
                  <span className="font-mono text-[10px] text-slate-400">
                    {meta.frameCount}f
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* Center Column: Canvas (with Onion Skinning) + Bottom Multi-frame Timeline */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <PixelCanvas
          engine={engine}
          renderVersion={renderVersion}
          zoom={zoom}
          onZoomChange={setZoom}
          onionSkin={onionSkin}
        />

        <AnimationTimeline
          engine={engine}
          renderVersion={renderVersion}
          onionSkin={onionSkin}
          onChangeOnionSkin={setOnionSkin}
          fps={fps}
          onChangeFps={setFps}
          loop={loop}
          onChangeLoop={setLoop}
          markers={markers}
          onAddMarker={(marker) => setMarkers((prev) => [...prev, marker])}
          onRemoveMarker={(idx) => setMarkers((prev) => prev.filter((_, i) => i !== idx))}
          isPlaying={isPlaying}
          onTogglePlay={() => setIsPlaying((p) => !p)}
          playbackSpeed={playbackSpeed}
          onChangePlaybackSpeed={setPlaybackSpeed}
          previewFrameIndex={previewFrameIndex}
          lastTriggeredMarkers={lastTriggeredMarkers}
        />
      </div>

      {/* Right Dock: Live Animated Preview, Layers & Unified Export */}
      <aside className="flex w-72 flex-col overflow-y-auto border-l border-slate-800 bg-surface-900">
        <div className="border-b border-slate-800 p-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-emerald-300">
              Aperçu Temps Réel ({previewScale}×)
            </h3>
            <span className="font-mono text-[10px] text-slate-400">
              F{previewFrameIndex + 1}/{frames.length} · ×{playbackSpeed}
            </span>
          </div>
          <div className="pixel-checkerboard relative flex h-32 items-center justify-center rounded-md border border-slate-800">
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
            {lastTriggeredMarkers.length > 0 && (
              <div className="absolute right-1.5 top-1.5 rounded bg-rose-600 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase text-white shadow">
                ⚡ {lastTriggeredMarkers[0]?.event}
              </div>
            )}
          </div>
        </div>

        <LayersPanel engine={engine} />

        {/* Unified AnimationClip Export */}
        <div className="space-y-2.5 p-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Clip &amp; Export Unifié
          </h3>

          <div className="grid grid-cols-2 gap-1.5">
            <label className="text-[11px] text-slate-400">
              Catégorie
              <select
                value={category}
                onChange={(e) => {
                  const nextCat = e.target.value as AnimationCategory;
                  setCategory(nextCat);
                  setClipName(CLIP_PRESETS[nextCat][0] ?? 'default');
                }}
                className="mt-0.5 w-full rounded border border-slate-700 bg-surface-800 px-2 py-1 text-xs text-white"
              >
                <option value="vfx">VFX / Asset</option>
                <option value="combat">Combat</option>
                <option value="cutscene">Cinématique</option>
              </select>
            </label>
            <label className="text-[11px] text-slate-400">
              Nom du clip
              <input
                type="text"
                list="clip-preset-list"
                value={clipName}
                onChange={(e) => setClipName(e.target.value)}
                className="mt-0.5 w-full rounded border border-slate-700 bg-surface-800 px-2 py-1 font-mono text-xs text-white"
              />
              <datalist id="clip-preset-list">
                {CLIP_PRESETS[category].map((preset) => (
                  <option key={preset} value={preset} />
                ))}
              </datalist>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <label className="text-[11px] text-slate-400">
              Nom asset
              <input
                type="text"
                value={assetName}
                onChange={(e) => setAssetName(e.target.value)}
                className="mt-0.5 w-full rounded border border-slate-700 bg-surface-800 px-2 py-1 text-xs text-white"
              />
            </label>
            <label className="text-[11px] text-slate-400">
              ID fichier
              <input
                type="text"
                value={assetId}
                onChange={(e) => setAssetId(e.target.value)}
                className="mt-0.5 w-full rounded border border-slate-700 bg-surface-800 px-2 py-1 font-mono text-xs text-white"
              />
            </label>
          </div>

          <button
            type="button"
            disabled={isSaving}
            onClick={() => void handleExportToProject()}
            className="pixel-btn pixel-btn-emerald flex w-full items-center justify-center gap-1.5 px-3 py-2 text-[11px] font-bold disabled:opacity-50"
          >
            <PixelSaveIcon size={14} />
            <span>{isSaving ? 'Export...' : 'Exporter Spritesheet + Clip'}</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadBundle}
            className="pixel-btn flex w-full items-center justify-center gap-1.5 px-3 py-1.5 text-[11px]"
          >
            <PixelDownloadIcon size={14} />
            <span>Télécharger PNG + JSON</span>
          </button>

          <div className="flex gap-1.5">
            <select
              value={gifScale}
              onChange={(e) => setGifScale(Number(e.target.value))}
              title="Facteur d’échelle du GIF (pixel-perfect)"
              className="border-2 border-dnd-gold bg-dnd-surface px-2 py-1.5 font-mono text-xs text-dnd-gold"
            >
              <option value={1}>×1</option>
              <option value={2}>×2</option>
              <option value={4}>×4</option>
              <option value={8}>×8</option>
            </select>
            <button
              type="button"
              onClick={handleDownloadGif}
              className="pixel-btn pixel-btn-gold flex flex-1 items-center justify-center gap-1.5 px-3 py-1.5 text-[11px] font-bold"
            >
              <PixelDownloadIcon size={14} />
              <span>Télécharger GIF</span>
            </button>
          </div>

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
    </div>
  );
}
