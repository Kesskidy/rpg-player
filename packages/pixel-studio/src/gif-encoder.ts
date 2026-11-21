export interface GifFrameInput {
  rgba: Uint8ClampedArray;
  durationMs: number;
}

export interface EncodeGifOptions {
  width: number;
  height: number;
  frames: readonly GifFrameInput[];
  /** Nearest-neighbor integer pixel scale factor (1..16, default 1). */
  scale?: number;
  /** Infinite loop via NETSCAPE2.0 extension (default true). */
  loop?: boolean;
}

function writeUint16LE(out: number[], value: number): void {
  out.push(value & 0xff, (value >> 8) & 0xff);
}

function upscaleNearestRgba(
  src: Uint8ClampedArray,
  width: number,
  height: number,
  scale: number,
): Uint8ClampedArray {
  if (scale <= 1) return src;
  const outW = width * scale;
  const outH = height * scale;
  const dst = new Uint8ClampedArray(outW * outH * 4);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sOff = (y * width + x) * 4;
      const r = src[sOff] ?? 0;
      const g = src[sOff + 1] ?? 0;
      const b = src[sOff + 2] ?? 0;
      const a = src[sOff + 3] ?? 0;

      for (let sy = 0; sy < scale; sy += 1) {
        const dy = y * scale + sy;
        for (let sx = 0; sx < scale; sx += 1) {
          const dx = x * scale + sx;
          const dOff = (dy * outW + dx) * 4;
          dst[dOff] = r;
          dst[dOff + 1] = g;
          dst[dOff + 2] = b;
          dst[dOff + 3] = a;
        }
      }
    }
  }
  return dst;
}

/**
 * Builds a Local Color Table (index 0 reserved for transparency, up to 255 opaque colors)
 * and maps every RGBA pixel to a palette index.
 */
function quantizeFrameToLocalPalette(
  rgba: Uint8ClampedArray,
  pixelCount: number,
): {
  paletteRgb: Uint8Array;
  lctBits: number;
  indices: Uint8Array;
} {
  // Count opaque colors
  const colorCounts = new Map<number, number>();
  for (let i = 0; i < pixelCount; i += 1) {
    const off = i * 4;
    const a = rgba[off + 3] ?? 0;
    if (a < 128) continue;
    const key = ((rgba[off] ?? 0) << 16) | ((rgba[off + 1] ?? 0) << 8) | (rgba[off + 2] ?? 0);
    colorCounts.set(key, (colorCounts.get(key) ?? 0) + 1);
  }

  let paletteKeys: number[];
  if (colorCounts.size <= 255) {
    paletteKeys = Array.from(colorCounts.keys());
  } else {
    // Keep top 255 most frequent colors (fast & crisp for pixel art)
    paletteKeys = Array.from(colorCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 255)
      .map(([k]) => k);
  }

  const totalEntriesNeeded = Math.max(2, paletteKeys.length + 1); // +1 for index 0 transparent
  let lctBits = 2; // minimum 4 entries so minCodeSize >= 2
  while ((1 << lctBits) < totalEntriesNeeded && lctBits < 8) {
    lctBits += 1;
  }
  const tableSize = 1 << lctBits;
  const paletteRgb = new Uint8Array(tableSize * 3);
  const exactLookup = new Map<number, number>();

  for (let i = 0; i < paletteKeys.length; i += 1) {
    const key = paletteKeys[i]!;
    const idx = i + 1; // 0 is transparent
    paletteRgb[idx * 3] = (key >> 16) & 0xff;
    paletteRgb[idx * 3 + 1] = (key >> 8) & 0xff;
    paletteRgb[idx * 3 + 2] = key & 0xff;
    exactLookup.set(key, idx);
  }

  const nearestCache = new Map<number, number>();
  const indices = new Uint8Array(pixelCount);

  for (let i = 0; i < pixelCount; i += 1) {
    const off = i * 4;
    const a = rgba[off + 3] ?? 0;
    if (a < 128) {
      indices[i] = 0;
      continue;
    }
    const r = rgba[off] ?? 0;
    const g = rgba[off + 1] ?? 0;
    const b = rgba[off + 2] ?? 0;
    const key = (r << 16) | (g << 8) | b;

    const exact = exactLookup.get(key);
    if (exact !== undefined) {
      indices[i] = exact;
      continue;
    }

    const cached = nearestCache.get(key);
    if (cached !== undefined) {
      indices[i] = cached;
      continue;
    }

    let bestIdx = 1;
    let bestDist = Infinity;
    for (let p = 1; p <= paletteKeys.length; p += 1) {
      const dr = r - (paletteRgb[p * 3] ?? 0);
      const dg = g - (paletteRgb[p * 3 + 1] ?? 0);
      const db = b - (paletteRgb[p * 3 + 2] ?? 0);
      const dist = dr * dr + dg * dg + db * db;
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = p;
      }
    }
    nearestCache.set(key, bestIdx);
    indices[i] = bestIdx;
  }

  return { paletteRgb, lctBits, indices };
}

/**
 * Standard GIF89a variable-width LZW encoder emitting packed sub-blocks.
 */
function encodeLzwSubBlocks(indices: Uint8Array, minCodeSize: number): number[] {
  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;

  const subBlocks: number[] = [];
  const blockBuf: number[] = [];

  let bitAcc = 0;
  let bitCount = 0;

  function pushByte(byte: number) {
    blockBuf.push(byte & 0xff);
    if (blockBuf.length === 255) {
      subBlocks.push(255, ...blockBuf);
      blockBuf.length = 0;
    }
  }

  function writeCode(code: number, width: number) {
    bitAcc |= code << bitCount;
    bitCount += width;
    while (bitCount >= 8) {
      pushByte(bitAcc & 0xff);
      bitAcc >>= 8;
      bitCount -= 8;
    }
  }

  let codeSize = minCodeSize + 1;
  let nextCode = eoiCode + 1;
  const dict = new Map<number, number>();

  writeCode(clearCode, codeSize);

  if (indices.length > 0) {
    let prefix = indices[0]!;
    for (let i = 1; i < indices.length; i += 1) {
      const k = indices[i]!;
      const key = (prefix << 8) | k;
      const found = dict.get(key);
      if (found !== undefined) {
        prefix = found;
      } else {
        writeCode(prefix, codeSize);

        if (nextCode < 4096) {
          dict.set(key, nextCode);
          // Match GIF89a decoder 1-step lag: bump width when inserted code reaches 2^codeSize
          if (nextCode === 1 << codeSize && codeSize < 12) {
            codeSize += 1;
          }
          nextCode += 1;
        } else {
          writeCode(clearCode, codeSize);
          dict.clear();
          codeSize = minCodeSize + 1;
          nextCode = eoiCode + 1;
        }
        prefix = k;
      }
    }
    writeCode(prefix, codeSize);
  }

  writeCode(eoiCode, codeSize);
  if (bitCount > 0) {
    pushByte(bitAcc & 0xff);
  }
  if (blockBuf.length > 0) {
    subBlocks.push(blockBuf.length, ...blockBuf);
  }
  subBlocks.push(0x00); // Block terminator
  return subBlocks;
}

/**
 * Pure TypeScript GIF89a animated image encoder tailored for crisp pixel art.
 * Supports per-frame delays, transparency (with disposal=2), looping, and integer upscaling.
 */
export function encodeAnimatedGif(options: EncodeGifOptions): Uint8Array {
  const scale = Math.max(1, Math.min(16, Math.trunc(options.scale ?? 1)));
  const outWidth = Math.max(1, Math.trunc(options.width) * scale);
  const outHeight = Math.max(1, Math.trunc(options.height) * scale);
  const loop = options.loop ?? true;

  if (options.frames.length === 0) {
    throw new Error('Impossible d’encoder un GIF sans aucune frame.');
  }

  const out: number[] = [];

  // 1. GIF89a Header
  out.push(0x47, 0x49, 0x46, 0x38, 0x39, 0x61);

  // 2. Logical Screen Descriptor (no Global Color Table; each frame provides its own LCT)
  writeUint16LE(out, outWidth);
  writeUint16LE(out, outHeight);
  out.push(0x70, 0x00, 0x00);

  // 3. NETSCAPE2.0 Infinite Loop Application Extension
  if (loop) {
    out.push(
      0x21,
      0xff,
      0x0b,
      0x4e,
      0x45,
      0x54,
      0x53,
      0x43,
      0x41,
      0x50,
      0x45,
      0x32,
      0x2e,
      0x30,
      0x03,
      0x01,
      0x00,
      0x00,
      0x00,
    );
  }

  const pixelCount = outWidth * outHeight;

  // 4. Encode every frame
  for (const frame of options.frames) {
    const scaledRgba = upscaleNearestRgba(frame.rgba, options.width, options.height, scale);
    const { paletteRgb, lctBits, indices } = quantizeFrameToLocalPalette(scaledRgba, pixelCount);
    const delayCs = Math.max(2, Math.min(65535, Math.round(frame.durationMs / 10)));

    // Graphic Control Extension (disposal=2 restore background + transparent index 0)
    out.push(0x21, 0xf9, 0x04, 0x09);
    writeUint16LE(out, delayCs);
    out.push(0x00, 0x00);

    // Image Descriptor
    out.push(0x2c);
    writeUint16LE(out, 0);
    writeUint16LE(out, 0);
    writeUint16LE(out, outWidth);
    writeUint16LE(out, outHeight);
    out.push(0x80 | (lctBits - 1));

    // Local Color Table
    for (let i = 0; i < paletteRgb.length; i += 1) {
      out.push(paletteRgb[i]!);
    }

    // LZW Image Data
    const minCodeSize = Math.max(2, lctBits);
    out.push(minCodeSize);
    const lzwBlocks = encodeLzwSubBlocks(indices, minCodeSize);
    for (let i = 0; i < lzwBlocks.length; i += 1) {
      out.push(lzwBlocks[i]!);
    }
  }

  // 5. GIF Trailer
  out.push(0x3b);
  return new Uint8Array(out);
}
