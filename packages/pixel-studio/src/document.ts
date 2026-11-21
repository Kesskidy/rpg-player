import {
  DEFAULT_PALETTE,
  PIXEL_DOCUMENT_SCHEMA_VERSION,
  type PixelDocumentSerialized,
  type PixelFrameSerialized,
  type PixelLayerSerialized,
} from '@rpg-player/core-types';
import { clampUnit } from './color.js';
import type {
  CreateDocumentOptions,
  PixelDocumentRuntime,
  PixelFrameRuntime,
  PixelLayerRuntime,
} from './types.js';

export const MIN_GRID_DIMENSION = 1;
export const MAX_GRID_DIMENSION = 1024;

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const BASE64_LOOKUP = new Uint8Array(128).fill(255);
for (let i = 0; i < BASE64_ALPHABET.length; i += 1) {
  BASE64_LOOKUP[BASE64_ALPHABET.charCodeAt(i)] = i;
}

export function encodeBytesToBase64(bytes: Uint8Array | Uint8ClampedArray): string {
  const len = bytes.length;
  const chunks: string[] = [];
  for (let i = 0; i < len; i += 3) {
    const b0 = bytes[i] ?? 0;
    const has1 = i + 1 < len;
    const has2 = i + 2 < len;
    const b1 = has1 ? (bytes[i + 1] ?? 0) : 0;
    const b2 = has2 ? (bytes[i + 2] ?? 0) : 0;

    const triplet = (b0 << 16) | (b1 << 8) | b2;
    chunks.push(
      BASE64_ALPHABET[(triplet >> 18) & 0x3f]!,
      BASE64_ALPHABET[(triplet >> 12) & 0x3f]!,
      has1 ? BASE64_ALPHABET[(triplet >> 6) & 0x3f]! : '=',
      has2 ? BASE64_ALPHABET[triplet & 0x3f]! : '=',
    );
  }
  return chunks.join('');
}

export function decodeBase64ToClamped(base64: string): Uint8ClampedArray {
  const cleaned = base64.replace(/\s+/g, '');
  if (cleaned.length % 4 !== 0) {
    throw new Error('Chaîne base64 invalide (longueur non multiple de 4).');
  }
  if (cleaned.length === 0) {
    return new Uint8ClampedArray(0);
  }

  let padding = 0;
  if (cleaned.endsWith('==')) padding = 2;
  else if (cleaned.endsWith('=')) padding = 1;

  const byteLength = (cleaned.length / 4) * 3 - padding;
  const output = new Uint8ClampedArray(byteLength);

  let outIdx = 0;
  for (let i = 0; i < cleaned.length; i += 4) {
    const c0 = cleaned.charCodeAt(i);
    const c1 = cleaned.charCodeAt(i + 1);
    const c2 = cleaned.charCodeAt(i + 2);
    const c3 = cleaned.charCodeAt(i + 3);

    const v0 = c0 < 128 ? (BASE64_LOOKUP[c0] ?? 255) : 255;
    const v1 = c1 < 128 ? (BASE64_LOOKUP[c1] ?? 255) : 255;
    const v2 = c2 === 61 ? 0 : c2 < 128 ? (BASE64_LOOKUP[c2] ?? 255) : 255;
    const v3 = c3 === 61 ? 0 : c3 < 128 ? (BASE64_LOOKUP[c3] ?? 255) : 255;

    if (v0 === 255 || v1 === 255 || v2 === 255 || v3 === 255) {
      throw new Error('Caractère invalide dans le buffer base64.');
    }

    const triplet = (v0 << 18) | (v1 << 12) | (v2 << 6) | v3;
    if (outIdx < byteLength) output[outIdx++] = (triplet >> 16) & 0xff;
    if (outIdx < byteLength) output[outIdx++] = (triplet >> 8) & 0xff;
    if (outIdx < byteLength) output[outIdx++] = triplet & 0xff;
  }

  return output;
}

let idCounter = 0;

export function generateStudioId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${idCounter.toString(36)}`;
}

export function validateDimensions(width: number, height: number): void {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < MIN_GRID_DIMENSION ||
    height < MIN_GRID_DIMENSION ||
    width > MAX_GRID_DIMENSION ||
    height > MAX_GRID_DIMENSION
  ) {
    throw new Error(
      `Dimensions de grille invalides (${width}x${height}). Valeurs entières attendues entre ${MIN_GRID_DIMENSION} et ${MAX_GRID_DIMENSION}.`,
    );
  }
}

export function createPixelLayer(
  width: number,
  height: number,
  name: string,
  id?: string,
): PixelLayerRuntime {
  validateDimensions(width, height);
  return {
    id: id ?? generateStudioId('layer'),
    name,
    visible: true,
    opacity: 1,
    locked: false,
    pixels: new Uint8ClampedArray(width * height * 4),
  };
}

export function cloneLayer(layer: PixelLayerRuntime): PixelLayerRuntime {
  return {
    id: layer.id,
    name: layer.name,
    visible: layer.visible,
    opacity: layer.opacity,
    locked: layer.locked,
    pixels: new Uint8ClampedArray(layer.pixels),
  };
}

export function createPixelDocument(options: CreateDocumentOptions): PixelDocumentRuntime {
  validateDimensions(options.width, options.height);
  const initialLayer = createPixelLayer(options.width, options.height, 'Calque 1');
  const initialFrame: PixelFrameRuntime = {
    id: generateStudioId('frame'),
    durationMs: 125,
    layers: [initialLayer],
  };

  return {
    schemaVersion: PIXEL_DOCUMENT_SCHEMA_VERSION,
    assetId: options.assetId,
    width: options.width,
    height: options.height,
    palette: [...(options.palette ?? DEFAULT_PALETTE)],
    frames: [initialFrame],
  };
}

export function serializeDocument(doc: PixelDocumentRuntime): PixelDocumentSerialized {
  const frames: PixelFrameSerialized[] = doc.frames.map((frame) => {
    const layers: PixelLayerSerialized[] = frame.layers.map((layer) => ({
      id: layer.id,
      name: layer.name,
      visible: layer.visible,
      opacity: clampUnit(layer.opacity),
      locked: layer.locked,
      pixelsBase64: encodeBytesToBase64(layer.pixels),
    }));
    return {
      id: frame.id,
      durationMs: frame.durationMs,
      layers,
    };
  });

  return {
    schemaVersion: PIXEL_DOCUMENT_SCHEMA_VERSION,
    assetId: doc.assetId,
    width: doc.width,
    height: doc.height,
    palette: [...doc.palette],
    frames,
  };
}

export function deserializeDocument(serialized: PixelDocumentSerialized): PixelDocumentRuntime {
  if (serialized.schemaVersion !== PIXEL_DOCUMENT_SCHEMA_VERSION) {
    throw new Error(`Version de PixelDocument non supportée : ${String(serialized.schemaVersion)}`);
  }
  validateDimensions(serialized.width, serialized.height);
  const expectedByteLength = serialized.width * serialized.height * 4;

  const frames: PixelFrameRuntime[] = serialized.frames.map((frame) => {
    const layers: PixelLayerRuntime[] = frame.layers.map((layer) => {
      const pixels = decodeBase64ToClamped(layer.pixelsBase64);
      if (pixels.length !== expectedByteLength) {
        throw new Error(
          `Buffer pixel invalide pour le calque "${layer.name}" : attendu ${expectedByteLength} octets, reçu ${pixels.length}.`,
        );
      }
      return {
        id: layer.id,
        name: layer.name,
        visible: layer.visible,
        opacity: clampUnit(layer.opacity),
        locked: layer.locked,
        pixels,
      };
    });

    if (layers.length === 0) {
      layers.push(createPixelLayer(serialized.width, serialized.height, 'Calque 1'));
    }

    return {
      id: frame.id,
      durationMs: frame.durationMs,
      layers,
    };
  });

  if (frames.length === 0) {
    return createPixelDocument({
      assetId: serialized.assetId,
      width: serialized.width,
      height: serialized.height,
      palette: serialized.palette,
    });
  }

  return {
    schemaVersion: PIXEL_DOCUMENT_SCHEMA_VERSION,
    assetId: serialized.assetId,
    width: serialized.width,
    height: serialized.height,
    palette: [...serialized.palette],
    frames,
  };
}
