import type { AnimationClip, AnimationEventMarker } from '@rpg-player/core-types';
import type { TimelinePlaybackSpeed, TimelineStepResult } from './types.js';

/**
 * Pure TypeScript frame-accurate timeline player supporting per-frame durations,
 * playback speed multipliers (x0.5 / x1 / x2), looping, and exact event marker emission
 * (e.g. `hit_frame`, `vfx_spawn`, `camera_shake`).
 */
export class AnimationTimelinePlayer {
  private clip: AnimationClip;
  private frameIndex = 0;
  private elapsedInFrameMs = 0;
  private playing = true;
  private completed = false;
  private speed: TimelinePlaybackSpeed | number = 1;
  private firedInitialFrameMarkers = false;

  constructor(clip: AnimationClip, autoPlay = true) {
    this.clip = clip;
    this.playing = autoPlay;
  }

  setClip(clip: AnimationClip, resetToStart = true): void {
    this.clip = clip;
    if (resetToStart) {
      this.reset();
    }
  }

  getClip(): Readonly<AnimationClip> {
    return this.clip;
  }

  setSpeed(speed: TimelinePlaybackSpeed | number): void {
    this.speed = Math.max(0.1, Math.min(8, speed));
  }

  getSpeed(): number {
    return this.speed;
  }

  play(): void {
    if (this.completed) {
      this.reset();
    }
    this.playing = true;
  }

  pause(): void {
    this.playing = false;
  }

  isPlaying(): boolean {
    return this.playing;
  }

  isCompleted(): boolean {
    return this.completed;
  }

  reset(): void {
    this.frameIndex = 0;
    this.elapsedInFrameMs = 0;
    this.completed = false;
    this.firedInitialFrameMarkers = false;
  }

  seekFrame(index: number): void {
    const count = Math.max(1, this.clip.frames.length);
    this.frameIndex = Math.max(0, Math.min(count - 1, Math.trunc(index)));
    this.elapsedInFrameMs = 0;
    this.completed = false;
    this.firedInitialFrameMarkers = true;
  }

  getFrameIndex(): number {
    return this.frameIndex;
  }

  getCurrentSpriteFrame(): number {
    return this.clip.frames[this.frameIndex] ?? 0;
  }

  getFrameDurationMs(index: number): number {
    const custom = this.clip.frameDurationsMs?.[index];
    if (custom && custom > 0) {
      return custom;
    }
    const fps = Math.max(1, this.clip.fps || 6);
    return 1000 / fps;
  }

  getTotalDurationMs(): number {
    const count = Math.max(1, this.clip.frames.length);
    let total = 0;
    for (let i = 0; i < count; i += 1) {
      total += this.getFrameDurationMs(i);
    }
    return total;
  }

  private markersAt(index: number): AnimationEventMarker[] {
    if (!this.clip.markers || this.clip.markers.length === 0) return [];
    return this.clip.markers.filter((m) => m.frameIndex === index);
  }

  /**
   * Advances playback by `dtMs` milliseconds and returns all markers crossed during this tick.
   */
  step(dtMs: number): TimelineStepResult {
    const triggeredMarkers: AnimationEventMarker[] = [];
    const frameCount = Math.max(1, this.clip.frames.length);

    if (!this.firedInitialFrameMarkers && this.playing && !this.completed) {
      this.firedInitialFrameMarkers = true;
      triggeredMarkers.push(...this.markersAt(this.frameIndex));
    }

    if (!this.playing || this.completed || dtMs <= 0) {
      return {
        frameIndex: this.frameIndex,
        spriteFrame: this.getCurrentSpriteFrame(),
        triggeredMarkers,
        completed: this.completed,
      };
    }

    this.elapsedInFrameMs += dtMs * this.speed;
    let safety = 0;

    while (safety < 64) {
      safety += 1;
      const duration = this.getFrameDurationMs(this.frameIndex);
      if (this.elapsedInFrameMs < duration) {
        break;
      }

      this.elapsedInFrameMs -= duration;
      const nextIndex = this.frameIndex + 1;

      if (nextIndex >= frameCount) {
        if (this.clip.loop ?? true) {
          this.frameIndex = 0;
          triggeredMarkers.push(...this.markersAt(0));
        } else {
          this.frameIndex = frameCount - 1;
          this.elapsedInFrameMs = 0;
          this.completed = true;
          this.playing = false;
          break;
        }
      } else {
        this.frameIndex = nextIndex;
        triggeredMarkers.push(...this.markersAt(this.frameIndex));
      }
    }

    return {
      frameIndex: this.frameIndex,
      spriteFrame: this.getCurrentSpriteFrame(),
      triggeredMarkers,
      completed: this.completed,
    };
  }
}
