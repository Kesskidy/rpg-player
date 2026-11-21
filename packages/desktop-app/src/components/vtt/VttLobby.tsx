import { useState } from 'react';
import type { MapMeta, ProjectManifest } from '@rpg-player/core-types';
import { PixelCrownIcon, PixelDiceIcon, PixelPlayIcon } from '../ui/PixelIcons';

export interface CreateRoomForm {
  serverUrl: string;
  roomName: string;
  password: string;
  gmName: string;
  selectedMapId: string | null;
}

export interface JoinRoomForm {
  serverUrl: string;
  roomCode: string;
  password: string;
  playerName: string;
}

interface VttLobbyProps {
  project: ProjectManifest | null;
  connecting: boolean;
  errorMessage: string | null;
  onCreateRoom: (form: CreateRoomForm) => void;
  onJoinRoom: (form: JoinRoomForm) => void;
  onStartLocalDemo: (gmName: string, playerName: string, selectedMapId: string | null) => void;
}

export function VttLobby({
  project,
  connecting,
  errorMessage,
  onCreateRoom,
  onJoinRoom,
  onStartLocalDemo,
}: VttLobbyProps) {
  const projectMaps: MapMeta[] = project?.maps ? Object.values(project.maps) : [];

  const [serverUrl, setServerUrl] = useState('ws://localhost:8765');
  const [roomName, setRoomName] = useState(
    project ? `Table — ${project.name}` : 'Les Chroniques Pixel',
  );
  const [gmPassword, setGmPassword] = useState('');
  const [gmName, setGmName] = useState('Maître du Jeu');
  const [selectedMapId, setSelectedMapId] = useState<string>(projectMaps[0]?.id ?? '');

  const [roomCode, setRoomCode] = useState('');
  const [joinPassword, setJoinPassword] = useState('');
  const [playerName, setPlayerName] = useState('Aventurier');

  return (
    <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto bg-surface-950 p-6">
      <div className="w-full max-w-4xl space-y-5">
        <div className="text-center">
          <span className="rounded-full bg-indigo-600/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-indigo-300 ring-1 ring-indigo-500/40">
            Module 3 — Table Virtuelle Multijoueur (VTT / JDR)
          </span>
          <h2 className="mt-2 text-xl font-bold text-white">
            Hébergez ou rejoignez une session JDR temps réel
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            Réutilise les maps, sprites, fiches et inventaires de vos modules Pixel Studio &amp; RPG
            Engine.
          </p>
        </div>

        {errorMessage && (
          <div className="rounded-lg border border-rose-500/40 bg-rose-950/50 px-4 py-2.5 text-xs text-rose-200">
            {errorMessage}
          </div>
        )}

        {/* Quick Local Multi-Role Demo Banner */}
        <div className="flex flex-col items-center justify-between gap-3 rounded-xl border border-emerald-500/35 bg-emerald-950/25 p-4 sm:flex-row">
          <div>
            <h3 className="text-xs font-bold text-emerald-200">
              Mode Démo Local (MJ + Joueur instantané, sans serveur externe)
            </h3>
            <p className="mt-0.5 text-[11px] text-emerald-100/70">
              Permet de tester immédiatement le brouillard de guerre, les permissions MJ/Joueur, les
              dés et l’édition live des fiches en basculant entre les deux rôles.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onStartLocalDemo(gmName, playerName, selectedMapId || null)}
            className="pixel-btn pixel-btn-dragon flex shrink-0 items-center gap-2 px-4 py-2 text-xs font-bold"
          >
            <PixelPlayIcon size={14} />
            <span>Lancer Démo MJ / Joueur</span>
          </button>
        </div>

        {/* WebSocket Server Address */}
        <div className="flex flex-col gap-2 rounded-lg border border-slate-800 bg-surface-900 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex flex-1 items-center gap-3 text-xs text-slate-300">
            <span className="shrink-0 font-semibold text-slate-400">Serveur WebSocket :</span>
            <input
              type="text"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              className="w-full max-w-xs rounded border border-slate-700 bg-surface-800 px-2.5 py-1 font-mono text-xs text-white outline-none focus:border-indigo-500"
            />
          </label>
          <span className="font-mono text-[11px] text-slate-500">
            Hôte local : <code className="text-indigo-300">npm.cmd run vtt:server</code>
          </span>
        </div>

        {/* Two columns: Host (GM) vs Join (Player) */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* Create Room (GM) */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onCreateRoom({
                serverUrl,
                roomName,
                password: gmPassword,
                gmName,
                selectedMapId: selectedMapId || null,
              });
            }}
            className="pixel-panel space-y-3 border-dnd-gold p-5"
          >
            <div className="flex items-center justify-between border-b-2 border-dnd-border pb-2">
              <h3 className="flex items-center gap-2 font-pixel text-xs font-bold text-dnd-gold">
                <PixelCrownIcon size={16} />
                <span>Créer un Salon (MJ)</span>
              </h3>
              <span className="pixel-badge-gm px-2 py-0.5 text-[10px] font-bold uppercase">
                MJ
              </span>
            </div>

            <label className="block text-xs text-slate-400">
              Nom du salon
              <input
                type="text"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                required
                className="mt-1 w-full rounded border border-slate-700 bg-surface-800 px-2.5 py-1.5 text-xs text-white outline-none focus:border-amber-400"
              />
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs text-slate-400">
                Pseudo MJ
                <input
                  type="text"
                  value={gmName}
                  onChange={(e) => setGmName(e.target.value)}
                  required
                  className="mt-1 w-full rounded border border-slate-700 bg-surface-800 px-2.5 py-1.5 text-xs text-white"
                />
              </label>
              <label className="block text-xs text-slate-400">
                Mot de passe (optionnel)
                <input
                  type="password"
                  value={gmPassword}
                  onChange={(e) => setGmPassword(e.target.value)}
                  placeholder="Libre si vide"
                  className="mt-1 w-full rounded border border-slate-700 bg-surface-800 px-2.5 py-1.5 text-xs text-white"
                />
              </label>
            </div>

            <label className="block text-xs text-slate-400">
              Scène initiale
              <select
                value={selectedMapId}
                onChange={(e) => setSelectedMapId(e.target.value)}
                className="mt-1 w-full rounded border border-slate-700 bg-surface-800 px-2.5 py-1.5 text-xs text-white"
              >
                <option value="">Map Taverne / Donjon par défaut (20×14)</option>
                {projectMaps.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.width}×{m.height})
                  </option>
                ))}
              </select>
            </label>

            <button
              type="submit"
              disabled={connecting}
              className="pixel-btn pixel-btn-gold w-full px-4 py-2 text-xs font-bold disabled:opacity-50"
            >
              {connecting ? 'Connexion...' : 'Ouvrir le Salon (WebSocket)'}
            </button>
          </form>

          {/* Join Room (Player) */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onJoinRoom({
                serverUrl,
                roomCode,
                password: joinPassword,
                playerName,
              });
            }}
            className="pixel-panel space-y-3 border-dnd-arcane p-5"
          >
            <div className="flex items-center justify-between border-b-2 border-dnd-border pb-2">
              <h3 className="flex items-center gap-2 font-pixel text-xs font-bold text-dnd-parchment">
                <PixelDiceIcon size={16} />
                <span>Rejoindre (Joueur)</span>
              </h3>
              <span className="border-2 border-dnd-arcane bg-indigo-950/70 px-2 py-0.5 font-pixel text-[10px] font-bold uppercase text-dnd-parchment">
                Joueur
              </span>
            </div>

            <label className="block text-xs text-slate-400">
              Code d’invitation (6 caractères)
              <input
                type="text"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                placeholder="EX: K7M4P2"
                required
                className="mt-1 w-full rounded border border-slate-700 bg-surface-800 px-2.5 py-1.5 font-mono text-sm uppercase tracking-widest text-white outline-none focus:border-cyan-400"
              />
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs text-slate-400">
                Nom du Joueur / Héros
                <input
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  required
                  className="mt-1 w-full rounded border border-slate-700 bg-surface-800 px-2.5 py-1.5 text-xs text-white"
                />
              </label>
              <label className="block text-xs text-slate-400">
                Mot de passe
                <input
                  type="password"
                  value={joinPassword}
                  onChange={(e) => setJoinPassword(e.target.value)}
                  placeholder="Si requis"
                  className="mt-1 w-full rounded border border-slate-700 bg-surface-800 px-2.5 py-1.5 text-xs text-white"
                />
              </label>
            </div>

            <p className="text-[11px] text-slate-500">
              Astuce : ouvrez un second onglet du navigateur sur{' '}
              <code className="text-slate-300">localhost:5173</code> pour rejoindre votre propre
              salon en tant que Joueur !
            </p>

            <button
              type="submit"
              disabled={connecting}
              className="pixel-btn pixel-btn-arcane w-full px-4 py-2 text-xs font-bold disabled:opacity-50"
            >
              {connecting ? 'Connexion...' : 'Rejoindre la table'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
