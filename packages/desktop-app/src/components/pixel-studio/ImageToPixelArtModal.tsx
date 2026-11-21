import { useEffect, useMemo, useRef, useState } from 'react';
import type { ColorRGBA, HexColor } from '@rpg-player/core-types';
import {
  convertImageToPixelArt,
  rgbaToHex,
  type ImageToPixelArtResult,
  type RawRgbaImage,
} from '@rpg-player/pixel-studio';

interface ImageToPixelArtModalProps {
  open: boolean;
  activeCanvasWidth: number;
  activeCanvasHeight: number;
  onClose: () => void;
  onImportAsLayer: (
    name: string,
    result: ImageToPixelArtResult,
    placement: 'center' | 'top-left',
  ) => void;
  onImportAsNewAsset: (name: string, result: ImageToPixelArtResult) => void;
}

const HEIGHT_PRESETS = [16, 24, 32, 48, 64, 96, 128] as const;
const PALETTE_OPTIONS: ReadonlyArray<{ label: string; value: number | null }> = [
  { label: 'Libre', value: null },
  { label: '16 coul.', value: 16 },
  { label: '32 coul.', value: 32 },
  { label: '64 coul.', value: 64 },
];

export function ImageToPixelArtModal({
  open,
  activeCanvasWidth,
  activeCanvasHeight,
  onClose,
  onImportAsLayer,
  onImportAsNewAsset,
}: ImageToPixelArtModalProps) {
  const [sourceName, setSourceName] = useState<string>('import_sprite');
  const [sourceImage, setSourceImage] = useState<RawRgbaImage | null>(null);
  const [targetHeight, setTargetHeight] = useState<number>(48);
  const [keyColors, setKeyColors] = useState<ColorRGBA[]>([]);
  const [tolerance, setTolerance] = useState<number>(32);
  const [contiguousOnly, setContiguousOnly] = useState<boolean>(true);
  const [transparencyThreshold, setTransparencyThreshold] = useState<number>(50);
  const [paletteSize, setPaletteSize] = useState<number | null>(32);
  const [placement, setPlacement] = useState<'center' | 'top-left'>('center');
  const [error, setError] = useState<string | null>(null);

  const sourceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const resultCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const conversion = useMemo<ImageToPixelArtResult | null>(() => {
    if (!sourceImage) return null;
    return convertImageToPixelArt(sourceImage, {
      targetHeight,
      chromaKey: {
        colors: keyColors,
        tolerance,
        contiguousOnly,
      },
      transparencyThreshold: transparencyThreshold / 100,
      paletteSize,
    });
  }, [sourceImage, targetHeight, keyColors, tolerance, contiguousOnly, transparencyThreshold, paletteSize]);

  // Draw source image into interactive eyedropper canvas
  useEffect(() => {
    const canvas = sourceCanvasRef.current;
    if (!canvas || !sourceImage) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const imgData = ctx.createImageData(sourceImage.width, sourceImage.height);
    imgData.data.set(sourceImage.rgba);
    ctx.putImageData(imgData, 0, 0);
  }, [sourceImage]);

  // Draw live pixel-art conversion preview
  useEffect(() => {
    const canvas = resultCanvasRef.current;
    if (!canvas || !conversion) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const imgData = ctx.createImageData(conversion.width, conversion.height);
    imgData.data.set(conversion.rgba);
    ctx.putImageData(imgData, 0, 0);
  }, [conversion]);

  if (!open) return null;

  async function handleFile(file: File) {
    setError(null);
    try {
      const bitmap = await createImageBitmap(file);
      const offscreen = document.createElement('canvas');
      offscreen.width = bitmap.width;
      offscreen.height = bitmap.height;
      const ctx = offscreen.getContext('2d');
      if (!ctx) throw new Error('Contexte Canvas 2D indisponible.');
      ctx.drawImage(bitmap, 0, 0);
      const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
      bitmap.close();

      const baseName = file.name.replace(/\.[^.]+$/, '') || 'import_sprite';
      setSourceName(baseName);
      setSourceImage({
        width: data.width,
        height: data.height,
        rgba: new Uint8ClampedArray(data.data),
      });

      // Auto-pick top-left corner color if opaque as a helpful starting chroma key
      const a0 = data.data[3] ?? 0;
      if (a0 >= 128) {
        setKeyColors([
          {
            r: data.data[0] ?? 0,
            g: data.data[1] ?? 0,
            b: data.data[2] ?? 0,
            a: 255,
          },
        ]);
      } else {
        setKeyColors([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de lire cette image.');
    }
  }

  function handleEyedropperClick(event: React.MouseEvent<HTMLCanvasElement>) {
    if (!sourceImage) return;
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor(((event.clientX - rect.left) / rect.width) * sourceImage.width);
    const y = Math.floor(((event.clientY - rect.top) / rect.height) * sourceImage.height);
    if (x < 0 || y < 0 || x >= sourceImage.width || y >= sourceImage.height) return;

    const off = (y * sourceImage.width + x) * 4;
    if ((sourceImage.rgba[off + 3] ?? 0) < 128) return;

    const picked: ColorRGBA = {
      r: sourceImage.rgba[off]!,
      g: sourceImage.rgba[off + 1]!,
      b: sourceImage.rgba[off + 2]!,
      a: 255,
    };

    const hex = rgbaToHex(picked);
    setKeyColors((prev) => {
      if (prev.some((c) => rgbaToHex(c) === hex)) return prev;
      return [...prev, picked];
    });
  }

  function removeKeyColor(hexToRemove: HexColor) {
    setKeyColors((prev) => prev.filter((c) => rgbaToHex(c) !== hexToRemove));
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-slate-700 bg-surface-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
          <div>
            <h2 className="text-sm font-bold text-white">
              Convertisseur Image → Pixel Art (Couleur dominante &amp; Chroma Key)
            </h2>
            <p className="text-[11px] text-slate-400">
              Découpage strict sans flou bilinear · Pipette multi-couleurs · Flood-fill bords ·
              Quantification palette
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-surface-800 hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="grid flex-1 grid-cols-1 overflow-hidden lg:grid-cols-12">
          {/* Controls Sidebar */}
          <aside className="space-y-4 overflow-y-auto border-b border-slate-800 p-4 text-xs lg:col-span-4 lg:border-b-0 lg:border-r">
            {/* File picker */}
            <div>
              <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-indigo-500/50 bg-indigo-950/20 px-3 py-4 text-center transition hover:bg-indigo-950/40">
                <span className="font-semibold text-indigo-200">
                  {sourceImage ? `Source : ${sourceName}` : 'Choisir une image (PNG, JPG, WebP)'}
                </span>
                <span className="mt-1 text-[10px] text-slate-400">
                  {sourceImage
                    ? `${sourceImage.width}×${sourceImage.height}px — cliquer pour remplacer`
                    : 'Cliquez pour parcourir vos fichiers'}
                </span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleFile(f);
                  }}
                />
              </label>
              {error && (
                <p className="mt-2 rounded border border-rose-500/40 bg-rose-950/50 px-2 py-1 text-[11px] text-rose-200">
                  {error}
                </p>
              )}
            </div>

            {/* Target Height */}
            <div className="space-y-1.5 border-t border-slate-800 pt-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold uppercase tracking-wider text-[10px] text-slate-400">
                  Hauteur cible (ratio conservé)
                </span>
                <span className="font-mono text-[11px] text-indigo-300">
                  {conversion ? `${conversion.width}×${conversion.height}px` : `${targetHeight}px`}
                </span>
              </div>
              <div className="flex flex-wrap gap-1">
                {HEIGHT_PRESETS.map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => setTargetHeight(h)}
                    className={`rounded px-2 py-0.5 font-mono text-[10px] ${
                      targetHeight === h
                        ? 'bg-indigo-600 text-white'
                        : 'bg-surface-800 text-slate-300 hover:bg-surface-700'
                    }`}
                  >
                    {h}px
                  </button>
                ))}
              </div>
              <input
                type="number"
                min={4}
                max={256}
                value={targetHeight}
                onChange={(e) => setTargetHeight(Math.max(4, Math.min(256, Number(e.target.value) || 32)))}
                className="w-full rounded border border-slate-700 bg-surface-800 px-2 py-1 font-mono text-xs text-white"
              />
            </div>

            {/* Chroma Key */}
            <div className="space-y-2 border-t border-slate-800 pt-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold uppercase tracking-wider text-[10px] text-slate-400">
                  Suppression de fond (Chroma Key)
                </span>
                {keyColors.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setKeyColors([])}
                    className="text-[10px] text-rose-400 hover:underline"
                  >
                    Tout effacer
                  </button>
                )}
              </div>

              <p className="text-[10px] text-slate-400">
                Cliquez directement sur l’image source à droite (pipette) pour ajouter des couleurs à
                retirer.
              </p>

              <div className="flex flex-wrap gap-1.5">
                {keyColors.length === 0 ? (
                  <span className="italic text-[10px] text-slate-500">Aucune couleur retirée</span>
                ) : (
                  keyColors.map((col) => {
                    const hex = rgbaToHex(col);
                    return (
                      <button
                        key={hex}
                        type="button"
                        onClick={() => removeKeyColor(hex)}
                        title="Cliquer pour retirer ce filtre"
                        className="flex items-center gap-1.5 rounded border border-slate-700 bg-surface-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-200 hover:border-rose-400"
                      >
                        <span
                          className="h-3 w-3 rounded-sm ring-1 ring-white/30"
                          style={{ backgroundColor: hex }}
                        />
                        {hex} ×
                      </button>
                    );
                  })
                )}
              </div>

              <label className="block text-[11px] text-slate-400">
                Tolérance RGB : <strong className="font-mono text-white">{tolerance}</strong>
                <input
                  type="range"
                  min={0}
                  max={140}
                  value={tolerance}
                  onChange={(e) => setTolerance(Number(e.target.value))}
                  className="mt-1 w-full accent-indigo-500"
                />
              </label>

              <label className="flex cursor-pointer items-center gap-2 text-[11px] text-slate-200">
                <input
                  type="checkbox"
                  checked={contiguousOnly}
                  onChange={(e) => setContiguousOnly(e.target.checked)}
                  className="accent-indigo-500"
                />
                Contigu uniquement (flood-fill depuis les bords)
              </label>

              <label className="block text-[11px] text-slate-400">
                Seuil transparence cellule :{' '}
                <strong className="font-mono text-white">{transparencyThreshold}%</strong>
                <input
                  type="range"
                  min={10}
                  max={90}
                  value={transparencyThreshold}
                  onChange={(e) => setTransparencyThreshold(Number(e.target.value))}
                  className="mt-1 w-full accent-indigo-500"
                />
              </label>
            </div>

            {/* Palette Quantization */}
            <div className="space-y-1.5 border-t border-slate-800 pt-3">
              <span className="block font-semibold uppercase tracking-wider text-[10px] text-slate-400">
                Quantification de palette (image-q)
              </span>
              <div className="grid grid-cols-4 gap-1">
                {PALETTE_OPTIONS.map((opt) => (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => setPaletteSize(opt.value)}
                    className={`rounded py-1 text-[10px] font-medium ${
                      paletteSize === opt.value
                        ? 'bg-indigo-600 text-white'
                        : 'bg-surface-800 text-slate-300 hover:bg-surface-700'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Placement for layer injection */}
            <div className="space-y-1.5 border-t border-slate-800 pt-3">
              <span className="block font-semibold uppercase tracking-wider text-[10px] text-slate-400">
                Placement sur le canvas actif ({activeCanvasWidth}×{activeCanvasHeight})
              </span>
              <div className="grid grid-cols-2 gap-1">
                <button
                  type="button"
                  onClick={() => setPlacement('center')}
                  className={`rounded py-1 text-[11px] ${
                    placement === 'center'
                      ? 'bg-indigo-600/30 text-indigo-100 ring-1 ring-indigo-500/60'
                      : 'bg-surface-800 text-slate-400'
                  }`}
                >
                  Centrer / Recadrer
                </button>
                <button
                  type="button"
                  onClick={() => setPlacement('top-left')}
                  className={`rounded py-1 text-[11px] ${
                    placement === 'top-left'
                      ? 'bg-indigo-600/30 text-indigo-100 ring-1 ring-indigo-500/60'
                      : 'bg-surface-800 text-slate-400'
                  }`}
                >
                  Coin haut-gauche
                </button>
              </div>
            </div>
          </aside>

          {/* Side-by-side Live Previews */}
          <div className="flex flex-1 flex-col overflow-hidden bg-surface-950 p-4 lg:col-span-8">
            {!sourceImage || !conversion ? (
              <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-slate-800 text-center text-xs text-slate-500">
                Importez une image (PNG, JPG ou WebP) à gauche pour prévisualiser la conversion en
                temps réel.
              </div>
            ) : (
              <div className="grid flex-1 grid-cols-1 gap-4 overflow-hidden md:grid-cols-2">
                {/* Source image with Eyedropper */}
                <div className="flex flex-col overflow-hidden rounded-lg border border-slate-800 bg-surface-900">
                  <div className="flex items-center justify-between border-b border-slate-800 px-3 py-1.5 text-[11px]">
                    <span className="font-semibold text-slate-200">
                      Image source (Pipette : cliquez le fond)
                    </span>
                    <span className="font-mono text-slate-400">
                      {sourceImage.width}×{sourceImage.height}
                    </span>
                  </div>
                  <div className="pixel-checkerboard flex flex-1 items-center justify-center overflow-hidden p-3">
                    <canvas
                      ref={sourceCanvasRef}
                      width={sourceImage.width}
                      height={sourceImage.height}
                      onClick={handleEyedropperClick}
                      className="max-h-80 max-w-full cursor-crosshair object-contain shadow"
                    />
                  </div>
                </div>

                {/* Pixel Art Result */}
                <div className="flex flex-col overflow-hidden rounded-lg border border-indigo-500/40 bg-surface-900">
                  <div className="flex items-center justify-between border-b border-slate-800 px-3 py-1.5 text-[11px]">
                    <span className="font-semibold text-indigo-200">Résultat Pixel Art</span>
                    <span className="font-mono text-indigo-300">
                      {conversion.width}×{conversion.height} · {conversion.extractedPalette.length}{' '}
                      coul.
                    </span>
                  </div>
                  <div className="pixel-checkerboard flex flex-1 items-center justify-center overflow-hidden p-3">
                    <canvas
                      ref={resultCanvasRef}
                      width={conversion.width}
                      height={conversion.height}
                      style={{
                        width: Math.min(320, conversion.width * Math.max(2, Math.floor(260 / Math.max(conversion.width, conversion.height)))),
                        height: Math.min(320, conversion.height * Math.max(2, Math.floor(260 / Math.max(conversion.width, conversion.height)))),
                      }}
                      className="pixelated shadow-xl ring-1 ring-white/20"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Footer Actions */}
            <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-slate-800 pt-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md bg-surface-800 px-3.5 py-2 text-xs text-slate-300 hover:bg-surface-700"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={!conversion}
                onClick={() => {
                  if (!conversion) return;
                  onImportAsLayer(sourceName, conversion, placement);
                  onClose();
                }}
                className="rounded-md bg-indigo-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-40"
              >
                Importer dans le canvas (nouveau calque)
              </button>
              <button
                type="button"
                disabled={!conversion}
                onClick={() => {
                  if (!conversion) return;
                  onImportAsNewAsset(sourceName, conversion);
                  onClose();
                }}
                className="rounded-md bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-40"
              >
                Créer comme nouvel asset ({conversion ? `${conversion.width}×${conversion.height}` : '…'})
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
