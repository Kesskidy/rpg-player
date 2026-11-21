import { useEffect, useRef, useState } from 'react';
import type {
  CardinalDirection,
  ColliderBox,
  DepthPlane,
  EquipmentSlot,
  MapEvent,
  MapEventKind,
  MapEventTrigger,
  MapMeta,
  NarrativeGraph,
  NarrativeVariableValue,
  ProjectManifest,
  ProjectStorageAdapter,
  RpgDatabase,
  TileMapData,
} from '@rpg-player/core-types';
import {
  AssetTextureRegistry,
  createDefaultFeetCollider,
  createEmptyTileMap,
  InventorySystem,
  MapEditorEngine,
  NarrativeRunner,
  PixiMapViewport,
  type CombatSnapshot,
  type MapEditorTool,
  type NarrativeStepState,
  type TileCoord,
  type ViewportMode,
} from '@rpg-player/rpg-engine';
import { formatSaveFeedback, loadMap, saveMap } from '../../storage/project-service';
import { CombatOverlay } from './CombatOverlay';
import { DialogueOverlay } from './DialogueOverlay';
import { InventoryModal } from './InventoryModal';
import { TileAssetPicker } from './TileAssetPicker';
import { PixelPlayIcon, PixelSaveIcon } from '../ui/PixelIcons';

interface MapEditorWorkspaceProps {
  storage: ProjectStorageAdapter;
  project: ProjectManifest | null;
  database: RpgDatabase;
  narratives: Record<string, NarrativeGraph>;
  onProjectUpdated: (manifest: ProjectManifest) => void;
  onGoToPixelStudio: () => void;
}

const TOOL_ITEMS: ReadonlyArray<{ id: MapEditorTool; label: string; shortcut: string }> = [
  { id: 'paint-tile', label: 'Peindre tuile', shortcut: 'B' },
  { id: 'erase-tile', label: 'Gommer tuile', shortcut: 'E' },
  { id: 'paint-collision', label: 'Mur / Collision', shortcut: 'C' },
  { id: 'erase-collision', label: 'Effacer Mur', shortcut: 'X' },
  { id: 'place-event', label: 'PNJ / Événement', shortcut: 'N' },
  { id: 'erase-event', label: 'Effacer Évén.', shortcut: 'D' },
  { id: 'set-spawn', label: 'Point de Spawn', shortcut: 'S' },
];

function slugifyMapId(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '') || `map_${Date.now().toString(36)}`
  );
}

export function MapEditorWorkspace({
  storage,
  project,
  database,
  narratives,
  onProjectUpdated,
  onGoToPixelStudio,
}: MapEditorWorkspaceProps) {
  const [editor] = useState<MapEditorEngine>(() => {
    const map = createEmptyTileMap({
      id: 'map_village',
      name: 'Village de départ',
      width: 20,
      height: 14,
      tileSize: project?.defaultTileSize ?? 32,
    });
    // Place a helpful starter NPC right beside spawn linked to the sample narrative
    map.events = [
      {
        id: 'ev_guard_starter',
        name: 'Garde du Village',
        kind: 'npc',
        trigger: 'interact',
        x: map.playerSpawn.x + 2,
        y: map.playerSpawn.y,
        spriteAssetId: null,
        narrativeId: 'garde_village',
        battleEnemyId: null,
        isSolid: true,
        plane: 'y_sorted',
        collider: createDefaultFeetCollider(map.tileSize),
      },
    ];
    return new MapEditorEngine(map);
  });

  const [renderVersion, setRenderVersion] = useState(0);
  const [mode, setMode] = useState<ViewportMode>('editor');
  const [zoomDisplay, setZoomDisplay] = useState(2);
  const [hoverTile, setHoverTile] = useState<TileCoord | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>('ev_guard_starter');
  const [isSpaceHeld, setIsSpaceHeld] = useState(false);

  // Live Preview RPG runtime state (inventory, HP/MP, variables, dialogue, combat)
  const previewInventoryRef = useRef<InventorySystem>(new InventorySystem(database));
  const previewVarsRef = useRef<Record<string, NarrativeVariableValue>>({});
  const [heroHp, setHeroHp] = useState(database.hero.stats.maxHp);
  const [heroMp, setHeroMp] = useState(database.hero.stats.maxMp);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [, setInventoryTick] = useState(0);

  const [activeDialogue, setActiveDialogue] = useState<{
    runner: NarrativeRunner;
    step: NarrativeStepState;
  } | null>(null);
  const [activeCombatEnemyId, setActiveCombatEnemyId] = useState<string | null>(null);
  const [previewMap, setPreviewMap] = useState<TileMapData | null>(null);
  const [previewToast, setPreviewToast] = useState<string | null>(null);

  const [newMapName, setNewMapName] = useState('Donjon');
  const [newMapWidth, setNewMapWidth] = useState(20);
  const [newMapHeight, setNewMapHeight] = useState(14);
  const [newMapTileSize, setNewMapTileSize] = useState(project?.defaultTileSize ?? 32);

  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [viewportReady, setViewportReady] = useState(false);

  const viewportHostRef = useRef<HTMLDivElement | null>(null);
  const registryRef = useRef<AssetTextureRegistry | null>(null);
  const viewportRef = useRef<PixiMapViewport | null>(null);

  const isPaintingRef = useRef(false);
  const isPanningRef = useRef(false);
  const panOriginRef = useRef({ clientX: 0, clientY: 0, camX: 0, camY: 0 });

  // Pause PixiJS simulation whenever Dialogue, Combat, or Inventory modal is open
  useEffect(() => {
    const paused = Boolean(activeDialogue || activeCombatEnemyId || inventoryOpen);
    viewportRef.current?.setPaused(paused);
  }, [activeDialogue, activeCombatEnemyId, inventoryOpen]);

  // Subscribe to headless MapEditorEngine updates
  useEffect(() => {
    return editor.subscribe(() => {
      setRenderVersion((v) => v + 1);
      viewportRef.current?.syncMap(editor.getMap());
      const st = editor.getState();
      viewportRef.current?.setOverlayOptions({
        showGrid: st.showGrid,
        showCollisions: st.showCollisions,
      });
    });
  }, [editor]);

  // Mount PixiJS v8 WebGL/Canvas viewport
  useEffect(() => {
    const host = viewportHostRef.current;
    if (!host) return;

    const registry = new AssetTextureRegistry();
    const viewport = new PixiMapViewport(editor.getMap(), registry);
    registryRef.current = registry;
    viewportRef.current = viewport;
    setViewportReady(false);

    let cancelled = false;
    void viewport
      .init(host)
      .then(() => {
        if (cancelled) return;
        setViewportReady(true);
        setZoomDisplay(viewport.getCamera().zoom);
      })
      .catch((err) => {
        if (cancelled) return;
        setFeedback({
          kind: 'error',
          text: `Erreur d’initialisation du rendu 2D : ${err instanceof Error ? err.message : String(err)}`,
        });
      });

    return () => {
      cancelled = true;
      setViewportReady(false);
      viewport.destroy();
      registry.destroy();
      viewportRef.current = null;
      registryRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  // Auto-load the project's first map (e.g. map_guilde in demo-pack) when switching projects
  useEffect(() => {
    if (!project?.maps) return;
    const mapsList = Object.values(project.maps);
    if (mapsList.length === 0) return;
    const preferred = project.maps['map_guilde'] ?? mapsList[0]!;
    let cancelled = false;
    void loadMap(storage, preferred)
      .then((loaded) => {
        if (cancelled) return;
        editor.loadMap(loaded);
        setSelectedEventId(loaded.events[0]?.id ?? null);
        viewportRef.current?.syncMap(loaded);
        viewportRef.current?.centerCameraOnMap();
        setZoomDisplay(viewportRef.current?.getCamera().zoom ?? 2);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storage, project?.id, viewportReady]);

  // Single authoritative asset sync once viewport is ready (prevents texture destroy race!)
  useEffect(() => {
    if (!viewportReady) return;
    const registry = registryRef.current;
    const viewport = viewportRef.current;
    if (!registry || !viewport) return;

    let cancelled = false;
    async function syncAssets() {
      viewport!.clearScene();
      if (!project) {
        registry!.clear();
      } else {
        await registry!.loadFromStorage(storage, project.assets);
      }
      if (!cancelled) {
        viewport!.syncMap(editor.getMap());
        viewport!.centerCameraOnMap();
        setZoomDisplay(viewport!.getCamera().zoom);
      }
    }
    void syncAssets();

    return () => {
      cancelled = true;
    };
  }, [storage, project, viewportReady, editor]);

  function launchBattle(enemyId: string) {
    if (!database.enemies[enemyId]) {
      setPreviewToast(`Monstre introuvable : ${enemyId}`);
      return;
    }
    setActiveCombatEnemyId(enemyId);
  }

  function triggerMapEvent(event: MapEvent) {
    if (event.teleport && project?.maps?.[event.teleport.targetMapId]) {
      const targetMeta = project.maps[event.teleport.targetMapId]!;
      const dest = event.teleport;
      void loadMap(storage, targetMeta)
        .then((loaded) => {
          const teleportedMap: TileMapData = {
            ...loaded,
            playerSpawn: {
              x: dest.targetX,
              y: dest.targetY,
              direction: dest.direction ?? loaded.playerSpawn.direction,
            },
          };
          // Keep MapEditorEngine untouched so unsaved edits & Undo history are preserved!
          setPreviewMap(teleportedMap);
          viewportRef.current?.syncMap(teleportedMap);
          setPreviewToast(`Téléportation → ${loaded.name}`);
        })
        .catch(() => {
          setPreviewToast(`Impossible de charger la map "${targetMeta.name}".`);
        });
      return;
    }

    if (event.narrativeId && narratives[event.narrativeId]) {
      const graph = narratives[event.narrativeId]!;
      const runner = new NarrativeRunner(graph, {
        inventory: previewInventoryRef.current,
        variables: previewVarsRef.current,
        onHeal: (hp, mp) => {
          const eff = previewInventoryRef.current.computeEffectiveStats(database.hero.stats);
          setHeroHp((cur) => Math.min(eff.maxHp, cur + hp));
          setHeroMp((cur) => Math.min(eff.maxMp, cur + mp));
        },
      });
      const step = runner.start();
      setInventoryTick((t) => t + 1);

      if (step.status === 'dialogue' || step.status === 'cinematic') {
        setActiveDialogue({ runner, step });
      } else if (step.triggeredBattleEnemyId) {
        launchBattle(step.triggeredBattleEnemyId);
      }
      return;
    }

    if (event.battleEnemyId) {
      launchBattle(event.battleEnemyId);
      return;
    }

    setPreviewToast(`${event.name} n’a pas encore de dialogue ni de combat lié.`);
  }

  // Register touch-zone callback on PixiJS viewport
  useEffect(() => {
    viewportRef.current?.setOnTouchEvent((event) => {
      triggerMapEvent(event);
    });
    return () => {
      viewportRef.current?.setOnTouchEvent(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [database, narratives, heroHp, heroMp]);

  // Keyboard handling: Editor shortcuts vs Preview movement, Interact (E/Enter), Inventory (I)
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement
      ) {
        return;
      }

      const key = event.key.toLowerCase();

      if (mode === 'preview') {
        if (event.key === 'Escape') {
          event.preventDefault();
          if (inventoryOpen) {
            setInventoryOpen(false);
          } else if (activeDialogue) {
            setActiveDialogue(null);
          } else if (!activeCombatEnemyId) {
            handleSetMode('editor');
          }
          return;
        }

        if (key === 'i' && !activeCombatEnemyId && !activeDialogue) {
          event.preventDefault();
          setInventoryOpen((open) => !open);
          return;
        }

        if (activeCombatEnemyId || activeDialogue || inventoryOpen) {
          return;
        }

        if (key === 'e' || event.key === 'Enter' || event.code === 'Space') {
          event.preventDefault();
          const target = viewportRef.current?.findInteractableEvent() ?? null;
          if (target) {
            triggerMapEvent(target);
          } else {
            setPreviewToast('Aucun PNJ ou coffre à portée.');
          }
          return;
        }

        if (key === 'arrowup' || key === 'z' || key === 'w') {
          event.preventDefault();
          viewportRef.current?.setInput({ up: true });
        } else if (key === 'arrowdown' || key === 's') {
          event.preventDefault();
          viewportRef.current?.setInput({ down: true });
        } else if (key === 'arrowleft' || key === 'q' || key === 'a') {
          event.preventDefault();
          viewportRef.current?.setInput({ left: true });
        } else if (key === 'arrowright' || key === 'd') {
          event.preventDefault();
          viewportRef.current?.setInput({ right: true });
        }
        return;
      }

      if (event.code === 'Space') {
        event.preventDefault();
        setIsSpaceHeld(true);
        return;
      }

      if ((event.ctrlKey || event.metaKey) && key === 'z') {
        event.preventDefault();
        if (event.shiftKey) editor.redo();
        else editor.undo();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && key === 'y') {
        event.preventDefault();
        editor.redo();
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }

      if (key === 'b') editor.setTool('paint-tile');
      else if (key === 'e') editor.setTool('erase-tile');
      else if (key === 'c') editor.setTool('paint-collision');
      else if (key === 'x') editor.setTool('erase-collision');
      else if (key === 'n') editor.setTool('place-event');
      else if (key === 'd') editor.setTool('erase-event');
      else if (key === 's') editor.setTool('set-spawn');
      else if (key === 'g') editor.setShowGrid(!editor.getState().showGrid);
    }

    function handleKeyUp(event: KeyboardEvent) {
      const key = event.key.toLowerCase();
      if (event.code === 'Space') {
        setIsSpaceHeld(false);
      }
      if (mode === 'preview') {
        if (key === 'arrowup' || key === 'z' || key === 'w') {
          viewportRef.current?.setInput({ up: false });
        } else if (key === 'arrowdown' || key === 's') {
          viewportRef.current?.setInput({ down: false });
        } else if (key === 'arrowleft' || key === 'q' || key === 'a') {
          viewportRef.current?.setInput({ left: false });
        } else if (key === 'arrowright' || key === 'd') {
          viewportRef.current?.setInput({ right: false });
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, editor, activeCombatEnemyId, activeDialogue, inventoryOpen, database, narratives]);

  function handleSetMode(nextMode: ViewportMode) {
    setMode(nextMode);
    setActiveDialogue(null);
    setActiveCombatEnemyId(null);
    setInventoryOpen(false);
    setPreviewToast(null);
    setPreviewMap(null);

    if (nextMode === 'preview') {
      const freshInv = new InventorySystem(database);
      previewInventoryRef.current = freshInv;
      previewVarsRef.current = {};
      const eff = freshInv.computeEffectiveStats(database.hero.stats);
      setHeroHp(eff.maxHp);
      setHeroMp(eff.maxMp);
      setInventoryTick((t) => t + 1);
    } else {
      // Restore the editor's untouched map & camera when returning from Preview
      viewportRef.current?.syncMap(editor.getMap());
      viewportRef.current?.centerCameraOnMap();
    }
    viewportRef.current?.setMode(nextMode);
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (mode !== 'editor') return;
    const viewport = viewportRef.current;
    if (!viewport) return;

    if (event.button === 1 || (event.button === 0 && isSpaceHeld)) {
      event.preventDefault();
      const cam = viewport.getCamera();
      isPanningRef.current = true;
      panOriginRef.current = {
        clientX: event.clientX,
        clientY: event.clientY,
        camX: cam.x,
        camY: cam.y,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    if (event.button !== 0) return;

    const tile = viewport.screenToTile(event.clientX, event.clientY);
    if (!tile) return;

    const tool = editor.getState().activeTool;
    if (tool === 'place-event') {
      const existing = editor.getEventAt(tile.tx, tile.ty);
      if (existing) {
        setSelectedEventId(existing.id);
        return;
      }
      editor.applyAtTile(tile.tx, tile.ty);
      const created = editor.getEventAt(tile.tx, tile.ty);
      if (created) {
        setSelectedEventId(created.id);
      }
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    isPaintingRef.current = true;
    editor.beginEdit();
    editor.applyAtTile(tile.tx, tile.ty);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const viewport = viewportRef.current;
    if (!viewport || mode !== 'editor') return;

    if (isPanningRef.current) {
      const dx = event.clientX - panOriginRef.current.clientX;
      const dy = event.clientY - panOriginRef.current.clientY;
      viewport.setCamera({
        x: panOriginRef.current.camX + dx,
        y: panOriginRef.current.camY + dy,
      });
      return;
    }

    const tile = viewport.screenToTile(event.clientX, event.clientY);
    setHoverTile(tile);
    viewport.setOverlayOptions({ hoverTile: tile });

    if (isPaintingRef.current && tile) {
      editor.applyAtTile(tile.tx, tile.ty);
    }
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (isPanningRef.current) {
      isPanningRef.current = false;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      return;
    }

    if (isPaintingRef.current) {
      isPaintingRef.current = false;
      editor.endEdit();
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    }
  }

  function handleWheel(event: React.WheelEvent<HTMLDivElement>) {
    const viewport = viewportRef.current;
    if (!viewport) return;
    event.preventDefault();
    const cam = viewport.getCamera();
    const delta = event.deltaY < 0 ? 0.5 : -0.5;
    const nextZoom = Math.max(0.5, Math.min(6, Math.round((cam.zoom + delta) * 2) / 2));
    viewport.setCamera({ zoom: nextZoom });
    setZoomDisplay(nextZoom);
  }

  function handleCreateMap(event: React.FormEvent) {
    event.preventDefault();
    if (mode === 'preview') handleSetMode('editor');
    const created = createEmptyTileMap({
      id: slugifyMapId(newMapName),
      name: newMapName.trim() || 'Nouvelle Map',
      width: newMapWidth,
      height: newMapHeight,
      tileSize: newMapTileSize,
    });
    editor.loadMap(created);
    setSelectedEventId(null);
    viewportRef.current?.syncMap(created);
    viewportRef.current?.centerCameraOnMap();
    setFeedback({
      kind: 'ok',
      text: `Nouvelle map « ${created.name} » (${created.width}×${created.height}) créée.`,
    });
  }

  async function handleOpenMap(meta: MapMeta) {
    setFeedback(null);
    if (mode === 'preview') handleSetMode('editor');
    try {
      const loaded = await loadMap(storage, meta);
      editor.loadMap(loaded);
      setSelectedEventId(loaded.events?.[0]?.id ?? null);
      viewportRef.current?.syncMap(loaded);
      viewportRef.current?.centerCameraOnMap();
      setFeedback({ kind: 'ok', text: `Map « ${loaded.name} » chargée.` });
    } catch (error) {
      setFeedback({
        kind: 'error',
        text: error instanceof Error ? error.message : 'Erreur lors du chargement de la map.',
      });
    }
  }

  async function handleSaveMap() {
    if (!project) {
      setFeedback({
        kind: 'error',
        text: 'Ouvrez ou créez d’abord un dossier projet pour sauvegarder la map.',
      });
      return;
    }
    setIsSaving(true);
    setFeedback(null);
    try {
      const saved = await saveMap(storage, project, editor.serialize());
      onProjectUpdated(saved.manifest);
      setFeedback({
        kind: 'ok',
        text: formatSaveFeedback(storage, `Map sauvegardée dans ${saved.meta.filePath}.`),
      });
    } catch (error) {
      setFeedback({
        kind: 'error',
        text: error instanceof Error ? error.message : 'Échec de sauvegarde de la map.',
      });
    } finally {
      setIsSaving(false);
    }
  }

  function handleFinishCombat(finalSnap: CombatSnapshot) {
    setActiveCombatEnemyId(null);
    const eff = previewInventoryRef.current.computeEffectiveStats(database.hero.stats);
    if (finalSnap.phase === 'defeat') {
      setHeroHp(Math.max(1, Math.round(eff.maxHp * 0.5)));
    } else {
      setHeroHp(Math.max(1, finalSnap.hero.hp));
    }
    setHeroMp(finalSnap.hero.mp);
    setInventoryTick((t) => t + 1);
    if (finalSnap.phase === 'victory' && finalSnap.rewardSummary) {
      setPreviewToast(`Victoire ! Butin : ${finalSnap.rewardSummary}`);
    }
  }

  function handleUseConsumable(itemId: string) {
    const res = previewInventoryRef.current.useConsumable(itemId);
    if (res.ok) {
      const eff = previewInventoryRef.current.computeEffectiveStats(database.hero.stats);
      setHeroHp((hp) => Math.min(eff.maxHp, hp + res.healHp));
      setHeroMp((mp) => Math.min(eff.maxMp, mp + res.healMp));
      setInventoryTick((t) => t + 1);
    }
  }

  function handleEquipItem(itemId: string) {
    if (previewInventoryRef.current.equipItem(itemId).ok) {
      setInventoryTick((t) => t + 1);
    }
  }

  function handleUnequipSlot(slot: EquipmentSlot) {
    if (previewInventoryRef.current.unequipSlot(slot).ok) {
      setInventoryTick((t) => t + 1);
    }
  }

  void renderVersion;
  const map = editor.getMap();
  const displayedMap = mode === 'preview' && previewMap ? previewMap : map;
  const state = editor.getState();
  const projectMaps = project?.maps ? Object.values(project.maps) : [];
  const spriteAssets = project
    ? Object.values(project.assets).filter((asset) => asset.type === 'sprite')
    : [];
  const mapEvents = map.events ?? [];
  const selectedEvent = mapEvents.find((ev) => ev.id === selectedEventId) ?? null;
  const narrativeList = Object.values(narratives);
  const enemyList = Object.values(database.enemies);
  const effectiveHeroStats = previewInventoryRef.current.computeEffectiveStats(database.hero.stats);

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Left Dock: Tools, Layers & Auto-Imported Phase 1 Asset Palette */}
      <aside className="flex w-72 flex-col border-r border-slate-800 bg-surface-900">
        <div className="space-y-2 border-b border-slate-800 p-3">
          <div className="flex items-center justify-between">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Outils Tilemap
            </h3>
            <div className="flex gap-1">
              <button
                type="button"
                disabled={!editor.canUndo() || mode === 'preview'}
                onClick={() => editor.undo()}
                title="Annuler (Ctrl+Z)"
                className="rounded bg-surface-800 px-2 py-0.5 text-[11px] text-slate-200 hover:bg-surface-700 disabled:opacity-35"
              >
                ↶
              </button>
              <button
                type="button"
                disabled={!editor.canRedo() || mode === 'preview'}
                onClick={() => editor.redo()}
                title="Rétablir (Ctrl+Y)"
                className="rounded bg-surface-800 px-2 py-0.5 text-[11px] text-slate-200 hover:bg-surface-700 disabled:opacity-35"
              >
                ↷
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1">
            {TOOL_ITEMS.map((item) => {
              const active = state.activeTool === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={mode === 'preview'}
                  onClick={() => editor.setTool(item.id)}
                  className={`rounded px-2 py-1 text-left text-[11px] font-medium transition disabled:opacity-40 ${
                    active
                      ? 'bg-indigo-600 text-white shadow'
                      : 'bg-surface-800 text-slate-300 hover:bg-surface-700'
                  }`}
                >
                  {item.label} <span className="opacity-60">({item.shortcut})</span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-1 pt-0.5">
            <button
              type="button"
              disabled={mode === 'preview'}
              onClick={() => editor.setPaintMode('replace')}
              title="Remplace l’asset sur la case du calque actif"
              className={`flex-1 rounded px-2 py-1 text-[10px] font-semibold transition ${
                state.paintMode === 'replace'
                  ? 'bg-indigo-600/30 text-indigo-100 ring-1 ring-indigo-500/60'
                  : 'bg-surface-800 text-slate-400 hover:bg-surface-700'
              }`}
            >
              Remplacer
            </button>
            <button
              type="button"
              disabled={mode === 'preview'}
              onClick={() => editor.setPaintMode('stack')}
              title="Empile plusieurs assets sur la même case (même si bloquée)"
              className={`flex-1 rounded px-2 py-1 text-[10px] font-semibold transition ${
                state.paintMode === 'stack'
                  ? 'bg-amber-600/30 text-amber-200 ring-1 ring-amber-500/60'
                  : 'bg-surface-800 text-slate-400 hover:bg-surface-700'
              }`}
            >
              Empiler (Superposer)
            </button>
          </div>

          <div className="flex items-center gap-1.5 pt-1">
            <button
              type="button"
              onClick={() => editor.setShowGrid(!state.showGrid)}
              className={`flex-1 rounded px-2 py-1 text-[11px] font-medium ${
                state.showGrid
                  ? 'bg-indigo-600/25 text-indigo-200 ring-1 ring-indigo-500/50'
                  : 'bg-surface-800 text-slate-400'
              }`}
            >
              Grille : {state.showGrid ? 'ON' : 'OFF'}
            </button>
            <button
              type="button"
              onClick={() => editor.setShowCollisions(!state.showCollisions)}
              className={`flex-1 rounded px-2 py-1 text-[11px] font-medium ${
                state.showCollisions
                  ? 'bg-rose-600/25 text-rose-200 ring-1 ring-rose-500/50'
                  : 'bg-surface-800 text-slate-400'
              }`}
            >
              Collisions : {state.showCollisions ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>

        {/* Tilemap Layers grouped by Depth Plane (below / y_sorted / above) */}
        <div className="space-y-1.5 border-b border-slate-800 p-3">
          <div className="flex items-center justify-between">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Calques ({map.layers.length})
            </h3>
            <div className="flex gap-1">
              <button
                type="button"
                disabled={mode === 'preview'}
                onClick={() => editor.addLayer(`Décor Y-Sort`, 'y_sorted')}
                title="Ajouter un calque Y-Sorted"
                className="rounded bg-surface-800 px-1.5 py-0.5 text-[10px] text-amber-300 hover:bg-surface-700 disabled:opacity-40"
              >
                + Y-Sort
              </button>
              <button
                type="button"
                disabled={mode === 'preview'}
                onClick={() => editor.addLayer(`Sol extra`, 'below')}
                title="Ajouter un calque sous le personnage"
                className="rounded bg-surface-800 px-1.5 py-0.5 text-[10px] text-emerald-300 hover:bg-surface-700 disabled:opacity-40"
              >
                + Sous
              </button>
            </div>
          </div>

          <div className="max-h-36 space-y-1 overflow-y-auto pr-0.5">
            {map.layers
              .slice()
              .reverse()
              .map((layer) => {
                const active = layer.id === state.activeLayerId;
                const planeBadge =
                  layer.plane === 'above'
                    ? { label: 'DESSUS', cls: 'bg-purple-500/20 text-purple-300' }
                    : layer.plane === 'y_sorted'
                      ? { label: 'Y-SORT', cls: 'bg-amber-500/20 text-amber-300' }
                      : { label: 'SOUS', cls: 'bg-sky-500/20 text-sky-300' };
                return (
                  <div
                    key={layer.id}
                    onClick={() => editor.setActiveLayer(layer.id)}
                    className={`flex cursor-pointer items-center justify-between gap-1.5 rounded border px-2 py-1 text-xs transition ${
                      active
                        ? 'border-indigo-500/80 bg-indigo-600/20 text-white'
                        : 'border-slate-800 bg-surface-800/50 text-slate-300 hover:bg-surface-800'
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span
                        className={`shrink-0 rounded px-1 py-0.5 font-mono text-[9px] font-bold ${planeBadge.cls}`}
                      >
                        {planeBadge.label}
                      </span>
                      <span className="truncate font-medium">{layer.name}</span>
                    </div>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        editor.setLayerVisibility(layer.id, !layer.visible);
                      }}
                      className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                        layer.visible
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-slate-800 text-slate-500'
                      }`}
                    >
                      {layer.visible ? 'VIS' : 'OFF'}
                    </button>
                  </div>
                );
              })}
          </div>
        </div>

        <TileAssetPicker
          storage={storage}
          project={project}
          tileSize={map.tileSize}
          selectedTile={state.selectedTile}
          onSelectTile={(cell) => {
            editor.setSelectedTile(cell);
            if (state.activeTool !== 'paint-tile') {
              editor.setTool('paint-tile');
            }
          }}
          onGoToPixelStudio={onGoToPixelStudio}
        />
      </aside>

      {/* Center: PixiJS v8 WebGL Viewport + RPG Preview Overlays */}
      <section className="relative flex flex-1 flex-col overflow-hidden bg-surface-950">
        <div className="flex items-center justify-between border-b border-slate-800 bg-surface-900/90 px-4 py-2">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-white">{displayedMap.name}</span>
            <span className="font-mono text-[11px] text-slate-400">
              {displayedMap.width}×{displayedMap.height} · {(displayedMap.events ?? []).length}{' '}
              événement(s)
            </span>
          </div>

          <div className="flex items-center gap-2">
            {mode === 'preview' && (
              <>
                <div className="flex items-center gap-2 rounded border border-slate-700 bg-surface-800 px-2.5 py-1 font-mono text-[11px]">
                  <span className="text-emerald-300">
                    PV {heroHp}/{effectiveHeroStats.maxHp}
                  </span>
                  <span className="text-sky-300">
                    PM {heroMp}/{effectiveHeroStats.maxMp}
                  </span>
                  <span className="text-amber-300">{previewInventoryRef.current.getGold()} Or</span>
                </div>
                <button
                  type="button"
                  onClick={() => setInventoryOpen(true)}
                  className="rounded bg-indigo-600/30 px-2.5 py-1 text-xs font-medium text-indigo-200 ring-1 ring-indigo-500/50 hover:bg-indigo-600/50"
                >
                  Sac (I)
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() => {
                viewportRef.current?.centerCameraOnMap();
                setZoomDisplay(viewportRef.current?.getCamera().zoom ?? 2);
              }}
              className="pixel-btn px-2.5 py-1 text-[11px]"
            >
              Centrer ({zoomDisplay}×)
            </button>

            {mode === 'editor' ? (
              <button
                type="button"
                onClick={() => handleSetMode('preview')}
                className="pixel-btn pixel-btn-dragon flex items-center gap-1.5 px-3.5 py-1.5 text-[11px] font-bold"
              >
                <PixelPlayIcon size={13} />
                <span>Play Preview</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleSetMode('editor')}
                className="pixel-btn pixel-btn-gold px-3.5 py-1.5 text-[11px] font-bold"
              >
                ■ Stop Preview
              </button>
            )}
          </div>
        </div>

        <div
          ref={viewportHostRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={() => {
            if (!isPaintingRef.current) {
              setHoverTile(null);
              viewportRef.current?.setOverlayOptions({ hoverTile: null });
            }
          }}
          onWheel={handleWheel}
          onContextMenu={(event) => event.preventDefault()}
          className={`relative flex-1 overflow-hidden ${
            mode === 'preview'
              ? 'cursor-default'
              : isSpaceHeld
                ? 'cursor-grab'
                : 'cursor-crosshair'
          }`}
        />

        {previewToast && mode === 'preview' && (
          <div className="absolute right-4 top-14 z-30 flex items-center gap-2 rounded-lg border border-amber-500/40 bg-surface-900/95 px-3 py-2 text-xs text-amber-200 shadow-lg">
            <span>{previewToast}</span>
            <button
              type="button"
              onClick={() => setPreviewToast(null)}
              className="text-slate-400 hover:text-white"
            >
              ×
            </button>
          </div>
        )}

        {/* HUD bottom status */}
        <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-3 rounded-md border border-slate-800 bg-surface-900/90 px-3 py-1.5 text-[11px] text-slate-300 backdrop-blur">
          {mode === 'preview' ? (
            <>
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              <span>ZQSD / Flèches : bouger</span>
              <span className="text-slate-600">|</span>
              <span className="text-cyan-300">E / Entrée : parler au PNJ</span>
              <span className="text-slate-600">|</span>
              <span className="text-indigo-300">I : inventaire</span>
            </>
          ) : (
            <>
              <span className="font-mono">
                {hoverTile ? `Tuile (${hoverTile.tx}, ${hoverTile.ty})` : 'Hors map'}
              </span>
              <span className="text-slate-600">|</span>
              <span className="font-mono">
                Spawn ({map.playerSpawn.x}, {map.playerSpawn.y})
              </span>
              <span className="text-slate-600">|</span>
              <span className="text-slate-400">Espace + Glisser : déplacer · Molette : zoom</span>
            </>
          )}
        </div>

        {/* Interactive RPG Preview Overlays */}
        {activeDialogue && (
          <DialogueOverlay
            step={activeDialogue.step}
            storage={storage}
            project={project}
            onSelectChoice={(choiceId) => {
              const next = activeDialogue.runner.selectChoice(choiceId);
              setInventoryTick((t) => t + 1);
              if (next.status === 'ended') {
                setActiveDialogue(null);
                if (next.triggeredBattleEnemyId) {
                  launchBattle(next.triggeredBattleEnemyId);
                }
              } else {
                setActiveDialogue({ runner: activeDialogue.runner, step: next });
              }
            }}
            onAdvance={() => {
              const next = activeDialogue.runner.advance();
              setInventoryTick((t) => t + 1);
              if (next.status === 'ended') {
                setActiveDialogue(null);
                if (next.triggeredBattleEnemyId) {
                  launchBattle(next.triggeredBattleEnemyId);
                }
              } else {
                setActiveDialogue({ runner: activeDialogue.runner, step: next });
              }
            }}
            onClose={() => setActiveDialogue(null)}
          />
        )}

        <InventoryModal
          open={inventoryOpen}
          database={database}
          inventory={previewInventoryRef.current}
          heroHp={heroHp}
          heroMp={heroMp}
          variables={previewVarsRef.current}
          onUseConsumable={handleUseConsumable}
          onEquipItem={handleEquipItem}
          onUnequipSlot={handleUnequipSlot}
          onClose={() => setInventoryOpen(false)}
        />

        {activeCombatEnemyId && (
          <CombatOverlay
            enemyId={activeCombatEnemyId}
            database={database}
            inventory={previewInventoryRef.current}
            initialHeroHp={heroHp}
            initialHeroMp={heroMp}
            map={map}
            onFinish={handleFinishCombat}
          />
        )}
      </section>

      {/* Right Dock: Selected Event Inspector, Player Sprite, Save & Project Maps */}
      <aside className="flex w-76 flex-col overflow-y-auto border-l border-slate-800 bg-surface-900">
        {/* Selected Map Event Inspector */}
        <div className="space-y-2 border-b border-slate-800 p-3">
          <div className="flex items-center justify-between">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-cyan-300">
              Événements / PNJ ({mapEvents.length})
            </h3>
            {selectedEvent && (
              <button
                type="button"
                onClick={() => {
                  editor.removeEventById(selectedEvent.id);
                  setSelectedEventId(null);
                }}
                className="rounded px-1.5 py-0.5 text-[10px] text-rose-300 hover:bg-rose-950/60"
              >
                Supprimer
              </button>
            )}
          </div>

          {mapEvents.length > 0 && (
            <select
              value={selectedEvent?.id ?? ''}
              onChange={(e) => setSelectedEventId(e.target.value || null)}
              className="w-full rounded border border-slate-700 bg-surface-800 px-2 py-1 text-xs text-white"
            >
              <option value="">Sélectionner un événement…</option>
              {mapEvents.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.name} ({ev.x},{ev.y})
                </option>
              ))}
            </select>
          )}

          {selectedEvent ? (
            <div className="space-y-2 rounded-md border border-slate-800 bg-surface-950/60 p-2.5 text-[11px]">
              <input
                type="text"
                value={selectedEvent.name}
                onChange={(e) => editor.upsertEvent({ ...selectedEvent, name: e.target.value })}
                className="w-full rounded border border-slate-700 bg-surface-800 px-2 py-1 text-xs text-white"
              />
              <div className="grid grid-cols-2 gap-1.5">
                <select
                  value={selectedEvent.kind}
                  onChange={(e) =>
                    editor.upsertEvent({
                      ...selectedEvent,
                      kind: e.target.value as MapEventKind,
                    })
                  }
                  className="rounded border border-slate-700 bg-surface-800 px-1.5 py-1 text-xs text-white"
                >
                  <option value="npc">PNJ</option>
                  <option value="chest">Coffre</option>
                  <option value="prop">Grand Décor</option>
                  <option value="zone">Zone</option>
                </select>
                <select
                  value={selectedEvent.trigger}
                  onChange={(e) =>
                    editor.upsertEvent({
                      ...selectedEvent,
                      trigger: e.target.value as MapEventTrigger,
                    })
                  }
                  className="rounded border border-slate-700 bg-surface-800 px-1.5 py-1 text-xs text-white"
                >
                  <option value="interact">Touche (E)</option>
                  <option value="touch">Au contact</option>
                  <option value="none">Aucun</option>
                </select>
              </div>

              <label className="block text-slate-400">
                Plan de profondeur
                <select
                  value={selectedEvent.plane}
                  onChange={(e) =>
                    editor.upsertEvent({
                      ...selectedEvent,
                      plane: e.target.value as DepthPlane,
                    })
                  }
                  className="mt-0.5 w-full rounded border border-slate-700 bg-surface-800 px-2 py-1 text-xs text-white"
                >
                  <option value="y_sorted">Y-Sorted (Devant/Derrière)</option>
                  <option value="below">Sous le personnage</option>
                  <option value="above">Au-dessus du personnage</option>
                </select>
              </label>

              <label className="block text-slate-400">
                Dialogue lié (Twine)
                <select
                  value={selectedEvent.narrativeId ?? ''}
                  onChange={(e) =>
                    editor.upsertEvent({
                      ...selectedEvent,
                      narrativeId: e.target.value || null,
                    })
                  }
                  className="mt-0.5 w-full rounded border border-slate-700 bg-surface-800 px-2 py-1 text-xs text-white"
                >
                  <option value="">(Aucun dialogue)</option>
                  {narrativeList.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-slate-400">
                Combat direct (optionnel)
                <select
                  value={selectedEvent.battleEnemyId ?? ''}
                  onChange={(e) =>
                    editor.upsertEvent({
                      ...selectedEvent,
                      battleEnemyId: e.target.value || null,
                    })
                  }
                  className="mt-0.5 w-full rounded border border-slate-700 bg-surface-800 px-2 py-1 text-xs text-white"
                >
                  <option value="">(Aucun)</option>
                  {enemyList.map((enemy) => (
                    <option key={enemy.id} value={enemy.id}>
                      ⚔ {enemy.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-slate-400">
                Sprite (Phase 1)
                <select
                  value={selectedEvent.spriteAssetId ?? ''}
                  onChange={(e) =>
                    editor.upsertEvent({
                      ...selectedEvent,
                      spriteAssetId: e.target.value || null,
                    })
                  }
                  className="mt-0.5 w-full rounded border border-slate-700 bg-surface-800 px-2 py-1 text-xs text-white"
                >
                  <option value="">Icône par défaut</option>
                  {spriteAssets.map((sp) => (
                    <option key={sp.id} value={sp.id}>
                      {sp.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex cursor-pointer items-center gap-2 text-slate-300">
                <input
                  type="checkbox"
                  checked={selectedEvent.isSolid}
                  onChange={(e) =>
                    editor.upsertEvent({ ...selectedEvent, isSolid: e.target.checked })
                  }
                  className="accent-indigo-500"
                />
                Bloque le passage (isSolid)
              </label>

              {selectedEvent.isSolid && (
                <div className="space-y-1.5 rounded border border-slate-800 bg-surface-900/70 p-2">
                  <div className="flex items-center justify-between text-[10px] text-amber-300">
                    <span className="font-semibold">Empreinte aux pieds (px)</span>
                    <button
                      type="button"
                      onClick={() =>
                        editor.upsertEvent({
                          ...selectedEvent,
                          collider: { offsetX: -16, offsetY: -16, width: 32, height: 16 },
                        })
                      }
                      className="rounded bg-surface-800 px-1.5 py-0.5 text-[9px] text-slate-300 hover:bg-surface-700"
                    >
                      32×16
                    </button>
                  </div>
                  {(() => {
                    const col: ColliderBox =
                      selectedEvent.collider ?? createDefaultFeetCollider(map.tileSize);
                    const patchCollider = (patch: Partial<ColliderBox>) =>
                      editor.upsertEvent({
                        ...selectedEvent,
                        collider: { ...col, ...patch },
                      });
                    return (
                      <div className="grid grid-cols-2 gap-1 text-[10px] text-slate-400">
                        <label>
                          Larg.
                          <input
                            type="number"
                            min={4}
                            max={128}
                            value={col.width}
                            onChange={(e) => {
                              const w = Math.max(4, Number(e.target.value));
                              patchCollider({ width: w, offsetX: -Math.floor(w / 2) });
                            }}
                            className="mt-0.5 w-full rounded border border-slate-700 bg-surface-800 px-1.5 py-0.5 font-mono text-white"
                          />
                        </label>
                        <label>
                          Haut.
                          <input
                            type="number"
                            min={4}
                            max={128}
                            value={col.height}
                            onChange={(e) => {
                              const h = Math.max(4, Number(e.target.value));
                              patchCollider({ height: h, offsetY: -h });
                            }}
                            className="mt-0.5 w-full rounded border border-slate-700 bg-surface-800 px-1.5 py-0.5 font-mono text-white"
                          />
                        </label>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          ) : (
            <p className="text-[11px] text-slate-500">
              Utilisez l’outil <strong>PNJ / Événement (N)</strong> puis cliquez sur une case de la
              map pour lier un dialogue ou un combat.
            </p>
          )}
        </div>

        {/* Player Sprite */}
        <div className="space-y-2 border-b border-slate-800 p-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Personnage Jouable
          </h3>
          <div className="grid grid-cols-2 gap-1.5">
            <select
              value={map.playerAssetId ?? ''}
              onChange={(event) => editor.setPlayerAssetId(event.target.value || null)}
              className="rounded border border-slate-700 bg-surface-800 px-2 py-1 text-xs text-slate-200"
            >
              <option value="">Héros intégré</option>
              {spriteAssets.map((sprite) => (
                <option key={sprite.id} value={sprite.id}>
                  {sprite.name}
                </option>
              ))}
            </select>
            <select
              value={map.playerSpawn.direction}
              onChange={(event) =>
                editor.setSpawnDirection(event.target.value as CardinalDirection)
              }
              className="rounded border border-slate-700 bg-surface-800 px-2 py-1 text-xs text-slate-200"
            >
              <option value="down">Face Bas</option>
              <option value="up">Face Haut</option>
              <option value="left">Face Gauche</option>
              <option value="right">Face Droite</option>
            </select>
          </div>
          {(() => {
            const pCol = map.playerCollider ?? createDefaultFeetCollider(map.tileSize);
            return (
              <div className="grid grid-cols-2 gap-1.5 text-[10px] text-slate-400">
                <label>
                  Hitbox pieds L (px)
                  <input
                    type="number"
                    min={4}
                    max={64}
                    value={pCol.width}
                    onChange={(e) => {
                      const w = Math.max(4, Number(e.target.value));
                      editor.setPlayerCollider({ ...pCol, width: w, offsetX: -Math.floor(w / 2) });
                    }}
                    className="mt-0.5 w-full rounded border border-slate-700 bg-surface-800 px-1.5 py-0.5 font-mono text-xs text-white"
                  />
                </label>
                <label>
                  Hitbox pieds H (px)
                  <input
                    type="number"
                    min={4}
                    max={64}
                    value={pCol.height}
                    onChange={(e) => {
                      const h = Math.max(4, Number(e.target.value));
                      editor.setPlayerCollider({ ...pCol, height: h, offsetY: -h });
                    }}
                    className="mt-0.5 w-full rounded border border-slate-700 bg-surface-800 px-1.5 py-0.5 font-mono text-xs text-white"
                  />
                </label>
              </div>
            );
          })()}
        </div>

        {/* Save Map */}
        <div className="space-y-2 border-b border-slate-800 p-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Map active
          </h3>
          <input
            type="text"
            value={map.name}
            onChange={(event) => editor.setMapName(event.target.value)}
            className="w-full rounded border border-slate-700 bg-surface-800 px-2 py-1 text-xs text-white"
          />
          <button
            type="button"
            disabled={isSaving}
            onClick={() => void handleSaveMap()}
            className="pixel-btn pixel-btn-emerald flex w-full items-center justify-center gap-1.5 px-3 py-1.5 text-[11px] font-bold disabled:opacity-50"
          >
            <PixelSaveIcon size={14} />
            <span>{isSaving ? 'Sauvegarde...' : 'Sauvegarder la Map'}</span>
          </button>
          {feedback && (
            <p
              className={`rounded border px-2 py-1 text-[11px] ${
                feedback.kind === 'ok'
                  ? 'border-emerald-500/40 bg-emerald-950/50 text-emerald-200'
                  : 'border-rose-500/40 bg-rose-950/50 text-rose-200'
              }`}
            >
              {feedback.text}
            </p>
          )}
        </div>

        {/* Create & list project maps */}
        <div className="space-y-2.5 p-3">
          <form onSubmit={handleCreateMap} className="space-y-2 border-b border-slate-800 pb-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Nouvelle Map
            </h3>
            <input
              type="text"
              value={newMapName}
              onChange={(event) => setNewMapName(event.target.value)}
              className="w-full rounded border border-slate-700 bg-surface-800 px-2 py-1 text-xs text-white"
            />
            <div className="grid grid-cols-3 gap-1">
              <input
                type="number"
                min={4}
                max={256}
                value={newMapWidth}
                onChange={(e) => setNewMapWidth(Number(e.target.value))}
                title="Largeur en tuiles"
                className="rounded border border-slate-700 bg-surface-800 px-1.5 py-1 font-mono text-xs text-white"
              />
              <input
                type="number"
                min={4}
                max={256}
                value={newMapHeight}
                onChange={(e) => setNewMapHeight(Number(e.target.value))}
                title="Hauteur en tuiles"
                className="rounded border border-slate-700 bg-surface-800 px-1.5 py-1 font-mono text-xs text-white"
              />
              <input
                type="number"
                min={8}
                max={128}
                value={newMapTileSize}
                onChange={(e) => setNewMapTileSize(Number(e.target.value))}
                title="Taille tuile (px)"
                className="rounded border border-slate-700 bg-surface-800 px-1.5 py-1 font-mono text-xs text-white"
              />
            </div>
            <button
              type="submit"
              className="w-full rounded bg-surface-700 py-1.5 text-xs font-medium text-white hover:bg-indigo-600"
            >
              Créer la map
            </button>
          </form>

          {projectMaps.length > 0 && (
            <div className="space-y-1">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Maps du projet ({projectMaps.length})
              </h3>
              {projectMaps.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => void handleOpenMap(item)}
                  className={`flex w-full items-center justify-between rounded border px-2 py-1.5 text-left text-xs ${
                    item.id === map.id
                      ? 'border-indigo-500/80 bg-indigo-600/20 text-white'
                      : 'border-slate-800 bg-surface-800/50 text-slate-300 hover:bg-surface-800'
                  }`}
                >
                  <span className="truncate font-medium">{item.name}</span>
                  <span className="font-mono text-[10px] text-slate-400">
                    {item.width}×{item.height}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
