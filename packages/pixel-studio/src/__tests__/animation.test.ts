import { describe, expect, it } from 'vitest';
import type { AnimationClip } from '@rpg-player/core-types';
import { AnimationTimelinePlayer, PixelStudioEngine } from '../index.js';

describe('Animation Studio core (multi-frame, onion skinning, timeline markers)', () => {
  it('manages multi-frame timelines with duplicate, reorder, duration, and Undo/Redo', () => {
    const engine = new PixelStudioEngine({ assetId: 'vfx_slash', width: 16, height: 16 });
    engine.setHexColor('#ff0000');
    engine.beginStroke({ x: 2, y: 2 });
    engine.endStroke();

    // Duplicate frame 0 -> frame 1 keeps the drawn pixel
    const dup = engine.duplicateFrame(0);
    expect(dup).not.toBeNull();
    expect(engine.getFrames()).toHaveLength(2);
    expect(engine.getActiveFrameIndex()).toBe(1);
    expect(engine.renderFrame(1)[(2 * 16 + 2) * 4]).toBe(255);

    // Add blank frame 2 with custom duration
    engine.addFrame(80);
    expect(engine.getFrames()).toHaveLength(3);
    expect(engine.getFrames()[2]?.durationMs).toBe(80);

    // Onion skinning shows previous frame ghost pixel on empty frame 2
    const withOnion = engine.renderActiveFrameWithOnionSkin({
      enabled: true,
      showPrevious: true,
      showNext: false,
      opacity: 0.4,
    });
    expect(withOnion[(2 * 16 + 2) * 4 + 3]).toBeGreaterThan(0);

    // Undo removes frame 2 cleanly
    expect(engine.undo()).toBe(true);
    expect(engine.getFrames()).toHaveLength(2);
  });

  it('fires exact event markers (hit_frame, vfx_spawn) with per-frame durations and playback speed', () => {
    const clip: AnimationClip = {
      category: 'combat',
      frames: [0, 1, 2, 3],
      fps: 10,
      frameDurationsMs: [100, 100, 50, 150],
      loop: false,
      markers: [
        { frameIndex: 2, event: 'hit_frame', payload: 'slash' },
        { frameIndex: 2, event: 'vfx_spawn', payload: 'vfx_impact' },
      ],
    };

    const player = new AnimationTimelinePlayer(clip, true);
    // Advance 100ms -> frame 1 (no hit_frame yet)
    const step1 = player.step(100);
    expect(step1.frameIndex).toBe(1);
    expect(step1.triggeredMarkers).toHaveLength(0);

    // Advance 100ms -> frame 2 => hit_frame & vfx_spawn fire!
    const step2 = player.step(100);
    expect(step2.frameIndex).toBe(2);
    expect(step2.triggeredMarkers.map((m) => m.event)).toEqual(['hit_frame', 'vfx_spawn']);

    // Double speed (x2): advancing 100ms real time = 200ms clip time -> completes clip!
    player.setSpeed(2);
    const step3 = player.step(100);
    expect(step3.completed).toBe(true);
    expect(step3.frameIndex).toBe(3);
  });

  it('encodes valid animated GIF89a with transparency, loop, scaling, and decodable LZW frames', () => {
    const engine = new PixelStudioEngine({ assetId: 'gif_test', width: 8, height: 8 });
    // Frame 0: red & green pixels on transparent background
    engine.setHexColor('#ff0000');
    engine.beginStroke({ x: 1, y: 1 });
    engine.endStroke();
    engine.setHexColor('#00ff00');
    engine.beginStroke({ x: 6, y: 6 });
    engine.endStroke();

    // Frame 1: blue pixel with 200ms delay
    engine.addFrame(200);
    engine.setHexColor('#0000ff');
    engine.beginStroke({ x: 3, y: 4 });
    engine.endStroke();

    const gif = engine.exportGif({ scale: 2, loop: true });

    // Check GIF89a header + trailer
    const header = String.fromCharCode(...gif.slice(0, 6));
    expect(header).toBe('GIF89a');
    expect(gif[gif.length - 1]).toBe(0x3b);

    // Check scaled Logical Screen Descriptor (16x16)
    const width = gif[6]! | (gif[7]! << 8);
    const height = gif[8]! | (gif[9]! << 8);
    expect(width).toBe(16);
    expect(height).toBe(16);

    // Minimal GIF89a + LZW parser to verify every frame decodes to exact pixel count
    let pos = 13;
    let frameCount = 0;
    let sawNetscape = false;
    const decodedFrameDelaysCs: number[] = [];

    while (pos < gif.length && gif[pos] !== 0x3b) {
      const introducer = gif[pos++]!;
      if (introducer === 0x21) {
        const label = gif[pos++]!;
        if (label === 0xff) {
          // Application extension
          const blockSize = gif[pos++]!;
          const appId = String.fromCharCode(...gif.slice(pos, pos + blockSize));
          if (appId === 'NETSCAPE2.0') sawNetscape = true;
          pos += blockSize;
          while (gif[pos] !== 0) {
            pos += 1 + gif[pos]!;
          }
          pos += 1;
        } else if (label === 0xf9) {
          // Graphic Control Extension
          const blockSize = gif[pos++]!;
          expect(blockSize).toBe(4);
          pos += 1; // packed
          const delay = gif[pos]! | (gif[pos + 1]! << 8);
          decodedFrameDelaysCs.push(delay);
          pos += 3; // delay + transparent index
          expect(gif[pos++]).toBe(0);
        }
      } else if (introducer === 0x2c) {
        // Image Descriptor
        const iw = gif[pos + 4]! | (gif[pos + 5]! << 8);
        const ih = gif[pos + 6]! | (gif[pos + 7]! << 8);
        const packed = gif[pos + 8]!;
        pos += 9;

        const hasLct = (packed & 0x80) !== 0;
        expect(hasLct).toBe(true);
        const lctSize = 1 << ((packed & 0x07) + 1);
        pos += lctSize * 3; // skip LCT

        const minCodeSize = gif[pos++]!;
        const dataBytes: number[] = [];
        while (gif[pos] !== 0) {
          const subLen = gif[pos++]!;
          for (let i = 0; i < subLen; i += 1) dataBytes.push(gif[pos++]!);
        }
        pos += 1; // terminator

        // Standard GIF LZW decoder verification
        const clearCode = 1 << minCodeSize;
        const eoiCode = clearCode + 1;
        let codeSize = minCodeSize + 1;
        let nextCode = eoiCode + 1;
        let bitPos = 0;
        const readCode = (): number => {
          let val = 0;
          for (let b = 0; b < codeSize; b += 1) {
            const byteIdx = (bitPos + b) >> 3;
            const bitIdx = (bitPos + b) & 7;
            val |= (((dataBytes[byteIdx] ?? 0) >> bitIdx) & 1) << b;
          }
          bitPos += codeSize;
          return val;
        };

        const table: number[][] = [];
        const resetTable = () => {
          table.length = 0;
          for (let i = 0; i < clearCode; i += 1) table[i] = [i];
          table[clearCode] = [];
          table[eoiCode] = [];
          codeSize = minCodeSize + 1;
          nextCode = eoiCode + 1;
        };
        resetTable();

        const decodedPixels: number[] = [];
        let prevEntry: number[] | null = null;
        while (true) {
          const code = readCode();
          if (code === clearCode) {
            resetTable();
            prevEntry = null;
            continue;
          }
          if (code === eoiCode) break;

          let entry: number[];
          if (code < table.length && table[code]) {
            entry = table[code]!;
          } else if (code === nextCode && prevEntry) {
            entry = [...prevEntry, prevEntry[0]!];
          } else {
            throw new Error(`Invalid LZW code ${code} (nextCode=${nextCode})`);
          }
          decodedPixels.push(...entry);

          if (prevEntry && nextCode < 4096) {
            table[nextCode] = [...prevEntry, entry[0]!];
            nextCode += 1;
            if (nextCode === 1 << codeSize && codeSize < 12) {
              codeSize += 1;
            }
          }
          prevEntry = entry;
        }

        expect(decodedPixels.length).toBe(iw * ih);
        frameCount += 1;
      }
    }

    expect(sawNetscape).toBe(true);
    expect(frameCount).toBe(2);
    expect(decodedFrameDelaysCs).toEqual([13, 20]); // 125ms -> 13cs, 200ms -> 20cs
  });
});
