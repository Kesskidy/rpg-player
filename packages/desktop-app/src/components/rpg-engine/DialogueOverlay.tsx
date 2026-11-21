import type { ProjectManifest, ProjectStorageAdapter } from '@rpg-player/core-types';
import type { NarrativeStepState } from '@rpg-player/rpg-engine';
import { CinematicPlayerOverlay } from './CinematicPlayerOverlay';

interface DialogueOverlayProps {
  step: NarrativeStepState;
  storage?: ProjectStorageAdapter;
  project?: ProjectManifest | null;
  onSelectChoice: (choiceId: string) => void;
  onAdvance: () => void;
  onClose: () => void;
}

export function DialogueOverlay({
  step,
  storage,
  project,
  onSelectChoice,
  onAdvance,
  onClose,
}: DialogueOverlayProps) {
  if (step.status === 'ended') {
    return null;
  }

  // Blocking CinematicNode playback (`waitForCompletion: true`)
  if (step.status === 'cinematic' && step.activeCinematic) {
    return (
      <CinematicPlayerOverlay
        config={step.activeCinematic}
        storage={storage}
        project={project}
        onComplete={onAdvance}
      />
    );
  }

  return (
    <>
      {step.backgroundCinematic && (
        <CinematicPlayerOverlay
          config={step.backgroundCinematic}
          storage={storage}
          project={project}
          isBackground
        />
      )}

      <div className="absolute inset-x-0 bottom-4 z-30 flex justify-center px-4">
        <div className="w-full max-w-2xl rounded-xl border-2 border-indigo-400/70 bg-surface-900/95 p-4 shadow-2xl backdrop-blur">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="rounded bg-indigo-600/30 px-2.5 py-0.5 text-xs font-bold text-indigo-200 ring-1 ring-indigo-500/50">
              {step.speaker || 'Narration'}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="rounded px-2 py-0.5 text-[11px] text-slate-400 hover:bg-surface-800 hover:text-white"
            >
              Fermer (Échap)
            </button>
          </div>

          {step.actionLogs.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {step.actionLogs.map((log, i) => (
                <span
                  key={i}
                  className="rounded bg-amber-500/20 px-2 py-0.5 text-[11px] font-medium text-amber-200 ring-1 ring-amber-500/40"
                >
                  ✦ {log}
                </span>
              ))}
            </div>
          )}

          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-100">
            {step.text}
          </p>

          <div className="mt-4 space-y-1.5">
            {step.choices.length > 0 ? (
              step.choices.map(({ choice, enabled }) => (
                <button
                  key={choice.id}
                  type="button"
                  disabled={!enabled}
                  onClick={() => onSelectChoice(choice.id)}
                  className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-xs font-medium transition ${
                    enabled
                      ? 'border-slate-700 bg-surface-800 text-white hover:border-indigo-400 hover:bg-indigo-600/30'
                      : 'cursor-not-allowed border-slate-800 bg-surface-950/60 text-slate-500'
                  }`}
                >
                  <span>▸ {choice.label}</span>
                  {!enabled && choice.condition && (
                    <span className="font-mono text-[10px] text-rose-400/80">
                      Requis : {choice.condition}
                    </span>
                  )}
                </button>
              ))
            ) : (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={onAdvance}
                  className="rounded-md bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-500"
                >
                  Continuer ▸
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
