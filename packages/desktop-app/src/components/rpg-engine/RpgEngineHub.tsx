import { useEffect, useState } from 'react';
import type {
  NarrativeGraph,
  ProjectManifest,
  ProjectStorageAdapter,
  RpgDatabase,
} from '@rpg-player/core-types';
import {
  createDefaultRpgDatabase,
  createSampleNarrativeGraph,
} from '@rpg-player/rpg-engine';
import { loadNarrative, loadRpgDatabase } from '../../storage/project-service';
import { DatabaseWorkspace } from './DatabaseWorkspace';
import { MapEditorWorkspace } from './MapEditorWorkspace';
import { NarrativeWorkspace } from './NarrativeWorkspace';

interface RpgEngineHubProps {
  storage: ProjectStorageAdapter;
  project: ProjectManifest | null;
  onProjectUpdated: (manifest: ProjectManifest) => void;
  onGoToPixelStudio: () => void;
}

type RpgSubTab = 'map' | 'narrative' | 'database';

export function RpgEngineHub({
  storage,
  project,
  onProjectUpdated,
  onGoToPixelStudio,
}: RpgEngineHubProps) {
  const [subTab, setSubTab] = useState<RpgSubTab>('map');
  const [database, setDatabase] = useState<RpgDatabase>(() => createDefaultRpgDatabase());
  const [narratives, setNarratives] = useState<Record<string, NarrativeGraph>>(() => {
    const sample = createSampleNarrativeGraph();
    return { [sample.id]: sample };
  });
  const [activeNarrativeId, setActiveNarrativeId] = useState<string>('garde_village');

  // Auto-load saved database & narratives when a project folder is opened
  useEffect(() => {
    if (!project) return;
    let cancelled = false;

    async function hydrateProjectRpgData() {
      try {
        const loadedDb = await loadRpgDatabase(storage, project!);
        if (!cancelled && loadedDb) {
          setDatabase(loadedDb);
        }
      } catch {
        // Keep current database if none saved yet
      }

      const metaList = Object.values(project!.narratives ?? {});
      if (metaList.length > 0) {
        const loadedMap: Record<string, NarrativeGraph> = {};
        for (const meta of metaList) {
          try {
            loadedMap[meta.id] = await loadNarrative(storage, meta);
          } catch {
            // Skip unreadable narrative files
          }
        }
        if (!cancelled && Object.keys(loadedMap).length > 0) {
          setNarratives((prev) => ({ ...prev, ...loadedMap }));
        }
      }
    }

    void hydrateProjectRpgData();
    return () => {
      cancelled = true;
    };
  }, [storage, project?.id]);

  function handleChangeNarrative(nextGraph: NarrativeGraph) {
    setNarratives((prev) => ({ ...prev, [nextGraph.id]: nextGraph }));
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Sub-navigation bar for Module 2 */}
      <div className="flex items-center justify-between border-b border-slate-800 bg-surface-900/70 px-4 py-1.5">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setSubTab('map')}
            className={`rounded px-3 py-1 text-xs font-medium transition ${
              subTab === 'map'
                ? 'bg-indigo-600/30 text-indigo-100 ring-1 ring-indigo-500/60'
                : 'text-slate-400 hover:bg-surface-800 hover:text-slate-200'
            }`}
          >
            Carte, PNJ &amp; Play Preview
          </button>
          <button
            type="button"
            onClick={() => setSubTab('narrative')}
            className={`rounded px-3 py-1 text-xs font-medium transition ${
              subTab === 'narrative'
                ? 'bg-indigo-600/30 text-indigo-100 ring-1 ring-indigo-500/60'
                : 'text-slate-400 hover:bg-surface-800 hover:text-slate-200'
            }`}
          >
            Narration Nodale (Twine)
          </button>
          <button
            type="button"
            onClick={() => setSubTab('database')}
            className={`rounded px-3 py-1 text-xs font-medium transition ${
              subTab === 'database'
                ? 'bg-indigo-600/30 text-indigo-100 ring-1 ring-indigo-500/60'
                : 'text-slate-400 hover:bg-surface-800 hover:text-slate-200'
            }`}
          >
            Base de Données, Fiches &amp; Combat
          </button>
        </div>

        <span className="text-[11px] text-slate-500">
          Cinématiques, Fiches Personnages &amp; Combat 3 Modes (Simple · Animé · Dynamique IA)
        </span>
      </div>

      {subTab === 'map' && (
        <MapEditorWorkspace
          storage={storage}
          project={project}
          database={database}
          narratives={narratives}
          onProjectUpdated={onProjectUpdated}
          onGoToPixelStudio={onGoToPixelStudio}
        />
      )}

      {subTab === 'narrative' && (
        <NarrativeWorkspace
          storage={storage}
          project={project}
          database={database}
          narratives={narratives}
          activeNarrativeId={activeNarrativeId}
          onSelectNarrative={setActiveNarrativeId}
          onChangeNarrative={handleChangeNarrative}
          onProjectUpdated={onProjectUpdated}
        />
      )}

      {subTab === 'database' && (
        <DatabaseWorkspace
          storage={storage}
          project={project}
          database={database}
          onChangeDatabase={setDatabase}
          onProjectUpdated={onProjectUpdated}
        />
      )}
    </div>
  );
}
