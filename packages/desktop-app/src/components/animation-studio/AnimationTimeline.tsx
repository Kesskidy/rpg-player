import { useEffect, useRef, useState } from 'react';
import type { AnimationEventMarker, AnimationMarkerEvent } from '@rpg-player/core-types';
import type {
  OnionSkinOptions,
  PixelStudioEngine,
  TimelinePlaybackSpeed,
} from '@rpg-player/pixel-studio';
import { PixelPauseIcon, PixelPlayIcon } from '../ui/PixelIcons';

interface AnimationTimelineProps {
  engine: PixelStudioEngine;
  renderVersion: number;
  onionSkin: OnionSkinOptions;
  onChangeOnionSkin: (next: OnionSkinOptions) => void;
  fps: number;
  onChangeFps: (fps: number) => void;
  loop: boolean;
  onChangeLoop: (loop: boolean) => void;
  markers: AnimationEventMarker[];
  onAddMarker: (marker: AnimationEventMarker) => void;
  onRemoveMarker: (index: number) => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  playbackSpeed: TimelinePlaybackSpeed;
  onChangePlaybackSpeed: (speed: TimelinePlaybackSpeed) => void;
  previewFrameIndex: number;
  lastTriggeredMarkers: AnimationEventMarker[];
}

const MARKER_BADGE: Record<
  AnimationMarkerEvent,
  { label: string; short: string; colorClass: string }
> = {
  hit_frame: {
    label: 'hit_frame',
    short: 'HIT',
    colorClass: 'bg-rose-600/80 text-rose-50 border-rose-400/70',
  },
  vfx_spawn: {
    label: 'vfx_spawn',
    short: 'VFX',
    colorClass: 'bg-amber-600/80 text-amber-50 border-amber-400/70',
  },
  camera_shake: {
    label: 'camera_shake',
    short: 'SHAKE',
    colorClass: 'bg-purple-600/80 text-purple-50 border-purple-400/70',
  },
  sfx: {
    label: 'sfx',
    short: 'SFX',
    colorClass: 'bg-cyan-600/80 text-cyan-50 border-cyan-400/70',
  },
  custom: {
    label: 'custom',
    short: 'TAG',
    colorClass: 'bg-emerald-600/80 text-emerald-50 border-emerald-400/70',
  },
};

function FrameThumbCanvas({
  engine,
  frameIndex,
  renderVersion,
}: {
  engine: PixelStudioEngine;
  frameIndex: number;
  renderVersion: number;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const doc = engine.getDocument();

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rgba = engine.renderFrame(frameIndex);
    const img = ctx.createImageData(doc.width, doc.height);
    img.data.set(rgba);
    ctx.putImageData(img, 0, 0);
  }, [engine, frameIndex, doc.width, doc.height, renderVersion]);

  const maxSide = 44;
  const scale = Math.min(maxSide / doc.width, maxSide / doc.height);
  const w = Math.max(12, Math.round(doc.width * scale));
  const h = Math.max(12, Math.round(doc.height * scale));

  return (
    <canvas
      ref={ref}
      width={doc.width}
      height={doc.height}
      style={{ width: w, height: h }}
      className="pixelated"
    />
  );
}

export function AnimationTimeline({
  engine,
  renderVersion,
  onionSkin,
  onChangeOnionSkin,
  fps,
  onChangeFps,
  loop,
  onChangeLoop,
  markers,
  onAddMarker,
  onRemoveMarker,
  isPlaying,
  onTogglePlay,
  playbackSpeed,
  onChangePlaybackSpeed,
  previewFrameIndex,
  lastTriggeredMarkers,
}: AnimationTimelineProps) {
  const [markerPayload, setMarkerPayload] = useState('');

  const frames = engine.getFrames();
  const activeIndex = engine.getActiveFrameIndex();
  const activeFrame = frames[activeIndex];
  const activeFrameMarkers = markers
    .map((marker, idx) => ({ marker, idx }))
    .filter(({ marker }) => marker.frameIndex === activeIndex);

  function handleQuickAddMarker(eventKind: AnimationMarkerEvent) {
    onAddMarker({
      frameIndex: activeIndex,
      event: eventKind,
      payload: markerPayload.trim() || undefined,
    });
    setMarkerPayload('');
  }

  return (
    <div className="flex h-56 flex-col border-t border-slate-800 bg-surface-900">
      {/* Top Timeline Controls: Playback, FPS, Loop, Onion Skinning */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-3 py-1.5 text-[11px]">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onTogglePlay}
            className={`pixel-btn flex items-center gap-1.5 px-2.5 py-1 font-bold ${
              isPlaying ? 'pixel-btn-gold' : 'pixel-btn-dragon'
            }`}
          >
            {isPlaying ? <PixelPauseIcon size={12} /> : <PixelPlayIcon size={12} />}
            <span>{isPlaying ? 'Pause' : 'Lire'}</span>
          </button>

          <div className="flex items-center rounded border border-slate-700 bg-surface-800 p-0.5">
            {([0.5, 1, 2] as TimelinePlaybackSpeed[]).map((spd) => (
              <button
                key={spd}
                type="button"
                onClick={() => onChangePlaybackSpeed(spd)}
                className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${
                  playbackSpeed === spd
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                ×{spd}
              </button>
            ))}
          </div>

          <label className="flex items-center gap-1 text-slate-300">
            FPS
            <input
              type="number"
              min={1}
              max={60}
              value={fps}
              onChange={(e) => onChangeFps(Math.max(1, Math.min(60, Number(e.target.value))))}
              className="w-12 rounded border border-slate-700 bg-surface-800 px-1.5 py-0.5 font-mono text-white"
            />
          </label>

          <label className="flex cursor-pointer items-center gap-1 text-slate-300">
            <input
              type="checkbox"
              checked={loop}
              onChange={(e) => onChangeLoop(e.target.checked)}
              className="accent-indigo-500"
            />
            Boucle
          </label>
        </div>

        {/* Onion Skinning Controls */}
        <div className="flex items-center gap-2 rounded border border-slate-800 bg-surface-950/70 px-2 py-0.5">
          <label className="flex cursor-pointer items-center gap-1 font-semibold text-cyan-300">
            <input
              type="checkbox"
              checked={onionSkin.enabled}
              onChange={(e) =>
                onChangeOnionSkin({ ...onionSkin, enabled: e.target.checked })
              }
              className="accent-cyan-500"
            />
            Pelure d’oignon
          </label>
          <label className="flex cursor-pointer items-center gap-1 text-rose-300">
            <input
              type="checkbox"
              disabled={!onionSkin.enabled}
              checked={onionSkin.showPrevious}
              onChange={(e) =>
                onChangeOnionSkin({ ...onionSkin, showPrevious: e.target.checked })
              }
              className="accent-rose-500"
            />
            Préc.
          </label>
          <label className="flex cursor-pointer items-center gap-1 text-sky-300">
            <input
              type="checkbox"
              disabled={!onionSkin.enabled}
              checked={onionSkin.showNext}
              onChange={(e) =>
                onChangeOnionSkin({ ...onionSkin, showNext: e.target.checked })
              }
              className="accent-sky-500"
            />
            Suiv.
          </label>
          <input
            type="range"
            min={0.1}
            max={0.8}
            step={0.05}
            disabled={!onionSkin.enabled}
            value={onionSkin.opacity}
            onChange={(e) =>
              onChangeOnionSkin({ ...onionSkin, opacity: Number(e.target.value) })
            }
            title="Opacité de la pelure d’oignon"
            className="w-16 accent-cyan-500"
          />
        </div>

        {/* Frame Management Buttons */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => engine.addFrame(Math.round(1000 / Math.max(1, fps)))}
            className="rounded bg-indigo-600 px-2 py-1 font-semibold text-white hover:bg-indigo-500"
          >
            + Frame
          </button>
          <button
            type="button"
            onClick={() => engine.duplicateFrame(activeIndex)}
            className="rounded bg-surface-800 px-2 py-1 text-slate-200 hover:bg-surface-700"
          >
            Dupliquer
          </button>
          <button
            type="button"
            disabled={activeIndex <= 0}
            onClick={() => {
              if (engine.reorderFrame(activeIndex, activeIndex - 1)) {
                engine.setActiveFrame(activeIndex - 1);
              }
            }}
            title="Déplacer frame à gauche"
            className="rounded bg-surface-800 px-1.5 py-1 text-slate-200 hover:bg-surface-700 disabled:opacity-35"
          >
            ←
          </button>
          <button
            type="button"
            disabled={activeIndex >= frames.length - 1}
            onClick={() => {
              if (engine.reorderFrame(activeIndex, activeIndex + 1)) {
                engine.setActiveFrame(activeIndex + 1);
              }
            }}
            title="Déplacer frame à droite"
            className="rounded bg-surface-800 px-1.5 py-1 text-slate-200 hover:bg-surface-700 disabled:opacity-35"
          >
            →
          </button>
          <button
            type="button"
            disabled={frames.length <= 1}
            onClick={() => engine.removeFrame(activeIndex)}
            className="rounded bg-rose-950/70 px-2 py-1 text-rose-200 hover:bg-rose-800 disabled:opacity-35"
          >
            Suppr.
          </button>
        </div>
      </div>

      {/* Frames Strip */}
      <div className="flex flex-1 items-center gap-2 overflow-x-auto px-3 py-2">
        {frames.map((frame, index) => {
          const isSelected = index === activeIndex;
          const isPreviewCursor = isPlaying && index === previewFrameIndex;
          const frameMarkers = markers.filter((m) => m.frameIndex === index);

          return (
            <button
              key={frame.id}
              type="button"
              onClick={() => engine.setActiveFrame(index)}
              className={`relative flex h-24 w-24 shrink-0 flex-col items-center justify-between rounded-lg border p-1.5 transition ${
                isSelected
                  ? 'border-indigo-400 bg-indigo-950/50 ring-2 ring-indigo-500/40'
                  : isPreviewCursor
                    ? 'border-emerald-400 bg-emerald-950/30'
                    : 'border-slate-800 bg-surface-950/70 hover:border-slate-600'
              }`}
            >
              <div className="flex w-full items-center justify-between text-[10px]">
                <span className="font-mono font-bold text-slate-300">#{index + 1}</span>
                <span className="font-mono text-slate-500">{frame.durationMs}ms</span>
              </div>

              <div className="pixel-checkerboard flex h-12 w-12 items-center justify-center rounded border border-slate-800">
                <FrameThumbCanvas
                  engine={engine}
                  frameIndex={index}
                  renderVersion={renderVersion}
                />
              </div>

              <div className="flex max-w-full flex-wrap justify-center gap-0.5 overflow-hidden">
                {frameMarkers.length > 0 ? (
                  frameMarkers.slice(0, 2).map((m, mi) => (
                    <span
                      key={`${m.event}_${mi}`}
                      className={`rounded border px-1 text-[8px] font-bold uppercase ${MARKER_BADGE[m.event].colorClass}`}
                    >
                      {MARKER_BADGE[m.event].short}
                    </span>
                  ))
                ) : (
                  <span className="text-[9px] text-slate-600">
                    {frame.layers.length} calq.
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Bottom Event Markers & Per-Frame Duration Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 bg-surface-950/80 px-3 py-1.5 text-[11px]">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono font-semibold text-indigo-300">
            Frame #{activeIndex + 1}
          </span>
          {activeFrame && (
            <label className="flex items-center gap-1 text-slate-400">
              Durée
              <input
                type="number"
                min={16}
                max={5000}
                step={10}
                value={activeFrame.durationMs}
                onChange={(e) => engine.setFrameDuration(activeIndex, Number(e.target.value))}
                className="w-16 rounded border border-slate-700 bg-surface-800 px-1.5 py-0.5 font-mono text-white"
              />
              ms
            </label>
          )}
          <span className="text-slate-700">|</span>
          <span className="text-slate-400">Marqueurs :</span>
          <input
            type="text"
            value={markerPayload}
            onChange={(e) => setMarkerPayload(e.target.value)}
            placeholder="payload (ex: slash_vfx)"
            className="w-32 rounded border border-slate-700 bg-surface-800 px-1.5 py-0.5 text-[11px] text-white"
          />
          {(['hit_frame', 'vfx_spawn', 'camera_shake', 'sfx'] as AnimationMarkerEvent[]).map(
            (ev) => (
              <button
                key={ev}
                type="button"
                onClick={() => handleQuickAddMarker(ev)}
                className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold transition hover:brightness-110 ${MARKER_BADGE[ev].colorClass}`}
              >
                + {MARKER_BADGE[ev].label}
              </button>
            ),
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1">
          {activeFrameMarkers.map(({ marker, idx }) => (
            <span
              key={idx}
              className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold ${MARKER_BADGE[marker.event].colorClass}`}
            >
              {marker.event}
              {marker.payload ? `:${marker.payload}` : ''}
              <button
                type="button"
                onClick={() => onRemoveMarker(idx)}
                className="ml-0.5 opacity-75 hover:opacity-100"
              >
                ×
              </button>
            </span>
          ))}
          {lastTriggeredMarkers.length > 0 && (
            <span className="ml-2 animate-pulse rounded bg-rose-600/30 px-2 py-0.5 font-mono text-[10px] font-bold text-rose-200 ring-1 ring-rose-500/60">
              ⚡ {lastTriggeredMarkers.map((m) => m.event).join(', ')}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
