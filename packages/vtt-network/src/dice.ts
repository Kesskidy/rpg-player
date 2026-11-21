import type { VttDiceRollResult } from '@rpg-player/core-types';

const DICE_PATTERN = /^\s*(\d*)d(\d+)\s*([+-]\s*\d+)?\s*$/i;

/**
 * Parses and rolls standard RPG dice notation (e.g. "1d20+5", "2d6-1", "d100", "4d8").
 * Accepts an optional RNG in [0..1) for deterministic testing.
 */
export function rollDiceFormula(
  formula: string,
  rng: () => number = Math.random,
): VttDiceRollResult {
  const match = DICE_PATTERN.exec(formula);
  if (!match) {
    throw new Error(`Formule de dés invalide : "${formula}" (exemples : 1d20, 2d6+3, d100)`);
  }

  const count = match[1] ? Number.parseInt(match[1], 10) : 1;
  const sides = Number.parseInt(match[2]!, 10);
  const modifier = match[3] ? Number.parseInt(match[3].replace(/\s+/g, ''), 10) : 0;

  if (count < 1 || count > 50) {
    throw new Error('Le nombre de dés doit être compris entre 1 et 50.');
  }
  if (sides < 2 || sides > 1000) {
    throw new Error('Le nombre de faces doit être compris entre 2 et 1000.');
  }

  const rolls: number[] = [];
  let sum = 0;
  for (let i = 0; i < count; i += 1) {
    const value = Math.floor(rng() * sides) + 1;
    rolls.push(value);
    sum += value;
  }

  const modPart = modifier === 0 ? '' : modifier > 0 ? `+${modifier}` : `${modifier}`;
  return {
    formula: `${count}d${sides}${modPart}`,
    count,
    sides,
    modifier,
    rolls,
    total: sum + modifier,
  };
}
