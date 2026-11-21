import { useEffect, useRef, useState } from 'react';
import type {
  AnimationClip,
  AssetMeta,
  CinematicConfig,
  ProjectManifest,
  ProjectStorageAdapter,
} from '@rpg-player/core-types';
import { AnimationTimelinePlayer } from '@rpg-player/pixel-studio';

interface CinematicPlayerOverlayProps {
  config: CinematicConfig;
  storage?: ProjectStorageAdapter;
  project?: ProjectManifest | null;
  /** True when rendered behind active dialogue (`loopInBackground`). */
  isBackground?: boolean;
  onComplete?: () => void;
}

export function CinematicPlayerOverlay({
  config,
  storage,
  project,
  isBackground = false,
  onComplete,
}: CinematicPlayerOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [totalFrames, setTotalFrames] = useState(1);
  const [assetMissing, setAssetMissing] = useState(false);

  const meta: AssetMeta | null = project?.assets[config.assetId] ?? null;

  useEffect(() => {
    let cancelled = false;
    let rafId = 0;
    let objectUrl: string | null = null;

    async function runPlayer() {
      let img: HTMLImageElement | null = null;
      let clip: AnimationClip = {
        category: 'cutscene',
        frames: [0],
        fps: 6,
        loop: isBackground || config.loopInBackground,
      };

      if (meta && storage) {
        try {
          const bytes = await storage.readBinary(meta.filePath);
          if (cancelled) return;
          const copy = new Uint8Array(bytes);
          objectUrl = URL.createObjectURL(new Blob([copy], { type: 'image/png' }));
          img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const el = new Image();
            el.onload = () => resolve(el);
            el.onerror = () => reject(new Error('Image load error'));
            el.src = objectUrl!;
          });
          if (cancelled) return;

          const matchedClip =
            meta.animations[config.clipName] ?? Object.values(meta.animations)[0];
          if (matchedClip && matchedClip.frames.length > 0) {
            clip = {
              ...matchedClip,
              loop: isBackground ? true : (config.loopInBackground || !config.waitForCompletion),
            };
          } else {
            clip = {
              category: 'cutscene',
              frames: Array.from({ length: Math.max(1, meta.frameCount) }, (_, i) => i),
              fps: 6,
              loop: isBackground ? true : (config.loopInBackground || !config.waitForCompletion),
            };
          }
          setAssetMissing(false);
        } catch {
          setAssetMissing(true);
        }
      } else {
        setAssetMissing(true);
        clip = {
          category: 'cutscene',
          frames: [0, 1, 2, 3],
          fps: 2,
          loop: isBackground,
        };
      }

      setTotalFrames(Math.max(1, clip.frames.length));
      const player = new AnimationTimelinePlayer(clip, true);
      player.setSpeed(config.playbackSpeed ?? 1);

      let lastTime = performance.now();

      function drawFrame(spriteFrame: number) {
        const canvas = canvasRef.current;
        if (!canvas || !img || !meta) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const cols = Math.max(1, meta.columns);
        const col = spriteFrame % cols;
        const row = Math.floor(spriteFrame / cols);
        const sx = col * meta.gridWidth;
        const sy = row * meta.gridHeight;
        ctx.drawImage(
          img,
          sx,
          sy,
          meta.gridWidth,
          meta.gridHeight,
          0,
          0,
          canvas.width,
          canvas.height,
        );
      }

      drawFrame(player.getCurrentSpriteFrame());

      function tick(now: number) {
        if (cancelled) return;
        const dt = Math.min(100, now - lastTime);
        lastTime = now;
        const res = player.step(dt);
        setCurrentFrame(res.frameIndex);
        drawFrame(res.spriteFrame);

        if (res.completed && !isBackground && config.waitForCompletion) {
          onComplete?.();
          return;
        }
        rafId = requestAnimationFrame(tick);
      }

      rafId = requestAnimationFrame(tick);
    }

    void runPlayer();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [config, meta, storage, isBackground, onComplete]);

  const width = meta ? meta.gridWidth : 128;
  const height = meta ? meta.gridHeight : 72;

  if (isBackground || config.displayMode === 'background') {
    return (
      <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black/35 backdrop-blur-[1px]">
        {!assetMissing ? (
          <canvas
            ref={canvasRef}
            width={width}
            height={height}
            style={{ width: Math.min(480, width * 4), height: Math.min(280, height * 4) }}
            className="pixelated opacity-80 drop-shadow-2xl"
          />
        ) : (
          <div className="rounded-xl border border-pink-500/30 bg-pink-950/40 px-4 py-2 text-xs text-pink-200">
            🎬 Arrière-plan : {config.assetId || 'cinématique'} ({config.clipName})
          </div>
        )}
      </div>
    );
  }

  if (config.displayMode === 'inset') {
    return (
      <div className="absolute inset-x-0 bottom-36 z-30 flex justify-center px-4">
        <div className="flex flex-col items-center rounded-xl border-2 border-pink-500/70 bg-surface-900/95 p-3 shadow-2xl backdrop-blur">
          <div className="mb-1.5 flex w-full items-center justify-between gap-4 text-[11px]">
            <span className="font-semibold text-pink-200">
              🎬 Cinématique — {meta?.name ?? (config.assetId || 'Aperçu')}
            </span>
            <span className="font-mono text-slate-400">
              {currentFrame + 1}/{totalFrames}
            </span>
          </div>

          <div className="pixel-checkerboard flex min-h-[120px] min-w-[200px] items-center justify-center rounded-lg border border-slate-800 bg-black/70 p-2">
            {!assetMissing ? (
              <canvas
                ref={canvasRef}
                width={width}
                height={height}
                style={{ width: Math.min(320, width * 3), height: Math.min(200, height * 3) }}
                className="pixelated"
              />
            ) : (
              <div className="text-center text-xs text-pink-200">
                <div className="text-2xl">🎬</div>
                <div className="mt-1 font-mono text-[11px]">
                  {config.assetId || '(aucun asset)'} · {config.clipName}
                </div>
              </div>
            )}
          </div>

          {config.caption && (
            <p className="mt-2 max-w-md text-center text-xs text-slate-200">{config.caption}</p>
          )}

          {onComplete && (
            <button
              type="button"
              onClick={onComplete}
              className="mt-2.5 rounded bg-pink-600 px-3 py-1 text-xs font-semibold text-white hover:bg-pink-500"
            >
              Continuer ▸
            </button>
          )}
        </div>
      </div>
    );
  }

  // Fullscreen cinema presentation
  return (
    <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/90 p-6 backdrop-blur-sm">
      <div className="flex max-w-2xl flex-col items-center rounded-2xl border border-pink-500/50 bg-surface-950/95 p-5 shadow-2xl">
        <div className="mb-3 flex w-full items-center justify-between gap-6">
          <span className="rounded bg-pink-600/25 px-2.5 py-0.5 text-xs font-bold text-pink-200 ring-1 ring-pink-500/50">
            🎬 {meta?.name ?? (config.assetId || 'Cinématique')} · {config.clipName}
          </span>
          <span className="font-mono text-xs text-slate-400">
            Frame {currentFrame + 1}/{totalFrames}
          </span>
        </div>

        <div className="flex min-h-[180px] min-w-[320px] items-center justify-center rounded-xl border border-slate-800 bg-black p-4">
          {!assetMissing ? (
            <canvas
              ref={canvasRef}
              width={width}
              height={height}
              style={{ width: Math.min(440, width * 4), height: Math.min(280, height * 4) }}
              className="pixelated"
            />
          ) : (
            <div className="text-center text-pink-200">
              <div className="text-4xl">🎬</div>
              <p className="mt-2 text-xs text-slate-300">
                Asset « {config.assetId || 'non défini'} » (créez ou exportez une cinématique dans
                Animation Studio)
              </p>
            </div>
          )}
        </div>

        {config.caption && (
          <p className="mt-4 max-w-lg text-center text-sm italic text-slate-100">
            « {config.caption} »
          </p>
        )}

        {onComplete && (
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={onComplete}
              className="rounded-md bg-pink-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-pink-500"
            >
              Passer / Continuer ▸
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
