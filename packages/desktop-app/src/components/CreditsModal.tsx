import { PixelCrownIcon } from './ui/PixelIcons';

interface CreditsModalProps {
  open: boolean;
  onClose: () => void;
}

export function CreditsModal({ open, onClose }: CreditsModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <div
        className="pixel-panel w-full max-w-md border-dnd-gold p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b-2 border-dnd-border pb-3">
          <div className="flex items-center gap-2.5">
            <PixelCrownIcon size={22} />
            <div>
              <h2 className="font-pixel text-sm font-bold text-dnd-gold">
                Crédits — RPG Player Studio
              </h2>
              <p className="mt-0.5 text-[11px] text-dnd-muted">
                Atelier Dark Fantasy 16-bit · Pixel · RPG · VTT
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="pixel-btn px-2 py-0.5 text-xs text-dnd-parchment"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 border-2 border-dnd-gold bg-dnd-surface p-4 text-center shadow-pixel-sm">
          <p className="font-pixel text-[10px] uppercase tracking-widest text-dnd-muted">
            Architecture &amp; Développement
          </p>
          <p className="mt-2 font-pixel text-lg font-bold tracking-tight text-dnd-gold">
            Made by Gemini Neon
          </p>
        </div>

        <dl className="mt-4 space-y-2 border-2 border-dnd-border bg-dnd-obsidian p-3.5 text-xs">
          <div className="flex justify-between gap-2">
            <dt className="font-pixel text-[10px] text-dnd-gold">Module 1</dt>
            <dd className="text-right text-dnd-parchment">Pixel Studio &amp; Image → Pixel Art</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="font-pixel text-[10px] text-dnd-gold">Module 2</dt>
            <dd className="text-right text-dnd-parchment">
              Animation Studio (Onion Skin · Markers · GIF)
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="font-pixel text-[10px] text-dnd-gold">Module 3</dt>
            <dd className="text-right text-dnd-parchment">
              RPG Engine (PixiJS · Twine · Fiches · Combat)
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="font-pixel text-[10px] text-dnd-gold">Module 4</dt>
            <dd className="text-right text-dnd-parchment">
              VTT / Mode JDR (WebSocket · MJ · Fog)
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="font-pixel text-[10px] text-dnd-muted">Polices</dt>
            <dd className="text-right text-dnd-muted">Silkscreen · JetBrains Mono (Local OFL)</dd>
          </div>
        </dl>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="pixel-btn pixel-btn-dragon px-4 py-1.5 text-xs font-bold"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
