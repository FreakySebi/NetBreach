import { CONFIG } from './config';
import { offlineCapSeconds } from './state';
import { tick, type RuntimeMap } from './simulation';
import type { GameEvent, GameState } from './types';

export interface OfflineReport {
  seconds: number;
  cappedSeconds: number;
  money: number;
  crypto: number;
  data: number;
  hacks: number;
  rep: number;
}

/**
 * Rechnet verstrichene Zeit nach. Die Schrittweite wird so gewählt, dass höchstens
 * CONFIG.offline.maxSteps Ticks nötig sind.
 */
export function simulateOffline(state: GameState, runtime: RuntimeMap, seconds: number): OfflineReport {
  const capped = Math.min(seconds, offlineCapSeconds(state));
  const before = { money: state.run.money, crypto: state.run.crypto, data: state.run.data, hacks: state.run.hacks, rep: state.reputation };
  const step = Math.max(1 / CONFIG.tickRate, capped / CONFIG.offline.maxSteps);
  const events: GameEvent[] = [];
  const flows = new Map<number, number>();
  const opts = CONFIG.offline.allowRaids ? {} : { scriptTraceLimit: CONFIG.offline.scriptTraceLimit };
  let left = capped;
  while (left > 1e-6) {
    const dt = Math.min(step, left);
    tick(state, runtime, dt, events, flows, opts);
    if (!CONFIG.offline.allowRaids) state.trace = Math.min(state.trace, 99);
    left -= dt;
    events.length = 0;
  }
  return {
    seconds,
    cappedSeconds: capped,
    money: state.run.money - before.money,
    crypto: state.run.crypto - before.crypto,
    data: state.run.data - before.data,
    hacks: state.run.hacks - before.hacks,
    rep: state.reputation - before.rep,
  };
}
