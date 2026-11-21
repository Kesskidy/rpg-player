import { PAL } from './palette.js';
import { packFramesHorizontal, PixelCanvas } from './pixel-canvas.js';

/**
 * Slime (32x32, 2 frames idle squash & bounce).
 */
export function buildSlimeSpritesheet(): { frames: PixelCanvas[]; sheet: PixelCanvas } {
  const frames = [0, 1].map((f) => {
    const c = new PixelCanvas(32, 32);
    const rx = f === 0 ? 11 : 12;
    const ry = f === 0 ? 9 : 7;
    const cy = f === 0 ? 20 : 22;

    c.ellipse(16, 28, 12, 3, PAL.shadowAlpha);
    c.ellipse(16, cy, rx, ry, PAL.slimeMid);
    c.ellipse(16, cy + 3, rx - 1, Math.max(3, ry - 3), PAL.slimeDark);
    c.ellipse(14, cy - 2, rx - 4, Math.max(3, ry - 4), PAL.slimeLight);
    // Glossy specular shine
    c.rect(10, cy - 4, 3, 2, PAL.slimeHi);
    c.px(13, cy - 5, PAL.paperHi);
    // Cute eyes
    c.rect(12, cy, 2, 3, PAL.ink);
    c.rect(18, cy, 2, 3, PAL.ink);
    c.px(12, cy, PAL.paperHi);
    c.px(18, cy, PAL.paperHi);

    c.addOutline(PAL.ink);
    return c;
  });
  return { frames, sheet: packFramesHorizontal(frames) };
}

/**
 * Gobelin (32x32, 2 frames idle).
 */
export function buildGoblinSpritesheet(): { frames: PixelCanvas[]; sheet: PixelCanvas } {
  const frames = [0, 1].map((f) => {
    const c = new PixelCanvas(32, 32);
    const bob = f;

    c.ellipse(16, 29, 9, 2.5, PAL.shadowAlpha);
    // Feet
    c.rect(11, 24, 3, 5, PAL.goblinDark);
    c.rect(18, 24, 3, 5, PAL.goblinDark);
    // Brown ragged tunic
    c.rect(11, 16 + bob, 10, 9, PAL.woodMid);
    c.rect(11, 16 + bob, 3, 8, PAL.woodLight);
    c.rect(11, 22 + bob, 10, 2, PAL.woodDark);
    // Pointed ears
    c.rect(5, 9 + bob, 5, 3, PAL.goblinMid);
    c.rect(22, 9 + bob, 5, 3, PAL.goblinMid);
    c.px(4, 10 + bob, PAL.goblinLight);
    c.px(27, 10 + bob, PAL.goblinLight);
    // Head
    c.rect(10, 7 + bob, 12, 9, PAL.goblinMid);
    c.rect(10, 7 + bob, 4, 4, PAL.goblinLight);
    // Mischievous yellow eyes
    c.rect(12, 11 + bob, 2, 2, PAL.fireYellow);
    c.rect(18, 11 + bob, 2, 2, PAL.fireYellow);
    c.px(13, 12 + bob, PAL.fireRed);
    c.px(19, 12 + bob, PAL.fireRed);
    // Dagger held on right
    c.rect(23, 14 + bob, 2, 8, PAL.ironHi);
    c.rect(22, 21 + bob, 4, 2, PAL.goldMid);

    c.addOutline(PAL.ink);
    return c;
  });
  return { frames, sheet: packFramesHorizontal(frames) };
}

/**
 * Squelette (32x48, 2 frames idle, humanoid feet collider 32x16).
 */
export function buildSkeletonSpritesheet(): { frames: PixelCanvas[]; sheet: PixelCanvas } {
  const frames = [0, 1].map((f) => {
    const c = new PixelCanvas(32, 48);
    const bob = f;

    c.ellipse(16, 44, 9, 3, PAL.shadowAlpha);
    // Bone legs
    c.rect(12, 33, 2, 11, PAL.boneMid);
    c.rect(18, 33, 2, 11, PAL.boneMid);
    c.rect(11, 42, 4, 2, PAL.boneLight);
    c.rect(17, 42, 4, 2, PAL.boneLight);
    // Pelvis & spine
    c.rect(12, 30 + bob, 8, 3, PAL.boneDark);
    c.rect(15, 20 + bob, 2, 11, PAL.boneMid);
    // Ribcage
    for (const ry of [21, 24, 27]) {
      c.rect(11, ry + bob, 10, 2, PAL.boneLight);
      c.rect(14, ry + bob, 4, 2, PAL.boneDark);
    }
    // Arms
    c.rect(8, 21 + bob, 2, 11, PAL.boneMid);
    c.rect(22, 21 + bob, 2, 11, PAL.boneMid);
    // Skull
    c.rect(11, 8 + bob, 10, 10, PAL.boneLight);
    c.rect(12, 17 + bob, 8, 3, PAL.boneMid);
    // Dark eye sockets + crimson glow
    c.rect(12, 12 + bob, 3, 3, PAL.ink);
    c.rect(17, 12 + bob, 3, 3, PAL.ink);
    c.px(13, 13 + bob, PAL.fireRed);
    c.px(18, 13 + bob, PAL.fireRed);
    // Rusty sword & wooden buckler
    c.rect(24, 18 + bob, 2, 16, PAL.ironMid);
    c.rect(24, 18 + bob, 1, 14, PAL.ironHi);
    c.bevelBox(4, 24 + bob, 6, 10, PAL.woodDark, PAL.woodMid, PAL.ink, PAL.ink);

    c.addOutline(PAL.ink);
    return c;
  });
  return { frames, sheet: packFramesHorizontal(frames) };
}

/**
 * Boss Golem de Pierre (64x64, 2 frames idle, 48x32 feet collision footprint).
 */
export function buildStoneGolemBossSpritesheet(): { frames: PixelCanvas[]; sheet: PixelCanvas } {
  const frames = [0, 1].map((f) => {
    const c = new PixelCanvas(64, 64);
    const bob = f === 1 ? 1 : 0;
    const runeColor = f === 0 ? PAL.runeCyan : PAL.runeGlow;

    // Large 48x32 base shadow footprint
    c.ellipse(32, 58, 24, 6, PAL.shadowAlpha);

    // Massive stone legs
    c.bevelBox(14, 42, 13, 18, PAL.stoneDark, PAL.stoneMid, PAL.stoneDeep, PAL.ink);
    c.bevelBox(37, 42, 13, 18, PAL.stoneDark, PAL.stoneMid, PAL.stoneDeep, PAL.ink);

    // Colossal boulder torso
    c.bevelBox(13, 16 + bob, 38, 28, PAL.stoneMid, PAL.stoneLight, PAL.stoneDark, PAL.ink);
    // Cracked stone lines
    c.line(18, 22 + bob, 28, 30 + bob, PAL.stoneDeep);
    c.line(44, 20 + bob, 36, 29 + bob, PAL.stoneDeep);
    c.line(22, 36 + bob, 40, 39 + bob, PAL.stoneDeep);

    // Glowing arcane rune core in chest
    c.ellipse(32, 30 + bob, 7, 7, PAL.stoneDeep);
    c.ellipse(32, 30 + bob, 5, 5, runeColor);
    c.rect(30, 28 + bob, 4, 4, PAL.fireWhite);

    // Oversized shoulder boulders
    c.bevelBox(4, 13 + bob, 14, 15, PAL.stoneLight, PAL.stoneHi, PAL.stoneDark, PAL.ink);
    c.bevelBox(46, 13 + bob, 14, 15, PAL.stoneLight, PAL.stoneHi, PAL.stoneDark, PAL.ink);

    // Heavy stone fists hanging low
    c.bevelBox(4, 28 + bob, 12, 22, PAL.stoneMid, PAL.stoneLight, PAL.stoneDeep, PAL.ink);
    c.bevelBox(48, 28 + bob, 12, 22, PAL.stoneMid, PAL.stoneLight, PAL.stoneDeep, PAL.ink);
    c.rect(7, 36 + bob, 5, 2, runeColor);
    c.rect(52, 36 + bob, 5, 2, runeColor);

    // Crowned stone head
    c.bevelBox(21, 5 + bob, 22, 14, PAL.stoneLight, PAL.stoneHi, PAL.stoneDark, PAL.ink);
    // Glowing eyes & rune brow
    c.rect(25, 11 + bob, 4, 3, runeColor);
    c.rect(35, 11 + bob, 4, 3, runeColor);
    c.px(26, 12 + bob, PAL.fireWhite);
    c.px(36, 12 + bob, PAL.fireWhite);
    c.rect(31, 7 + bob, 2, 3, runeColor);

    c.addOutline(PAL.ink);
    return c;
  });
  return { frames, sheet: packFramesHorizontal(frames) };
}
