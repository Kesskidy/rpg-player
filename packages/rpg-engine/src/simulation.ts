import type { ColliderBox, MapEvent, TileMapData } from '@rpg-player/core-types';
import { createDefaultFeetCollider } from './map-editor-core.js';
import type { InputState, PlayerRuntimeState, WorldRect } from './types.js';

export function resolveColliderRect(footX: number, footY: number, collider: ColliderBox): WorldRect {
  return {
    x: footX + collider.offsetX,
    y: footY + collider.offsetY,
    width: collider.width,
    height: collider.height,
  };
}

export function rectsOverlap(a: WorldRect, b: WorldRect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

export function getMapEventFootPosition(event: MapEvent, tileSize: number): { x: number; y: number } {
  return {
    x: (event.x + 0.5) * tileSize,
    y: (event.y + 0.9) * tileSize,
  };
}

export function getMapEventColliderRect(event: MapEvent, tileSize: number): WorldRect {
  const foot = getMapEventFootPosition(event, tileSize);
  const collider = event.collider ?? createDefaultFeetCollider(tileSize);
  return resolveColliderRect(foot.x, foot.y, collider);
}

/**
 * Pure TypeScript 2D movement & collision runtime (zero PixiJS/DOM dependencies).
 * Dissociates visual height from ground collision footprints:
 * - Static collisions come strictly from `map.collisionLayer.cells`
 * - Dynamic/entity collisions test exact feet AABB overlap against every entity with `isSolid: true`
 */
export class RpgSimulation {
  private map: TileMapData;
  private player: PlayerRuntimeState;
  private input: InputState = { up: false, down: false, left: false, right: false };

  constructor(map: TileMapData) {
    this.map = map;
    this.player = this.createInitialPlayer(map);
  }

  private createInitialPlayer(map: TileMapData): PlayerRuntimeState {
    const ts = map.tileSize;
    const collider = map.playerCollider
      ? { ...map.playerCollider }
      : createDefaultFeetCollider(ts);

    return {
      x: (map.playerSpawn.x + 0.5) * ts,
      y: (map.playerSpawn.y + 0.9) * ts,
      direction: map.playerSpawn.direction,
      isMoving: false,
      speedPxPerSec: ts * 4.2,
      collider,
    };
  }

  updateMap(map: TileMapData, resetPlayer = false): void {
    this.map = map;
    if (resetPlayer) {
      this.resetToSpawn();
    } else if (map.playerCollider) {
      this.player.collider = { ...map.playerCollider };
    }
  }

  resetToSpawn(): void {
    this.player = this.createInitialPlayer(this.map);
  }

  setInput(next: Partial<InputState>): void {
    this.input = { ...this.input, ...next };
  }

  clearInput(): void {
    this.input = { up: false, down: false, left: false, right: false };
  }

  getPlayerState(): Readonly<PlayerRuntimeState> {
    return this.player;
  }

  getPlayerColliderRect(): WorldRect {
    return resolveColliderRect(this.player.x, this.player.y, this.player.collider);
  }

  /** Checks static `collisionLayer` grid solidity (independent of visual tiles). */
  isTileBlocked(tx: number, ty: number): boolean {
    if (tx < 0 || ty < 0 || tx >= this.map.width || ty >= this.map.height) {
      return true;
    }
    return (this.map.collisionLayer.cells[ty * this.map.width + tx] ?? 0) !== 0;
  }

  /**
   * Checks whether the player's feet AABB at anchor (footX, footY) overlaps:
   * 1. Map boundaries
   * 2. Static blocked cells in `map.collisionLayer`
   * 3. Any solid entity (`event.isSolid === true`) using its feet AABB `collider`
   */
  collidesAt(footX: number, footY: number): boolean {
    const rect = resolveColliderRect(footX, footY, this.player.collider);
    const minX = rect.x;
    const maxX = rect.x + rect.width - 0.001;
    const minY = rect.y;
    const maxY = rect.y + rect.height - 0.001;

    const worldWidth = this.map.width * this.map.tileSize;
    const worldHeight = this.map.height * this.map.tileSize;
    if (minX < 0 || minY < 0 || maxX >= worldWidth || maxY >= worldHeight) {
      return true;
    }

    const ts = this.map.tileSize;
    const startTx = Math.floor(minX / ts);
    const endTx = Math.floor(maxX / ts);
    const startTy = Math.floor(minY / ts);
    const endTy = Math.floor(maxY / ts);

    for (let ty = startTy; ty <= endTy; ty += 1) {
      for (let tx = startTx; tx <= endTx; tx += 1) {
        if (this.isTileBlocked(tx, ty)) {
          return true;
        }
      }
    }

    // Dynamic / static entity feet AABB collision checks
    for (const ev of this.map.events) {
      if (!ev.isSolid) continue;
      const evRect = getMapEventColliderRect(ev, ts);
      if (rectsOverlap(rect, evRect)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Returns the nearest interactable map event directly in front of or under the player.
   */
  findInteractableEvent(): MapEvent | null {
    const events = this.map.events;
    if (events.length === 0) return null;

    const ts = this.map.tileSize;
    const playerRect = this.getPlayerColliderRect();
    const centerX = playerRect.x + playerRect.width / 2;
    const centerY = playerRect.y + playerRect.height / 2;
    const playerTx = Math.floor(centerX / ts);
    const playerTy = Math.floor(centerY / ts);

    let frontTx = playerTx;
    let frontTy = playerTy;
    if (this.player.direction === 'up') frontTy -= 1;
    else if (this.player.direction === 'down') frontTy += 1;
    else if (this.player.direction === 'left') frontTx -= 1;
    else if (this.player.direction === 'right') frontTx += 1;

    const frontEvent = events.find(
      (ev) => ev.trigger === 'interact' && ev.x === frontTx && ev.y === frontTy,
    );
    if (frontEvent) return frontEvent;

    const underEvent = events.find(
      (ev) => ev.trigger === 'interact' && ev.x === playerTx && ev.y === playerTy,
    );
    if (underEvent) return underEvent;

    const maxDistSq = (ts * 1.2) ** 2;
    let closest: MapEvent | null = null;
    let closestDist = Infinity;
    for (const ev of events) {
      if (ev.trigger !== 'interact') continue;
      const foot = getMapEventFootPosition(ev, ts);
      const distSq = (foot.x - this.player.x) ** 2 + (foot.y - this.player.y) ** 2;
      if (distSq <= maxDistSq && distSq < closestDist) {
        closest = ev;
        closestDist = distSq;
      }
    }
    return closest;
  }

  findTouchedEvent(): MapEvent | null {
    const events = this.map.events;
    if (events.length === 0) return null;
    const ts = this.map.tileSize;
    const rect = this.getPlayerColliderRect();
    const playerTx = Math.floor((rect.x + rect.width / 2) / ts);
    const playerTy = Math.floor((rect.y + rect.height / 2) / ts);
    return (
      events.find((ev) => ev.trigger === 'touch' && ev.x === playerTx && ev.y === playerTy) ?? null
    );
  }

  step(rawDtSeconds: number): Readonly<PlayerRuntimeState> {
    const dt = Math.max(0, Math.min(0.05, rawDtSeconds));
    let dx = 0;
    let dy = 0;
    if (this.input.left) dx -= 1;
    if (this.input.right) dx += 1;
    if (this.input.up) dy -= 1;
    if (this.input.down) dy += 1;

    if (dx === 0 && dy === 0) {
      this.player.isMoving = false;
      return this.player;
    }

    if (Math.abs(dx) >= Math.abs(dy)) {
      this.player.direction = dx > 0 ? 'right' : 'left';
    } else {
      this.player.direction = dy > 0 ? 'down' : 'up';
    }

    if (dx !== 0 && dy !== 0) {
      const inv = 1 / Math.SQRT2;
      dx *= inv;
      dy *= inv;
    }

    const stepX = dx * this.player.speedPxPerSec * dt;
    const stepY = dy * this.player.speedPxPerSec * dt;

    let moved = false;
    if (stepX !== 0) {
      const candidateX = this.player.x + stepX;
      if (!this.collidesAt(candidateX, this.player.y)) {
        this.player.x = candidateX;
        moved = true;
      }
    }

    if (stepY !== 0) {
      const candidateY = this.player.y + stepY;
      if (!this.collidesAt(this.player.x, candidateY)) {
        this.player.y = candidateY;
        moved = true;
      }
    }

    this.player.isMoving = moved;
    return this.player;
  }
}
