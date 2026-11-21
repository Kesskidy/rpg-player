/**
 * Pure TypeScript RGBA PNG encoder (RFC 2083).
 * Works identically in Node/Vitest headless tests and browsers without HTMLCanvasElement.
 */

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

const CRC32_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let c = n;
  for (let k = 0; k < 8; k += 1) {
    c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC32_TABLE[n] = c >>> 0;
}

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    c = (CRC32_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8)) >>> 0;
  }
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Uint8Array): number {
  const MOD_ADLER = 65521;
  let a = 1;
  let b = 0;
  for (let i = 0; i < bytes.length; i += 1) {
    a = (a + bytes[i]!) % MOD_ADLER;
    b = (b + a) % MOD_ADLER;
  }
  return ((b << 16) | a) >>> 0;
}

function writeUint32BE(target: Uint8Array, offset: number, value: number): void {
  target[offset] = (value >>> 24) & 0xff;
  target[offset + 1] = (value >>> 16) & 0xff;
  target[offset + 2] = (value >>> 8) & 0xff;
  target[offset + 3] = value & 0xff;
}

function makeChunk(type: string, data: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(12 + data.length);
  writeUint32BE(chunk, 0, data.length);
  chunk[4] = type.charCodeAt(0);
  chunk[5] = type.charCodeAt(1);
  chunk[6] = type.charCodeAt(2);
  chunk[7] = type.charCodeAt(3);
  chunk.set(data, 8);
  const crc = crc32(chunk.subarray(4, 8 + data.length));
  writeUint32BE(chunk, 8 + data.length, crc);
  return chunk;
}

/**
 * Wraps raw uncompressed data in a valid zlib stream using DEFLATE stored blocks (BTYPE=00).
 */
function wrapZlibStored(raw: Uint8Array): Uint8Array {
  const MAX_BLOCK = 65535;
  const blockCount = Math.max(1, Math.ceil(raw.length / MAX_BLOCK));
  const totalSize = 2 + raw.length + blockCount * 5 + 4;
  const out = new Uint8Array(totalSize);

  // Zlib header: CMF=0x78 (deflate, 32K window), FLG=0x01 (check bits valid, no dict)
  out[0] = 0x78;
  out[1] = 0x01;

  let outOffset = 2;
  let inOffset = 0;

  for (let b = 0; b < blockCount; b += 1) {
    const remaining = raw.length - inOffset;
    const len = Math.min(MAX_BLOCK, remaining);
    const isFinal = b === blockCount - 1;
    const nlen = ~len & 0xffff;

    out[outOffset++] = isFinal ? 0x01 : 0x00;
    out[outOffset++] = len & 0xff;
    out[outOffset++] = (len >>> 8) & 0xff;
    out[outOffset++] = nlen & 0xff;
    out[outOffset++] = (nlen >>> 8) & 0xff;

    out.set(raw.subarray(inOffset, inOffset + len), outOffset);
    outOffset += len;
    inOffset += len;
  }

  writeUint32BE(out, outOffset, adler32(raw));
  return out;
}

export function encodeRgbaToPng(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
): Uint8Array {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error(`Dimensions PNG invalides : ${width}x${height}`);
  }
  const expectedLength = width * height * 4;
  if (rgba.length !== expectedLength) {
    throw new Error(
      `Longueur RGBA invalide pour PNG ${width}x${height} : attendu ${expectedLength}, reçu ${rgba.length}.`,
    );
  }

  // IHDR chunk (13 bytes)
  const ihdrData = new Uint8Array(13);
  writeUint32BE(ihdrData, 0, width);
  writeUint32BE(ihdrData, 4, height);
  ihdrData[8] = 8; // Bit depth: 8 bits per channel
  ihdrData[9] = 6; // Color type: 6 = Truecolor with alpha (RGBA)
  ihdrData[10] = 0; // Compression method: DEFLATE
  ihdrData[11] = 0; // Filter method: adaptive
  ihdrData[12] = 0; // Interlace: none

  // Raw scanlines with filter type 0 (None) prepended to each row
  const rowBytes = width * 4;
  const rawScanlines = new Uint8Array((rowBytes + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const dstStart = y * (rowBytes + 1);
    rawScanlines[dstStart] = 0; // Filter: None
    const srcStart = y * rowBytes;
    rawScanlines.set(rgba.subarray(srcStart, srcStart + rowBytes), dstStart + 1);
  }

  const ihdrChunk = makeChunk('IHDR', ihdrData);
  const idatChunk = makeChunk('IDAT', wrapZlibStored(rawScanlines));
  const iendChunk = makeChunk('IEND', new Uint8Array(0));

  const png = new Uint8Array(
    PNG_SIGNATURE.length + ihdrChunk.length + idatChunk.length + iendChunk.length,
  );
  let cursor = 0;
  png.set(PNG_SIGNATURE, cursor);
  cursor += PNG_SIGNATURE.length;
  png.set(ihdrChunk, cursor);
  cursor += ihdrChunk.length;
  png.set(idatChunk, cursor);
  cursor += idatChunk.length;
  png.set(iendChunk, cursor);

  return png;
}
