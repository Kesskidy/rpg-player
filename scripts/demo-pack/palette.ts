import { hexToRgba } from '@rpg-player/pixel-studio';
import type { ColorRGBA } from '@rpg-player/core-types';

/**
 * Cohesive fantasy RPG pixel-art palette with dark outlines and 3-tone shading ramps.
 */
export const PAL = {
  // Outlines & shadows
  ink: '#141013',
  shadow: '#1e1924',
  shadowAlpha: '#14101370',

  // Warm Wood (Guild floor, tables, barrels, doors)
  woodDark: '#47281c',
  woodMid: '#73442a',
  woodLight: '#9e633c',
  woodHi: '#c48a57',

  // Guild Plaster & Carpet
  plasterDark: '#9a8c7c',
  plasterMid: '#c4b49c',
  plasterLight: '#e4d8c1',
  carpetDark: '#6b1628',
  carpetMid: '#a32035',
  carpetLight: '#d13848',
  goldDark: '#9c6618',
  goldMid: '#dfa128',
  goldHi: '#ffe066',

  // Dungeon Stone & Iron
  stoneDeep: '#1f2330',
  stoneDark: '#2f3647',
  stoneMid: '#465066',
  stoneLight: '#68758f',
  stoneHi: '#93a1ba',
  ironDark: '#28303d',
  ironMid: '#58667a',
  ironHi: '#9fb0c7',

  // Fire, Lava & Water
  fireRed: '#c92a2a',
  fireOrange: '#f06418',
  fireYellow: '#ffd43b',
  fireWhite: '#fff5cc',
  waterDeep: '#183f5e',
  waterMid: '#246b8c',
  waterHi: '#4cb5c3',

  // Nature & Monsters
  slimeDark: '#1b6b3a',
  slimeMid: '#37a84a',
  slimeLight: '#7ce063',
  slimeHi: '#d4ff9e',
  goblinDark: '#365924',
  goblinMid: '#5c8c38',
  goblinLight: '#8bbd55',
  boneDark: '#7a756b',
  boneMid: '#bdb5a6',
  boneLight: '#ede7da',

  // Character clothing & skin
  skinDark: '#b87654',
  skinMid: '#e3a57d',
  skinLight: '#f7c9a6',
  hairBrown: '#4a2b1d',
  hairWhite: '#dce3ed',
  blueDark: '#1c3a6e',
  blueMid: '#2f63b8',
  blueLight: '#5c95e8',
  purpleDark: '#3b1d54',
  purpleMid: '#68348f',
  purpleLight: '#995cc4',
  greenDark: '#1f4d36',
  greenMid: '#337a52',
  greenLight: '#58ab74',
  runeCyan: '#38e8ff',
  runeGlow: '#a6f7ff',

  // Paper / Parchment / Books
  paperDark: '#b39c76',
  paperMid: '#e0cfa9',
  paperHi: '#f7eed7',
} as const;

export type PaletteKey = keyof typeof PAL;

const COLOR_CACHE = new Map<string, ColorRGBA>();

export function rgba(hex: string): ColorRGBA {
  const cached = COLOR_CACHE.get(hex);
  if (cached) return cached;
  const parsed = hexToRgba(hex);
  COLOR_CACHE.set(hex, parsed);
  return parsed;
}

export const DEMO_PALETTE_HEX: string[] = [
  PAL.ink,
  PAL.woodDark,
  PAL.woodMid,
  PAL.woodLight,
  PAL.carpetMid,
  PAL.goldMid,
  PAL.stoneDark,
  PAL.stoneMid,
  PAL.stoneLight,
  PAL.fireOrange,
  PAL.fireYellow,
  PAL.slimeMid,
  PAL.blueMid,
  PAL.purpleMid,
  PAL.skinMid,
  PAL.paperHi,
];
