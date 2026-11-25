import { spawn, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

export type TunnelStatus =
  | { state: 'idle' }
  | { state: 'starting' }
  | { state: 'ready'; publicUrl: string }
  | { state: 'error'; message: string };

const TUNNEL_URL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;

/**
 * Extracts a Cloudflare Quick Tunnel URL from a single log line and converts it to `wss://`.
 */
export function parseTunnelUrl(line: string): string | null {
  const match = TUNNEL_URL_RE.exec(line);
  if (!match) return null;
  return match[0].toLowerCase().replace(/^https:/, 'wss:');
}

/**
 * Resolves the `cloudflared` executable path in packaged Electron (`resources/bin/`)
 * or local development (`vendor/cloudflared/`).
 */
export function resolveCloudflaredBinaryPath(
  resourcesPath?: string,
  baseDir = __dirname,
): string | null {
  const exeName = process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared';
  const candidates = [
    ...(resourcesPath ? [path.join(resourcesPath, 'bin', exeName)] : []),
    path.resolve(baseDir, '..', 'vendor', 'cloudflared', exeName),
    path.resolve(baseDir, '..', '..', '..', 'vendor', 'cloudflared', exeName),
    path.resolve(process.cwd(), 'vendor', 'cloudflared', exeName),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

export interface CloudflareTunnelOptions {
  /** Override args builder (useful for tests with a mock Node binary). */
  buildArgs?: (localPort: number) => string[];
}

/**
 * Manages a single `cloudflared` Quick Tunnel child process exposing `127.0.0.1:<port>`
 * over an outbound encrypted tunnel (`wss://<random>.trycloudflare.com`).
 */
export class CloudflareTunnel {
  private child: ChildProcess | null = null;
  private status: TunnelStatus = { state: 'idle' };
  private stopping = false;
  private readonly binPath: string;
  private readonly onStatus: (status: TunnelStatus) => void;
  private readonly buildArgs: (localPort: number) => string[];

  constructor(
    binPath: string,
    onStatus: (status: TunnelStatus) => void = () => undefined,
    options: CloudflareTunnelOptions = {},
  ) {
    this.binPath = binPath;
    this.onStatus = onStatus;
    this.buildArgs =
      options.buildArgs ??
      ((localPort) => [
        'tunnel',
        '--no-autoupdate',
        '--url',
        `http://127.0.0.1:${localPort}`,
      ]);
  }

  getStatus(): TunnelStatus {
    return this.status;
  }

  isRunning(): boolean {
    return this.child !== null && !this.child.killed && this.child.exitCode === null;
  }

  private setStatus(next: TunnelStatus): void {
    this.status = next;
    this.onStatus(next);
  }

  start(localPort: number, timeoutMs = 30_000): Promise<string> {
    this.stop();
    this.stopping = false;
    this.setStatus({ state: 'starting' });

    return new Promise<string>((resolve, reject) => {
      let settled = false;
      const recentLogs: string[] = [];
      let stderrBuf = '';
      let stdoutBuf = '';

      const args = this.buildArgs(localPort);
      const child = spawn(this.binPath, args, {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      this.child = child;

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        const tail = recentLogs.slice(-5).join(' | ');
        const message = tail
          ? `Délai dépassé lors de l’ouverture du tunnel Cloudflare (${Math.round(timeoutMs / 1000)} s) : ${tail}`
          : `Délai dépassé lors de l’ouverture du tunnel Cloudflare (${Math.round(timeoutMs / 1000)} s).`;
        this.terminateChild();
        this.setStatus({ state: 'error', message });
        reject(new Error(message));
      }, timeoutMs);

      const handleLine = (line: string) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        recentLogs.push(trimmed);
        if (recentLogs.length > 20) recentLogs.shift();

        if (!settled) {
          const url = parseTunnelUrl(trimmed);
          if (url) {
            settled = true;
            clearTimeout(timer);
            this.setStatus({ state: 'ready', publicUrl: url });
            resolve(url);
          }
        }
      };

      const feedBuffer = (chunk: Buffer, isStderr: boolean) => {
        const text = chunk.toString('utf-8');
        if (isStderr) {
          stderrBuf += text;
          const lines = stderrBuf.split(/\r?\n/);
          stderrBuf = lines.pop() ?? '';
          for (const line of lines) handleLine(line);
        } else {
          stdoutBuf += text;
          const lines = stdoutBuf.split(/\r?\n/);
          stdoutBuf = lines.pop() ?? '';
          for (const line of lines) handleLine(line);
        }
      };

      child.stderr?.on('data', (chunk: Buffer) => feedBuffer(chunk, true));
      child.stdout?.on('data', (chunk: Buffer) => feedBuffer(chunk, false));

      child.on('error', (err) => {
        clearTimeout(timer);
        this.child = null;
        const message = `Impossible de lancer cloudflared : ${err.message}`;
        this.setStatus({ state: 'error', message });
        if (!settled) {
          settled = true;
          reject(new Error(message));
        }
      });

      child.on('exit', (code, signal) => {
        clearTimeout(timer);
        if (stderrBuf.trim()) handleLine(stderrBuf);
        if (stdoutBuf.trim()) handleLine(stdoutBuf);
        if (this.child === child) {
          this.child = null;
        }
        if (this.stopping) {
          if (!settled) {
            settled = true;
            reject(new Error('Tunnel arrêté.'));
          }
          return;
        }
        const tail = recentLogs.slice(-4).join(' | ');
        const reason = `cloudflared s’est arrêté (code=${String(code)}, signal=${String(signal)})${tail ? ` : ${tail}` : ''}`;
        this.setStatus({ state: 'error', message: reason });
        if (!settled) {
          settled = true;
          reject(new Error(reason));
        }
      });
    });
  }

  private terminateChild(): void {
    const proc = this.child;
    this.child = null;
    if (!proc) return;
    try {
      proc.kill();
    } catch {
      // Process may already have exited
    }
  }

  stop(): void {
    this.stopping = true;
    this.terminateChild();
    if (this.status.state !== 'idle') {
      this.setStatus({ state: 'idle' });
    }
  }
}
