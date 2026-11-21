import { PAL } from './palette.js';
import { packFramesHorizontal, PixelCanvas } from './pixel-canvas.js';

export interface CharacterPaletteSpec {
  tunicDark: string;
  tunicMid: string;
  tunicLight: string;
  cloak?: string;
  hair: string;
  beard?: string;
  hat?: 'none' | 'merchant' | 'helmet';
  weapon?: 'sword' | 'staff' | 'spear' | 'pouch';
}

/**
 * Draws a single 32x48 RPG humanoid frame anchored at bottom-center (16, 48).
 * Frames 0..1 = idle breathing, Frames 2..5 = 4-step walk cycle.
 */
function drawHumanoidFrame(spec: CharacterPaletteSpec, frameIndex: number): PixelCanvas {
  const c = new PixelCanvas(32, 48);
  const isWalk = frameIndex >= 2;
  const walkStep = isWalk ? frameIndex - 2 : 0; // 0, 1, 2, 3
  const bobY = isWalk ? (walkStep % 2 === 1 ? -1 : 0) : frameIndex === 1 ? 1 : 0;

  // Soft ground shadow at feet (32x16 feet area)
  c.ellipse(16, 44, 10, 3, PAL.shadowAlpha);

  // Back cloak (for Hero / Guild Master)
  if (spec.cloak) {
    const sway = isWalk ? (walkStep === 1 ? -1 : walkStep === 3 ? 1 : 0) : 0;
    c.rect(9 + sway, 22 + bobY, 14, 18, spec.cloak);
    c.rect(8 + sway, 36 + bobY, 16, 4, spec.cloak);
  }

  // Legs / boots with animated stride
  const leftLegY = isWalk ? (walkStep === 1 ? -2 : walkStep === 3 ? 1 : 0) : 0;
  const rightLegY = isWalk ? (walkStep === 3 ? -2 : walkStep === 1 ? 1 : 0) : 0;
  c.rect(11, 35 + leftLegY, 4, 8, PAL.woodDark);
  c.rect(11, 41 + leftLegY, 4, 3, PAL.ink);
  c.rect(17, 35 + rightLegY, 4, 8, PAL.woodDark);
  c.rect(17, 41 + rightLegY, 4, 3, PAL.ink);

  // Torso / Tunic (shaded 3 tones)
  c.rect(10, 21 + bobY, 12, 15, spec.tunicMid);
  c.rect(10, 21 + bobY, 3, 15, spec.tunicLight);
  c.rect(19, 21 + bobY, 3, 15, spec.tunicDark);
  // Belt + gold buckle
  c.rect(10, 31 + bobY, 12, 2, PAL.woodDark);
  c.rect(15, 31 + bobY, 2, 2, PAL.goldHi);

  // Arms swinging on walk
  const armSwing = isWalk ? (walkStep === 1 ? -1 : walkStep === 3 ? 1 : 0) : 0;
  c.rect(7, 22 + bobY + armSwing, 3, 10, spec.tunicDark);
  c.rect(7, 31 + bobY + armSwing, 3, 3, PAL.skinMid);
  c.rect(22, 22 + bobY - armSwing, 3, 10, spec.tunicMid);
  c.rect(22, 31 + bobY - armSwing, 3, 3, PAL.skinMid);

  // Head
  c.rect(11, 9 + bobY, 10, 11, PAL.skinMid);
  c.rect(11, 9 + bobY, 3, 10, PAL.skinLight);
  c.rect(19, 10 + bobY, 2, 9, PAL.skinDark);

  // Eyes
  c.rect(13, 14 + bobY, 2, 2, PAL.ink);
  c.rect(17, 14 + bobY, 2, 2, PAL.ink);
  c.px(13, 14 + bobY, PAL.paperHi);
  c.px(17, 14 + bobY, PAL.paperHi);

  // Hair / Hat / Helmet
  if (spec.hat === 'helmet') {
    c.rect(10, 6 + bobY, 12, 7, PAL.ironMid);
    c.rect(11, 7 + bobY, 4, 4, PAL.ironHi);
    c.rect(19, 7 + bobY, 3, 6, PAL.ironDark);
    // Red plume crest
    c.rect(14, 3 + bobY, 4, 4, PAL.carpetLight);
    c.rect(15, 2 + bobY, 3, 2, PAL.fireOrange);
  } else if (spec.hat === 'merchant') {
    c.rect(9, 7 + bobY, 14, 4, PAL.greenMid);
    c.rect(10, 5 + bobY, 11, 3, PAL.greenLight);
    c.rect(10, 10 + bobY, 12, 1, PAL.goldMid);
  } else {
    c.rect(10, 7 + bobY, 12, 4, spec.hair);
    c.rect(10, 10 + bobY, 2, 4, spec.hair);
    c.rect(20, 10 + bobY, 2, 4, spec.hair);
  }

  // Beard (Guild Master)
  if (spec.beard) {
    c.rect(11, 18 + bobY, 10, 5, spec.beard);
    c.rect(13, 23 + bobY, 6, 3, spec.beard);
  }

  // Signature accessories / weapons
  if (spec.weapon === 'sword') {
    c.rect(24, 24 + bobY - armSwing, 2, 12, PAL.ironHi);
    c.rect(23, 28 + bobY - armSwing, 4, 2, PAL.goldMid);
  } else if (spec.weapon === 'staff') {
    c.rect(25, 11 + bobY - armSwing, 2, 31, PAL.woodLight);
    c.rect(24, 8 + bobY - armSwing, 4, 4, PAL.goldMid);
    c.rect(25, 9 + bobY - armSwing, 2, 2, PAL.runeCyan);
  } else if (spec.weapon === 'spear') {
    c.rect(25, 6 + bobY - armSwing, 2, 37, PAL.woodMid);
    c.rect(24, 2 + bobY - armSwing, 4, 5, PAL.ironHi);
    c.px(25, 1 + bobY - armSwing, PAL.fireWhite);
  } else if (spec.weapon === 'pouch') {
    c.rect(22, 30 + bobY, 5, 5, PAL.goldMid);
    c.rect(23, 31 + bobY, 2, 2, PAL.goldHi);
  }

  c.addOutline(PAL.ink);
  return c;
}

export function buildCharacterFrames(spec: CharacterPaletteSpec): PixelCanvas[] {
  return [0, 1, 2, 3, 4, 5].map((f) => drawHumanoidFrame(spec, f));
}

export function buildHeroSpritesheet(): { frames: PixelCanvas[]; sheet: PixelCanvas } {
  const frames = buildCharacterFrames({
    tunicDark: PAL.blueDark,
    tunicMid: PAL.blueMid,
    tunicLight: PAL.blueLight,
    cloak: PAL.carpetMid,
    hair: PAL.hairBrown,
    hat: 'none',
    weapon: 'sword',
  });
  return { frames, sheet: packFramesHorizontal(frames) };
}

export function buildGuildMasterSpritesheet(): { frames: PixelCanvas[]; sheet: PixelCanvas } {
  const frames = buildCharacterFrames({
    tunicDark: PAL.purpleDark,
    tunicMid: PAL.purpleMid,
    tunicLight: PAL.purpleLight,
    cloak: PAL.goldDark,
    hair: PAL.hairWhite,
    beard: PAL.hairWhite,
    hat: 'none',
    weapon: 'staff',
  });
  return { frames, sheet: packFramesHorizontal(frames) };
}

export function buildMerchantSpritesheet(): { frames: PixelCanvas[]; sheet: PixelCanvas } {
  const frames = buildCharacterFrames({
    tunicDark: PAL.woodDark,
    tunicMid: PAL.woodLight,
    tunicLight: PAL.paperMid,
    hair: PAL.hairBrown,
    hat: 'merchant',
    weapon: 'pouch',
  });
  return { frames, sheet: packFramesHorizontal(frames) };
}

export function buildGuardSpritesheet(): { frames: PixelCanvas[]; sheet: PixelCanvas } {
  const frames = buildCharacterFrames({
    tunicDark: PAL.ironDark,
    tunicMid: PAL.ironMid,
    tunicLight: PAL.ironHi,
    hair: PAL.hairBrown,
    hat: 'helmet',
    weapon: 'spear',
  });
  return { frames, sheet: packFramesHorizontal(frames) };
}
