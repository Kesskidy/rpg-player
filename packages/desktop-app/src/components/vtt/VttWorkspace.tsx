import { useEffect, useRef, useState } from 'react';
import type {
  MapEvent,
  NarrativeVariableValue,
  ProjectManifest,
  ProjectStorageAdapter,
  RpgDatabase,
  TileMapData,
  VttClientMessage,
  VttRole,
  VttRoomState,
  VttToken,
  VttTokenKind,
} from '@rpg-player/core-types';
import {
  AssetTextureRegistry,
  createDefaultRpgDatabase,
  createEmptyTileMap,
  InventorySystem,
  NarrativeRunner,
  PixiVttViewport,
  type CombatSnapshot,
  type NarrativeStepState,
} from '@rpg-player/rpg-engine';
import { VttClient, VttRoomManager } from '@rpg-player/vtt-network';
import { loadMap, loadRpgDatabase } from '../../storage/project-service';
import { loadScenarioBundle, type LoadedScenarioBundle } from '../../storage/scenario-loader';
import { CombatOverlay } from '../rpg-engine/CombatOverlay';
import { DialogueOverlay } from '../rpg-engine/DialogueOverlay';
import { PixelBookIcon, PixelCrownIcon, PixelDiceIcon, PixelGridIcon } from '../ui/PixelIcons';
import { VttChatDicePanel } from './VttChatDicePanel';
import { VttLobby, type CreateRoomForm, type JoinRoomForm } from './VttLobby';
import { VttSheetPanel } from './VttSheetPanel';

interface VttWorkspaceProps {
  storage: ProjectStorageAdapter;
  project: ProjectManifest | null;
  onProjectLoaded?: (
    storage: ProjectStorageAdapter,
    manifest: ProjectManifest,
    pathLabel: string,
  ) => void;
}

type GmBoardTool = 'move-token' | 'fog-reveal' | 'fog-hide';

interface ActiveSession {
  mode: 'websocket' | 'local-demo';
  roomCode: string;
  participantId: string;
  role: VttRole;
  // Local demo tracks both GM & Player IDs so you can switch perspective in 1 click
  demoGmId?: string;
  demoPlayerId?: string;
}

function createStarterVttMap(tileSize = 32): TileMapData {
  const map = createEmptyTileMap({
    id: 'vtt_donjon_demo',
    name: 'Salle du Donjon (VTT)',
    width: 18,
    height: 12,
    tileSize,
  });
  // Add a few inner pillars as walls on the independent collisionLayer
  for (const [x, y] of [
    [6, 4],
    [6, 5],
    [11, 4],
    [11, 5],
    [8, 7],
    [9, 7],
  ]) {
    map.collisionLayer.cells[y! * map.width + x!] = 1;
  }
  return map;
}

export function VttWorkspace({ storage, project, onProjectLoaded }: VttWorkspaceProps) {
  const [database, setDatabase] = useState<RpgDatabase>(() => createDefaultRpgDatabase());
  const [session, setSession] = useState<ActiveSession | null>(null);
  const [roomState, setRoomState] = useState<VttRoomState | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeScenario, setActiveScenario] = useState<LoadedScenarioBundle | null>(null);
  const [activeDialogue, setActiveDialogue] = useState<{
    runner: NarrativeRunner;
    step: NarrativeStepState;
    inventory: InventorySystem;
  } | null>(null);
  const [activeVttCombat, setActiveVttCombat] = useState<{
    enemyId: string;
    tokenId: string;
    inventory: InventorySystem;
    initialHeroHp: number;
    initialHeroMp: number;
  } | null>(null);
  const scenarioVarsRef = useRef<Record<string, NarrativeVariableValue>>({});
  const [vttViewportReady, setVttViewportReady] = useState(false);

  const [gmTool, setGmTool] = useState<GmBoardTool>('move-token');
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);
  const [rightTab, setRightTab] = useState<'chat' | 'sheet'>('chat');
  const [showGrid, setShowGrid] = useState(true);
  const [copiedCode, setCopiedCode] = useState(false);

  // GM quick-spawn form
  const [spawnName, setSpawnName] = useState('Gobelin');
  const [spawnKind, setSpawnKind] = useState<VttTokenKind>('monster');
  const [spawnHp, setSpawnHp] = useState(40);
  const [spawnLight, setSpawnLight] = useState(0);
  const [spawnSpriteId, setSpawnSpriteId] = useState('');
  const [spawnVisible, setSpawnVisible] = useState(true);
  const [spawnSolid, setSpawnSolid] = useState(true);

  // GM event / music trigger form
  const [announceKind, setAnnounceKind] = useState<'event' | 'music'>('event');
  const [announceTitle, setAnnounceTitle] = useState('Embuscade !');
  const [announceMsg, setAnnounceMsg] = useState('Des bruits de pas résonnent dans le couloir...');

  const clientRef = useRef<VttClient | null>(null);
  const localManagerRef = useRef<VttRoomManager | null>(null);
  const viewportHostRef = useRef<HTMLDivElement | null>(null);
  const registryRef = useRef<AssetTextureRegistry | null>(null);
  const viewportRef = useRef<PixiVttViewport | null>(null);
  const isDraggingBoardRef = useRef(false);
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ clientX: 0, clientY: 0, camX: 0, camY: 0 });

  // Hydrate project RPG database when open
  useEffect(() => {
    if (!project) return;
    let cancelled = false;
    void loadRpgDatabase(storage, project).then((loaded) => {
      if (!cancelled && loaded) setDatabase(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [storage, project?.id]);

  // Cleanup WebSocket on unmount
  useEffect(() => {
    return () => {
      clientRef.current?.disconnect();
    };
  }, []);

  // Mount PixiJS VTT viewport whenever a session starts
  useEffect(() => {
    if (!session) return;
    const host = viewportHostRef.current;
    if (!host) return;

    const registry = new AssetTextureRegistry();
    const viewport = new PixiVttViewport(registry);
    registryRef.current = registry;
    viewportRef.current = viewport;
    setVttViewportReady(false);

    let cancelled = false;
    void viewport.init(host).then(() => {
      if (cancelled) return;
      setVttViewportReady(true);
    });

    return () => {
      cancelled = true;
      setVttViewportReady(false);
      viewport.destroy();
      registry.destroy();
      viewportRef.current = null;
      registryRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.roomCode]);

  // Sync textures cleanly whenever viewport is ready or project/scenario changes
  useEffect(() => {
    if (!vttViewportReady || !registryRef.current || !viewportRef.current) return;
    const effectiveStorage = activeScenario?.adapter ?? storage;
    const effectiveProject = activeScenario?.manifest ?? project;
    let cancelled = false;

    async function syncVttTextures() {
      if (effectiveProject) {
        await registryRef.current!.loadFromStorage(effectiveStorage, effectiveProject.assets);
      } else {
        registryRef.current!.clear();
      }
      if (!cancelled && viewportRef.current && session && roomState) {
        viewportRef.current.syncState(
          roomState,
          session.role,
          session.participantId,
          selectedTokenId,
          showGrid,
        );
        viewportRef.current.forceRebuildMap();
      }
    }
    void syncVttTextures();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vttViewportReady, storage, project?.id, activeScenario?.manifest.id]);

  // Push every state sync into PixiJS VTT renderer
  useEffect(() => {
    if (!session || !roomState || !viewportRef.current) return;
    viewportRef.current.syncState(
      roomState,
      session.role,
      session.participantId,
      selectedTokenId,
      showGrid,
    );
  }, [roomState, session, selectedTokenId, showGrid]);

  // Keyboard arrow / ZQSD step movement for selected token
  useEffect(() => {
    if (!session || !roomState) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement
      ) {
        return;
      }
      if (activeDialogue || activeVttCombat) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key === 'e' || event.key === 'Enter') {
        const prompt = findNearbyScenarioInteraction();
        if (prompt) {
          event.preventDefault();
          triggerNearbyInteraction(prompt);
          return;
        }
      }

      const token =
        roomState!.tokens.find((t) => t.id === selectedTokenId) ??
        roomState!.tokens.find((t) => t.ownerIds.includes(session!.participantId));
      if (!token) return;

      let dx = 0;
      let dy = 0;
      if (key === 'arrowup' || key === 'z' || key === 'w') dy = -1;
      else if (key === 'arrowdown' || key === 's') dy = 1;
      else if (key === 'arrowleft' || key === 'q' || key === 'a') dx = -1;
      else if (key === 'arrowright' || key === 'd') dx = 1;
      else return;

      event.preventDefault();
      sendAction({
        type: 'move_token',
        tokenId: token.id,
        x: token.x + dx,
        y: token.y + dy,
      });
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, roomState, selectedTokenId, activeScenario, activeDialogue, activeVttCombat]);

  async function resolveMapById(mapId: string | null): Promise<TileMapData> {
    if (project && mapId && project.maps?.[mapId]) {
      try {
        return await loadMap(storage, project.maps[mapId]!);
      } catch {
        // Fallback to starter map
      }
    }
    return createStarterVttMap(project?.defaultTileSize ?? 32);
  }

  function sendAction(msg: VttClientMessage) {
    if (!session) return;
    setErrorMessage(null);

    if (session.mode === 'local-demo') {
      const manager = localManagerRef.current;
      if (!manager) return;
      const outcome = manager.handleMessage(session.roomCode, session.participantId, msg);
      if (!outcome.ok) {
        setErrorMessage(outcome.errorMessage ?? 'Action refusée.');
        return;
      }

      // Auto-trigger door / scene teleport when stepping on a teleport tile in Scenario mode (even in Player view!)
      if (msg.type === 'move_token' && activeScenario) {
        const currentState = manager.projectStateFor(session.roomCode, session.participantId);
        const teleportEv = currentState?.activeMap.events.find(
          (ev) => ev.teleport && ev.x === msg.x && ev.y === msg.y,
        );
        if (teleportEv?.teleport && activeScenario.vttPreset.scenes[teleportEv.teleport.targetMapId]) {
          handleSwitchScenarioScene(teleportEv.teleport.targetMapId);
          return;
        }
      }

      const projected = manager.projectStateFor(session.roomCode, session.participantId);
      if (projected) setRoomState(projected);
      return;
    }

    try {
      clientRef.current?.send(msg);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Erreur d’envoi WebSocket.');
    }
  }

  async function handleCreateRoom(form: CreateRoomForm) {
    setConnecting(true);
    setErrorMessage(null);
    try {
      clientRef.current?.disconnect();
      clientRef.current = null;
      const initialMap = await resolveMapById(form.selectedMapId);
      const client = new VttClient({
        onMessage: (serverMsg) => {
          if (serverMsg.type === 'room_joined') {
            setSession({
              mode: 'websocket',
              roomCode: serverMsg.roomCode,
              participantId: serverMsg.participantId,
              role: serverMsg.role,
            });
            setRoomState(serverMsg.state);
          } else if (serverMsg.type === 'state_sync') {
            setRoomState(serverMsg.state);
          } else if (serverMsg.type === 'chat_message') {
            setRoomState((prev) =>
              prev ? { ...prev, chat: [...prev.chat, serverMsg.message] } : prev,
            );
          } else if (serverMsg.type === 'error') {
            setErrorMessage(serverMsg.message);
          }
        },
        onError: (reason) => setErrorMessage(reason),
      });
      clientRef.current = client;
      await client.connect(form.serverUrl);
      client.send({
        type: 'create_room',
        roomName: form.roomName,
        password: form.password || undefined,
        gmName: form.gmName,
        initialMap,
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Connexion impossible.');
    } finally {
      setConnecting(false);
    }
  }

  async function handleJoinRoom(form: JoinRoomForm) {
    setConnecting(true);
    setErrorMessage(null);
    try {
      clientRef.current?.disconnect();
      clientRef.current = null;
      const client = new VttClient({
        onMessage: (serverMsg) => {
          if (serverMsg.type === 'room_joined') {
            setSession({
              mode: 'websocket',
              roomCode: serverMsg.roomCode,
              participantId: serverMsg.participantId,
              role: serverMsg.role,
            });
            setRoomState(serverMsg.state);
          } else if (serverMsg.type === 'state_sync') {
            setRoomState(serverMsg.state);
          } else if (serverMsg.type === 'chat_message') {
            setRoomState((prev) =>
              prev ? { ...prev, chat: [...prev.chat, serverMsg.message] } : prev,
            );
          } else if (serverMsg.type === 'error') {
            setErrorMessage(serverMsg.message);
          }
        },
        onError: (reason) => setErrorMessage(reason),
      });
      clientRef.current = client;
      await client.connect(form.serverUrl);
      client.send({
        type: 'join_room',
        roomCode: form.roomCode,
        password: form.password || undefined,
        playerName: form.playerName,
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Connexion impossible.');
    } finally {
      setConnecting(false);
    }
  }

  async function handleStartLocalDemo(
    gmName: string,
    playerName: string,
    selectedMapId: string | null,
  ) {
    setErrorMessage(null);
    const initialMap = await resolveMapById(selectedMapId);
    const manager = new VttRoomManager();
    localManagerRef.current = manager;

    const created = manager.handleMessage(null, null, {
      type: 'create_room',
      roomName: 'Table Démo Locale',
      gmName,
      initialMap,
    });
    const roomCode = created.roomCode!;
    const gmId = created.participantId!;

    const joined = manager.handleMessage(null, null, {
      type: 'join_room',
      roomCode,
      playerName,
    });
    const playerId = joined.participantId!;

    // Seed a goblin inside the fog so switching GM <-> Player immediately shows Fog of War filtering
    manager.handleMessage(roomCode, gmId, {
      type: 'spawn_token',
      token: {
        name: 'Gobelin embusqué',
        kind: 'monster',
        x: 2,
        y: 2,
        color: '#ef4444',
        spriteAssetId: null,
        ownerIds: [],
        hp: 45,
        maxHp: 45,
        mp: 10,
        maxMp: 10,
        lightRadius: 0,
        visibleToPlayers: true,
      },
    });

    setSession({
      mode: 'local-demo',
      roomCode,
      participantId: gmId,
      role: 'gm',
      demoGmId: gmId,
      demoPlayerId: playerId,
    });
    setRoomState(manager.projectStateFor(roomCode, gmId));
  }

  function applyScenarioSceneToManager(
    manager: VttRoomManager,
    roomCode: string,
    gmId: string,
    playerId: string,
    bundle: LoadedScenarioBundle,
    sceneId: string,
    changeMapFirst: boolean,
  ) {
    const scenePreset = bundle.vttPreset.scenes[sceneId];
    const targetMap = bundle.maps[sceneId];
    if (!scenePreset || !targetMap) return;

    if (changeMapFirst) {
      manager.handleMessage(roomCode, gmId, {
        type: 'change_map',
        map: targetMap,
        hideAllFog: scenePreset.fogEnabled,
      });
    }

    // Clear existing tokens and spawn scenario tokens cleanly
    const current = manager.projectStateFor(roomCode, gmId);
    if (current) {
      for (const existingTok of current.tokens) {
        manager.handleMessage(roomCode, gmId, {
          type: 'remove_token',
          tokenId: existingTok.id,
        });
      }
    }

    for (const tokSpec of scenePreset.tokens) {
      const { ownerRole, ...tokenData } = tokSpec;
      manager.handleMessage(roomCode, gmId, {
        type: 'spawn_token',
        token: {
          ...tokenData,
          ownerIds: ownerRole === 'player' ? [playerId] : [gmId],
        },
      });
    }

    // Configure Fog of War: OFF in Tavern, ON in Dungeon (with spawn area revealed)
    manager.handleMessage(roomCode, gmId, {
      type: 'update_fog',
      action: 'set_enabled',
      enabled: scenePreset.fogEnabled,
    });
    if (!scenePreset.fogEnabled) {
      manager.handleMessage(roomCode, gmId, { type: 'update_fog', action: 'reveal_all' });
    } else {
      manager.handleMessage(roomCode, gmId, { type: 'update_fog', action: 'hide_all' });
      const radius = scenePreset.revealSpawnRadius || 4;
      const cells: Array<{ x: number; y: number; hidden: boolean }> = [];
      const cx = targetMap.playerSpawn.x;
      const cy = targetMap.playerSpawn.y;
      for (let y = Math.max(0, cy - radius); y <= Math.min(targetMap.height - 1, cy + radius); y += 1) {
        for (let x = Math.max(0, cx - radius); x <= Math.min(targetMap.width - 1, cx + radius); x += 1) {
          if (Math.hypot(x - cx, y - cy) <= radius + 0.5) {
            cells.push({ x, y, hidden: false });
          }
        }
      }
      if (cells.length > 0) {
        manager.handleMessage(roomCode, gmId, { type: 'update_fog', cells });
      }
    }
  }

  async function handleLoadTavernScenario() {
    setConnecting(true);
    setErrorMessage(null);
    try {
      const bundle = await loadScenarioBundle('quete_taverne');
      setActiveScenario(bundle);
      setDatabase(bundle.database);
      onProjectLoaded?.(
        bundle.adapter,
        bundle.manifest,
        'scenarios/quete_taverne (La Prime de la Taverne)',
      );

      const initialSceneId = bundle.vttPreset.initialSceneId;
      const initialMap = bundle.maps[initialSceneId];
      if (!initialMap) {
        throw new Error(`Scène initiale introuvable : ${initialSceneId}`);
      }

      const manager = new VttRoomManager();
      localManagerRef.current = manager;

      const created = manager.handleMessage(null, null, {
        type: 'create_room',
        roomName: bundle.vttPreset.title,
        gmName: 'Maître du Jeu',
        initialMap,
      });
      const roomCode = created.roomCode!;
      const gmId = created.participantId!;

      const joined = manager.handleMessage(null, null, {
        type: 'join_room',
        roomCode,
        playerName: bundle.vttPreset.playerSheet.characterName,
      });
      const playerId = joined.participantId!;

      // Apply pre-filled Adventurer character sheet (60 PV, sword + 1 potion)
      manager.handleMessage(roomCode, gmId, {
        type: 'update_sheet',
        participantId: playerId,
        patch: bundle.vttPreset.playerSheet,
      });

      // Populate Act 1 (Taverne, fog OFF)
      applyScenarioSceneToManager(manager, roomCode, gmId, playerId, bundle, initialSceneId, false);

      // Send intro RP & GM announcement
      for (const msg of bundle.vttPreset.introChatMessages) {
        if (msg.channel === 'rp' || msg.channel === 'hrp') {
          manager.handleMessage(roomCode, gmId, {
            type: 'send_chat',
            channel: msg.channel,
            text: msg.text,
          });
        }
      }
      manager.handleMessage(roomCode, gmId, {
        type: 'gm_trigger_event',
        kind: bundle.vttPreset.introAnnouncement.kind,
        title: bundle.vttPreset.introAnnouncement.title,
        message: bundle.vttPreset.introAnnouncement.message,
      });

      setSession({
        mode: 'local-demo',
        roomCode,
        participantId: gmId,
        role: 'gm',
        demoGmId: gmId,
        demoPlayerId: playerId,
      });
      setRoomState(manager.projectStateFor(roomCode, gmId));
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Impossible de charger le scénario « La Prime de la Taverne ».',
      );
    } finally {
      setConnecting(false);
    }
  }

  function handleSwitchScenarioScene(sceneId: string) {
    if (!activeScenario || !session || session.mode !== 'local-demo' || !localManagerRef.current) {
      return;
    }
    const gmId = session.demoGmId!;
    const playerId = session.demoPlayerId!;
    applyScenarioSceneToManager(
      localManagerRef.current,
      session.roomCode,
      gmId,
      playerId,
      activeScenario,
      sceneId,
      true,
    );
    const scenePreset = activeScenario.vttPreset.scenes[sceneId];
    if (scenePreset) {
      localManagerRef.current.handleMessage(session.roomCode, gmId, {
        type: 'gm_trigger_event',
        kind: 'event',
        title: scenePreset.label,
        message: scenePreset.gmNotes,
      });
    }
    setSelectedTokenId(null);
    setRoomState(localManagerRef.current.projectStateFor(session.roomCode, session.participantId));
  }

  function syncInventoryBackToPlayerSheet(inv: InventorySystem) {
    if (!session || session.mode !== 'local-demo' || !localManagerRef.current) return;
    const gmId = session.demoGmId!;
    const playerId = session.demoPlayerId!;
    localManagerRef.current.handleMessage(session.roomCode, gmId, {
      type: 'update_sheet',
      participantId: playerId,
      patch: {
        inventory: inv.toFlatSlots(),
        gold: inv.getGold(),
      },
    });
    setRoomState(localManagerRef.current.projectStateFor(session.roomCode, session.participantId));
  }

  function createInventoryFromPlayerSheet(): InventorySystem {
    const inv = new InventorySystem(database);
    if (session?.demoPlayerId && roomState?.sheets[session.demoPlayerId]) {
      const sheet = roomState.sheets[session.demoPlayerId]!;
      inv.replaceFromSnapshot(sheet.inventory, sheet.gold);
    }
    return inv;
  }

  function handleOpenScenarioDialogue(narrativeId: string) {
    const graph = activeScenario?.narratives[narrativeId];
    if (!graph) return;
    const inv = createInventoryFromPlayerSheet();
    const runner = new NarrativeRunner(graph, {
      inventory: inv,
      variables: scenarioVarsRef.current,
    });
    const step = runner.start();
    syncInventoryBackToPlayerSheet(inv);
    if (step.status !== 'ended') {
      setActiveDialogue({ runner, step, inventory: inv });
    }
  }

  type NearbyInteraction =
    | { kind: 'teleport'; label: string; targetMapId: string }
    | { kind: 'dialogue'; label: string; narrativeId: string }
    | { kind: 'combat'; label: string; enemyId: string; token: VttToken };

  function findNearbyScenarioInteraction(): NearbyInteraction | null {
    if (!activeScenario || !roomState || !session) return null;
    const playerToken =
      roomState.tokens.find((t) => t.kind === 'player' && t.ownerIds.includes(session.participantId)) ??
      roomState.tokens.find((t) => t.kind === 'player');
    if (!playerToken) return null;

    // 1. Check nearby teleport door (distance <= 1.5 tiles)
    for (const ev of roomState.activeMap.events) {
      if (ev.teleport && activeScenario.vttPreset.scenes[ev.teleport.targetMapId]) {
        const dist = Math.hypot(playerToken.x - ev.x, playerToken.y - ev.y);
        if (dist <= 1.5) {
          const targetLabel =
            activeScenario.vttPreset.scenes[ev.teleport.targetMapId]?.label ?? ev.name;
          return {
            kind: 'teleport',
            label: `Franchir la porte → ${targetLabel}`,
            targetMapId: ev.teleport.targetMapId,
          };
        }
      }
    }

    // 2. Check nearby narrative NPC or Chest (distance <= 2.2 for NPC behind counter, 1.5 for chest)
    for (const ev of roomState.activeMap.events) {
      if (ev.narrativeId && activeScenario.narratives[ev.narrativeId]) {
        const maxDist = ev.kind === 'npc' ? 2.2 : 1.5;
        if (Math.hypot(playerToken.x - ev.x, playerToken.y - ev.y) <= maxDist) {
          return {
            kind: 'dialogue',
            label: ev.kind === 'chest' ? `Ouvrir : ${ev.name}` : `Parler : ${ev.name}`,
            narrativeId: ev.narrativeId,
          };
        }
      }
    }

    // 3. Check adjacent living monster token on board (distance <= 1.6)
    for (const tok of roomState.tokens) {
      if (tok.kind !== 'monster' || tok.hp <= 0) continue;
      if (Math.hypot(playerToken.x - tok.x, playerToken.y - tok.y) <= 1.6) {
        const enemyId = tok.name.toLowerCase().includes('boss')
          ? 'boss_ogre_sombre'
          : 'sbire_donjon';
        if (database.enemies[enemyId]) {
          return {
            kind: 'combat',
            label: `Combattre : ${tok.name}`,
            enemyId,
            token: tok,
          };
        }
      }
    }

    return null;
  }

  function triggerNearbyInteraction(interaction: NearbyInteraction) {
    if (interaction.kind === 'teleport') {
      handleSwitchScenarioScene(interaction.targetMapId);
      return;
    }
    if (interaction.kind === 'dialogue') {
      handleOpenScenarioDialogue(interaction.narrativeId);
      return;
    }
    if (interaction.kind === 'combat') {
      const inv = createInventoryFromPlayerSheet();
      if (inv.hasItem('epee_basique')) {
        inv.equipItem('epee_basique');
      }
      const sheet = session?.demoPlayerId ? roomState?.sheets[session.demoPlayerId] : null;
      setActiveVttCombat({
        enemyId: interaction.enemyId,
        tokenId: interaction.token.id,
        inventory: inv,
        initialHeroHp: sheet?.hp ?? database.hero.stats.maxHp,
        initialHeroMp: sheet?.mp ?? database.hero.stats.maxMp,
      });
    }
  }

  function handleFinishVttCombat(finalSnap: CombatSnapshot) {
    if (!activeVttCombat || !session || session.mode !== 'local-demo' || !localManagerRef.current) {
      setActiveVttCombat(null);
      return;
    }
    const manager = localManagerRef.current;
    const gmId = session.demoGmId!;
    const playerId = session.demoPlayerId!;

    // Update hero sheet HP/MP/inventory/gold
    const nextHp =
      finalSnap.phase === 'defeat'
        ? Math.max(1, Math.round(finalSnap.hero.stats.maxHp * 0.5))
        : Math.max(1, finalSnap.hero.hp);
    manager.handleMessage(session.roomCode, gmId, {
      type: 'update_sheet',
      participantId: playerId,
      patch: {
        hp: nextHp,
        mp: finalSnap.hero.mp,
        inventory: activeVttCombat.inventory.toFlatSlots(),
        gold: activeVttCombat.inventory.getGold(),
      },
    });

    // Sync hero token HP & remove or damage defeated monster token on board
    const fullState = manager.projectStateFor(session.roomCode, gmId);
    const heroTok = fullState?.tokens.find((t) => t.kind === 'player');
    if (heroTok) {
      manager.handleMessage(session.roomCode, gmId, {
        type: 'update_token',
        tokenId: heroTok.id,
        patch: { hp: nextHp, mp: finalSnap.hero.mp },
      });
    }

    if (finalSnap.phase === 'victory') {
      manager.handleMessage(session.roomCode, gmId, {
        type: 'remove_token',
        tokenId: activeVttCombat.tokenId,
      });
      manager.handleMessage(session.roomCode, gmId, {
        type: 'gm_trigger_event',
        kind: 'event',
        title: `Victoire contre ${finalSnap.enemy.name} !`,
        message: finalSnap.rewardSummary ? `Butin : ${finalSnap.rewardSummary}` : 'Ennemi éliminé.',
      });
    } else {
      manager.handleMessage(session.roomCode, gmId, {
        type: 'update_token',
        tokenId: activeVttCombat.tokenId,
        patch: { hp: Math.max(1, finalSnap.enemy.hp) },
      });
    }

    setActiveVttCombat(null);
    setRoomState(manager.projectStateFor(session.roomCode, session.participantId));
  }

  function handleToggleDemoRole() {
    if (!session || session.mode !== 'local-demo' || !localManagerRef.current) return;
    const nextRole: VttRole = session.role === 'gm' ? 'player' : 'gm';
    const nextParticipantId =
      nextRole === 'gm' ? session.demoGmId! : session.demoPlayerId!;
    const nextSession: ActiveSession = {
      ...session,
      role: nextRole,
      participantId: nextParticipantId,
    };
    setSession(nextSession);
    setGmTool('move-token');
    setSelectedTokenId(null);
    setRoomState(localManagerRef.current.projectStateFor(session.roomCode, nextParticipantId));
  }

  function handleLeaveRoom() {
    clientRef.current?.disconnect();
    clientRef.current = null;
    localManagerRef.current = null;
    setSession(null);
    setRoomState(null);
    setSelectedTokenId(null);
    setActiveDialogue(null);
    setActiveVttCombat(null);
    setErrorMessage(null);
  }

  async function handleChangeScene(mapId: string) {
    if (activeScenario?.vttPreset.scenes[mapId]) {
      handleSwitchScenarioScene(mapId);
      return;
    }
    const nextMap = await resolveMapById(mapId || null);
    sendAction({ type: 'change_map', map: nextMap, hideAllFog: true });
  }

  function handleBoardPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    const viewport = viewportRef.current;
    if (!viewport || !roomState || !session) return;

    if (event.button === 1 || event.button === 2) {
      event.preventDefault();
      const cam = viewport.getCamera();
      isPanningRef.current = true;
      panStartRef.current = {
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

    // GM Fog painting
    if (session.role === 'gm' && (gmTool === 'fog-reveal' || gmTool === 'fog-hide')) {
      isDraggingBoardRef.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      sendAction({
        type: 'update_fog',
        cells: [{ x: tile.tx, y: tile.ty, hidden: gmTool === 'fog-hide' }],
      });
      return;
    }

    // Token selection / click-to-move
    const tokenOnTile = roomState.tokens.find((t) => t.x === tile.tx && t.y === tile.ty);
    if (tokenOnTile) {
      const canControl =
        session.role === 'gm' || tokenOnTile.ownerIds.includes(session.participantId);
      if (canControl) {
        setSelectedTokenId(tokenOnTile.id);
        return;
      }
    }

    if (selectedTokenId) {
      sendAction({
        type: 'move_token',
        tokenId: selectedTokenId,
        x: tile.tx,
        y: tile.ty,
      });
    }
  }

  function handleBoardPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const viewport = viewportRef.current;
    if (!viewport || !session) return;

    if (isPanningRef.current) {
      const dx = event.clientX - panStartRef.current.clientX;
      const dy = event.clientY - panStartRef.current.clientY;
      viewport.setCamera({
        x: panStartRef.current.camX + dx,
        y: panStartRef.current.camY + dy,
      });
      return;
    }

    const tile = viewport.screenToTile(event.clientX, event.clientY);
    viewport.setHoverTile(tile);

    if (
      isDraggingBoardRef.current &&
      tile &&
      session.role === 'gm' &&
      (gmTool === 'fog-reveal' || gmTool === 'fog-hide')
    ) {
      sendAction({
        type: 'update_fog',
        cells: [{ x: tile.tx, y: tile.ty, hidden: gmTool === 'fog-hide' }],
      });
    }
  }

  function handleBoardPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    isDraggingBoardRef.current = false;
    isPanningRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleWheel(event: React.WheelEvent<HTMLDivElement>) {
    const viewport = viewportRef.current;
    if (!viewport) return;
    event.preventDefault();
    const cam = viewport.getCamera();
    const delta = event.deltaY < 0 ? 0.5 : -0.5;
    viewport.setCamera({ zoom: Math.max(0.5, Math.min(6, cam.zoom + delta)) });
  }

  if (!session || !roomState) {
    return (
      <VttLobby
        project={project}
        connecting={connecting}
        errorMessage={errorMessage}
        onCreateRoom={(form) => void handleCreateRoom(form)}
        onJoinRoom={(form) => void handleJoinRoom(form)}
        onStartLocalDemo={(gm, plr, mapId) => void handleStartLocalDemo(gm, plr, mapId)}
        onLoadTavernScenario={() => void handleLoadTavernScenario()}
      />
    );
  }

  const isGm = session.role === 'gm';
  const selectedToken = roomState.tokens.find((t) => t.id === selectedTokenId) ?? null;
  const projectMaps = project?.maps ? Object.values(project.maps) : [];
  const spriteAssets = project
    ? Object.values(project.assets).filter((a) => a.type === 'sprite')
    : [];
  const players = roomState.participants.filter((p) => p.role === 'player');
  const nearbyInteraction = findNearbyScenarioInteraction();
  void (undefined as unknown as MapEvent);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* VTT Session Top Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-dnd-border bg-dnd-stone px-4 py-1.5 text-xs">
        <div className="flex items-center gap-3">
          {isGm ? (
            <span className="pixel-badge-gm inline-flex items-center gap-1.5 px-2.5 py-0.5 text-[10px] font-bold uppercase">
              <PixelCrownIcon size={14} />
              <span>Maître du Jeu</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 border-2 border-dnd-arcane bg-indigo-950/70 px-2.5 py-0.5 font-pixel text-[10px] font-bold uppercase text-dnd-parchment shadow-pixel-sm">
              <PixelDiceIcon size={14} />
              <span>Joueur</span>
            </span>
          )}
          <span className="font-pixel text-xs font-bold text-dnd-parchment">
            {roomState.roomName}
          </span>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(roomState.roomCode);
              setCopiedCode(true);
              setTimeout(() => setCopiedCode(false), 1500);
            }}
            className="pixel-btn px-2 py-0.5 font-mono text-[11px] text-dnd-gold"
            title="Copier le code d’invitation"
          >
            Code : {roomState.roomCode} {copiedCode ? '✓' : '⊞'}
          </button>
          <span className="text-[11px] text-dnd-muted">
            {roomState.participants.filter((p) => p.connected).length} connecté(s)
          </span>
        </div>

        <div className="flex items-center gap-2">
          {activeScenario?.narratives['quete_femme_guichet'] && (
            <button
              type="button"
              onClick={() => handleOpenScenarioDialogue('quete_femme_guichet')}
              className="pixel-btn pixel-btn-gold flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold"
            >
              <PixelBookIcon size={13} />
              <span>Dialogue Guichet</span>
            </button>
          )}
          {session.mode === 'local-demo' && (
            <button
              type="button"
              onClick={handleToggleDemoRole}
              className="pixel-btn pixel-btn-emerald px-3 py-1 text-[11px] font-bold"
            >
              Basculer : {isGm ? 'Vue Joueur' : 'Vue MJ'}
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowGrid((g) => !g)}
            className="pixel-btn flex items-center gap-1 px-2.5 py-1 text-[11px]"
          >
            <PixelGridIcon size={13} />
            <span>Grille : {showGrid ? 'ON' : 'OFF'}</span>
          </button>
          <button
            type="button"
            onClick={handleLeaveRoom}
            className="pixel-btn pixel-btn-dragon px-2.5 py-1 text-[11px] font-bold"
          >
            Quitter
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="flex items-center justify-between border-b border-rose-500/40 bg-rose-950/60 px-4 py-1 text-xs text-rose-200">
          <span>{errorMessage}</span>
          <button type="button" onClick={() => setErrorMessage(null)}>
            ×
          </button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Left Dock: GM Admin Controls (visible ONLY to GM) */}
        {isGm && (
          <aside className="flex w-72 flex-col space-y-3 overflow-y-auto border-r-2 border-dnd-border bg-dnd-stone p-3 text-xs">
            {/* Active Scenario GM Quick Acts & Notes */}
            {activeScenario && (
              <div className="space-y-2 border-b-2 border-dnd-border pb-3">
                <h3 className="font-pixel text-[10px] font-bold uppercase tracking-wider text-dnd-gold">
                  Scénario : {activeScenario.vttPreset.title}
                </h3>
                <div className="grid grid-cols-1 gap-1.5">
                  {Object.values(activeScenario.vttPreset.scenes).map((sc) => (
                    <button
                      key={sc.mapId}
                      type="button"
                      onClick={() => handleSwitchScenarioScene(sc.mapId)}
                      className={`pixel-btn px-2 py-1.5 text-left text-[10px] font-bold ${
                        roomState.activeMap.id === sc.mapId ? 'pixel-btn-gold' : ''
                      }`}
                    >
                      {sc.label}
                    </button>
                  ))}
                </div>
                {activeScenario.vttPreset.scenes[roomState.activeMap.id]?.gmNotes && (
                  <p className="border-2 border-dnd-border bg-dnd-obsidian p-2 text-[10px] leading-relaxed text-dnd-muted">
                    <strong className="text-dnd-gold">Aide MJ : </strong>
                    {activeScenario.vttPreset.scenes[roomState.activeMap.id]?.gmNotes}
                  </p>
                )}
              </div>
            )}

            {/* Scene / Map Switcher */}
            <div className="space-y-1.5 border-b border-slate-800 pb-3">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-amber-300">
                Scène Active (MJ)
              </h3>
              <select
                value={roomState.activeMap.id}
                onChange={(e) => void handleChangeScene(e.target.value)}
                className="w-full rounded border border-slate-700 bg-surface-800 px-2 py-1.5 text-xs text-white"
              >
                <option value="">Donjon Démo (18×12)</option>
                {projectMaps.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.width}×{m.height})
                  </option>
                ))}
              </select>
            </div>

            {/* Fog of War Controls */}
            <div className="space-y-2 border-b border-slate-800 pb-3">
              <div className="flex items-center justify-between">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-amber-300">
                  Brouillard de Guerre
                </h3>
                <button
                  type="button"
                  onClick={() =>
                    sendAction({
                      type: 'update_fog',
                      action: 'set_enabled',
                      enabled: !roomState.fogEnabled,
                    })
                  }
                  className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                    roomState.fogEnabled
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {roomState.fogEnabled ? 'ACTIF' : 'OFF'}
                </button>
              </div>

              <div className="grid grid-cols-3 gap-1">
                <button
                  type="button"
                  onClick={() => setGmTool('move-token')}
                  className={`rounded py-1 text-[10px] font-semibold ${
                    gmTool === 'move-token'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-surface-800 text-slate-300'
                  }`}
                >
                  Tokens
                </button>
                <button
                  type="button"
                  onClick={() => setGmTool('fog-reveal')}
                  className={`rounded py-1 text-[10px] font-semibold ${
                    gmTool === 'fog-reveal'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-surface-800 text-slate-300'
                  }`}
                >
                  Révéler
                </button>
                <button
                  type="button"
                  onClick={() => setGmTool('fog-hide')}
                  className={`rounded py-1 text-[10px] font-semibold ${
                    gmTool === 'fog-hide'
                      ? 'bg-rose-600 text-white'
                      : 'bg-surface-800 text-slate-300'
                  }`}
                >
                  Masquer
                </button>
              </div>

              <div className="grid grid-cols-2 gap-1">
                <button
                  type="button"
                  onClick={() => sendAction({ type: 'update_fog', action: 'reveal_all' })}
                  className="rounded bg-surface-800 py-1 text-[11px] text-slate-200 hover:bg-surface-700"
                >
                  Tout révéler
                </button>
                <button
                  type="button"
                  onClick={() => sendAction({ type: 'update_fog', action: 'hide_all' })}
                  className="rounded bg-surface-800 py-1 text-[11px] text-slate-200 hover:bg-surface-700"
                >
                  Tout masquer
                </button>
              </div>
            </div>

            {/* Spawn Token on the fly */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendAction({
                  type: 'spawn_token',
                  token: {
                    name: spawnName.trim() || 'PNJ',
                    kind: spawnKind,
                    x: roomState.activeMap.playerSpawn.x,
                    y: roomState.activeMap.playerSpawn.y,
                    color:
                      spawnKind === 'monster'
                        ? '#ef4444'
                        : spawnKind === 'npc'
                          ? '#06b6d4'
                          : '#38bdf8',
                    spriteAssetId: spawnSpriteId || null,
                    ownerIds: [session.participantId],
                    hp: spawnHp,
                    maxHp: spawnHp,
                    mp: 10,
                    maxMp: 10,
                    lightRadius: spawnLight,
                    visibleToPlayers: spawnVisible,
                    isSolid: spawnSolid,
                  },
                });
              }}
              className="space-y-2 border-b border-slate-800 pb-3"
            >
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-amber-300">
                Spawn PNJ / Monstre
              </h3>
              <div className="grid grid-cols-2 gap-1.5">
                <input
                  type="text"
                  value={spawnName}
                  onChange={(e) => setSpawnName(e.target.value)}
                  placeholder="Nom"
                  className="rounded border border-slate-700 bg-surface-800 px-2 py-1 text-xs text-white"
                />
                <select
                  value={spawnKind}
                  onChange={(e) => setSpawnKind(e.target.value as VttTokenKind)}
                  className="rounded border border-slate-700 bg-surface-800 px-1.5 py-1 text-xs text-white"
                >
                  <option value="monster">Monstre</option>
                  <option value="npc">PNJ</option>
                  <option value="player">Allié</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <label className="text-[10px] text-slate-400">
                  PV
                  <input
                    type="number"
                    min={1}
                    value={spawnHp}
                    onChange={(e) => setSpawnHp(Math.max(1, Number(e.target.value)))}
                    className="mt-0.5 w-full rounded border border-slate-700 bg-surface-800 px-2 py-1 font-mono text-xs text-white"
                  />
                </label>
                <label className="text-[10px] text-slate-400">
                  Lumière (cases)
                  <input
                    type="number"
                    min={0}
                    max={12}
                    value={spawnLight}
                    onChange={(e) => setSpawnLight(Math.max(0, Number(e.target.value)))}
                    className="mt-0.5 w-full rounded border border-slate-700 bg-surface-800 px-2 py-1 font-mono text-xs text-white"
                  />
                </label>
              </div>
              {spriteAssets.length > 0 && (
                <select
                  value={spawnSpriteId}
                  onChange={(e) => setSpawnSpriteId(e.target.value)}
                  className="w-full rounded border border-slate-700 bg-surface-800 px-2 py-1 text-xs text-white"
                >
                  <option value="">Pion coloré (par défaut)</option>
                  {spriteAssets.map((sp) => (
                    <option key={sp.id} value={sp.id}>
                      Sprite : {sp.name}
                    </option>
                  ))}
                </select>
              )}
              <label className="flex items-center gap-2 text-[11px] text-slate-300">
                <input
                  type="checkbox"
                  checked={spawnVisible}
                  onChange={(e) => setSpawnVisible(e.target.checked)}
                  className="accent-amber-500"
                />
                Visible pour les joueurs
              </label>
              <label className="flex items-center gap-2 text-[11px] text-slate-300">
                <input
                  type="checkbox"
                  checked={spawnSolid}
                  onChange={(e) => setSpawnSolid(e.target.checked)}
                  className="accent-amber-500"
                />
                Bloque le passage (isSolid)
              </label>
              <button
                type="submit"
                className="w-full rounded bg-amber-600 py-1.5 text-xs font-semibold text-white hover:bg-amber-500"
              >
                + Faire apparaître
              </button>
            </form>

            {/* Selected Token Permissions & Controls */}
            {selectedToken && (
              <div className="space-y-2 border-b border-slate-800 pb-3">
                <div className="flex items-center justify-between">
                  <h3 className="truncate text-[11px] font-semibold uppercase text-cyan-300">
                    Token : {selectedToken.name}
                  </h3>
                  <button
                    type="button"
                    onClick={() => {
                      sendAction({ type: 'remove_token', tokenId: selectedToken.id });
                      setSelectedTokenId(null);
                    }}
                    className="text-[10px] text-rose-400 hover:underline"
                  >
                    Retirer
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  <label className="text-[10px] text-slate-400">
                    PV ({selectedToken.hp}/{selectedToken.maxHp})
                    <input
                      type="number"
                      value={selectedToken.hp}
                      onChange={(e) =>
                        sendAction({
                          type: 'update_token',
                          tokenId: selectedToken.id,
                          patch: { hp: Math.max(0, Number(e.target.value)) },
                        })
                      }
                      className="mt-0.5 w-full rounded border border-slate-700 bg-surface-800 px-1.5 py-1 font-mono text-xs text-white"
                    />
                  </label>
                  <label className="text-[10px] text-slate-400">
                    Lumière
                    <input
                      type="number"
                      min={0}
                      max={12}
                      value={selectedToken.lightRadius}
                      onChange={(e) =>
                        sendAction({
                          type: 'update_token',
                          tokenId: selectedToken.id,
                          patch: { lightRadius: Math.max(0, Number(e.target.value)) },
                        })
                      }
                      className="mt-0.5 w-full rounded border border-slate-700 bg-surface-800 px-1.5 py-1 font-mono text-xs text-white"
                    />
                  </label>
                </div>

                <label className="flex items-center gap-2 text-[11px] text-slate-300">
                  <input
                    type="checkbox"
                    checked={selectedToken.visibleToPlayers}
                    onChange={(e) =>
                      sendAction({
                        type: 'update_token',
                        tokenId: selectedToken.id,
                        patch: { visibleToPlayers: e.target.checked },
                      })
                    }
                    className="accent-indigo-500"
                  />
                  Visible aux joueurs
                </label>

                <label className="flex items-center gap-2 text-[11px] text-slate-300">
                  <input
                    type="checkbox"
                    checked={selectedToken.isSolid ?? true}
                    onChange={(e) =>
                      sendAction({
                        type: 'update_token',
                        tokenId: selectedToken.id,
                        patch: { isSolid: e.target.checked },
                      })
                    }
                    className="accent-amber-500"
                  />
                  Bloque le passage (isSolid)
                </label>

                {players.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-[10px] text-slate-400">
                      Permissions de déplacement :
                    </span>
                    {players.map((plr) => {
                      const allowed = selectedToken.ownerIds.includes(plr.id);
                      return (
                        <label
                          key={plr.id}
                          className="flex items-center gap-2 text-[11px] text-slate-200"
                        >
                          <input
                            type="checkbox"
                            checked={allowed}
                            onChange={(e) => {
                              const nextOwners = e.target.checked
                                ? [...selectedToken.ownerIds, plr.id]
                                : selectedToken.ownerIds.filter((id) => id !== plr.id);
                              sendAction({
                                type: 'update_token',
                                tokenId: selectedToken.id,
                                patch: { ownerIds: nextOwners },
                              });
                            }}
                            className="accent-cyan-500"
                          />
                          {plr.name}
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* GM Trigger Event / Music */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendAction({
                  type: 'gm_trigger_event',
                  kind: announceKind,
                  title: announceTitle,
                  message: announceMsg,
                });
              }}
              className="space-y-2"
            >
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-amber-300">
                Événement / Musique
              </h3>
              <div className="grid grid-cols-2 gap-1">
                <button
                  type="button"
                  onClick={() => setAnnounceKind('event')}
                  className={`rounded py-1 text-[10px] font-bold ${
                    announceKind === 'event'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-surface-800 text-slate-400'
                  }`}
                >
                  ★ Événement
                </button>
                <button
                  type="button"
                  onClick={() => setAnnounceKind('music')}
                  className={`rounded py-1 text-[10px] font-bold ${
                    announceKind === 'music'
                      ? 'bg-purple-600 text-white'
                      : 'bg-surface-800 text-slate-400'
                  }`}
                >
                  ♪ Musique
                </button>
              </div>
              <input
                type="text"
                value={announceTitle}
                onChange={(e) => setAnnounceTitle(e.target.value)}
                placeholder="Titre"
                className="w-full rounded border border-slate-700 bg-surface-800 px-2 py-1 text-xs text-white"
              />
              <input
                type="text"
                value={announceMsg}
                onChange={(e) => setAnnounceMsg(e.target.value)}
                placeholder="Description / Piste"
                className="w-full rounded border border-slate-700 bg-surface-800 px-2 py-1 text-xs text-white"
              />
              <button
                type="submit"
                className="w-full rounded bg-indigo-600 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500"
              >
                Diffuser à la table
              </button>
            </form>
          </aside>
        )}

        {/* Center: Shared PixiJS VTT Board */}
        <section className="relative flex flex-1 flex-col overflow-hidden bg-surface-950">
          {roomState.activeAnnouncement && (
            <div className="z-20 flex items-center justify-between border-b border-indigo-500/40 bg-indigo-950/70 px-4 py-1.5 text-xs text-indigo-100">
              <span>
                <strong>
                  {roomState.activeAnnouncement.kind === 'music' ? '♪ ' : '★ '}
                  {roomState.activeAnnouncement.title}
                </strong>
                {roomState.activeAnnouncement.message
                  ? ` — ${roomState.activeAnnouncement.message}`
                  : ''}
              </span>
            </div>
          )}

          <div
            ref={viewportHostRef}
            onPointerDown={handleBoardPointerDown}
            onPointerMove={handleBoardPointerMove}
            onPointerUp={handleBoardPointerUp}
            onWheel={handleWheel}
            onContextMenu={(e) => e.preventDefault()}
            className="relative flex-1 cursor-crosshair overflow-hidden"
          />

          {nearbyInteraction && (
            <div className="absolute bottom-14 left-1/2 z-30 -translate-x-1/2">
              <button
                type="button"
                onClick={() => triggerNearbyInteraction(nearbyInteraction)}
                className="pixel-btn pixel-btn-gold flex items-center gap-2 px-4 py-2 text-xs font-bold shadow-pixel-lg"
              >
                <span>[E] {nearbyInteraction.label}</span>
              </button>
            </div>
          )}

          <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-3 rounded-md border border-slate-800 bg-surface-900/90 px-3 py-1.5 text-[11px] text-slate-300 backdrop-blur">
            <span className="font-semibold text-white">{roomState.activeMap.name}</span>
            <span className="text-slate-600">|</span>
            <span>
              {isGm && gmTool !== 'move-token'
                ? gmTool === 'fog-reveal'
                  ? 'Pinceau Brouillard : Révéler'
                  : 'Pinceau Brouillard : Masquer'
                : 'Clic sur token puis case (ou ZQSD / Flèches) · Clic droit : caméra'}
            </span>
          </div>
        </section>

        {/* Right Dock: Chat/Dice + Character Sheet/Inventory */}
        <aside className="flex w-80 flex-col border-l border-slate-800 bg-surface-900">
          <div className="grid grid-cols-2 border-b border-slate-800">
            <button
              type="button"
              onClick={() => setRightTab('chat')}
              className={`py-2 text-xs font-semibold transition ${
                rightTab === 'chat'
                  ? 'border-b-2 border-indigo-500 bg-surface-800/60 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Chat &amp; Dés
            </button>
            <button
              type="button"
              onClick={() => setRightTab('sheet')}
              className={`py-2 text-xs font-semibold transition ${
                rightTab === 'sheet'
                  ? 'border-b-2 border-indigo-500 bg-surface-800/60 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {isGm ? 'Fiches Joueurs (MJ)' : 'Ma Fiche & Sac'}
            </button>
          </div>

          {rightTab === 'chat' ? (
            <VttChatDicePanel
              messages={roomState.chat}
              onSendChat={(channel, text) => sendAction({ type: 'send_chat', channel, text })}
              onRollDice={(formula, label) => sendAction({ type: 'roll_dice', formula, label })}
            />
          ) : (
            <VttSheetPanel
              roomState={roomState}
              role={session.role}
              participantId={session.participantId}
              database={database}
              onUpdateSheet={(targetId, patch) =>
                sendAction({ type: 'update_sheet', participantId: targetId, patch })
              }
            />
          )}
        </aside>
      </div>
      {activeDialogue && (
        <DialogueOverlay
          step={activeDialogue.step}
          storage={activeScenario?.adapter ?? storage}
          project={activeScenario?.manifest ?? project}
          onSelectChoice={(choiceId) => {
            const next = activeDialogue.runner.selectChoice(choiceId);
            syncInventoryBackToPlayerSheet(activeDialogue.inventory);
            if (next.status === 'ended') {
              setActiveDialogue(null);
            } else {
              setActiveDialogue({
                runner: activeDialogue.runner,
                step: next,
                inventory: activeDialogue.inventory,
              });
            }
          }}
          onAdvance={() => {
            const next = activeDialogue.runner.advance();
            syncInventoryBackToPlayerSheet(activeDialogue.inventory);
            if (next.status === 'ended') {
              setActiveDialogue(null);
            } else {
              setActiveDialogue({
                runner: activeDialogue.runner,
                step: next,
                inventory: activeDialogue.inventory,
              });
            }
          }}
          onClose={() => setActiveDialogue(null)}
        />
      )}

      {activeVttCombat && (
        <CombatOverlay
          enemyId={activeVttCombat.enemyId}
          database={database}
          inventory={activeVttCombat.inventory}
          initialHeroHp={activeVttCombat.initialHeroHp}
          initialHeroMp={activeVttCombat.initialHeroMp}
          map={roomState.activeMap}
          onFinish={handleFinishVttCombat}
        />
      )}
    </div>
  );
}
