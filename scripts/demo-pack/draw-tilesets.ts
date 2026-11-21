import { PAL } from './palette.js';
import { PixelCanvas } from './pixel-canvas.js';

function drawTile(
  sheet: PixelCanvas,
  col: number,
  row: number,
  drawer: (c: PixelCanvas) => void,
): void {
  const tile = new PixelCanvas(32, 32);
  drawer(tile);
  sheet.blit(tile, col * 32, row * 32);
}

/**
 * Generates `tileset_guilde.png` (128x128, 4x4 grid of 32x32 tiles).
 */
export function buildGuildTileset(): PixelCanvas {
  const sheet = new PixelCanvas(128, 128);

  // (0,0) Parquet en bois
  drawTile(sheet, 0, 0, (c) => {
    c.fill(PAL.woodMid);
    for (let row = 0; row < 4; row += 1) {
      const y = row * 8;
      c.rect(0, y, 32, 1, PAL.woodDark);
      c.rect(0, y + 1, 32, 1, PAL.woodLight);
      const seamX = row % 2 === 0 ? 14 : 26;
      c.rect(seamX, y, 1, 8, PAL.woodDark);
      c.px(seamX - 2, y + 4, PAL.woodDark);
      c.px(seamX + 2, y + 4, PAL.woodDark);
      // Subtle wood grain
      c.rect((row * 7 + 3) % 24, y + 4, 6, 1, PAL.woodLight);
      c.rect((row * 11 + 5) % 22, y + 6, 5, 1, PAL.woodDark);
    }
  });

  // (1,0) Dalles d'entrée
  drawTile(sheet, 1, 0, (c) => {
    c.fill(PAL.plasterDark);
    const slabs: Array<[number, number, number, number]> = [
      [1, 1, 14, 14],
      [17, 1, 14, 14],
      [1, 17, 14, 14],
      [17, 17, 14, 14],
    ];
    for (const [x, y, w, h] of slabs) {
      c.bevelBox(x, y, w, h, PAL.plasterMid, PAL.plasterLight, PAL.plasterDark, PAL.stoneDark);
    }
  });

  // (2,0) Tapis rouge (bord doré)
  drawTile(sheet, 2, 0, (c) => {
    c.fill(PAL.carpetMid);
    c.strokeRect(0, 0, 32, 32, PAL.carpetDark);
    c.strokeRect(2, 2, 28, 28, PAL.goldMid);
    c.strokeRect(3, 3, 26, 26, PAL.goldHi);
    c.rect(5, 5, 22, 22, PAL.carpetLight);
    c.rect(7, 7, 18, 18, PAL.carpetMid);
    // Corner studs
    const studs: Array<[number, number]> = [
      [4, 4],
      [26, 4],
      [4, 26],
      [26, 26],
    ];
    for (const [cx, cy] of studs) {
      c.rect(cx, cy, 2, 2, PAL.goldHi);
    }
  });

  // (3,0) Tapis rouge (centre motif royal)
  drawTile(sheet, 3, 0, (c) => {
    c.fill(PAL.carpetMid);
    c.ditherRect(2, 2, 28, 28, PAL.carpetMid, PAL.carpetLight);
    // Diamond emblem
    for (let i = 0; i < 8; i += 1) {
      c.rect(16 - i, 8 + i, i * 2, 1, PAL.carpetDark);
      c.rect(16 - i, 23 - i, i * 2, 1, PAL.carpetDark);
    }
    for (let i = 0; i < 6; i += 1) {
      c.rect(16 - i, 10 + i, i * 2, 1, PAL.goldMid);
      c.rect(16 - i, 21 - i, i * 2, 1, PAL.goldMid);
    }
    c.rect(14, 14, 4, 4, PAL.goldHi);
  });

  // (0,1) Mur en bois/pierre (colombage + soubassement pierre)
  drawTile(sheet, 0, 1, (c) => {
    c.fill(PAL.plasterMid);
    // Timber beams
    c.rect(0, 0, 32, 4, PAL.woodDark);
    c.rect(0, 1, 32, 2, PAL.woodMid);
    c.rect(0, 0, 4, 20, PAL.woodMid);
    c.rect(28, 0, 4, 20, PAL.woodMid);
    c.rect(3, 0, 1, 20, PAL.ink);
    c.rect(28, 0, 1, 20, PAL.ink);
    // Stone base wainscot
    c.rect(0, 20, 32, 12, PAL.stoneDark);
    c.bevelBox(1, 21, 14, 10, PAL.stoneMid, PAL.stoneLight, PAL.stoneDeep, PAL.ink);
    c.bevelBox(16, 21, 15, 10, PAL.stoneMid, PAL.stoneLight, PAL.stoneDeep, PAL.ink);
  });

  // (1,1) Porte en bois cloutée
  drawTile(sheet, 1, 1, (c) => {
    c.fill(PAL.stoneDark);
    c.bevelBox(4, 2, 24, 30, PAL.woodMid, PAL.woodLight, PAL.woodDark, PAL.ink);
    for (let x = 9; x <= 23; x += 5) {
      c.rect(x, 4, 1, 26, PAL.woodDark);
    }
    // Iron hinges
    c.rect(5, 8, 9, 3, PAL.ironDark);
    c.rect(6, 9, 7, 1, PAL.ironHi);
    c.rect(5, 22, 9, 3, PAL.ironDark);
    c.rect(6, 23, 7, 1, PAL.ironHi);
    // Gold handle
    c.rect(22, 16, 3, 3, PAL.goldMid);
    c.px(23, 17, PAL.goldHi);
  });

  // (2,1) Fenêtre avec lumière chaude
  drawTile(sheet, 2, 1, (c) => {
    c.fill(PAL.plasterMid);
    c.rect(0, 0, 32, 4, PAL.woodDark);
    c.rect(0, 22, 32, 10, PAL.stoneMid);
    c.rect(0, 22, 32, 1, PAL.ink);
    // Glowing window panes
    c.bevelBox(6, 5, 20, 16, PAL.woodDark, PAL.woodLight, PAL.ink, PAL.ink);
    c.rect(8, 7, 7, 5, PAL.blueLight);
    c.rect(17, 7, 7, 5, PAL.fireYellow);
    c.rect(8, 14, 7, 5, PAL.fireYellow);
    c.rect(17, 14, 7, 5, PAL.fireWhite);
    // Warm sunlit highlight on floor/wall
    c.px(9, 8, PAL.fireWhite);
    c.px(18, 8, PAL.fireWhite);
    c.rect(8, 23, 16, 5, '#ffe06640');
  });

  // (3,1) Mur boiserie intérieure
  drawTile(sheet, 3, 1, (c) => {
    c.fill(PAL.woodDark);
    c.bevelBox(2, 2, 13, 28, PAL.woodMid, PAL.woodLight, PAL.woodDark, PAL.ink);
    c.bevelBox(17, 2, 13, 28, PAL.woodMid, PAL.woodLight, PAL.woodDark, PAL.ink);
  });

  // (0,2) Comptoir d'accueil (Y-Sorted)
  drawTile(sheet, 0, 2, (c) => {
    c.rect(1, 27, 30, 4, PAL.shadowAlpha);
    c.bevelBox(0, 8, 32, 8, PAL.woodLight, PAL.woodHi, PAL.woodMid, PAL.ink);
    c.bevelBox(1, 16, 30, 13, PAL.woodMid, PAL.woodLight, PAL.woodDark, PAL.ink);
    c.strokeRect(4, 19, 10, 7, PAL.woodDark);
    c.strokeRect(18, 19, 10, 7, PAL.woodDark);
  });

  // (1,2) Table en bois
  drawTile(sheet, 1, 2, (c) => {
    c.ellipse(16, 27, 13, 3, PAL.shadowAlpha);
    // Legs
    c.bevelBox(4, 18, 4, 10, PAL.woodDark, PAL.woodMid, PAL.ink, PAL.ink);
    c.bevelBox(24, 18, 4, 10, PAL.woodDark, PAL.woodMid, PAL.ink, PAL.ink);
    // Tabletop
    c.bevelBox(2, 8, 28, 12, PAL.woodLight, PAL.woodHi, PAL.woodMid, PAL.ink);
    // Small mug on table
    c.bevelBox(20, 10, 5, 6, PAL.ironMid, PAL.ironHi, PAL.ironDark, PAL.ink);
    c.rect(21, 10, 3, 2, PAL.fireWhite);
  });

  // (2,2) Tabouret
  drawTile(sheet, 2, 2, (c) => {
    c.ellipse(16, 27, 8, 3, PAL.shadowAlpha);
    c.rect(10, 18, 3, 9, PAL.woodDark);
    c.rect(19, 18, 3, 9, PAL.woodDark);
    c.rect(12, 22, 8, 2, PAL.woodMid);
    c.ellipse(16, 15, 8, 4, PAL.ink);
    c.ellipse(16, 15, 7, 3, PAL.woodLight);
    c.ellipse(15, 14, 5, 2, PAL.woodHi);
  });

  // (3,2) Panneau de quêtes (avec affiches)
  drawTile(sheet, 3, 2, (c) => {
    c.rect(4, 28, 24, 3, PAL.shadowAlpha);
    c.rect(5, 22, 3, 8, PAL.woodDark);
    c.rect(24, 22, 3, 8, PAL.woodDark);
    c.bevelBox(2, 3, 28, 20, PAL.woodMid, PAL.woodLight, PAL.woodDark, PAL.ink);
    c.rect(4, 5, 24, 16, PAL.woodDark);
    // Quest posters
    c.rect(6, 7, 7, 9, PAL.paperHi);
    c.rect(7, 8, 2, 2, PAL.carpetLight);
    c.rect(7, 11, 5, 1, PAL.woodDark);
    c.rect(7, 13, 4, 1, PAL.woodDark);

    c.rect(15, 6, 9, 7, PAL.paperMid);
    c.rect(19, 7, 2, 1, PAL.fireRed);
    c.rect(16, 9, 6, 1, PAL.woodDark);
    c.rect(16, 11, 5, 1, PAL.woodDark);

    c.rect(16, 14, 8, 6, PAL.paperHi);
    c.rect(17, 16, 5, 1, PAL.woodDark);
    c.rect(17, 18, 4, 1, PAL.woodDark);
  });

  // (0,3) Tonneau
  drawTile(sheet, 0, 3, (c) => {
    c.ellipse(16, 28, 10, 3, PAL.shadowAlpha);
    c.ellipse(16, 18, 10, 11, PAL.woodMid);
    c.rect(8, 10, 3, 17, PAL.woodLight);
    c.rect(14, 9, 4, 18, PAL.woodHi);
    c.rect(21, 10, 3, 17, PAL.woodDark);
    // Iron hoops
    c.rect(7, 13, 18, 2, PAL.ironDark);
    c.rect(8, 13, 10, 1, PAL.ironHi);
    c.rect(7, 22, 18, 2, PAL.ironDark);
    c.rect(8, 22, 10, 1, PAL.ironHi);
    // Top lid
    c.ellipse(16, 9, 8, 3, PAL.woodDark);
    c.ellipse(16, 9, 7, 2, PAL.woodLight);
    c.addOutline(PAL.ink);
  });

  // (1,3) Bibliothèque
  drawTile(sheet, 1, 3, (c) => {
    c.bevelBox(2, 1, 28, 30, PAL.woodMid, PAL.woodLight, PAL.woodDark, PAL.ink);
    const shelfYs = [4, 12, 20];
    const bookColors = [
      PAL.carpetLight,
      PAL.blueMid,
      PAL.greenMid,
      PAL.goldMid,
      PAL.purpleMid,
      PAL.carpetMid,
      PAL.blueLight,
    ];
    for (let s = 0; s < shelfYs.length; s += 1) {
      const sy = shelfYs[s]!;
      c.rect(4, sy, 24, 7, PAL.woodDark);
      for (let b = 0; b < 7; b += 1) {
        const bx = 5 + b * 3;
        const bh = 5 + ((b + s) % 2);
        const col = bookColors[(b + s * 2) % bookColors.length]!;
        c.rect(bx, sy + (7 - bh), 3, bh, col);
        c.rect(bx + 2, sy + (7 - bh), 1, bh, PAL.ink);
      }
    }
  });

  // (2,3) & (3,3) Torche murale (2 frames)
  for (let f = 0; f < 2; f += 1) {
    drawTile(sheet, 2 + f, 3, (c) => {
      // Warm glow halo
      c.ellipse(16, 12, 10 + f, 10, '#f0641835');
      // Wall iron bracket & stick
      c.rect(14, 15, 4, 12, PAL.woodMid);
      c.rect(13, 18, 6, 3, PAL.ironMid);
      c.rect(14, 15, 1, 11, PAL.woodLight);
      // Animated flame
      c.ellipse(16 + (f === 0 ? -1 : 1), 10, 4, 6, PAL.fireOrange);
      c.ellipse(16, 11, 3, 4, PAL.fireYellow);
      c.ellipse(16, 12, 1.5, 2, PAL.fireWhite);
      c.addOutline(PAL.ink);
    });
  }

  return sheet;
}

/**
 * Generates `tileset_donjon.png` (128x128, 4x4 grid of 32x32 tiles).
 */
export function buildDungeonTileset(): PixelCanvas {
  const sheet = new PixelCanvas(128, 128);

  // (0,0) Dalles de pierre sombres
  drawTile(sheet, 0, 0, (c) => {
    c.fill(PAL.stoneDeep);
    c.bevelBox(1, 1, 14, 14, PAL.stoneDark, PAL.stoneMid, PAL.stoneDeep, PAL.ink);
    c.bevelBox(17, 1, 14, 14, PAL.stoneDark, PAL.stoneMid, PAL.stoneDeep, PAL.ink);
    c.bevelBox(1, 17, 14, 14, PAL.stoneDark, PAL.stoneMid, PAL.stoneDeep, PAL.ink);
    c.bevelBox(17, 17, 14, 14, PAL.stoneDark, PAL.stoneMid, PAL.stoneDeep, PAL.ink);
  });

  // (1,0) Dalles fissurées
  drawTile(sheet, 1, 0, (c) => {
    c.fill(PAL.stoneDeep);
    c.bevelBox(1, 1, 14, 14, PAL.stoneDark, PAL.stoneMid, PAL.stoneDeep, PAL.ink);
    c.bevelBox(17, 1, 14, 14, PAL.stoneDark, PAL.stoneMid, PAL.stoneDeep, PAL.ink);
    c.bevelBox(1, 17, 14, 14, PAL.stoneDark, PAL.stoneMid, PAL.stoneDeep, PAL.ink);
    c.bevelBox(17, 17, 14, 14, PAL.stoneDark, PAL.stoneMid, PAL.stoneDeep, PAL.ink);
    // Cracks & moss specks
    c.line(5, 4, 12, 13, PAL.ink);
    c.line(12, 13, 18, 22, PAL.ink);
    c.line(18, 22, 26, 25, PAL.ink);
    c.px(6, 5, PAL.stoneHi);
    c.px(19, 21, PAL.slimeDark);
    c.px(20, 22, PAL.slimeDark);
  });

  // (2,0) & (3,0) Lave / eau bouillonnante (2 frames)
  for (let f = 0; f < 2; f += 1) {
    drawTile(sheet, 2 + f, 0, (c) => {
      c.fill(PAL.fireRed);
      c.ditherRect(0, 0, 32, 32, PAL.fireRed, PAL.fireOrange);
      const shift = f * 6;
      c.ellipse((10 + shift) % 26 + 3, 9, 6, 3, PAL.fireYellow);
      c.ellipse((22 - shift + 26) % 24 + 4, 22, 7, 3, PAL.fireYellow);
      c.rect((9 + shift) % 24 + 3, 8, 4, 1, PAL.fireWhite);
      c.rect((20 - shift + 24) % 22 + 4, 21, 5, 1, PAL.fireWhite);
      c.strokeRect(0, 0, 32, 32, PAL.stoneDeep);
    });
  }

  // (0,1) Mur de donjon en briques
  drawTile(sheet, 0, 1, (c) => {
    c.fill(PAL.ink);
    for (let row = 0; row < 4; row += 1) {
      const y = row * 8;
      const offset = row % 2 === 0 ? 0 : 8;
      for (let x = -8 + offset; x < 32; x += 16) {
        c.bevelBox(x + 1, y + 1, 14, 6, PAL.stoneMid, PAL.stoneLight, PAL.stoneDark, PAL.ink);
      }
    }
  });

  // (1,1) Pilier de pierre (Y-Sorted)
  drawTile(sheet, 1, 1, (c) => {
    c.ellipse(16, 29, 12, 3, PAL.shadowAlpha);
    // Base pedestal
    c.bevelBox(5, 22, 22, 8, PAL.stoneMid, PAL.stoneLight, PAL.stoneDeep, PAL.ink);
    // Column shaft
    c.rect(8, 2, 16, 21, PAL.stoneMid);
    c.rect(9, 2, 4, 21, PAL.stoneLight);
    c.rect(10, 2, 2, 21, PAL.stoneHi);
    c.rect(19, 2, 5, 21, PAL.stoneDark);
    c.strokeRect(8, 2, 16, 21, PAL.ink);
    // Carved crack
    c.line(12, 10, 17, 14, PAL.stoneDeep);
  });

  // (2,1) Grille en fer
  drawTile(sheet, 2, 1, (c) => {
    c.rect(0, 4, 32, 3, PAL.ironDark);
    c.rect(0, 5, 32, 1, PAL.ironHi);
    c.rect(0, 25, 32, 3, PAL.ironDark);
    c.rect(0, 26, 32, 1, PAL.ironHi);
    for (let x = 3; x < 32; x += 6) {
      c.rect(x, 0, 3, 32, PAL.ironDark);
      c.rect(x + 1, 0, 1, 32, PAL.ironHi);
    }
  });

  // (3,1) Escalier descendant
  drawTile(sheet, 3, 1, (c) => {
    c.fill(PAL.ink);
    const tones = [PAL.stoneHi, PAL.stoneLight, PAL.stoneMid, PAL.stoneDark, PAL.stoneDeep];
    for (let step = 0; step < 5; step += 1) {
      const y = 3 + step * 5;
      c.rect(3, y, 26, 4, tones[step]!);
      c.rect(3, y + 4, 26, 1, PAL.ink);
    }
    c.strokeRect(2, 2, 28, 28, PAL.stoneLight);
  });

  // (0,2) Coffre fermé
  drawTile(sheet, 0, 2, (c) => {
    c.ellipse(16, 28, 12, 3, PAL.shadowAlpha);
    c.bevelBox(4, 10, 24, 17, PAL.woodMid, PAL.woodLight, PAL.woodDark, PAL.ink);
    c.rect(4, 16, 24, 2, PAL.ink);
    // Gold straps & lock
    c.rect(6, 10, 3, 17, PAL.goldMid);
    c.rect(23, 10, 3, 17, PAL.goldMid);
    c.rect(7, 11, 1, 15, PAL.goldHi);
    c.rect(24, 11, 1, 15, PAL.goldHi);
    c.bevelBox(13, 14, 6, 6, PAL.goldMid, PAL.goldHi, PAL.goldDark, PAL.ink);
    c.px(16, 17, PAL.ink);
  });

  // (1,2) Coffre ouvert
  drawTile(sheet, 1, 2, (c) => {
    c.ellipse(16, 28, 12, 3, PAL.shadowAlpha);
    // Open lid
    c.bevelBox(4, 4, 24, 8, PAL.woodDark, PAL.woodMid, PAL.ink, PAL.ink);
    // Dark interior with gold glint
    c.rect(5, 12, 22, 6, PAL.ink);
    c.rect(9, 14, 14, 3, PAL.goldMid);
    c.rect(11, 14, 5, 2, PAL.goldHi);
    // Lower box
    c.bevelBox(4, 17, 24, 10, PAL.woodMid, PAL.woodLight, PAL.woodDark, PAL.ink);
    c.rect(6, 17, 3, 10, PAL.goldMid);
    c.rect(23, 17, 3, 10, PAL.goldMid);
  });

  // (2,2) Piège à pics rentré
  drawTile(sheet, 2, 2, (c) => {
    c.bevelBox(2, 2, 28, 28, PAL.stoneDark, PAL.stoneMid, PAL.stoneDeep, PAL.ink);
    for (const py of [8, 16, 24]) {
      for (const px of [8, 16, 24]) {
        c.rect(px - 2, py - 2, 4, 4, PAL.ink);
        c.px(px - 1, py - 1, PAL.ironMid);
      }
    }
  });

  // (3,2) Piège à pics sorti
  drawTile(sheet, 3, 2, (c) => {
    c.bevelBox(2, 2, 28, 28, PAL.stoneDark, PAL.stoneMid, PAL.stoneDeep, PAL.ink);
    for (const py of [9, 17, 25]) {
      for (const px of [8, 16, 24]) {
        c.rect(px - 2, py - 1, 4, 3, PAL.ironDark);
        c.rect(px - 1, py - 4, 2, 4, PAL.ironMid);
        c.px(px, py - 5, PAL.ironHi);
        c.px(px - 1, py - 4, PAL.fireWhite);
      }
    }
  });

  // (0,3) & (1,3) Brasero allumé (2 frames)
  for (let f = 0; f < 2; f += 1) {
    drawTile(sheet, f, 3, (c) => {
      c.ellipse(16, 28, 10, 3, PAL.shadowAlpha);
      c.ellipse(16, 13, 12 + f, 10, '#f0641830');
      // Iron tripod & bowl
      c.rect(9, 21, 3, 7, PAL.ironDark);
      c.rect(20, 21, 3, 7, PAL.ironDark);
      c.bevelBox(6, 15, 20, 7, PAL.ironDark, PAL.ironMid, PAL.ink, PAL.ink);
      // Coals & flames
      c.rect(8, 14, 16, 3, PAL.fireRed);
      c.ellipse(13 + f, 11, 4, 5, PAL.fireOrange);
      c.ellipse(19 - f, 12, 4, 4, PAL.fireOrange);
      c.ellipse(16, 10 + f, 4, 5, PAL.fireYellow);
      c.ellipse(16, 12, 2, 2, PAL.fireWhite);
      c.addOutline(PAL.ink);
    });
  }

  // (2,3) Chapiteau de pilier (plane: above)
  drawTile(sheet, 2, 3, (c) => {
    c.bevelBox(3, 18, 26, 10, PAL.stoneLight, PAL.stoneHi, PAL.stoneMid, PAL.ink);
    c.bevelBox(6, 10, 20, 9, PAL.stoneMid, PAL.stoneLight, PAL.stoneDark, PAL.ink);
  });

  // (3,3) Arche de pierre (plane: above)
  drawTile(sheet, 3, 3, (c) => {
    c.bevelBox(0, 0, 32, 14, PAL.stoneMid, PAL.stoneLight, PAL.stoneDark, PAL.ink);
    c.rect(0, 14, 6, 18, PAL.stoneDark);
    c.rect(26, 14, 6, 18, PAL.stoneDark);
    c.strokeRect(0, 14, 6, 18, PAL.ink);
    c.strokeRect(26, 14, 6, 18, PAL.ink);
  });

  return sheet;
}
