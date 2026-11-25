import { useState } from 'react';
import type {
  NarrativeGraph,
  NarrativeVariableValue,
  ProjectManifest,
  ProjectStorageAdapter,
  RpgDatabase,
} from '@rpg-player/core-types';
import { NarrativeGraphEditor } from '@rpg-player/narrative-editor';
import {
  createSampleNarrativeGraph,
  InventorySystem,
  NarrativeRunner,
  type NarrativeStepState,
} from '@rpg-player/rpg-engine';
import { formatSaveFeedback, saveNarrative } from '../../storage/project-service';
import { DialogueOverlay } from './DialogueOverlay';

interface NarrativeWorkspaceProps {
  storage: ProjectStorageAdapter;
  project: ProjectManifest | null;
  database: RpgDatabase;
  narratives: Record<string, NarrativeGraph>;
  activeNarrativeId: string;
  onSelectNarrative: (id: string) => void;
  onChangeNarrative: (graph: NarrativeGraph) => void;
  onProjectUpdated: (manifest: ProjectManifest) => void;
}

function slugifyId(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '') || `dialogue_${Date.now().toString(36)}`
  );
}

export function NarrativeWorkspace({
  storage,
  project,
  database,
  narratives,
  activeNarrativeId,
  onSelectNarrative,
  onChangeNarrative,
  onProjectUpdated,
}: NarrativeWorkspaceProps) {
  const [newName, setNewName] = useState('Marchand du Port');
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  // Built-in interactive tester state
  const [testRunner, setTestRunner] = useState<NarrativeRunner | null>(null);
  const [testStep, setTestStep] = useState<NarrativeStepState | null>(null);
  const [testHasKey, setTestHasKey] = useState(false);

  const list = Object.values(narratives);
  const activeGraph = narratives[activeNarrativeId] ?? list[0]!;

  function handleCreateGraph(event: React.FormEvent) {
    event.preventDefault();
    const id = slugifyId(newName);
    const created = createSampleNarrativeGraph(id, newName.trim() || 'Nouveau dialogue');
    onChangeNarrative(created);
    onSelectNarrative(created.id);
    setFeedback({ kind: 'ok', text: `Graphe narratif « ${created.name} » créé.` });
  }

  async function handleSaveGraph() {
    if (!project) {
      setFeedback({
        kind: 'error',
        text: 'Ouvrez ou créez un dossier projet en haut à droite pour sauvegarder.',
      });
      return;
    }
    setIsSaving(true);
    setFeedback(null);
    try {
      const saved = await saveNarrative(storage, project, activeGraph);
      onProjectUpdated(saved.manifest);
      setFeedback({
        kind: 'ok',
        text: formatSaveFeedback(storage, `Sauvegardé : ${saved.meta.filePath}`),
      });
    } catch (error) {
      setFeedback({
        kind: 'error',
        text: error instanceof Error ? error.message : 'Échec de sauvegarde.',
      });
    } finally {
      setIsSaving(false);
    }
  }

  function handleStartTest() {
    const inv = new InventorySystem(database);
    if (testHasKey) {
      inv.addItem('cle_fer', 1);
    }
    const vars: Record<string, NarrativeVariableValue> = {};
    const runner = new NarrativeRunner(activeGraph, {
      inventory: inv,
      variables: vars,
    });
    const first = runner.start();
    setTestRunner(runner);
    setTestStep(first);
  }

  return (
    <div className="relative flex flex-1 overflow-hidden">
      {/* Left sidebar: list of narratives + save + quick test */}
      <aside className="flex w-64 flex-col border-r border-slate-800 bg-surface-900">
        <div className="space-y-2.5 border-b border-slate-800 p-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Graphe actif
          </h3>
          <input
            type="text"
            value={activeGraph.name}
            onChange={(e) => onChangeNarrative({ ...activeGraph, name: e.target.value })}
            className="w-full rounded border border-slate-700 bg-surface-800 px-2 py-1 text-xs text-white outline-none focus:border-indigo-500"
          />
          <button
            type="button"
            disabled={isSaving}
            onClick={() => void handleSaveGraph()}
            className="w-full rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {isSaving ? 'Sauvegarde...' : 'Sauvegarder (.narrative.json)'}
          </button>

          <div className="space-y-1.5 rounded-md border border-slate-800 bg-surface-950/60 p-2">
            <label className="flex cursor-pointer items-center gap-2 text-[11px] text-slate-300">
              <input
                type="checkbox"
                checked={testHasKey}
                onChange={(e) => setTestHasKey(e.target.checked)}
                className="accent-indigo-500"
              />
              Simuler avec « Clé en fer »
            </label>
            <button
              type="button"
              onClick={handleStartTest}
              className="w-full rounded bg-emerald-600 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
            >
              ▶ Tester le dialogue
            </button>
          </div>

          {feedback && (
            <p
              className={`rounded border px-2 py-1 text-[11px] ${feedback.kind === 'ok'
                ? 'border-emerald-500/40 bg-emerald-950/50 text-emerald-200'
                : 'border-rose-500/40 bg-rose-950/50 text-rose-200'
                }`}
            >
              {feedback.text}
            </p>
          )}
        </div>

        <form onSubmit={handleCreateGraph} className="space-y-2 border-b border-slate-800 p-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Nouveau Dialogue
          </h3>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nom du dialogue"
            className="w-full rounded border border-slate-700 bg-surface-800 px-2 py-1 text-xs text-white"
          />
          <button
            type="submit"
            className="w-full rounded bg-surface-700 py-1.5 text-xs font-medium text-white hover:bg-indigo-600"
          >
            + Créer graphe
          </button>
        </form>

        <div className="flex flex-1 flex-col overflow-hidden p-3">
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Dialogues ({list.length})
          </h3>
          <div className="flex-1 space-y-1 overflow-y-auto">
            {list.map((graph) => (
              <button
                key={graph.id}
                type="button"
                onClick={() => onSelectNarrative(graph.id)}
                className={`flex w-full items-center justify-between rounded border px-2.5 py-1.5 text-left text-xs transition ${graph.id === activeGraph.id
                  ? 'border-indigo-500/80 bg-indigo-600/20 text-white'
                  : 'border-slate-800 bg-surface-800/50 text-slate-300 hover:bg-surface-800'
                  }`}
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{graph.name}</div>
                  <div className="font-mono text-[10px] text-slate-400">
                    {graph.nodes.length} nœuds
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </aside>

      {/* Main visual Twine-like node editor */}
      <NarrativeGraphEditor
        graph={activeGraph}
        database={database}
        availableAssets={project?.assets}
        onChange={onChangeNarrative}
      />

      {/* Built-in dialogue tester overlay */}
      {testRunner && testStep && (
        <DialogueOverlay
          step={testStep}
          storage={storage}
          project={project}
          onSelectChoice={(choiceId) => {
            const next = testRunner.selectChoice(choiceId);
            if (next.status === 'ended') {
              setTestRunner(null);
              setTestStep(null);
              if (next.triggeredBattleEnemyId) {
                setFeedback({
                  kind: 'ok',
                  text: `Fin du test : combat déclenché contre « ${next.triggeredBattleEnemyId} ».`,
                });
              }
            } else {
              setTestStep(next);
            }
          }}
          onAdvance={() => {
            const next = testRunner.advance();
            if (next.status === 'ended') {
              setTestRunner(null);
              setTestStep(null);
            } else {
              setTestStep(next);
            }
          }}
          onClose={() => {
            setTestRunner(null);
            setTestStep(null);
          }}
        />
      )}
    </div>
  );
}
