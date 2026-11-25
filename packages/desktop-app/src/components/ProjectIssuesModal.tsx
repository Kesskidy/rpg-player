import { useEffect, useState } from 'react';
import type {
  NarrativeGraph,
  ProjectManifest,
  ProjectStorageAdapter,
  TileMapData,
} from '@rpg-player/core-types';
import { validateProjectConsistency, type ProjectIssue } from '@rpg-player/rpg-engine';
import { loadMap, loadNarrative, loadRpgDatabase } from '../storage/project-service';

interface ProjectIssuesModalProps {
  open: boolean;
  storage: ProjectStorageAdapter;
  project: ProjectManifest | null;
  onNavigateTab: (tab: 'pixel-studio' | 'animation-studio' | 'rpg-engine') => void;
  onClose: () => void;
}

export function ProjectIssuesModal({
  open,
  storage,
  project,
  onNavigateTab,
  onClose,
}: ProjectIssuesModalProps) {
  const [loading, setLoading] = useState(false);
  const [issues, setIssues] = useState<ProjectIssue[]>([]);
  const [scanError, setScanError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !project) return;
    let cancelled = false;
    setLoading(true);
    setScanError(null);

    async function runCheck() {
      try {
        const maps: Record<string, TileMapData> = {};
        for (const meta of Object.values(project!.maps ?? {})) {
          try {
            maps[meta.id] = await loadMap(storage, meta);
          } catch (err) {
            if (!cancelled) {
              setScanError(
                err instanceof Error ? err.message : `Map "${meta.filePath}" illisible.`,
              );
            }
          }
        }

        const narratives: Record<string, NarrativeGraph> = {};
        for (const meta of Object.values(project!.narratives ?? {})) {
          try {
            narratives[meta.id] = await loadNarrative(storage, meta);
          } catch (err) {
            if (!cancelled) {
              setScanError(
                err instanceof Error ? err.message : `Dialogue "${meta.filePath}" illisible.`,
              );
            }
          }
        }

        const database = await loadRpgDatabase(storage, project!).catch(() => null);
        const found = validateProjectConsistency({
          manifest: project!,
          maps,
          narratives,
          database,
        });
        if (!cancelled) {
          setIssues(found);
        }
      } catch (err) {
        if (!cancelled) {
          setScanError(err instanceof Error ? err.message : 'Échec de la vérification du projet.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void runCheck();
    return () => {
      cancelled = true;
    };
  }, [open, project, storage]);

  if (!open || !project) return null;

  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
      <div className="pixel-panel flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden border-dnd-gold">
        <div className="flex items-center justify-between border-b-2 border-dnd-border bg-dnd-stone px-4 py-2.5">
          <div>
            <h2 className="font-pixel text-xs font-bold text-dnd-gold">
              Vérificateur de projet — {project.name}
            </h2>
            <p className="mt-0.5 text-[11px] text-dnd-muted">
              {loading
                ? 'Analyse des maps, dialogues, assets et base RPG…'
                : `${errorCount} erreur(s) · ${warningCount} avertissement(s)`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="pixel-btn px-2.5 py-1 text-[11px]"
          >
            Fermer
          </button>
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto p-4 text-xs">
          {scanError && (
            <div className="rounded border border-rose-500/40 bg-rose-950/50 px-3 py-2 text-rose-200">
              {scanError}
            </div>
          )}

          {!loading && issues.length === 0 && !scanError && (
            <div className="rounded border border-emerald-500/40 bg-emerald-950/40 px-4 py-6 text-center text-emerald-200">
              ✓ Aucune incohérence détectée dans ce projet !
            </div>
          )}

          {issues.map((issue) => (
            <div
              key={issue.id}
              className={`flex items-start justify-between gap-3 rounded border px-3 py-2 ${
                issue.severity === 'error'
                  ? 'border-rose-500/40 bg-rose-950/35 text-rose-100'
                  : 'border-amber-500/40 bg-amber-950/30 text-amber-100'
              }`}
            >
              <div>
                <div className="flex items-center gap-2 font-mono text-[10px] uppercase">
                  <span
                    className={`rounded px-1.5 py-0.5 font-bold ${
                      issue.severity === 'error'
                        ? 'bg-rose-600 text-white'
                        : 'bg-amber-600 text-black'
                    }`}
                  >
                    {issue.severity === 'error' ? 'Erreur' : 'Alerte'}
                  </span>
                  <span className="text-slate-300">
                    [{issue.category}] {issue.targetName}
                  </span>
                </div>
                <p className="mt-1 text-xs">{issue.message}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  onNavigateTab(
                    issue.category === 'asset' ? 'animation-studio' : 'rpg-engine',
                  );
                  onClose();
                }}
                className="pixel-btn shrink-0 px-2.5 py-1 text-[10px]"
              >
                Ouvrir →
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
