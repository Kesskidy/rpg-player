import { useState } from 'react';
import type { MapMeta, ProjectManifest } from '@rpg-player/core-types';
import { parseInvitation, type VttExposureMode } from '@rpg-player/vtt-network';
import {
  PixelCrownIcon,
  PixelDiceIcon,
  PixelPlayIcon,
  PixelSparkIcon,
} from '../ui/PixelIcons';

export interface CreateRoomForm {
  serverUrl: string;
  /** When set in Electron, starts the embedded VTT host (local / lan / Cloudflare public tunnel). */
  hostExposure?: VttExposureMode;
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
  hostStatusText?: string | null;
  errorMessage: string | null;
  canRetryLan?: boolean;
  onRetryLan?: () => void;
  onCreateRoom: (form: CreateRoomForm) => void;
  onJoinRoom: (form: JoinRoomForm) => void;
  onStartLocalDemo: (gmName: string, playerName: string, selectedMapId: string | null) => void;
  onLoadTavernScenario: () => void;
}

const HOST_MODES: Array<{ id: VttExposureMode; label: string; hint: string }> = [
  {
    id: 'public',
    label: 'Sur Internet (Cloudflare)',
    hint: 'Ouvre un Quick Tunnel chiffré (wss://) avec un code d’invitation à copier.',
  },
  {
    id: 'lan',
    label: 'Réseau local (LAN)',
    hint: 'Accessible sur votre Wi-Fi / réseau local sans passer par Internet.',
  },
  {
    id: 'local',
    label: 'Ce PC uniquement',
    hint: 'Serveur local sur 127.0.0.1 pour tester sur cette machine.',
  },
];

export function VttLobby({
  project,
  connecting,
  hostStatusText,
  errorMessage,
  canRetryLan,
  onRetryLan,
  onCreateRoom,
  onJoinRoom,
  onStartLocalDemo,
  onLoadTavernScenario,
}: VttLobbyProps) {
  const projectMaps: MapMeta[] = project?.maps ? Object.values(project.maps) : [];
  const hasEmbeddedHost = typeof window !== 'undefined' && Boolean(window.rpgPlayerVttHost);

  const [hostExposure, setHostExposure] = useState<VttExposureMode>('public');
  const [serverUrl, setServerUrl] = useState('ws://localhost:8765');
  const [roomName, setRoomName] = useState(
    project ? `Table — ${project.name}` : 'Les Chroniques Pixel',
  );
  const [gmPassword, setGmPassword] = useState('');
  const [gmName, setGmName] = useState('Maître du Jeu');
  const [selectedMapId, setSelectedMapId] = useState<string>(projectMaps[0]?.id ?? '');

  const [invitationInput, setInvitationInput] = useState('');
  const [joinPassword, setJoinPassword] = useState('');
  const [playerName, setPlayerName] = useState('Aventurier');
  const [joinParseError, setJoinParseError] = useState<string | null>(null);

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

        {hostStatusText && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-950/40 px-4 py-2 text-xs text-amber-200">
            ⏳ {hostStatusText}
          </div>
        )}

        {(errorMessage || joinParseError) && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-500/40 bg-rose-950/50 px-4 py-2.5 text-xs text-rose-200">
            <span>{errorMessage ?? joinParseError}</span>
            {canRetryLan && onRetryLan && (
              <button
                type="button"
                onClick={onRetryLan}
                className="pixel-btn pixel-btn-gold shrink-0 px-3 py-1 text-[11px] font-bold"
              >
                Réessayer en réseau local (LAN)
              </button>
            )}
          </div>
        )}

        {/* Featured One-Click JDR Scenario: La Prime de la Taverne */}
        <div className="pixel-panel flex flex-col items-center justify-between gap-4 border-dnd-gold p-4 sm:flex-row">
          <div>
            <div className="flex items-center gap-2">
              <PixelCrownIcon size={16} />
              <span className="font-pixel text-[10px] font-bold uppercase tracking-wider text-dnd-gold">
                Scénario JDR Prêt-à-Jouer (2 Actes · Compatible RPG Engine)
              </span>
            </div>
            <h3 className="mt-1 font-pixel text-sm font-bold text-dnd-parchment">
              La Prime de la Taverne
            </h3>
            <p className="mt-1 text-[11px] text-dnd-muted">
              Acte 1 : La Taverne (briefing de la Femme au guichet, sans brouillard) → Acte 2 : Le
              Donjon (brouillard de guerre actif, coffre potion, 2 sbires et Boss Ogre Sombre 64×64).
            </p>
          </div>
          <button
            type="button"
            disabled={connecting}
            onClick={onLoadTavernScenario}
            className="pixel-btn pixel-btn-gold flex shrink-0 items-center gap-2 px-4 py-2.5 text-xs font-bold disabled:opacity-50"
          >
            <PixelSparkIcon size={15} />
            <span>
              {connecting ? 'Chargement...' : 'Charger le scénario : La Prime de la Taverne'}
            </span>
          </button>
        </div>

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

        {/* Manual WebSocket Server Address (always available in Web mode, optional fallback in Electron) */}
        {!hasEmbeddedHost && (
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
        )}

        {/* Two columns: Host (GM) vs Join (Player) */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* Create Room (GM) */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onCreateRoom({
                serverUrl,
                hostExposure: hasEmbeddedHost ? hostExposure : undefined,
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
                <span>{hasEmbeddedHost ? 'Héberger la partie (MJ)' : 'Créer un Salon (MJ)'}</span>
              </h3>
              <span className="pixel-badge-gm px-2 py-0.5 text-[10px] font-bold uppercase">
                MJ
              </span>
            </div>

            {hasEmbeddedHost && (
              <div className="space-y-1.5">
                <span className="block text-[11px] font-semibold text-slate-300">
                  Mode d’hébergement intégré
                </span>
                <div className="grid grid-cols-3 gap-1.5">
                  {HOST_MODES.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setHostExposure(opt.id)}
                      className={`rounded border px-2 py-1.5 text-[10px] font-bold transition ${
                        hostExposure === opt.id
                          ? 'border-dnd-gold bg-amber-950/70 text-dnd-gold'
                          : 'border-slate-700 bg-surface-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-slate-400">
                  {HOST_MODES.find((m) => m.id === hostExposure)?.hint}
                </p>
              </div>
            )}

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
              {connecting
                ? (hostStatusText ?? 'Connexion...')
                : hasEmbeddedHost
                  ? 'Démarrer le serveur & Ouvrir le Salon'
                  : 'Ouvrir le Salon (WebSocket)'}
            </button>
          </form>

          {/* Join Room (Player) */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setJoinParseError(null);
              const parsed = parseInvitation(invitationInput, serverUrl);
              if (!parsed || !parsed.roomCode) {
                setJoinParseError(
                  'Code d’invitation invalide. Collez le lien complet (ex: mon-tunnel.trycloudflare.com#ABCD2345) ou un code salon.',
                );
                return;
              }
              onJoinRoom({
                serverUrl: parsed.serverUrl,
                roomCode: parsed.roomCode,
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
              Code d’invitation (Internet, LAN ou code simple)
              <input
                type="text"
                value={invitationInput}
                onChange={(e) => {
                  setInvitationInput(e.target.value);
                  setJoinParseError(null);
                }}
                placeholder="ex: vive-lune-42.trycloudflare.com#ABCD2345 ou K7M4P2"
                required
                className="mt-1 w-full rounded border border-slate-700 bg-surface-800 px-2.5 py-1.5 font-mono text-xs text-white outline-none focus:border-cyan-400"
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
              Collez directement l’invitation envoyée par le MJ : le protocole{' '}
              <code className="text-slate-300">wss://</code> est ajouté automatiquement pour
              Cloudflare.
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
