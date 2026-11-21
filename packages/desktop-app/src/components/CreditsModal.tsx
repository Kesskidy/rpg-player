interface CreditsModalProps {
  open: boolean;
  onClose: () => void;
}

export function CreditsModal({ open, onClose }: CreditsModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-slate-700 bg-surface-900 p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-base font-bold text-white">Crédits — RPG Player Studio</h2>
            <p className="mt-0.5 text-xs text-slate-400">
              Suite créative tout-en-un · Pixel Studio · RPG Engine · VTT
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

        <div className="mt-5 rounded-lg border border-indigo-500/40 bg-indigo-950/40 p-4 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-indigo-300">
            Architecture &amp; Développement
          </p>
          <p className="mt-1.5 bg-gradient-to-r from-indigo-300 via-cyan-200 to-emerald-300 bg-clip-text text-xl font-extrabold tracking-tight text-transparent">
            Made by Gemini Neon
          </p>
        </div>

        <dl className="mt-4 space-y-2 rounded-lg border border-slate-800 bg-surface-950/60 p-3.5 text-xs">
          <div className="flex justify-between">
            <dt className="text-slate-400">Module 1</dt>
            <dd className="text-slate-200">Pixel Studio (Canvas 2D + PNG Headless)</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-400">Module 2</dt>
            <dd className="text-slate-200">RPG Engine (PixiJS v8 · Twine · Combat)</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-400">Module 3</dt>
            <dd className="text-slate-200">VTT / Mode JDR (WebSocket · MJ Admin · Fog)</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-400">Shell</dt>
            <dd className="text-slate-200">Electron · React · TypeScript · Tailwind CSS</dd>
          </div>
        </dl>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-indigo-600 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-500"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
