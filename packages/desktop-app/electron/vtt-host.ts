import {
  startVttServer,
  type RunningVttServer,
  type VttExposureMode,
} from '@rpg-player/vtt-network/server';
import * as os from 'node:os';
import {
  CloudflareTunnel,
  resolveCloudflaredBinaryPath,
  type TunnelStatus,
} from './cloudflare-tunnel';

export interface HostedVttInfo {
  exposure: VttExposureMode;
  localUrl: string;
  publicUrl?: string;
  lanUrls: string[];
  port: number;
}

export interface HostedVttStatusEvent {
  serverRunning: boolean;
  exposure: VttExposureMode | null;
  localUrl: string | null;
  lanUrls: string[];
  tunnel: TunnelStatus;
}

let activeServer: RunningVttServer | null = null;
let activeTunnel: CloudflareTunnel | null = null;
let activeInfo: HostedVttInfo | null = null;
let lastTunnelStatus: TunnelStatus = { state: 'idle' };

function discoverLanUrls(port: number): string[] {
  const ifaces = os.networkInterfaces();
  const urls: string[] = [];
  for (const entries of Object.values(ifaces)) {
    if (!entries) continue;
    for (const info of entries) {
      if (info.family === 'IPv4' && !info.internal) {
        urls.push(`ws://${info.address}:${port}`);
      }
    }
  }
  return urls;
}

export function getHostedVttStatus(): HostedVttStatusEvent {
  return {
    serverRunning: activeServer !== null,
    exposure: activeInfo?.exposure ?? null,
    localUrl: activeInfo?.localUrl ?? null,
    lanUrls: activeInfo?.lanUrls ?? [],
    tunnel: lastTunnelStatus,
  };
}

export async function startHostedVtt(
  exposure: VttExposureMode,
  onStatus?: (event: HostedVttStatusEvent) => void,
): Promise<HostedVttInfo> {
  await stopHostedVtt(onStatus);

  const emit = () => onStatus?.(getHostedVttStatus());
  const host = exposure === 'lan' ? '0.0.0.0' : '127.0.0.1';
  const server = await startVttServer({ port: 0, host, exposure });
  activeServer = server;

  const localUrl = `ws://127.0.0.1:${server.port}`;
  const lanUrls = exposure === 'lan' ? discoverLanUrls(server.port) : [];
  activeInfo = {
    exposure,
    localUrl,
    lanUrls,
    port: server.port,
  };
  lastTunnelStatus = { state: 'idle' };
  emit();

  if (exposure === 'public') {
    const binPath = resolveCloudflaredBinaryPath(process.resourcesPath);
    if (!binPath) {
      const message =
        'Binaire cloudflared introuvable. Exécutez « npm.cmd run fetch:cloudflared » ou choisissez le mode Réseau local (LAN).';
      lastTunnelStatus = { state: 'error', message };
      emit();
      await stopHostedVtt();
      throw new Error(message);
    }

    const tunnel = new CloudflareTunnel(binPath, (tunnelStatus) => {
      lastTunnelStatus = tunnelStatus;
      if (tunnelStatus.state === 'ready' && activeInfo) {
        activeInfo = { ...activeInfo, publicUrl: tunnelStatus.publicUrl };
      }
      emit();
    });
    activeTunnel = tunnel;

    try {
      const publicUrl = await tunnel.start(server.port, 30_000);
      activeInfo = {
        ...activeInfo,
        publicUrl,
      };
      emit();
    } catch (error) {
      await stopHostedVtt();
      throw error;
    }
  }

  return activeInfo;
}

export async function stopHostedVtt(
  onStatus?: (event: HostedVttStatusEvent) => void,
): Promise<void> {
  if (activeTunnel) {
    activeTunnel.stop();
    activeTunnel = null;
  }
  if (activeServer) {
    const srv = activeServer;
    activeServer = null;
    await srv.close().catch(() => undefined);
  }
  activeInfo = null;
  lastTunnelStatus = { state: 'idle' };
  onStatus?.(getHostedVttStatus());
}
