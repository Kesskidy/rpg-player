import { blendPixelOver } from '@rpg-player/pixel-studio';
import { PAL, rgba } from './palette.js';

/**
 * Lightweight procedural pixel-art drawing canvas over an RGBA buffer.
 * Supports crisp outlines, ovals, rounded boxes, shading, dithering, and sub-blitting.
 */
export class PixelCanvas {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8ClampedArray;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.pixels = new Uint8ClampedArray(width * height * 4);
  }

  px(x: number, y: number, hex: string): void {
    const ix = Math.trunc(x);
    const iy = Math.trunc(y);
    if (ix < 0 || iy < 0 || ix >= this.width || iy >= this.height) return;
    const c = rgba(hex);
    const offset = (iy * this.width + ix) * 4;
    if (c.a === 255) {
      this.pixels[offset] = c.r;
      this.pixels[offset + 1] = c.g;
      this.pixels[offset + 2] = c.b;
      this.pixels[offset + 3] = 255;
    } else if (c.a > 0) {
      blendPixelOver(this.pixels, offset, c.r, c.g, c.b, c.a, 1);
    }
  }

  isOpaque(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return false;
    return (this.pixels[(y * this.width + x) * 4 + 3] ?? 0) >= 160;
  }

  fill(hex: string): void {
    this.rect(0, 0, this.width, this.height, hex);
  }

  rect(x: number, y: number, w: number, h: number, hex: string): void {
    const x0 = Math.trunc(x);
    const y0 = Math.trunc(y);
    const x1 = Math.trunc(x + w);
    const y1 = Math.trunc(y + h);
    for (let py = y0; py < y1; py += 1) {
      for (let px = x0; px < x1; px += 1) {
        this.px(px, py, hex);
      }
    }
  }

  strokeRect(x: number, y: number, w: number, h: number, hex: string): void {
    this.rect(x, y, w, 1, hex);
    this.rect(x, y + h - 1, w, 1, hex);
    this.rect(x, y, 1, h, hex);
    this.rect(x + w - 1, y, 1, h, hex);
  }

  bevelBox(
    x: number,
    y: number,
    w: number,
    h: number,
    fillHex: string,
    lightHex: string,
    darkHex: string,
    outlineHex: string = PAL.ink,
  ): void {
    this.rect(x, y, w, h, fillHex);
    this.rect(x + 1, y + 1, w - 2, 1, lightHex);
    this.rect(x + 1, y + 1, 1, h - 2, lightHex);
    this.rect(x + 1, y + h - 2, w - 2, 1, darkHex);
    this.rect(x + w - 2, y + 1, 1, h - 2, darkHex);
    this.strokeRect(x, y, w, h, outlineHex);
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, hex: string): void {
    const x0 = Math.floor(cx - rx);
    const x1 = Math.ceil(cx + rx);
    const y0 = Math.floor(cy - ry);
    const y1 = Math.ceil(cy + ry);
    for (let py = y0; py <= y1; py += 1) {
      for (let px = x0; px <= x1; px += 1) {
        const nx = (px - cx) / rx;
        const ny = (py - cy) / ry;
        if (nx * nx + ny * ny <= 1.0) {
          this.px(px, py, hex);
        }
      }
    }
  }

  line(x0: number, y0: number, x1: number, y1: number, hex: string): void {
    let ax = Math.trunc(x0);
    let ay = Math.trunc(y0);
    const bx = Math.trunc(x1);
    const by = Math.trunc(y1);
    const dx = Math.abs(bx - ax);
    const dy = Math.abs(by - ay);
    const sx = ax < bx ? 1 : -1;
    const sy = ay < by ? 1 : -1;
    let err = dx - dy;
    for (;;) {
      this.px(ax, ay, hex);
      if (ax === bx && ay === by) break;
      const e2 = err * 2;
      if (e2 > -dy) {
        err -= dy;
        ax += sx;
      }
      if (e2 < dx) {
        err += dx;
        ay += sy;
      }
    }
  }

  ditherRect(x: number, y: number, w: number, h: number, hexA: string, hexB: string): void {
    for (let py = y; py < y + h; py += 1) {
      for (let px = x; px < x + w; px += 1) {
        this.px(px, py, (px + py) % 2 === 0 ? hexA : hexB);
      }
    }
  }

  /**
   * Adds a crisp 1px dark silhouette outline around all opaque pixels (classic RPG pixel art look).
   */
  addOutline(outlineHex: string = PAL.ink): void {
    const toOutline: Array<[number, number]> = [];
    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        if (this.isOpaque(x, y)) continue;
        if (
          this.isOpaque(x - 1, y) ||
          this.isOpaque(x + 1, y) ||
          this.isOpaque(x, y - 1) ||
          this.isOpaque(x, y + 1)
        ) {
          toOutline.push([x, y]);
        }
      }
    }
    for (const [x, y] of toOutline) {
      this.px(x, y, outlineHex);
    }
  }

  /**
   * Copies another PixelCanvas onto this canvas at (dstX, dstY) using alpha blending.
   */
  blit(src: PixelCanvas, dstX: number, dstY: number): void {
    for (let y = 0; y < src.height; y += 1) {
      const ty = dstY + y;
      if (ty < 0 || ty >= this.height) continue;
      for (let x = 0; x < src.width; x += 1) {
        const tx = dstX + x;
        if (tx < 0 || tx >= this.width) continue;
        const srcOff = (y * src.width + x) * 4;
        const sa = src.pixels[srcOff + 3] ?? 0;
        if (sa === 0) continue;
        const dstOff = (ty * this.width + tx) * 4;
        blendPixelOver(
          this.pixels,
          dstOff,
          src.pixels[srcOff] ?? 0,
          src.pixels[srcOff + 1] ?? 0,
          src.pixels[srcOff + 2] ?? 0,
          sa,
          1,
        );
      }
    }
  }
}

export function packFramesHorizontal(frames: readonly PixelCanvas[]): PixelCanvas {
  const fw = frames[0]!.width;
  const fh = frames[0]!.height;
  const sheet = new PixelCanvas(fw * frames.length, fh);
  for (let i = 0; i < frames.length; i += 1) {
    sheet.blit(frames[i]!, i * fw, 0);
  }
  return sheet;
}
