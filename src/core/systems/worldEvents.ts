import { CONFIG, type WorldEventConfig } from '../config';
import type { GameEvent, GameState } from '../types';
import { priceShock } from './crypto';
import { pick, pickWeighted, rand, randRange } from './rng';

const W = () => CONFIG.worldEvents;

export function worldEventById(id: string): WorldEventConfig | undefined {
  return W().types.find((t) => t.id === id);
}

function pushNews(state: GameState, text: string): void {
  const news = state.worldEvents.news;
  news.push(text);
  if (news.length > 6) news.splice(0, news.length - 6);
}

/** Schlagzeile eines Ereignisses (Zero-Day nennt die betroffene Familie). */
export function eventHeadline(id: string, family?: string): string {
  const cfg = worldEventById(id);
  if (!cfg) return id;
  const fam = CONFIG.exploits.families.find((f) => f.id === family);
  return `${cfg.name}${fam ? ` (${fam.name})` : ''}: ${cfg.desc}`;
}

/**
 * Zeitlich begrenzte Ereignisse fortschreiben und neue auslösen.
 * Offline laufen aktive Ereignisse aus, es entstehen aber keine neuen.
 */
export function worldEventsTick(state: GameState, dt: number, events: GameEvent[], offline: boolean): void {
  const we = state.worldEvents;
  for (const e of [...we.active]) {
    e.left -= dt;
    if (e.left <= 0) {
      we.active = we.active.filter((x) => x !== e);
      if (!offline) events.push({ kind: 'worldEvent', id: e.id, started: false, text: `${worldEventById(e.id)?.name ?? e.id} ist vorbei.` });
    }
  }
  if (offline || state.reputation < W().minRep) return;
  we.nextIn -= dt;
  if (we.nextIn > 0) return;
  we.nextIn = randRange(state, W().minInterval, W().maxInterval);
  const options = W().types.filter((t) => !we.active.some((a) => a.id === t.id));
  if (!options.length) return;
  const cfg = pickWeighted(state, options);
  let family: string | undefined;
  if (cfg.securityMult) {
    const fams = [...new Set(CONFIG.targets.filter((t) => state.reputation >= t.reqRep && !t.phases).map((t) => t.family))];
    family = pick(state, fams.length ? fams : ['iot']);
  }
  we.active.push({ id: cfg.id, left: cfg.duration, family });
  if (cfg.priceShock) priceShock(state, cfg.priceShock);
  const text = eventHeadline(cfg.id, family);
  pushNews(state, text);
  if (rand(state) < 0.5) pushNews(state, pick(state, W().headlines));
  events.push({ kind: 'worldEvent', id: cfg.id, started: true, text });
}
