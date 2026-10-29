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

export function getModifiers(_state: GameState): Modifiers {
  return { hackSpeed: 1, money: 1, dataValue: 1, crypto: 1, rep: 1, click: 1, traceGain: 1, traceDecay: 0 };
}
