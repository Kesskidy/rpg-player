import { useEffect, useRef, useState } from 'react';
import type {
  ProjectManifest,
  ProjectStorageAdapter,
  RpgDatabase,
  TileMapData,
  VttClientMessage,
  VttRole,
  VttRoomState,
  VttTokenKind,
} from '@rpg-player/core-types';
import {
  AssetTextureRegistry,
  createDefaultRpgDatabase,
  createEmptyTileMap,
  PixiVttViewport,
} from '@rpg-player/rpg-engine';
import { VttClient, VttRoomManager } from '@rpg-player/vtt-network';
import { loadMap, loadRpgDatabase } from '../../storage/project-service';
import { PixelCrownIcon, PixelDiceIcon, PixelGridIcon } from '../ui/PixelIcons';
import { VttChatDicePanel } from './VttChatDicePanel';
import { VttLobby, type CreateRoomForm, type JoinRoomForm } from './VttLobby';
import { VttSheetPanel } from './VttSheetPanel';

interface VttWorkspaceProps {
  storage: ProjectStorageAdapter;
  project: ProjectManifest | null;
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

export function VttWorkspace({ storage, project }: VttWorkspaceProps) {
  const [database, setDatabase] = useState<RpgDatabase>(() => createDefaultRpgDatabase());
  const [session, setSession] = useState<ActiveSession | null>(null);
  const [roomState, setRoomState] = useState<VttRoomState | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

    let cancelled = false;
    void viewport.init(host).then(async () => {
      if (cancelled) return;
      if (project) {
        await registry.loadFromStorage(storage, project.assets);
      }
      if (!cancelled && roomState) {
        viewport.syncState(roomState, session.role, session.participantId, selectedTokenId, showGrid);
        viewport.forceRebuildMap();
      }
    });

    return () => {
      cancelled = true;
      viewport.destroy();
      registry.destroy();
      viewportRef.current = null;
      registryRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.roomCode]);

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
      const token =
        roomState!.tokens.find((t) => t.id === selectedTokenId) ??
        roomState!.tokens.find((t) => t.ownerIds.includes(session!.participantId));
      if (!token) return;

      const key = event.key.toLowerCase();
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
  }, [session, roomState, selectedTokenId]);

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
    setErrorMessage(null);
  }

  async function handleChangeScene(mapId: string) {
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
          <aside className="flex w-72 flex-col space-y-3 overflow-y-auto border-r border-slate-800 bg-surface-900 p-3 text-xs">
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
    </div>
  );
}
