import { describe, expect, it } from 'vitest';
import { CloudflareTunnel, parseTunnelUrl, type TunnelStatus } from './cloudflare-tunnel';

describe('CloudflareTunnel & parseTunnelUrl (B2 + B7)', () => {
  it('extracts and converts Cloudflare Quick Tunnel URLs from real stderr log lines', () => {
    const realLines = [
      '2026-11-21T18:00:00Z INF +--------------------------------------------------------------------------------------------+',
      '2026-11-21T18:00:00Z INF |  Your quick Tunnel has been created! Visit it at (it may take some time to be reachable):  |',
      '2026-11-21T18:00:00Z INF |  https://vive-lune-42.trycloudflare.com                                                 |',
      '2026-11-21T18:00:00Z INF +--------------------------------------------------------------------------------------------+',
    ];

    expect(parseTunnelUrl(realLines[0]!)).toBeNull();
    expect(parseTunnelUrl(realLines[1]!)).toBeNull();
    expect(parseTunnelUrl(realLines[2]!)).toBe('wss://vive-lune-42.trycloudflare.com');
    expect(parseTunnelUrl('https://evil.example.com/fake')).toBeNull();
  });

  it('transitions starting -> ready and cleanly kills the child process on stop() with a mock Node binary', async () => {
    const statuses: TunnelStatus[] = [];
    const mockScript =
      'console.error("INF starting..."); setTimeout(() => console.error("| https://brave-orc-99.trycloudflare.com |"), 25); setInterval(() => {}, 10000);';

    const tunnel = new CloudflareTunnel(
      process.execPath,
      (st) => statuses.push(st),
      { buildArgs: () => ['-e', mockScript] },
    );

    const publicUrl = await tunnel.start(8765, 5000);
    expect(publicUrl).toBe('wss://brave-orc-99.trycloudflare.com');
    expect(tunnel.isRunning()).toBe(true);
    expect(statuses.map((s) => s.state)).toEqual(['starting', 'ready']);

    tunnel.stop();
    expect(tunnel.isRunning()).toBe(false);
    expect(tunnel.getStatus().state).toBe('idle');
  });

  it('rejects and enters error state if cloudflared exits prematurely with error logs', async () => {
    const statuses: TunnelStatus[] = [];
    const mockCrash = 'console.error("ERR connection refused by edge"); process.exit(1);';

    const tunnel = new CloudflareTunnel(
      process.execPath,
      (st) => statuses.push(st),
      { buildArgs: () => ['-e', mockCrash] },
    );

    await expect(tunnel.start(8765, 5000)).rejects.toThrow(/connection refused by edge/);
    expect(tunnel.getStatus().state).toBe('error');
    expect(tunnel.isRunning()).toBe(false);
  });

  it('rejects and kills child process when timeout expires without emitting a URL', async () => {
    const mockHang = 'console.error("INF waiting forever..."); setInterval(() => {}, 10000);';

    const tunnel = new CloudflareTunnel(process.execPath, undefined, {
      buildArgs: () => ['-e', mockHang],
    });

    await expect(tunnel.start(8765, 120)).rejects.toThrow(/Délai dépassé/);
    expect(tunnel.getStatus().state).toBe('error');
    expect(tunnel.isRunning()).toBe(false);
  });
});
