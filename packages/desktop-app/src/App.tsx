import { useState } from 'react';
import type { ProjectManifest, ProjectStorageAdapter } from '@rpg-player/core-types';
import { PIXEL_STUDIO_VERSION } from '@rpg-player/pixel-studio';
import { RPG_ENGINE_VERSION } from '@rpg-player/rpg-engine';
import { VTT_NETWORK_VERSION } from '@rpg-player/vtt-network';
import { AnimationStudioWorkspace } from './components/animation-studio/AnimationStudioWorkspace';
import { CreditsModal } from './components/CreditsModal';
import { PixelStudioWorkspace } from './components/pixel-studio/PixelStudioWorkspace';
import { RpgEngineHub } from './components/rpg-engine/RpgEngineHub';
import {
  PixelBrushIcon,
  PixelDiceIcon,
  PixelFilmIcon,
  PixelFolderIcon,
  PixelSparkIcon,
  PixelSwordIcon,
} from './components/ui/PixelIcons';
import { VttWorkspace } from './components/vtt/VttWorkspace';
import { createStorageAdapter } from './storage/adapter';
import { loadDemoPackProject } from './storage/demo-loader';
import { createProject, openProject } from './storage/project-service';

type ModuleTab = 'pixel-studio' | 'animation-studio' | 'rpg-engine' | 'vtt';

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
    const previousElectronPath =
      typeof window !== 'undefined' && window.rpgPlayerFs
        ? await window.rpgPlayerFs.getCurrentProjectPath()
        : null;
    try {
      const nativeAdapter = createStorageAdapter();
      const picked = await nativeAdapter.pickProjectDirectory();
      if (!picked) {
        return;
      }
      // Validate/open or initialize project BEFORE switching active storage & projectPath
      const existing = await openProject(nativeAdapter);
      const nextManifest = existing
        ? existing
        : await createProject(nativeAdapter, picked.name || 'Mon Projet RPG');

      setStorage(nativeAdapter);
      setProjectPath(picked.path);
      setProject(nextManifest);
    } catch (error) {
      // Roll back Electron currentProjectRoot so a failed open can never overwrite another folder
      if (typeof window !== 'undefined' && window.rpgPlayerFs?.setCurrentProjectPath) {
        await window.rpgPlayerFs.setCurrentProjectPath(previousElectronPath);
      }
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
    <div className="flex h-screen flex-col bg-dnd-obsidian text-dnd-parchment">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-dnd-border bg-dnd-stone px-4 py-2 shadow-pixel-sm">
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-8 w-8 items-center justify-center border-2 border-dnd-gold bg-dnd-dragon shadow-pixel-sm">
              <PixelSwordIcon size={18} />
            </span>
            <div>
              <h1 className="font-pixel text-sm font-bold leading-none text-dnd-gold">
                RPG Player Studio
              </h1>
              <p className="mt-1 text-[10px] text-dnd-muted">
                Studio v{PIXEL_STUDIO_VERSION} · Engine v{RPG_ENGINE_VERSION} · VTT v
                {VTT_NETWORK_VERSION}
              </p>
            </div>
          </div>

          <nav className="flex items-center gap-1.5" aria-label="Modules">
            <button
              type="button"
              onClick={() => setActiveTab('pixel-studio')}
              className={`pixel-tab flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold ${
                activeTab === 'pixel-studio' ? 'pixel-tab-active' : ''
              }`}
            >
              <PixelBrushIcon size={14} />
              <span>1. Pixel Studio</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('animation-studio')}
              className={`pixel-tab flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold ${
                activeTab === 'animation-studio' ? 'pixel-tab-active' : ''
              }`}
            >
              <PixelFilmIcon size={14} />
              <span>2. Animation</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('rpg-engine')}
              className={`pixel-tab flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold ${
                activeTab === 'rpg-engine' ? 'pixel-tab-active' : ''
              }`}
            >
              <PixelSwordIcon size={14} />
              <span>3. RPG Engine</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('vtt')}
              className={`pixel-tab flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold ${
                activeTab === 'vtt' ? 'pixel-tab-active' : ''
              }`}
            >
              <PixelDiceIcon size={14} />
              <span>4. VTT / JDR</span>
            </button>
          </nav>
        </div>

        <div className="flex items-center gap-2">
          {project ? (
            <div
              className="flex items-center gap-2 border-2 border-dnd-emerald bg-emerald-950/60 px-2.5 py-1 text-[11px] text-dnd-parchment shadow-pixel-sm"
              title={projectPath ?? ''}
            >
              <span className="h-2 w-2 bg-dnd-emerald" />
              <span className="max-w-44 truncate font-bold text-dnd-gold">{project.name}</span>
              <span className="text-dnd-muted">
                ({Object.keys(project.assets).length} assets ·{' '}
                {Object.keys(project.maps ?? {}).length} maps)
              </span>
            </div>
          ) : (
            <span className="border-2 border-dnd-border bg-dnd-surface px-2 py-1 text-[11px] text-dnd-muted">
              Aucun projet · <strong className="text-dnd-gold">{storage.mode}</strong>
            </span>
          )}

          <button
            type="button"
            disabled={loadingDemo}
            onClick={() => void handleLoadDemoPack()}
            className="pixel-btn pixel-btn-dragon flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold disabled:opacity-50"
          >
            <PixelSparkIcon size={14} />
            <span>{loadingDemo ? 'Chargement...' : 'Projet Démo'}</span>
          </button>

          <button
            type="button"
            onClick={() => void handleSelectProjectDirectory()}
            className="pixel-btn pixel-btn-arcane flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold"
          >
            <PixelFolderIcon size={14} />
            <span>{project ? 'Ouvrir' : 'Ouvrir / Créer'}</span>
          </button>

          <button
            type="button"
            onClick={() => setCreditsOpen(true)}
            className="pixel-btn px-2.5 py-1.5 text-[11px] font-bold text-dnd-gold"
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
        {activeTab === 'animation-studio' && (
          <AnimationStudioWorkspace
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
        {activeTab === 'vtt' && (
          <VttWorkspace
            storage={storage}
            project={project}
            onProjectLoaded={(nextStorage, nextManifest, label) => {
              setStorage(nextStorage);
              setProject(nextManifest);
              setProjectPath(label);
            }}
          />
        )}
      </main>

      <footer className="flex items-center justify-between border-t-2 border-dnd-border bg-dnd-stone px-4 py-1 text-[11px] text-dnd-muted">
        <span>
          RPG Player Studio — Grimoire Créatif 16-bit (Pixel Studio · Animation · RPG Engine · VTT)
        </span>
        <button
          type="button"
          onClick={() => setCreditsOpen(true)}
          className="font-pixel text-[10px] text-dnd-gold transition hover:text-dnd-parchment"
        >
          Made by Gemini Neon
        </button>
      </footer>

      <CreditsModal open={creditsOpen} onClose={() => setCreditsOpen(false)} />
    </div>
  );
}
