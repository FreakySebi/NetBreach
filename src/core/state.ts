import { CONFIG } from './config';
import type { GameState } from './types';

export const SAVE_VERSION = 1;

export function createInitialState(): GameState {
  return {
    version: SAVE_VERSION,
    money: 0,
    crypto: 0,
    reputation: 0,
    trace: 0,
    raidTimer: 0,
    nodes: [{ id: 1, type: 'job', x: -110, y: -60, levels: {}, buffer: 0 }],
    connections: [],
    nextId: 2,
    research: [],
    prestige: { tokens: 0, tokensTotal: 0, identities: 0, perks: {} },
    run: { money: 0, data: 0, crypto: 0, hacks: 0, clicks: 0, raids: 0, playTime: 0 },
    allTimeMoney: 0,
    savedAt: Date.now(),
    camera: { x: 0, y: 0, zoom: 1 },
  };
}

/** Globale Multiplikatoren aus Forschung und Prestige. */
export interface Modifiers {
  hackSpeed: number;
  money: number;
  dataValue: number;
  crypto: number;
  rep: number;
  click: number;
  traceGain: number;
  traceDecay: number;
}

export function perkLevel(state: GameState, id: string): number {
  return state.prestige.perks[id] ?? 0;
}

// Modifikatoren werden pro Tick oft gebraucht → nach Inhalt cachen.
let cacheKey = '';
let cacheValue: Modifiers | null = null;

export function getModifiers(state: GameState): Modifiers {
  const key = state.research.join(',') + '|' + state.prestige.tokensTotal + '|' + JSON.stringify(state.prestige.perks);
  if (cacheValue && key === cacheKey) return cacheValue;
  const m: Modifiers = { hackSpeed: 1, money: 1, dataValue: 1, crypto: 1, rep: 1, click: 1, traceGain: 1, traceDecay: 0 };
  for (const id of state.research) {
    const r = CONFIG.research.find((x) => x.id === id);
    if (!r?.mods) continue;
    for (const [k, v] of Object.entries(r.mods) as [keyof Modifiers, number][]) {
      if (k === 'traceDecay') m.traceDecay += v;
      else m[k] *= v;
    }
  }
  const p = CONFIG.prestige;
  const tokens = state.prestige.tokensTotal;
  m.money *= 1 + tokens * p.moneyPerToken;
  m.crypto *= 1 + tokens * p.moneyPerToken;
  m.hackSpeed *= 1 + tokens * p.speedPerToken;
  m.click *= Math.pow(3, perkLevel(state, 'contacts')) * (1 + tokens * p.moneyPerToken);
  m.traceGain *= Math.pow(0.9, perkLevel(state, 'ghost'));
  cacheKey = key;
  cacheValue = m;
  return m;
}

/** Ghost-Tokens, die eine neue Identität jetzt bringen würde. */
export function pendingTokens(state: GameState): number {
  const p = CONFIG.prestige;
  if (state.run.money < p.minMoney) return 0;
  return Math.floor(p.factor * Math.sqrt(state.run.money / p.minMoney));
}

export function offlineCapSeconds(state: GameState): number {
  return (CONFIG.offline.maxHours + 4 * perkLevel(state, 'nightshift')) * 3600;
}

/** Neue Identität: Lauf zurücksetzen, Prestige behalten. */
export function prestigeReset(state: GameState): GameState {
  const fresh = createInitialState();
  const gained = pendingTokens(state);
  fresh.prestige = {
    ...state.prestige,
    perks: { ...state.prestige.perks },
    tokens: state.prestige.tokens + gained,
    tokensTotal: state.prestige.tokensTotal + gained,
    identities: state.prestige.identities + 1,
  };
  fresh.allTimeMoney = state.allTimeMoney;
  const cash = perkLevel(fresh, 'startcash');
  if (cash > 0) fresh.money = 1000 * Math.pow(5, cash - 1);
  const rep = perkLevel(fresh, 'startrep');
  if (rep > 0) fresh.reputation = 50 * Math.pow(4, rep - 1);
  if (perkLevel(fresh, 'memory') > 0) fresh.research = [...state.research];
  return fresh;
}
