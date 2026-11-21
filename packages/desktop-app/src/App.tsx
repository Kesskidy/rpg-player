import { useState } from 'react';
import type { ProjectManifest, ProjectStorageAdapter } from '@rpg-player/core-types';
import { PIXEL_STUDIO_VERSION } from '@rpg-player/pixel-studio';
import { RPG_ENGINE_VERSION } from '@rpg-player/rpg-engine';
import { VTT_NETWORK_VERSION } from '@rpg-player/vtt-network';
import { CreditsModal } from './components/CreditsModal';
import { PixelStudioWorkspace } from './components/pixel-studio/PixelStudioWorkspace';
import { RpgEngineHub } from './components/rpg-engine/RpgEngineHub';
import { VttWorkspace } from './components/vtt/VttWorkspace';
import { createStorageAdapter } from './storage/adapter';
import { loadDemoPackProject } from './storage/demo-loader';
import { createProject, openProject } from './storage/project-service';

type ModuleTab = 'pixel-studio' | 'rpg-engine' | 'vtt';

export function App() {
  const [storage, setStorage] = useState<ProjectStorageAdapter>(() => createStorageAdapter());
  const [activeTab, setActiveTab] = useState<ModuleTab>('pixel-studio');
  const [project, setProject] = useState<ProjectManifest | null>(null);
  const [projectPath, setProjectPath] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loadingDemo, setLoadingDemo] = useState(false);
  const [creditsOpen, setCreditsOpen] = useState(false);

  async function handleSelectProjectDirectory() {
    setErrorMessage(null);
    try {
      const nativeAdapter = createStorageAdapter();
      const picked = await nativeAdapter.pickProjectDirectory();
      if (!picked) {
        return;
      }
      setStorage(nativeAdapter);
      setProjectPath(picked.path);
      const existing = await openProject(nativeAdapter);
      if (existing) {
        setProject(existing);
      } else {
        const created = await createProject(nativeAdapter, picked.name || 'Mon Projet RPG');
        setProject(created);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Erreur lors de l’accès au projet.');
    }
  }

  async function handleLoadDemoPack() {
    setErrorMessage(null);
    setLoadingDemo(true);
    try {
      const { adapter, manifest } = await loadDemoPackProject();
      setStorage(adapter);
      setProject(manifest);
      setProjectPath('demo-pack (Starter Pack intégré)');
      setActiveTab('rpg-engine');
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Impossible de charger demo-pack/. Exécutez npm.cmd run demo:generate.',
      );
    } finally {
      setLoadingDemo(false);
    }
  }

  return (
    <div className="flex h-screen flex-col bg-surface-950 text-slate-100">
      <header className="flex items-center justify-between border-b border-slate-800 bg-surface-900 px-4 py-2">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded bg-indigo-600 text-xs font-bold tracking-tight">
              RP
            </span>
            <div>
              <h1 className="text-sm font-semibold leading-none">RPG Player Studio</h1>
              <p className="mt-0.5 text-[11px] text-slate-400">
                Studio v{PIXEL_STUDIO_VERSION} · Engine v{RPG_ENGINE_VERSION} · VTT v
                {VTT_NETWORK_VERSION}
              </p>
            </div>
          </div>

          <nav className="flex items-center gap-1" aria-label="Modules">
            <button
              type="button"
              onClick={() => setActiveTab('pixel-studio')}
              className={`rounded px-3 py-1.5 text-xs font-medium transition ${
                activeTab === 'pixel-studio'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-300 hover:bg-surface-800'
              }`}
            >
              1. Pixel Studio
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('rpg-engine')}
              className={`rounded px-3 py-1.5 text-xs font-medium transition ${
                activeTab === 'rpg-engine'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-300 hover:bg-surface-800'
              }`}
            >
              2. RPG Engine
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('vtt')}
              className={`rounded px-3 py-1.5 text-xs font-medium transition ${
                activeTab === 'vtt'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-300 hover:bg-surface-800'
              }`}
            >
              3. VTT / Mode JDR
            </button>
          </nav>
        </div>

        <div className="flex items-center gap-2">
          {project ? (
            <div
              className="flex items-center gap-2 rounded border border-emerald-500/30 bg-emerald-950/30 px-2.5 py-1 text-[11px] text-emerald-200"
              title={projectPath ?? ''}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span className="max-w-44 truncate font-medium">{project.name}</span>
              <span className="text-emerald-400/70">
                ({Object.keys(project.assets).length} assets ·{' '}
                {Object.keys(project.maps ?? {}).length} maps)
              </span>
            </div>
          ) : (
            <span className="rounded border border-slate-700 bg-surface-800 px-2 py-1 text-[11px] text-slate-400">
              Aucun projet · <strong className="text-indigo-300">{storage.mode}</strong>
            </span>
          )}

          <button
            type="button"
            disabled={loadingDemo}
            onClick={() => void handleLoadDemoPack()}
            className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
          >
            {loadingDemo ? 'Chargement...' : 'Charger le projet de démo'}
          </button>

          <button
            type="button"
            onClick={() => void handleSelectProjectDirectory()}
            className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-500"
          >
            {project ? 'Ouvrir local' : 'Ouvrir / Créer'}
          </button>

          <button
            type="button"
            onClick={() => setCreditsOpen(true)}
            className="rounded border border-slate-700 bg-surface-800 px-2.5 py-1.5 text-xs text-slate-300 transition hover:bg-surface-700 hover:text-white"
          >
            Crédits
          </button>
        </div>
      </header>

      {errorMessage && (
        <div className="flex items-center justify-between border-b border-rose-500/40 bg-rose-950/60 px-4 py-1.5 text-xs text-rose-200">
          <span>{errorMessage}</span>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="rounded px-1.5 py-0.5 hover:bg-rose-900/60"
          >
            Fermer
          </button>
        </div>
      )}

      <main className="flex flex-1 overflow-hidden">
        {activeTab === 'pixel-studio' && (
          <PixelStudioWorkspace
            storage={storage}
            project={project}
            onProjectUpdated={setProject}
          />
        )}
        {activeTab === 'rpg-engine' && (
          <RpgEngineHub
            storage={storage}
            project={project}
            onProjectUpdated={setProject}
            onGoToPixelStudio={() => setActiveTab('pixel-studio')}
          />
        )}
        {activeTab === 'vtt' && <VttWorkspace storage={storage} project={project} />}
      </main>

      <footer className="flex items-center justify-between border-t border-slate-800 bg-surface-900 px-4 py-1 text-[11px] text-slate-500">
        <span>RPG Player Studio — Suite Complète (Pixel Studio · RPG Engine · VTT Multijoueur)</span>
        <button
          type="button"
          onClick={() => setCreditsOpen(true)}
          className="text-indigo-300/80 transition hover:text-indigo-200"
        >
          Made by Gemini Neon
        </button>
      </footer>

      <CreditsModal open={creditsOpen} onClose={() => setCreditsOpen(false)} />
    </div>
  );
}
