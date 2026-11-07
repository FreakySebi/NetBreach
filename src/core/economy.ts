import type { Cost, GameState } from './types';

/** Exponentielle Kostenkurve: base * growth ^ n */
export function scaleCost(base: Cost, growth: number, n: number, mult = 1): Cost {
  const f = Math.pow(growth, n) * mult;
  const out: Cost = {};
  if (base.money) out.money = Math.ceil(base.money * f);
  if (base.crypto) out.crypto = Math.round(base.crypto * f * 100) / 100;
  if (base.models) out.models = Math.ceil(base.models * Math.pow(growth, n));
  return out;
}

export function canAfford(state: GameState, cost: Cost): boolean {
  return (
    (cost.money ?? 0) <= state.money + 1e-9 &&
    (cost.crypto ?? 0) <= state.crypto + 1e-9 &&
    (cost.models ?? 0) <= state.models + 1e-9
  );
}

export function pay(state: GameState, cost: Cost): boolean {
  if (!canAfford(state, cost)) return false;
  state.money -= cost.money ?? 0;
  state.crypto -= cost.crypto ?? 0;
  state.models -= cost.models ?? 0;
  return true;
}

export function refund(state: GameState, cost: Cost, ratio: number): void {
  state.money += (cost.money ?? 0) * ratio;
  state.crypto += (cost.crypto ?? 0) * ratio;
  state.models += Math.floor((cost.models ?? 0) * ratio);
}

export function isFree(cost: Cost): boolean {
  return !cost.money && !cost.crypto && !cost.models;
}
