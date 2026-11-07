import { CONFIG, type TargetConfig } from '../config';
import { fmt, fmtBytes, fmtMoney, fmtTime } from '../format';
import { getModifiers } from '../state';
import type { Contract, ContractKind, ContractReward, GameEvent, GameState, NodeRuntime } from '../types';
import { addExploits, familyById } from './exploits';
import { pick, rand, randInt } from './rng';
import { NODE_DEFS } from '../../nodes/definitions';
import { stat } from '../../nodes/stats';

type RuntimeLike = Map<number, NodeRuntime>;
const C = () => CONFIG.contracts;

/** Aktueller Zählerstand, an dem der Fortschritt eines Auftrags gemessen wird. */
function metric(state: GameState, c: Contract): number {
  switch (c.kind) {
    case 'hackCount':
      return state.stats.targets[c.targetId ?? ''] ?? 0;
    case 'sellData':
      return state.stats.dataSold;
    case 'earnMoney':
      return state.run.money;
    case 'craft':
      return state.stats.exploits;
    case 'defend':
      return state.stats.repelled;
    case 'lowTrace':
      return 0;
  }
}

export function contractText(c: Contract): string {
  const t = CONFIG.targets.find((x) => x.id === c.targetId);
  const time = fmtTime(c.duration);
  switch (c.kind) {
    case 'hackCount':
      return `Hacke ${c.goal}× ${t?.name ?? '?'} in ${time}.`;
    case 'sellData':
      return `Verkaufe ${fmtBytes(c.goal)} Daten in ${time} – ohne Razzia.`;
    case 'earnMoney':
      return `Verdiene ${fmtMoney(c.goal)} in ${time}.`;
    case 'lowTrace':
      return `Halte den Trace ${fmtTime(c.goal)} am Stück unter ${CONFIG.contracts.lowTrace.below} % (Zeitlimit ${time}).`;
    case 'craft':
      return `Stelle ${c.goal} Exploits her in ${time}.`;
    case 'defend':
      return `Wehre einen Rivalen-Angriff ab (Zeitlimit ${time}).`;
  }
}

export function rewardText(r: ContractReward): string {
  const parts: string[] = [];
  if (r.money) parts.push(fmtMoney(r.money));
  if (r.crypto) parts.push(`${fmt(r.crypto, 3)} ₿`);
  if (r.rep) parts.push(`${fmt(r.rep)} Ruf`);
  if (r.exploits) parts.push(`${r.exploits.count}× ${familyById(r.exploits.family)?.name ?? ''}-Exploit`);
  return parts.join(' + ');
}

/** Hackbare Ziele mit der jeweils besten verfügbaren Rechenleistung. */
function hackableTargets(state: GameState, runtime: RuntimeLike): { t: TargetConfig; power: number }[] {
  const out: { t: TargetConfig; power: number }[] = [];
  const comps = state.nodes.filter((n) => NODE_DEFS[n.type].category === 'compute');
  for (const t of CONFIG.targets) {
    if (t.phases || t.rival || state.reputation < t.reqRep) continue;
    let best = 0;
    for (const n of comps) {
      const p = runtime.get(n.id)?.power ?? 0;
      if (p > best && stat(n, 'ram') >= t.ram) best = p;
    }
    if (best > 0) out.push({ t, power: best });
  }
  return out;
}

/** Eine Exploit-Familie über der des Ziels („selten“). */
function rareFamily(t: TargetConfig): string | undefined {
  const fams = CONFIG.exploits.families;
  const i = fams.findIndex((f) => f.id === t.family);
  return i < 0 ? undefined : fams[Math.min(fams.length - 1, i + 1)].id;
}

export function generateContract(state: GameState, runtime: RuntimeLike): Contract | null {
  const mods = getModifiers(state);
  const targets = hackableTargets(state, runtime);
  if (!targets.length) return null;
  const top = targets.slice(-3);
  const best = top[top.length - 1];
  const kinds: ContractKind[] = ['hackCount', 'hackCount', 'earnMoney', 'lowTrace'];
  if (state.nodes.some((n) => n.type === 'market')) kinds.push('sellData');
  if (state.nodes.some((n) => n.type === 'malware')) kinds.push('craft');
  if (state.reputation >= CONFIG.rivals.minRep && state.nodes.some((n) => n.type === 'firewall')) kinds.push('defend');
  const kind = pick(state, kinds);
  const id = state.contracts.nextId++;
  const base = { id, progress: 0, accepted: false, left: C().offerSeconds };
  const exploitBonus = (t: TargetConfig, count: number): ContractReward['exploits'] => {
    const f = rareFamily(t);
    return f ? { family: f, count } : undefined;
  };
  switch (kind) {
    case 'hackCount': {
      const { t, power } = pick(state, top);
      const each = Math.max(CONFIG.minHackTime, t.security / power);
      const h = C().hackCount;
      let goal = randInt(state, h.min, h.max);
      goal = Math.max(1, Math.min(goal, Math.floor((h.maxDuration - 120) / (each * h.timeSlack))));
      const duration = Math.min(h.maxDuration, Math.max(h.minDuration, goal * each * h.timeSlack + 120));
      const reward: ContractReward = { money: t.money * goal * C().moneyFactor * mods.money, rep: t.rep * goal * C().repFactor * mods.rep };
      if (rand(state) < 0.3) reward.exploits = exploitBonus(t, 1);
      return { ...base, kind, targetId: t.id, goal, duration, reward };
    }
    case 'sellData': {
      const goal = Math.max(10, best.t.data * C().sellData.hacksWorth);
      return { ...base, kind, goal, duration: C().sellData.duration, reward: { money: goal * CONFIG.data.pricePerMB * 3 * mods.money, rep: best.t.rep * 3 } };
    }
    case 'earnMoney': {
      const goal = best.t.money * C().earnMoney.hacksWorth * mods.money;
      const crypto = (goal * C().earnMoney.cryptoShare) / state.market.price;
      return { ...base, kind, goal, duration: C().earnMoney.duration, reward: { crypto, rep: best.t.rep * 4 } };
    }
    case 'lowTrace':
      return {
        ...base,
        kind,
        goal: C().lowTrace.seconds,
        duration: C().lowTrace.duration,
        reward: { rep: best.t.rep * 6, exploits: exploitBonus(best.t, 2), money: best.t.money * 2 * mods.money },
      };
    case 'craft':
      return { ...base, kind, goal: C().craft.count, duration: C().craft.duration, reward: { money: best.t.money * 8 * mods.money, exploits: exploitBonus(best.t, 2) } };
    case 'defend':
      return { ...base, kind, goal: 1, duration: C().defend.duration, reward: { rep: best.t.rep * 10, exploits: exploitBonus(best.t, 3) } };
  }
}

export function acceptContract(state: GameState, id: number): boolean {
  const c = state.contracts.offers.find((x) => x.id === id);
  if (!c || c.accepted) return false;
  c.accepted = true;
  c.left = c.duration;
  c.baseline = metric(state, c);
  c.raidsAtAccept = state.stats.raids;
  return true;
}

export function abandonContract(state: GameState, id: number): void {
  state.contracts.offers = state.contracts.offers.filter((c) => c.id !== id);
}

function payReward(state: GameState, r: ContractReward): void {
  if (r.money) {
    state.money += r.money;
    state.run.money += r.money;
    state.allTimeMoney += r.money;
  }
  if (r.crypto) state.crypto += r.crypto;
  if (r.rep) state.reputation += r.rep;
  if (r.exploits) addExploits(state, r.exploits.family, r.exploits.count);
}

/**
 * Auftrags-Board fortschreiben. Offline ist das Board eingefroren:
 * weder Timer noch Fortschritt laufen (die Basis wird mitgeschoben).
 */
export function contractsTick(state: GameState, runtime: RuntimeLike, dt: number, events: GameEvent[], offline: boolean): void {
  const cs = state.contracts;
  for (const c of [...cs.offers]) {
    if (!c.accepted) {
      if (!offline) c.left -= dt;
      if (c.left <= 0) abandonContract(state, c.id);
      continue;
    }
    if (offline) {
      c.baseline = metric(state, c) - (c.kind === 'lowTrace' ? 0 : c.progress);
      continue;
    }
    if (c.kind === 'lowTrace') c.progress = state.trace < C().lowTrace.below ? c.progress + dt : 0;
    else c.progress = Math.max(0, metric(state, c) - (c.baseline ?? 0));
    c.left -= dt;
    const raided = c.kind === 'sellData' && state.stats.raids > (c.raidsAtAccept ?? 0);
    if (c.progress >= c.goal) {
      payReward(state, c.reward);
      state.stats.contracts++;
      abandonContract(state, c.id);
      events.push({ kind: 'contract', id: c.id, success: true, text: `Auftrag erfüllt: ${rewardText(c.reward)}` });
    } else if (c.left <= 0 || raided) {
      abandonContract(state, c.id);
      events.push({ kind: 'contract', id: c.id, success: false, text: raided ? 'Auftrag gescheitert: Razzia!' : 'Auftrag gescheitert: Zeit abgelaufen.' });
    }
  }
  if (offline || state.reputation < C().minRep) return;
  if (cs.offers.length >= C().slots) return;
  cs.nextIn -= dt;
  if (cs.nextIn > 0) return;
  const c = generateContract(state, runtime);
  if (c) cs.offers.push(c);
  cs.nextIn = C().refillSeconds;
}
