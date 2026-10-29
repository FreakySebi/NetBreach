import { CONFIG, type TargetConfig } from './config';
import { getModifiers, type Modifiers } from './state';
import type { Connection, GameEvent, GameState, NodeInstance, NodeRuntime } from './types';
import { NODE_DEFS } from '../nodes/definitions';
import { stat } from '../nodes/stats';

export type RuntimeMap = Map<number, NodeRuntime>;
export type FlowMap = Map<number, number>;

export function targetById(id: string | undefined): TargetConfig | undefined {
  return CONFIG.targets.find((t) => t.id === id);
}

export function isCompute(node: NodeInstance): boolean {
  return NODE_DEFS[node.type].category === 'compute';
}

export function isStorage(node: NodeInstance): boolean {
  return NODE_DEFS[node.type].category === 'storage';
}

function emptyRuntime(): NodeRuntime {
  return {
    power: 0,
    powerRatio: 1,
    thermalRatio: 1,
    temperature: 30,
    bandwidth: 0,
    stealth: 0,
    gpuBonus: 0,
    boost: 0,
    scripted: false,
    bufferCap: 0,
    flags: new Set(),
    rate: 0,
    demand: 0,
    load: 0,
  };
}

/** Strombedarf eines Nodes in Watt. */
export function powerDemand(node: NodeInstance): number {
  return stat(node, 'powerBase') + stat(node, 'powerPerCore') * stat(node, 'cores');
}

/** Wärmelast eines Nodes. */
export function heatLoad(node: NodeInstance): number {
  return stat(node, 'heatBase') + stat(node, 'heatPerCore') * stat(node, 'cores');
}

/** Effektive Rechenleistung eines Rechners für ein bestimmtes Ziel. */
export function hackPower(node: NodeInstance, rt: NodeRuntime, target: TargetConfig | undefined, mods: Modifiers): number {
  const base = stat(node, 'cores') * stat(node, 'clock');
  const gpu = rt.gpuBonus * (target?.gpuFactor ?? 0);
  return (base + gpu) * rt.powerRatio * rt.thermalRatio * mods.hackSpeed * (1 + rt.boost);
}

export function targetUnlocked(state: GameState, t: TargetConfig): boolean {
  return state.reputation >= t.reqRep;
}

export function canHack(state: GameState, node: NodeInstance, t: TargetConfig): boolean {
  return targetUnlocked(state, t) && stat(node, 'ram') >= t.ram;
}

/** Index der Verbindungen nach Ziel- bzw. Quell-Port. */
class ConnIndex {
  private into = new Map<string, Connection[]>();
  private outOf = new Map<string, Connection[]>();
  constructor(conns: Connection[]) {
    for (const c of conns) {
      push(this.into, c.to + ':' + c.toPort, c);
      push(this.outOf, c.from + ':' + c.fromPort, c);
    }
  }
  in(id: number, port: string): Connection[] {
    return this.into.get(id + ':' + port) ?? [];
  }
  out(id: number, port: string): Connection[] {
    return this.outOf.get(id + ':' + port) ?? [];
  }
}

function push<K, V>(m: Map<K, V[]>, k: K, v: V): void {
  const a = m.get(k);
  if (a) a.push(v);
  else m.set(k, [v]);
}

/**
 * Abgeleitete Laufzeitwerte aller Nodes berechnen:
 * Strom → Kühlung → GPU → Bandbreite → Proxy-Kette → Script → Rechenleistung.
 */
export function computeRuntime(state: GameState, runtime: RuntimeMap, flows?: FlowMap): void {
  const mods = getModifiers(state);
  const byId = new Map<number, NodeInstance>();
  for (const node of state.nodes) {
    byId.set(node.id, node);
    let rt = runtime.get(node.id);
    if (!rt) {
      rt = emptyRuntime();
      runtime.set(node.id, rt);
    }
    rt.flags.clear();
    rt.powerRatio = 1;
    rt.thermalRatio = 1;
    rt.gpuBonus = 0;
    rt.boost = 0;
    rt.stealth = 0;
    rt.scripted = false;
    rt.bandwidth = 0;
    rt.load = 0;
    rt.demand = powerDemand(node);
    rt.bufferCap = 0;
  }
  for (const id of runtime.keys()) if (!byId.has(id)) runtime.delete(id);
  const idx = new ConnIndex(state.connections);
  const rtOf = (n: NodeInstance) => runtime.get(n.id)!;
  const flow = (c: Connection, v: number) => flows?.set(c.id, (flows.get(c.id) ?? 0) + v);

  // --- Strom ---
  for (const node of state.nodes) {
    const rt = rtOf(node);
    if (rt.demand > 0 && idx.in(node.id, 'powerIn').length === 0) {
      rt.powerRatio = 0;
      rt.flags.add('noPower');
    }
  }
  for (const psu of state.nodes) {
    if (psu.type !== 'psu') continue;
    const prt = rtOf(psu);
    const conns = idx.out(psu.id, 'powerOut');
    let demand = 0;
    for (const c of conns) demand += rtOf(byId.get(c.to)!).demand;
    const cap = stat(psu, 'capacity');
    const ratio = demand > 0 ? Math.min(1, cap / demand) : 1;
    prt.demand = demand;
    prt.rate = cap;
    if (demand > cap) prt.flags.add('overload');
    for (const c of conns) {
      const crt = rtOf(byId.get(c.to)!);
      crt.powerRatio = ratio;
      if (ratio < 1) crt.flags.add('lowPower');
      flow(c, crt.demand * ratio);
    }
  }

  // --- Kühlung ---
  const heat = new Map<number, number>();
  for (const node of state.nodes) heat.set(node.id, heatLoad(node));
  const cooling = new Map<number, number>();
  for (const node of state.nodes) cooling.set(node.id, stat(node, 'coolBuiltIn'));
  for (const cooler of state.nodes) {
    if (cooler.type !== 'cooler') continue;
    const crt = rtOf(cooler);
    const cap = stat(cooler, 'capacity') * crt.powerRatio;
    const conns = idx.out(cooler.id, 'coolOut');
    let need = 0;
    for (const c of conns) need += Math.max(0, heat.get(c.to)! - cooling.get(c.to)!);
    crt.demand = need;
    crt.rate = cap;
    if (need > cap) crt.flags.add('overload');
    for (const c of conns) {
      const n = Math.max(0, heat.get(c.to)! - cooling.get(c.to)!);
      const share = need > 0 ? (cap * n) / need : 0;
      cooling.set(c.to, cooling.get(c.to)! + Math.min(n, share));
      flow(c, Math.min(n, share) + 0.5);
    }
  }
  for (const node of state.nodes) {
    const h = heat.get(node.id)!;
    if (h <= 0) continue;
    const rt = rtOf(node);
    const cool = cooling.get(node.id)!;
    rt.thermalRatio = h <= cool + 1e-9 ? 1 : Math.max(0.25, cool / h);
    rt.temperature = 30 + 50 * Math.min(1.8, h / Math.max(cool, 0.01));
    if (rt.thermalRatio < 1) rt.flags.add('overheat');
  }

  // --- GPU-Beschleunigung ---
  for (const gpu of state.nodes) {
    if (gpu.type !== 'gpu') continue;
    const grt = rtOf(gpu);
    grt.power = stat(gpu, 'ops') * grt.powerRatio * grt.thermalRatio;
    for (const c of idx.out(gpu.id, 'accelOut')) {
      rtOf(byId.get(c.to)!).gpuBonus += grt.power;
      flow(c, grt.power);
    }
  }

  // --- Bandbreite (Router / Glasfaser) ---
  for (const node of state.nodes) if (isCompute(node)) rtOf(node).bandwidth = stat(node, 'nic');
  for (const r of state.nodes) {
    if (r.type !== 'router' && r.type !== 'fiber') continue;
    const rrt = rtOf(r);
    const bw = stat(r, 'bandwidth') * rrt.powerRatio;
    const conns = idx.out(r.id, 'netOut');
    rrt.rate = bw;
    rrt.load = conns.length;
    for (const c of conns) {
      rtOf(byId.get(c.to)!).bandwidth += bw / conns.length;
      flow(c, bw / conns.length);
    }
  }

  // --- Proxy-Ketten: Stealth = 1 - Π(1 - s_i) ---
  const chainStealth = (start: NodeInstance): number => {
    let keep = 1;
    const seen = new Set<number>([start.id]);
    let cur: NodeInstance | undefined = start;
    for (let depth = 0; cur && depth < 16; depth++) {
      const c: Connection | undefined = idx.in(cur.id, 'proxyIn')[0];
      if (!c || seen.has(c.from)) break;
      const p = byId.get(c.from);
      if (!p) break;
      seen.add(p.id);
      keep *= 1 - stat(p, 'stealth');
      flow(c, 1);
      cur = p;
    }
    return 1 - keep;
  };
  for (const node of state.nodes) {
    if (isCompute(node)) rtOf(node).stealth = chainStealth(node);
    else if (node.type === 'vpn' || node.type === 'proxy') {
      rtOf(node).stealth = 1 - (1 - stat(node, 'stealth')) * (1 - chainStealth(node));
    }
  }

  // --- Scripts ---
  for (const sc of state.nodes) {
    if (sc.type !== 'script') continue;
    const conns = idx.out(sc.id, 'scriptOut');
    rtOf(sc).load = conns.length;
    for (const c of conns) {
      const t = rtOf(byId.get(c.to)!);
      t.scripted = true;
      t.boost = Math.max(t.boost, stat(sc, 'boost'));
      flow(c, 1);
    }
  }

  // --- Rechner, Speicher, Markt ---
  for (const node of state.nodes) {
    const rt = rtOf(node);
    if (isCompute(node)) {
      rt.bufferCap = stat(node, 'buffer');
      rt.power = hackPower(node, rt, targetById(node.job?.targetId ?? node.targetId), mods);
      if (state.raidTimer > 0) rt.flags.add('raided');
    } else if (isStorage(node)) {
      rt.bufferCap = stat(node, 'capacity');
      if (node.buffer >= rt.bufferCap * 0.999) rt.flags.add('storageFull');
    } else if (node.type === 'market') {
      rt.bufferCap = stat(node, 'sellRate') * 2;
    }
  }
}

function completeHack(state: GameState, node: NodeInstance, rt: NodeRuntime, t: TargetConfig, mods: Modifiers, events: GameEvent[]): void {
  const money = t.money * mods.money;
  const rep = t.rep * mods.rep;
  const crypto = (t.crypto ?? 0) * mods.crypto;
  state.money += money;
  state.reputation += rep;
  state.crypto += crypto;
  state.run.money += money;
  state.run.crypto += crypto;
  state.allTimeMoney += money;
  state.run.hacks++;
  const free = Math.max(0, rt.bufferCap - node.buffer);
  node.buffer += Math.min(free, t.data);
  addTrace(state, t.trace * mods.traceGain * (1 - rt.stealth), events);
  events.push({ kind: 'hack', nodeId: node.id, targetId: t.id, money, data: t.data, crypto, rep });
}

function addTrace(state: GameState, amount: number, events: GameEvent[]): void {
  const before = state.trace;
  state.trace = Math.min(100, state.trace + amount);
  if (before < CONFIG.trace.warnAt && state.trace >= CONFIG.trace.warnAt) events.push({ kind: 'traceWarning' });
}

/** Startet einen Hack, falls möglich. */
export function startHack(state: GameState, node: NodeInstance): boolean {
  if (node.job || state.raidTimer > 0) return false;
  const t = targetById(node.targetId);
  if (!t || !canHack(state, node, t)) return false;
  node.job = { targetId: t.id, progress: 0, required: t.security };
  return true;
}

/** Razzia: Teil der Ressourcen geht verloren, alle Systeme sind kurz offline. */
export function raid(state: GameState, events: GameEvent[]): void {
  const r = CONFIG.trace;
  const lostMoney = state.money * r.raidMoneyLoss;
  const lostCrypto = state.crypto * r.raidCryptoLoss;
  let lostData = 0;
  state.money -= lostMoney;
  state.crypto -= lostCrypto;
  for (const n of state.nodes) {
    const l = n.buffer * r.raidDataLoss;
    n.buffer -= l;
    lostData += l;
    n.job = null;
  }
  state.trace = r.afterRaid;
  state.raidTimer = r.raidOfflineSeconds;
  state.run.raids++;
  events.push({ kind: 'raid', lostMoney, lostData, lostCrypto });
}

/** Wie viel ein Node an Daten aufnehmen kann. */
function freeSpace(node: NodeInstance, rt: NodeRuntime): number {
  if (isStorage(node) || node.type === 'market') return Math.max(0, rt.bufferCap - node.buffer);
  return 0;
}

/** Schiebt Daten gleichmäßig an alle angeschlossenen Empfänger. */
function pushData(
  node: NodeInstance,
  rate: number,
  dt: number,
  conns: Connection[],
  byId: Map<number, NodeInstance>,
  runtime: RuntimeMap,
  flows: FlowMap,
): number {
  let budget = Math.min(node.buffer, rate * dt);
  if (budget <= 0 || conns.length === 0) return 0;
  const recv = conns
    .map((c) => {
      const n = byId.get(c.to)!;
      return { c, n, free: freeSpace(n, runtime.get(n.id)!) };
    })
    .filter((r) => r.free > 1e-9);
  let moved = 0;
  let active = recv;
  for (let guard = 0; budget > 1e-9 && active.length && guard < 8; guard++) {
    const share = budget / active.length;
    for (const r of active) {
      const amt = Math.min(share, r.free);
      r.free -= amt;
      r.n.buffer += amt;
      budget -= amt;
      moved += amt;
      flows.set(r.c.id, (flows.get(r.c.id) ?? 0) + amt / dt);
    }
    active = active.filter((r) => r.free > 1e-9);
  }
  node.buffer -= moved;
  return moved;
}

export function marketPrice(state: GameState, market: NodeInstance, mods: Modifiers): number {
  const repBonus = 1 + Math.log10(1 + state.reputation) * CONFIG.data.repBonusPerLog10;
  return CONFIG.data.pricePerMB * stat(market, 'price') * repBonus * mods.dataValue * mods.money;
}

/** Ein Simulationsschritt. */
export interface TickOptions {
  /** Scripts starten ab diesem Trace keine neuen Hacks. */
  scriptTraceLimit?: number;
}

export function tick(
  state: GameState,
  runtime: RuntimeMap,
  dt: number,
  events: GameEvent[],
  flows: FlowMap = new Map(),
  opts: TickOptions = {},
): void {
  const traceLimit = opts.scriptTraceLimit ?? Infinity;
  const mods = getModifiers(state);
  state.run.playTime += dt;
  flows.clear();
  if (state.raidTimer > 0) {
    state.raidTimer = Math.max(0, state.raidTimer - dt);
    if (state.raidTimer === 0) events.push({ kind: 'info', text: 'Systeme wieder online.', tone: 'ok' });
  }
  computeRuntime(state, runtime, flows);
  const byId = new Map(state.nodes.map((n) => [n.id, n] as const));
  const idx = new ConnIndex(state.connections);

  // --- Hacks ---
  for (const node of state.nodes) {
    if (!isCompute(node)) continue;
    const rt = runtime.get(node.id)!;
    if (state.raidTimer > 0) continue;
    if (!node.job && rt.scripted && state.trace < traceLimit) {
      const t = targetById(node.targetId);
      if (t && !canHack(state, node, t)) rt.flags.add('ramLow');
      else startHack(state, node);
    }
    if (!node.job) {
      rt.flags.add('idle');
      continue;
    }
    const t = targetById(node.job.targetId);
    if (!t) {
      node.job = null;
      continue;
    }
    // Mehrere Abschlüsse pro Tick möglich (wichtig für große Offline-Schritte)
    let budget = Math.min(rt.power, t.security / CONFIG.minHackTime) * dt;
    for (let guard = 0; node.job && budget > 0 && guard < 1000; guard++) {
      const need = node.job.required - node.job.progress;
      if (budget < need) {
        node.job.progress += budget;
        break;
      }
      budget -= need;
      const done = targetById(node.job.targetId)!;
      node.job = null;
      completeHack(state, node, rt, done, mods, events);
      if (rt.scripted && state.raidTimer <= 0 && state.trace < traceLimit) startHack(state, node);
    }
  }

  // --- Datenfluss: Rechner → Speicher → Markt ---
  for (const node of state.nodes) {
    const rt = runtime.get(node.id)!;
    if (isCompute(node)) {
      rt.rate = pushData(node, rt.bandwidth, dt, idx.out(node.id, 'dataOut'), byId, runtime, flows) / dt;
      if (node.buffer >= rt.bufferCap - 1e-6) rt.flags.add('bufferFull');
    }
  }
  for (const node of state.nodes) {
    if (!isStorage(node)) continue;
    const rt = runtime.get(node.id)!;
    const rate = stat(node, 'throughput') * rt.powerRatio * rt.thermalRatio;
    rt.rate = pushData(node, rate, dt, idx.out(node.id, 'dataOut'), byId, runtime, flows) / dt;
    if (node.buffer >= rt.bufferCap * 0.999) rt.flags.add('storageFull');
  }
  for (const node of state.nodes) {
    if (node.type !== 'market') continue;
    const rt = runtime.get(node.id)!;
    const sold = Math.min(node.buffer, stat(node, 'sellRate') * dt);
    node.buffer -= sold;
    const income = sold * marketPrice(state, node, mods);
    state.money += income;
    state.run.money += income;
    state.allTimeMoney += income;
    state.run.data += sold;
    rt.rate = income / dt;
    if (node.buffer >= rt.bufferCap * 0.999) rt.flags.add('overload');
  }

  // --- Krypto-Miner ---
  for (const node of state.nodes) {
    if (node.type !== 'miner') continue;
    const rt = runtime.get(node.id)!;
    const hash = stat(node, 'hashrate') + rt.gpuBonus * CONFIG.mining.gpuToHash;
    const perSec = hash * CONFIG.mining.cryptoPerHash * rt.powerRatio * rt.thermalRatio * mods.crypto;
    state.crypto += perSec * dt;
    state.run.crypto += perSec * dt;
    rt.rate = perSec;
  }

  // --- Trace: erst prüfen (Hacks können 100 % erreicht haben), dann abbauen ---
  if (state.trace >= 100 && state.raidTimer <= 0) raid(state, events);
  else state.trace = Math.max(0, state.trace - (CONFIG.trace.baseDecay + mods.traceDecay) * dt);
}
