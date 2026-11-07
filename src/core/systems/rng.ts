import type { GameState } from '../types';

/** Gleichverteilte Zufallszahl in [0, 1) aus dem gespeicherten Seed (mulberry32). */
export function rand(state: GameState): number {
  let t = (state.rng = (state.rng + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randRange(state: GameState, min: number, max: number): number {
  return min + rand(state) * (max - min);
}

export function randInt(state: GameState, min: number, max: number): number {
  return Math.floor(randRange(state, min, max + 1));
}

export function pick<T>(state: GameState, items: readonly T[]): T {
  return items[Math.floor(rand(state) * items.length)];
}

export function pickWeighted<T extends { weight: number }>(state: GameState, items: readonly T[]): T {
  const total = items.reduce((a, b) => a + b.weight, 0);
  let r = rand(state) * total;
  for (const it of items) {
    r -= it.weight;
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}

/** Normalverteilte Zufallszahl (Box-Muller). */
export function randNormal(state: GameState): number {
  const u = Math.max(1e-12, rand(state));
  const v = rand(state);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
