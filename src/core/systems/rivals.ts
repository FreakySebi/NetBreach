import { CONFIG } from '../config';
import { getModifiers } from '../state';
import type { GameEvent, GameState, NodeRuntime } from '../types';
import { NODE_DEFS } from '../../nodes/definitions';
import { rand, randRange } from './rng';

type RuntimeLike = Map<number, NodeRuntime>;
const R = () => CONFIG.rivals;

/** Gesamte Abwehrstärke: Firewalls plus ein Anteil des Honeypot-Lockwerts. */
export function defenseRating(state: GameState, runtime: RuntimeLike): number {
  let d = 0;
  for (const n of state.nodes) {
    const rt = runtime.get(n.id);
    if (!rt) continue;
    if (n.type === 'firewall') d += rt.power;
    if (n.type === 'honeypot') d += rt.power * R().honeypotDefense;
  }
  return d;
}

function honeypotLure(state: GameState, runtime: RuntimeLike): number {
  let lure = 0;
  for (const n of state.nodes) if (n.type === 'honeypot') lure += runtime.get(n.id)?.power ?? 0;
  return lure;
}

/** Angriffsstärke der aktuellen Rivalen-Gruppe. */
export function rivalStrength(state: GameState): number {
  const rep = Math.max(1, state.reputation / R().minRep);
  return R().baseStrength * Math.pow(rep, R().repExponent) * Math.pow(R().levelGrowth, state.rival.level);
}

export function rivalsActive(state: GameState): boolean {
  return state.reputation >= R().minRep;
}

/** Angriff auswerten: abwehren (Ruf) oder Schaden (Sperren, Datendiebstahl, Geld). */
function resolveAttack(state: GameState, runtime: RuntimeLike, strength: number, events: GameEvent[]): void {
  const mods = getModifiers(state);
  const defense = defenseRating(state, runtime);
  const lure = honeypotLure(state, runtime);
  state.stats.attacks++;
  const repelled = defense >= strength;
  const parts: string[] = [];
  if (repelled) {
    state.stats.repelled++;
    const rep = R().repelRep * (strength / R().baseStrength) * mods.rep;
    state.reputation += rep;
    parts.push(`Angriff abgewehrt! +${Math.round(rep).toLocaleString('de-DE')} Ruf`);
  } else {
    const severity = 1 - defense / strength;
    // Zufällige Nodes sperren
    const candidates = state.nodes.filter((n) => NODE_DEFS[n.type].category !== 'job' && !n.locked);
    const count = Math.min(candidates.length, Math.ceil(severity * R().lockMaxNodes));
    for (let i = 0; i < count; i++) {
      const idx = Math.floor(rand(state) * candidates.length);
      const [n] = candidates.splice(idx, 1);
      n.locked = R().lockSeconds;
      n.job = null;
    }
    // Daten und Geld stehlen
    let stolen = 0;
    for (const n of state.nodes) {
      if (NODE_DEFS[n.type].category !== 'storage') continue;
      const s = n.buffer * severity * R().dataSteal;
      n.buffer -= s;
      stolen += s;
    }
    const money = state.money * severity * R().moneySteal;
    state.money -= money;
    parts.push(`Rivalen-Angriff! ${count} Nodes ${R().lockSeconds} s gesperrt, ${Math.round(stolen).toLocaleString('de-DE')} MB Daten und ${Math.round(money).toLocaleString('de-DE')} € gestohlen`);
  }
  if (lure > 0) {
    state.reputation += R().honeypotRep * lure * mods.rep;
    state.rival.track = Math.min(100, state.rival.track + R().trackPerLure * lure * (repelled ? 1 : 0.5));
    if (state.rival.track >= 100 && !state.rival.located) {
      state.rival.located = true;
      parts.push('Honeypots haben den Rivalen geortet – das Rivalen-Netz ist jetzt ein Hack-Ziel!');
    } else if (!state.rival.located) parts.push(`Rückverfolgung ${Math.floor(state.rival.track)} %`);
  }
  events.push({ kind: 'rivalAttack', repelled, text: parts.join(' · ') });
}

/**
 * Rivalen planen Angriffe mit Vorwarnung. Offline greifen sie nie an
 * (der Timer steht still).
 */
export function rivalsTick(state: GameState, runtime: RuntimeLike, dt: number, events: GameEvent[], offline: boolean): void {
  if (offline || !rivalsActive(state)) return;
  const r = state.rival;
  if (r.warning) {
    r.warning.left -= dt;
    if (r.warning.left <= 0) {
      const strength = r.warning.strength;
      r.warning = null;
      r.nextIn = randRange(state, R().minInterval, R().maxInterval);
      resolveAttack(state, runtime, strength, events);
    }
    return;
  }
  r.nextIn -= dt;
  if (r.nextIn <= 0) {
    r.warning = { left: R().warningSeconds, strength: rivalStrength(state) };
    events.push({ kind: 'rivalWarning', strength: r.warning.strength, defense: defenseRating(state, runtime) });
  }
}
