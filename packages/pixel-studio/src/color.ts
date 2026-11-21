import type { ColorRGBA, HexColor } from '@rpg-player/core-types';

export const TRANSPARENT_RGBA: ColorRGBA = { r: 0, g: 0, b: 0, a: 0 };

export function clampByte(value: number): number {
  if (value <= 0) return 0;
  if (value >= 255) return 255;
  return Math.round(value);
}

export function clampUnit(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

export function hexToRgba(hex: HexColor): ColorRGBA {
  const cleaned = hex.trim().replace(/^#/, '');
  if (cleaned.length === 3 || cleaned.length === 4) {
    const r = Number.parseInt(cleaned[0]! + cleaned[0]!, 16);
    const g = Number.parseInt(cleaned[1]! + cleaned[1]!, 16);
    const b = Number.parseInt(cleaned[2]! + cleaned[2]!, 16);
    const a = cleaned.length === 4 ? Number.parseInt(cleaned[3]! + cleaned[3]!, 16) : 255;
    if ([r, g, b, a].some(Number.isNaN)) {
      throw new Error(`Couleur hexadécimale invalide : "${hex}"`);
    }
    return { r, g, b, a };
  }

  if (cleaned.length === 6 || cleaned.length === 8) {
    const r = Number.parseInt(cleaned.slice(0, 2), 16);
    const g = Number.parseInt(cleaned.slice(2, 4), 16);
    const b = Number.parseInt(cleaned.slice(4, 6), 16);
    const a = cleaned.length === 8 ? Number.parseInt(cleaned.slice(6, 8), 16) : 255;
    if ([r, g, b, a].some(Number.isNaN)) {
      throw new Error(`Couleur hexadécimale invalide : "${hex}"`);
    }
    return { r, g, b, a };
  }

  throw new Error(`Couleur hexadécimale invalide : "${hex}"`);
}

function byteToHex(value: number): string {
  return clampByte(value).toString(16).padStart(2, '0');
}

export function rgbaToHex(color: ColorRGBA, includeAlpha = false): HexColor {
  const rgb = `#${byteToHex(color.r)}${byteToHex(color.g)}${byteToHex(color.b)}`;
  if (includeAlpha || color.a < 255) {
    return `${rgb}${byteToHex(color.a)}`;
  }
  return rgb;
}

/**
 * Porter-Duff source-over blending for straight-alpha RGBA pixels,
 * writing the blended result directly into `dst` at `byteOffset`.
 */
export function blendPixelOver(
  dst: Uint8ClampedArray,
  byteOffset: number,
  srcR: number,
  srcG: number,
  srcB: number,
  srcA: number,
  layerOpacity: number,
): void {
  const effectiveSrcA = (srcA / 255) * layerOpacity;
  if (effectiveSrcA <= 0) {
    return;
  }

  const dstA = (dst[byteOffset + 3] ?? 0) / 255;

  if (effectiveSrcA >= 1 || dstA <= 0) {
    dst[byteOffset] = srcR;
    dst[byteOffset + 1] = srcG;
    dst[byteOffset + 2] = srcB;
    dst[byteOffset + 3] = Math.round(effectiveSrcA * 255);
    return;
  }

  const outA = effectiveSrcA + dstA * (1 - effectiveSrcA);
  if (outA <= 0) {
    dst[byteOffset] = 0;
    dst[byteOffset + 1] = 0;
    dst[byteOffset + 2] = 0;
    dst[byteOffset + 3] = 0;
    return;
  }

  const dstR = dst[byteOffset] ?? 0;
  const dstG = dst[byteOffset + 1] ?? 0;
  const dstB = dst[byteOffset + 2] ?? 0;

  const invSrcA = 1 - effectiveSrcA;
  dst[byteOffset] = Math.round((srcR * effectiveSrcA + dstR * dstA * invSrcA) / outA);
  dst[byteOffset + 1] = Math.round((srcG * effectiveSrcA + dstG * dstA * invSrcA) / outA);
  dst[byteOffset + 2] = Math.round((srcB * effectiveSrcA + dstB * dstA * invSrcA) / outA);
  dst[byteOffset + 3] = Math.round(outA * 255);
}
