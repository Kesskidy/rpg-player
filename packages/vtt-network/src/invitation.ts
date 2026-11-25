export interface ParsedInvitation {
  serverUrl: string;
  roomCode: string;
}

/**
 * Formats a public WebSocket/HTTPS tunnel URL and room code into a compact copyable invitation:
 * e.g. `wss://vive-lune-42.trycloudflare.com` + `ABCD2345` -> `vive-lune-42.trycloudflare.com#ABCD2345`.
 */
export function formatInvitation(publicUrl: string, roomCode: string): string {
  const cleanHost = publicUrl
    .trim()
    .replace(/^(wss?|https?):\/\//i, '')
    .replace(/\/+$/, '');
  return `${cleanHost}#${roomCode.trim().toUpperCase()}`;
}

function normalizeServerUrl(rawHostOrUrl: string): string {
  const trimmed = rawHostOrUrl.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  if (/^wss?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  if (/^https:\/\//i.test(trimmed)) {
    return trimmed.replace(/^https:\/\//i, 'wss://');
  }
  if (/^http:\/\//i.test(trimmed)) {
    return trimmed.replace(/^http:\/\//i, 'ws://');
  }
  // Cloudflare Quick Tunnel domains always use TLS WebSockets (`wss://`)
  if (/\.trycloudflare\.com$/i.test(trimmed)) {
    return `wss://${trimmed}`;
  }
  // Localhost / numeric LAN IPs default to `ws://`, other hostnames default to `wss://`
  if (/^(localhost|127\.0\.0\.1|10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/i.test(trimmed)) {
    return `ws://${trimmed}`;
  }
  return `wss://${trimmed}`;
}

/**
 * Parses a player invitation string in any supported format:
 * - Compact invitation: `vive-lune-42.trycloudflare.com#ABCD2345`
 * - Full URL + fragment: `wss://vive-lune-42.trycloudflare.com#ABCD2345` or `ws://192.168.1.5:8765#K7M4P2`
 * - Bare room code (6–10 alphanumeric chars): uses `fallbackServerUrl`
 * - Bare URL without `#CODE`: uses `fallbackRoomCode`
 */
export function parseInvitation(
  rawInput: string,
  fallbackServerUrl = 'ws://localhost:8765',
  fallbackRoomCode = '',
): ParsedInvitation | null {
  const trimmed = rawInput.trim();
  if (!trimmed) return null;

  // Format with `#CODE`
  const hashIdx = trimmed.indexOf('#');
  if (hashIdx >= 0) {
    const hostPart = trimmed.slice(0, hashIdx).trim();
    const codePart = trimmed.slice(hashIdx + 1).trim().toUpperCase();
    if (!hostPart || !codePart) return null;
    const serverUrl = normalizeServerUrl(hostPart);
    if (!serverUrl) return null;
    return { serverUrl, roomCode: codePart };
  }

  // Format with explicit scheme or domain/port (no `#CODE`)
  if (
    /^(wss?|https?):\/\//i.test(trimmed) ||
    trimmed.includes('.') ||
    trimmed.includes(':')
  ) {
    const serverUrl = normalizeServerUrl(trimmed);
    return {
      serverUrl,
      roomCode: fallbackRoomCode.trim().toUpperCase(),
    };
  }

  // Bare room code (e.g. `K7M4P2` or `ABCD2345`)
  if (/^[A-Za-z0-9]{4,12}$/.test(trimmed)) {
    const serverUrl = normalizeServerUrl(fallbackServerUrl) || 'ws://localhost:8765';
    return {
      serverUrl,
      roomCode: trimmed.toUpperCase(),
    };
  }

  return null;
}
