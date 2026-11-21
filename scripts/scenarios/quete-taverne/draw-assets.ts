import { PAL } from '../../demo-pack/palette.js';
import { packFramesHorizontal, PixelCanvas } from '../../demo-pack/pixel-canvas.js';

// ============================================================================
// 1. Tileset Taverne (32x32, 4 cols x 2 rows = 8 tiles)
// (0,0) Parquet bois | (1,0) Tapis rouge/or | (2,0) Mur bois | (3,0) Porte sortie
// (0,1) Comptoir/Guichet | (1,1) Table + chopes | (2,1) Tabouret | (3,1) Tonneau
// ============================================================================

export function buildTavernTileset(): { sheet: PixelCanvas; frames: PixelCanvas[] } {
  const tiles: PixelCanvas[] = [];

  // (0,0) Parquet en bois chaleureux
  {
    const c = new PixelCanvas(32, 32);
    c.fill(PAL.woodMid);
    for (let row = 0; row < 4; row += 1) {
      const y = row * 8;
      c.rect(0, y, 32, 1, PAL.woodDark);
      c.rect(0, y + 1, 32, 1, PAL.woodLight);
      const seamX = row % 2 === 0 ? 14 : 24;
      c.rect(seamX, y, 1, 8, PAL.woodDark);
      c.rect((seamX + 16) % 32, y, 1, 8, PAL.woodDark);
    }
    tiles.push(c);
  }

  // (1,0) Tapis taverne rouge bordé d'or
  {
    const c = new PixelCanvas(32, 32);
    c.fill(PAL.carpetMid);
    c.strokeRect(1, 1, 30, 30, PAL.carpetDark);
    c.strokeRect(3, 3, 26, 26, PAL.goldMid);
    c.ditherRect(6, 6, 20, 20, PAL.carpetMid, PAL.carpetLight);
    c.rect(14, 14, 4, 4, PAL.goldHi);
    tiles.push(c);
  }

  // (2,0) Mur de taverne bois + colombages
  {
    const c = new PixelCanvas(32, 32);
    c.fill(PAL.plasterMid);
    c.rect(0, 0, 32, 5, PAL.woodDark);
    c.rect(0, 2, 32, 2, PAL.woodMid);
    c.rect(0, 22, 32, 10, PAL.woodMid);
    c.rect(0, 22, 32, 2, PAL.woodDark);
    c.rect(0, 24, 32, 1, PAL.woodLight);
    // Vertical timber beams
    c.rect(0, 5, 4, 17, PAL.woodDark);
    c.rect(1, 5, 2, 17, PAL.woodMid);
    c.rect(28, 5, 4, 17, PAL.woodDark);
    c.rect(29, 5, 2, 17, PAL.woodMid);
    // Subtle plaster shading
    c.rect(4, 5, 24, 2, PAL.plasterDark);
    c.rect(5, 8, 22, 12, PAL.plasterLight);
    tiles.push(c);
  }

  // (3,0) Porte de sortie en bois ferré (vers le donjon)
  {
    const c = new PixelCanvas(32, 32);
    c.bevelBox(3, 1, 26, 30, PAL.woodDark, PAL.woodMid, PAL.ink, PAL.ink);
    c.bevelBox(6, 4, 20, 27, PAL.woodMid, PAL.woodLight, PAL.woodDark, PAL.ink);
    for (let x = 11; x <= 21; x += 5) {
      c.rect(x, 5, 1, 25, PAL.woodDark);
    }
    // Iron hinges & gold knob
    c.rect(6, 9, 10, 2, PAL.ironDark);
    c.rect(6, 22, 10, 2, PAL.ironDark);
    c.rect(21, 16, 3, 3, PAL.goldMid);
    c.px(22, 17, PAL.goldHi);
    tiles.push(c);
  }

  // (0,1) Comptoir / Guichet de quêtes (avec registre & bourse)
  {
    const c = new PixelCanvas(32, 32);
    c.bevelBox(0, 5, 32, 24, PAL.woodMid, PAL.woodLight, PAL.woodDark, PAL.ink);
    c.bevelBox(0, 4, 32, 8, PAL.woodLight, PAL.woodHi, PAL.woodMid, PAL.ink);
    // Quest ledger parchment & gold coin stack
    c.bevelBox(4, 5, 10, 6, PAL.paperHi, PAL.paperHi, PAL.paperDark, PAL.ink);
    c.rect(6, 7, 6, 1, PAL.ink);
    c.rect(6, 9, 5, 1, PAL.ink);
    c.rect(20, 6, 6, 4, PAL.goldMid);
    c.rect(21, 5, 4, 2, PAL.goldHi);
    c.rect(2, 29, 28, 2, PAL.shadowAlpha);
    tiles.push(c);
  }

  // (1,1) Table en bois avec chopes de taverne
  {
    const c = new PixelCanvas(32, 32);
    c.rect(4, 26, 24, 3, PAL.shadowAlpha);
    c.rect(6, 18, 4, 10, PAL.woodDark);
    c.rect(22, 18, 4, 10, PAL.woodDark);
    c.bevelBox(2, 7, 28, 13, PAL.woodMid, PAL.woodHi, PAL.woodDark, PAL.ink);
    // Two frothy mugs
    c.bevelBox(7, 9, 5, 6, PAL.ironMid, PAL.ironHi, PAL.ironDark, PAL.ink);
    c.rect(8, 8, 3, 2, PAL.paperHi);
    c.bevelBox(19, 10, 5, 6, PAL.woodLight, PAL.woodHi, PAL.woodDark, PAL.ink);
    c.rect(20, 9, 3, 2, PAL.paperHi);
    tiles.push(c);
  }

  // (2,1) Tabouret en bois
  {
    const c = new PixelCanvas(32, 32);
    c.ellipse(16, 26, 8, 3, PAL.shadowAlpha);
    c.rect(10, 17, 3, 9, PAL.woodDark);
    c.rect(19, 17, 3, 9, PAL.woodDark);
    c.rect(11, 21, 10, 2, PAL.woodMid);
    c.ellipse(16, 15, 8, 4, PAL.ink);
    c.ellipse(16, 14, 7, 3, PAL.woodLight);
    c.ellipse(15, 13, 4, 2, PAL.woodHi);
    tiles.push(c);
  }

  // (3,1) Tonneau de bière cerclé de fer
  {
    const c = new PixelCanvas(32, 32);
    c.ellipse(16, 28, 10, 3, PAL.shadowAlpha);
    c.bevelBox(7, 5, 18, 22, PAL.woodMid, PAL.woodLight, PAL.woodDark, PAL.ink);
    c.rect(12, 6, 1, 20, PAL.woodDark);
    c.rect(19, 6, 1, 20, PAL.woodDark);
    c.rect(7, 10, 18, 2, PAL.ironDark);
    c.rect(8, 10, 16, 1, PAL.ironMid);
    c.rect(7, 20, 18, 2, PAL.ironDark);
    c.rect(8, 20, 16, 1, PAL.ironMid);
    c.rect(14, 15, 4, 3, PAL.goldMid);
    tiles.push(c);
  }

  const sheet = new PixelCanvas(32 * 4, 32 * 2);
  for (let i = 0; i < tiles.length; i += 1) {
    sheet.blit(tiles[i]!, (i % 4) * 32, Math.floor(i / 4) * 32);
  }
  return { sheet, frames: tiles };
}

// ============================================================================
// 2. Tileset Donjon (32x32, 4 cols x 2 rows = 8 tiles)
// (0,0) Dalles pierre | (1,0) Dalles fissurées | (2,0) Mur briques | (3,0) Pilier Y-Sort
// (0,1) Torche F1 | (1,1) Torche F2 | (2,1) Coffre fermé | (3,1) Coffre ouvert
// ============================================================================

export function buildScenarioDungeonTileset(): { sheet: PixelCanvas; frames: PixelCanvas[] } {
  const tiles: PixelCanvas[] = [];

  // (0,0) Dalles de pierre sombres
  {
    const c = new PixelCanvas(32, 32);
    c.fill(PAL.stoneDark);
    c.bevelBox(0, 0, 16, 16, PAL.stoneDark, PAL.stoneMid, PAL.stoneDeep, PAL.stoneDeep);
    c.bevelBox(16, 0, 16, 16, PAL.stoneDark, PAL.stoneMid, PAL.stoneDeep, PAL.stoneDeep);
    c.bevelBox(0, 16, 16, 16, PAL.stoneDark, PAL.stoneMid, PAL.stoneDeep, PAL.stoneDeep);
    c.bevelBox(16, 16, 16, 16, PAL.stoneDark, PAL.stoneMid, PAL.stoneDeep, PAL.stoneDeep);
    tiles.push(c);
  }

  // (1,0) Dalles fissurées avec mousse
  {
    const c = new PixelCanvas(32, 32);
    c.blit(tiles[0]!, 0, 0);
    c.line(5, 4, 11, 12, PAL.ink);
    c.line(11, 12, 18, 15, PAL.ink);
    c.line(18, 15, 25, 24, PAL.ink);
    c.rect(4, 20, 4, 3, PAL.greenDark);
    c.rect(5, 20, 2, 2, PAL.greenMid);
    c.rect(22, 6, 3, 2, PAL.greenDark);
    tiles.push(c);
  }

  // (2,0) Mur de briques de donjon
  {
    const c = new PixelCanvas(32, 32);
    c.fill(PAL.stoneDeep);
    for (let row = 0; row < 4; row += 1) {
      const y = row * 8;
      const offset = row % 2 === 0 ? 0 : 8;
      for (let bx = -8; bx < 32; bx += 16) {
        c.bevelBox(bx + offset, y, 16, 8, PAL.stoneMid, PAL.stoneLight, PAL.stoneDark, PAL.ink);
      }
    }
    tiles.push(c);
  }

  // (3,0) Pilier de donjon (Y-Sorted)
  {
    const c = new PixelCanvas(32, 32);
    c.ellipse(16, 29, 11, 3, PAL.shadowAlpha);
    c.bevelBox(6, 2, 20, 6, PAL.stoneLight, PAL.stoneHi, PAL.stoneMid, PAL.ink);
    c.bevelBox(8, 8, 16, 17, PAL.stoneMid, PAL.stoneLight, PAL.stoneDark, PAL.ink);
    c.rect(12, 9, 2, 15, PAL.stoneDark);
    c.rect(18, 9, 2, 15, PAL.stoneDark);
    c.bevelBox(5, 24, 22, 6, PAL.stoneLight, PAL.stoneHi, PAL.stoneDark, PAL.ink);
    tiles.push(c);
  }

  // (0,1) & (1,1) Torche murale animée (2 frames)
  for (let frame = 0; frame < 2; frame += 1) {
    const c = new PixelCanvas(32, 32);
    // Glow halo
    c.ellipse(16, 11, 9 + frame, 8, '#f0641838');
    // Iron bracket & wooden handle
    c.rect(14, 15, 4, 11, PAL.woodDark);
    c.rect(15, 16, 2, 9, PAL.woodMid);
    c.rect(12, 18, 8, 3, PAL.ironDark);
    c.rect(13, 19, 6, 1, PAL.ironHi);
    // Animated flame
    const sway = frame === 0 ? -1 : 1;
    c.ellipse(16 + sway, 11, 5, 6, PAL.fireRed);
    c.ellipse(16, 11, 4, 5, PAL.fireOrange);
    c.ellipse(16 - sway, 12, 2, 3, PAL.fireYellow);
    c.px(16, 12, PAL.fireWhite);
    tiles.push(c);
  }

  // (2,1) Coffre au trésor fermé
  {
    const c = new PixelCanvas(32, 32);
    c.ellipse(16, 27, 11, 3, PAL.shadowAlpha);
    c.bevelBox(5, 10, 22, 17, PAL.woodMid, PAL.woodLight, PAL.woodDark, PAL.ink);
    c.rect(5, 15, 22, 2, PAL.ink);
    c.rect(6, 10, 2, 16, PAL.goldMid);
    c.rect(24, 10, 2, 16, PAL.goldMid);
    c.bevelBox(13, 14, 6, 5, PAL.goldMid, PAL.goldHi, PAL.goldDark, PAL.ink);
    tiles.push(c);
  }

  // (3,1) Coffre au trésor ouvert
  {
    const c = new PixelCanvas(32, 32);
    c.ellipse(16, 27, 11, 3, PAL.shadowAlpha);
    c.bevelBox(5, 4, 22, 9, PAL.woodDark, PAL.woodMid, PAL.ink, PAL.ink);
    c.bevelBox(5, 13, 22, 14, PAL.woodMid, PAL.woodLight, PAL.woodDark, PAL.ink);
    c.rect(7, 14, 18, 5, PAL.ink);
    c.rect(10, 15, 12, 3, PAL.goldHi);
    c.rect(14, 14, 4, 2, PAL.fireYellow);
    tiles.push(c);
  }

  const sheet = new PixelCanvas(32 * 4, 32 * 2);
  for (let i = 0; i < tiles.length; i += 1) {
    sheet.blit(tiles[i]!, (i % 4) * 32, Math.floor(i / 4) * 32);
  }
  return { sheet, frames: tiles };
}

// ============================================================================
// 3. Token Aventurier (32x48, idle 2f + walk 4f = 6 frames)
// ============================================================================

function drawAdventurerFrame(bobY: number, leftLegY: number, rightLegY: number): PixelCanvas {
  const c = new PixelCanvas(32, 48);
  c.ellipse(16, 44, 9, 3, PAL.shadowAlpha);

  // Dragon-red cloak behind body
  c.rect(9, 20 + bobY, 14, 16, PAL.carpetDark);
  c.rect(10, 21 + bobY, 12, 14, PAL.carpetMid);

  // Boots / legs
  c.rect(11, 35 + leftLegY, 4, 9, PAL.woodDark);
  c.rect(17, 35 + rightLegY, 4, 9, PAL.woodDark);
  c.rect(11, 35 + leftLegY, 4, 3, PAL.ironDark);
  c.rect(17, 35 + rightLegY, 4, 3, PAL.ironDark);

  // Arcane blue tunic + leather belt
  c.rect(10, 21 + bobY, 12, 15, PAL.blueDark);
  c.rect(11, 22 + bobY, 10, 12, PAL.blueMid);
  c.rect(12, 22 + bobY, 4, 10, PAL.blueLight);
  c.rect(10, 31 + bobY, 12, 2, PAL.woodDark);
  c.rect(15, 31 + bobY, 2, 2, PAL.goldHi);

  // Arms + basic iron sword on right side
  c.rect(7, 23 + bobY, 3, 9, PAL.blueDark);
  c.rect(22, 23 + bobY, 3, 9, PAL.blueDark);
  c.rect(7, 31 + bobY, 3, 3, PAL.skinMid);
  c.rect(22, 31 + bobY, 3, 3, PAL.skinMid);
  // Sword blade & gold hilt
  c.rect(24, 17 + bobY, 2, 13, PAL.ironHi);
  c.rect(25, 17 + bobY, 1, 13, PAL.ironMid);
  c.rect(22, 29 + bobY, 6, 2, PAL.goldMid);

  // Head & hair
  c.rect(11, 9 + bobY, 10, 11, PAL.skinMid);
  c.rect(12, 10 + bobY, 8, 9, PAL.skinLight);
  c.rect(10, 6 + bobY, 12, 5, PAL.hairBrown);
  c.rect(10, 9 + bobY, 2, 5, PAL.hairBrown);
  c.rect(20, 9 + bobY, 2, 4, PAL.hairBrown);
  // Eyes
  c.rect(13, 14 + bobY, 2, 2, PAL.ink);
  c.rect(17, 14 + bobY, 2, 2, PAL.ink);

  c.addOutline(PAL.ink);
  return c;
}

export function buildAdventurerSpritesheet(): { sheet: PixelCanvas; frames: PixelCanvas[] } {
  const frames = [
    drawAdventurerFrame(0, 0, 0),
    drawAdventurerFrame(1, 0, 0),
    drawAdventurerFrame(0, -2, 1),
    drawAdventurerFrame(1, 0, 0),
    drawAdventurerFrame(0, 1, -2),
    drawAdventurerFrame(1, 0, 0),
  ];
  return { sheet: packFramesHorizontal(frames), frames };
}

// ============================================================================
// 4. PNJ Femme au Guichet (32x48, idle 2 frames)
// ============================================================================

function drawReceptionistFrame(bobY: number): PixelCanvas {
  const c = new PixelCanvas(32, 48);
  c.ellipse(16, 44, 9, 3, PAL.shadowAlpha);

  // Long emerald tavern dress + cream parchment apron
  c.rect(9, 22 + bobY, 14, 21, PAL.greenDark);
  c.rect(10, 23 + bobY, 12, 19, PAL.greenMid);
  c.rect(12, 29 + bobY, 8, 13, PAL.paperMid);
  c.rect(13, 29 + bobY, 6, 11, PAL.paperHi);

  // Corset bodice + gold brooch
  c.rect(11, 21 + bobY, 10, 8, PAL.carpetDark);
  c.rect(12, 22 + bobY, 8, 6, PAL.carpetMid);
  c.rect(15, 23 + bobY, 2, 2, PAL.goldHi);

  // Arms holding quest scroll
  c.rect(7, 23 + bobY, 3, 9, PAL.paperMid);
  c.rect(22, 23 + bobY, 3, 9, PAL.paperMid);
  c.rect(7, 31 + bobY, 3, 3, PAL.skinLight);
  c.rect(22, 31 + bobY, 3, 3, PAL.skinLight);
  // Quest parchment scroll
  c.rect(21, 26 + bobY, 5, 7, PAL.paperHi);
  c.rect(22, 28 + bobY, 3, 1, PAL.goldDark);
  c.rect(22, 30 + bobY, 3, 1, PAL.goldDark);

  // Head & warm bun hairstyle
  c.rect(11, 9 + bobY, 10, 11, PAL.skinMid);
  c.rect(12, 10 + bobY, 8, 9, PAL.skinLight);
  // Hair bun + bangs
  c.rect(12, 4 + bobY, 8, 4, PAL.woodMid);
  c.rect(13, 5 + bobY, 6, 2, PAL.woodLight);
  c.rect(10, 7 + bobY, 12, 4, PAL.woodDark);
  c.rect(10, 10 + bobY, 2, 7, PAL.woodDark);
  c.rect(20, 10 + bobY, 2, 7, PAL.woodDark);
  // Eyes & warm smile
  c.rect(13, 14 + bobY, 2, 2, PAL.ink);
  c.rect(17, 14 + bobY, 2, 2, PAL.ink);
  c.rect(15, 17 + bobY, 2, 1, PAL.carpetLight);

  c.addOutline(PAL.ink);
  return c;
}

export function buildReceptionistSpritesheet(): { sheet: PixelCanvas; frames: PixelCanvas[] } {
  const frames = [drawReceptionistFrame(0), drawReceptionistFrame(1)];
  return { sheet: packFramesHorizontal(frames), frames };
}

// ============================================================================
// 5. Monstre Sbire de Donjon — Gobelin Maraudeur (32x32, idle 2 frames)
// ============================================================================

function drawMinionFrame(bobY: number): PixelCanvas {
  const c = new PixelCanvas(32, 32);
  c.ellipse(16, 28, 9, 3, PAL.shadowAlpha);

  // Legs & ragged loincloth
  c.rect(11, 22, 3, 6, PAL.goblinDark);
  c.rect(18, 22, 3, 6, PAL.goblinDark);
  c.rect(11, 18 + bobY, 10, 5, PAL.woodDark);
  c.rect(12, 19 + bobY, 8, 3, PAL.woodMid);

  // Torso & arms
  c.rect(10, 14 + bobY, 12, 6, PAL.goblinMid);
  c.rect(7, 15 + bobY, 3, 6, PAL.goblinDark);
  c.rect(22, 15 + bobY, 3, 6, PAL.goblinDark);

  // Rusty dagger in right hand
  c.rect(24, 10 + bobY, 2, 8, PAL.ironHi);
  c.rect(23, 17 + bobY, 4, 2, PAL.woodLight);

  // Big goblin head + pointy ears
  c.rect(10, 6 + bobY, 12, 9, PAL.goblinMid);
  c.rect(11, 7 + bobY, 10, 6, PAL.goblinLight);
  c.rect(5, 8 + bobY, 5, 3, PAL.goblinMid);
  c.rect(22, 8 + bobY, 5, 3, PAL.goblinMid);
  // Glowing yellow eyes & grin
  c.rect(12, 10 + bobY, 2, 2, PAL.fireYellow);
  c.rect(18, 10 + bobY, 2, 2, PAL.fireYellow);
  c.rect(13, 13 + bobY, 6, 1, PAL.paperHi);

  c.addOutline(PAL.ink);
  return c;
}

export function buildMinionSpritesheet(): { sheet: PixelCanvas; frames: PixelCanvas[] } {
  const frames = [drawMinionFrame(0), drawMinionFrame(1)];
  return { sheet: packFramesHorizontal(frames), frames };
}

// ============================================================================
// 6. Boss Ogre Sombre (64x64, idle 2 frames, collider 48x32 at feet)
// ============================================================================

function drawBossOgreFrame(bobY: number): PixelCanvas {
  const c = new PixelCanvas(64, 64);
  c.ellipse(32, 58, 23, 5, PAL.shadowAlpha);

  // Massive legs & iron greaves
  c.rect(16, 44, 12, 14, PAL.purpleDark);
  c.rect(36, 44, 12, 14, PAL.purpleDark);
  c.rect(16, 51, 12, 7, PAL.ironDark);
  c.rect(36, 51, 12, 7, PAL.ironDark);
  c.rect(18, 52, 8, 2, PAL.ironMid);
  c.rect(38, 52, 8, 2, PAL.ironMid);

  // Huge dark-purple armored torso
  c.rect(12, 18 + bobY, 40, 28, PAL.purpleDark);
  c.rect(15, 20 + bobY, 34, 23, PAL.purpleMid);
  c.rect(18, 22 + bobY, 28, 10, PAL.purpleLight);
  // Spiked war belt & dragon-red buckle
  c.rect(12, 40 + bobY, 40, 6, PAL.woodDark);
  c.rect(27, 39 + bobY, 10, 8, PAL.goldMid);
  c.rect(30, 41 + bobY, 4, 4, PAL.fireRed);

  // Massive arms
  c.rect(4, 22 + bobY, 10, 22, PAL.purpleDark);
  c.rect(6, 24 + bobY, 6, 18, PAL.purpleMid);
  c.rect(50, 22 + bobY, 10, 22, PAL.purpleDark);
  c.rect(52, 24 + bobY, 6, 18, PAL.purpleMid);

  // Giant spiked iron club in right hand
  c.rect(53, 8 + bobY, 7, 26, PAL.woodDark);
  c.rect(54, 10 + bobY, 5, 22, PAL.woodMid);
  c.rect(51, 10 + bobY, 11, 12, PAL.ironDark);
  c.rect(52, 12 + bobY, 9, 8, PAL.ironMid);
  c.rect(50, 13 + bobY, 2, 2, PAL.ironHi);
  c.rect(62, 15 + bobY, 2, 2, PAL.ironHi);

  // Horned ogre head
  c.rect(20, 7 + bobY, 24, 16, PAL.purpleDark);
  c.rect(22, 9 + bobY, 20, 12, PAL.purpleMid);
  // Golden horns
  c.rect(16, 4 + bobY, 5, 6, PAL.goldMid);
  c.rect(15, 2 + bobY, 3, 4, PAL.goldHi);
  c.rect(43, 4 + bobY, 5, 6, PAL.goldMid);
  c.rect(46, 2 + bobY, 3, 4, PAL.goldHi);
  // Glowing dragon-red eyes & tusks
  c.rect(25, 13 + bobY, 4, 3, PAL.fireRed);
  c.rect(26, 14 + bobY, 2, 1, PAL.fireYellow);
  c.rect(35, 13 + bobY, 4, 3, PAL.fireRed);
  c.rect(36, 14 + bobY, 2, 1, PAL.fireYellow);
  c.rect(26, 19 + bobY, 3, 4, PAL.paperHi);
  c.rect(35, 19 + bobY, 3, 4, PAL.paperHi);

  c.addOutline(PAL.ink);
  return c;
}

export function buildBossOgreSpritesheet(): { sheet: PixelCanvas; frames: PixelCanvas[] } {
  const frames = [drawBossOgreFrame(0), drawBossOgreFrame(2)];
  return { sheet: packFramesHorizontal(frames), frames };
}
