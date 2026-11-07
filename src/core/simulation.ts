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
    botOps: 0,
    boost: 0,
    scripted: false,
    waiting: 0,
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

/** Effektive Rechenleistung eines Rechners für ein bestimmtes Ziel (bzw. die aktuelle Phase). */
export function hackPower(node: NodeInstance, rt: NodeRuntime, target: TargetConfig | undefined, mods: Modifiers, phase = 0): number {
  const health = rt.powerRatio * rt.thermalRatio * (node.locked ? 0 : 1);
  const p = target?.phases?.[phase];
  if (p?.resource === 'gpu') return rt.gpuBonus * health * mods.hackSpeed * (1 + rt.boost);
  if (p?.resource === 'bandwidth') return rt.bandwidth * health;
  const base = stat(node, 'cores') * stat(node, 'clock') + rt.botOps;
  const gpu = p ? 0 : rt.gpuBonus * (target?.gpuFactor ?? 0);
  return (base + gpu) * health * mods.hackSpeed * (1 + rt.boost);
}

/** Security eines Ziels inklusive Zero-Day-Ereignissen und Rivalen-Stufe. */
export function effectiveSecurity(state: GameState, t: TargetConfig): number {
  let sec = t.security;
  if (t.rival) sec *= Math.pow(CONFIG.rivals.rivalSecurityGrowth, state.rival.level);
  for (const e of state.worldEvents.active) {
    const cfg = CONFIG.worldEvents.types.find((x) => x.id === e.id);
    if (cfg?.securityMult && e.family === t.family) sec *= cfg.securityMult;
  }
  return sec;
}

/** Geschätzte Dauer eines Hacks in Sekunden (bei Phasen: Summe aller Phasen). */
export function estimateHackTime(state: GameState, node: NodeInstance, rt: NodeRuntime, t: TargetConfig, mods: Modifiers): number {
  const parts = t.phases ? t.phases.map((p, i) => [p.amount, i] as const) : [[effectiveSecurity(state, t), 0] as const];
  let total = 0;
  for (const [amount, i] of parts) {
    const p = hackPower(node, rt, t, mods, i);
    if (p <= 0) return Infinity;
    total += Math.max(CONFIG.minHackTime, amount / p);
  }
  return total;
}

/** Gesamtarbeit eines Ziels (bei Phasen: Summe, nur für Anzeigen). */
export function targetWork(state: GameState, t: TargetConfig): number {
  return t.phases ? t.phases.reduce((a, p) => a + p.amount, 0) : effectiveSecurity(state, t);
}

export function targetUnlocked(state: GameState, t: TargetConfig): boolean {
  if (state.reputation < t.reqRep) return false;
  if (t.reqIdentities && state.prestige.identities < t.reqIdentities) return false;
  if (t.reqResearch && !state.research.includes(t.reqResearch)) return false;
  if (t.rival && !state.rival.located) return false;
  return true;
}

/** Warum ein Ziel (noch) gesperrt ist – für die Anzeige. */
export function lockReason(state: GameState, t: TargetConfig): string | null {
  if (t.rival && !state.rival.located) return 'Erst mit Honeypots orten';
  if (state.reputation < t.reqRep) return `Benötigt ${Math.ceil(t.reqRep).toLocaleString('de-DE')} Reputation`;
  if (t.reqIdentities && state.prestige.identities < t.reqIdentities) return `Erst nach ${t.reqIdentities} Identitätswechseln`;
  if (t.reqResearch && !state.research.includes(t.reqResearch)) {
    const r = CONFIG.research.find((x) => x.id === t.reqResearch);
    return `Forschung „${r?.name ?? t.reqResearch}“ nötig`;
  }
  return null;
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
    rt.botOps = 0;
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
    const down = state.blackout > 0 && stat(psu, 'ups') < 1;
    const cap = down ? 0 : stat(psu, 'capacity');
    const ratio = demand > 0 ? Math.min(1, cap / demand) : 1;
    prt.demand = demand;
    prt.rate = cap;
    if (down) prt.flags.add('blackout');
    else if (demand > cap) prt.flags.add('overload');
    for (const c of conns) {
      const crt = rtOf(byId.get(c.to)!);
      crt.powerRatio = ratio;
      if (down) crt.flags.add('blackout');
      else if (ratio < 1) crt.flags.add('lowPower');
      flow(c, crt.demand * ratio);
    }
  }
  for (const node of state.nodes) {
    if (!node.locked) continue;
    const rt = rtOf(node);
    rt.powerRatio = 0;
    rt.flags.add('locked');
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

  // --- Botnetze: Geräte × OPS pro Gerät, geteilt auf angeschlossene Rechner ---
  for (const bn of state.nodes) {
    if (bn.type !== 'botnet') continue;
    const brt = rtOf(bn);
    brt.power = (bn.devices ?? 0) * stat(bn, 'opsPerDevice') * (bn.locked ? 0 : 1);
    brt.bufferCap = stat(bn, 'capacity');
    const conns = idx.out(bn.id, 'botOut');
    brt.load = conns.length;
    for (const c of conns) {
      rtOf(byId.get(c.to)!).botOps += brt.power / conns.length;
      flow(c, brt.power / conns.length);
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

  // --- Rechner, Speicher, Markt, Sicherheit, Labor ---
  for (const node of state.nodes) {
    const rt = rtOf(node);
    const health = rt.powerRatio * rt.thermalRatio;
    if (isCompute(node)) {
      rt.bufferCap = stat(node, 'buffer');
      rt.power = hackPower(node, rt, targetById(node.job?.targetId ?? node.targetId), mods, node.job?.phase ?? 0);
      if (state.raidTimer > 0) rt.flags.add('raided');
    } else if (isStorage(node)) {
      rt.bufferCap = stat(node, 'capacity');
      if (node.buffer >= rt.bufferCap * 0.999) rt.flags.add('storageFull');
    } else if (node.type === 'market') {
      rt.bufferCap = stat(node, 'sellRate') * 2;
    } else if (node.type === 'firewall') {
      rt.power = stat(node, 'defense') * health * mods.defense;
    } else if (node.type === 'honeypot') {
      rt.bufferCap = stat(node, 'capacity');
      const baited = node.buffer > 1e-6;
      if (!baited) rt.flags.add('noBait');
      rt.power = baited ? stat(node, 'lure') * health : 0;
    } else if (node.type === 'malware') {
      rt.bufferCap = stat(node, 'capacity');
      rt.power = (stat(node, 'ops') + rt.gpuBonus * CONFIG.exploits.gpuFactor) * health * mods.craft;
    }
  }
}

/** Gesamte Abwehrstärke gegen Rivalen-Angriffe. */
export function defenseRating(state: GameState, runtime: RuntimeMap): number {
  let d = 0;
  for (const n of state.nodes) {
    const rt = runtime.get(n.id);
    if (!rt) continue;
    if (n.type === 'firewall') d += rt.power;
    if (n.type === 'honeypot') d += rt.power * CONFIG.rivals.honeypotDefense;
  }
  return d;
}

/** Geld gutschreiben (zählt für Prestige und Statistik). */
export function earn(state: GameState, money: number): void {
  state.money += money;
  state.run.money += money;
  state.allTimeMoney += money;
}

function completeHack(state: GameState, node: NodeInstance, rt: NodeRuntime, t: TargetConfig, mods: Modifiers, events: GameEvent[]): void {
  const scale = t.rival ? Math.pow(CONFIG.rivals.rivalSecurityGrowth, state.rival.level) : 1;
  const money = t.money * mods.money * scale;
  const rep = t.rep * mods.rep * scale;
  const crypto = (t.crypto ?? 0) * mods.crypto * scale;
  const models = (t.models ?? 0) * mods.models;
  earn(state, money);
  state.reputation += rep;
  state.crypto += crypto;
  state.models += models;
  state.run.crypto += crypto;
  state.run.hacks++;
  state.stats.hacks++;
  state.stats.targets[t.id] = (state.stats.targets[t.id] ?? 0) + 1;
  const free = Math.max(0, rt.bufferCap - node.buffer);
  node.buffer += Math.min(free, t.data);
  if (t.botnet) {
    for (const bn of state.nodes) {
      if (bn.type !== 'botnet') continue;
      bn.devices = Math.min(stat(bn, 'capacity'), (bn.devices ?? 0) + t.botnet * stat(bn, 'spread') * mods.botnet);
    }
  }
  if (t.effect === 'blackout') {
    state.blackout = CONFIG.blackout.seconds;
    events.push({ kind: 'info', text: `Stromausfall! Netzteile ohne USV sind ${CONFIG.blackout.seconds} s aus.`, tone: 'warn' });
  }
  if (t.rival) {
    state.rival.located = false;
    state.rival.track = 0;
    state.rival.level++;
    state.stats.rivalsBeaten++;
    events.push({ kind: 'info', text: 'Rivalen-Netz zerschlagen! Die nächste Gruppe wird stärker sein.', tone: 'ok' });
  }
  if (t.phases) state.stats.coreCracks++;
  events.push({ kind: 'hack', nodeId: node.id, targetId: t.id, money, data: t.data, crypto, rep, models });
}

export function addTrace(state: GameState, amount: number, events: GameEvent[]): void {
  const before = state.trace;
  state.trace = Math.min(100, state.trace + amount);
  if (before < CONFIG.trace.warnAt && state.trace >= CONFIG.trace.warnAt) events.push({ kind: 'traceWarning' });
}

/** Trace, den ein Hack dieses Rechners auf dieses Ziel verursacht. */
export function hackTrace(state: GameState, rt: NodeRuntime | undefined, t: TargetConfig): number {
  return t.trace * getModifiers(state).traceGain * (1 - (rt?.stealth ?? 0));
}

/**
 * Startet einen Hack, falls möglich. Der Einbruch hinterlässt sofort Spuren:
 * Der Trace steigt beim Start. Mit `traceLimit` (Scripts) wird ab dieser Grenze
 * nicht gestartet, und auch nicht, wenn der Hack selbst eine Razzia auslösen würde.
 */
export function startHack(
  state: GameState,
  node: NodeInstance,
  rt?: NodeRuntime,
  events: GameEvent[] = [],
  traceLimit = Infinity,
): boolean {
  if (node.job || state.raidTimer > 0 || node.locked) return false;
  const t = targetById(node.targetId);
  if (!t || !canHack(state, node, t)) return false;
  const trace = hackTrace(state, rt, t);
  // Scripts: nur unter der Pausengrenze starten – und nie selbst eine Razzia auslösen
  if (traceLimit < Infinity && (state.trace >= traceLimit || state.trace + trace >= 100)) return false;
  const required = t.phases ? t.phases[0].amount : effectiveSecurity(state, t);
  node.job = { targetId: t.id, progress: 0, required, phase: 0 };
  addTrace(state, trace, events);
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
  state.stats.raids++;
  events.push({ kind: 'raid', lostMoney, lostData, lostCrypto });
}

/** Wie viel ein Node an Daten aufnehmen kann. */
function freeSpace(node: NodeInstance, rt: NodeRuntime): number {
  if (isStorage(node) || node.type === 'market' || node.type === 'honeypot' || node.type === 'malware') {
    return Math.max(0, rt.bufferCap - node.buffer);
  }
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
  const traceLimit = Math.min(opts.scriptTraceLimit ?? Infinity, CONFIG.trace.scriptPauseAt);
  const mods = getModifiers(state);
  state.run.playTime += dt;
  flows.clear();
  state.stats.playTime += dt;
  if (state.raidTimer > 0) {
    state.raidTimer = Math.max(0, state.raidTimer - dt);
    if (state.raidTimer === 0) events.push({ kind: 'info', text: 'Systeme wieder online.', tone: 'ok' });
  }
  if (state.blackout > 0) state.blackout = Math.max(0, state.blackout - dt);
  for (const n of state.nodes) if (n.locked) n.locked = n.locked > dt ? n.locked - dt : undefined;
  computeRuntime(state, runtime, flows);
  const byId = new Map(state.nodes.map((n) => [n.id, n] as const));
  const idx = new ConnIndex(state.connections);

  // --- Hacks ---
  const online = state.raidTimer <= 0;
  const comps = state.nodes.filter(isCompute);
  // Script-Rechner, die auf einen Start warten (faire Reihenfolge: längste Wartezeit zuerst)
  const contested = comps.some((n) => !n.job && !n.locked && runtime.get(n.id)!.scripted);
  for (const node of comps) {
    const rt = runtime.get(node.id)!;
    if (!online || node.locked || !node.job) continue;
    const t = targetById(node.job.targetId);
    if (!t) {
      node.job = null;
      continue;
    }
    // Mehrere Abschlüsse pro Tick möglich (wichtig für große Offline-Schritte)
    let budget = Math.min(rt.power, node.job.required / CONFIG.minHackTime) * dt;
    for (let guard = 0; node.job && budget > 0 && guard < 1000; guard++) {
      const need = node.job.required - node.job.progress;
      if (budget < need) {
        node.job.progress += budget;
        break;
      }
      budget -= need;
      const done = targetById(node.job.targetId)!;
      const phase = node.job.phase ?? 0;
      if (done.phases && phase + 1 < done.phases.length) {
        // Nächste Phase braucht eine andere Ressource → Rest-Budget verfällt
        node.job = { ...node.job, phase: phase + 1, progress: 0, required: done.phases[phase + 1].amount };
        events.push({ kind: 'phase', nodeId: node.id, targetId: done.id, phase: phase + 1 });
        break;
      }
      node.job = null;
      rt.waiting = 0;
      completeHack(state, node, rt, done, mods, events);
      // Direkt weiter nur, wenn kein anderer Script-Rechner wartet
      if (rt.scripted && !contested) startHack(state, node, rt, events, traceLimit);
    }
  }
  const idle = comps
    .filter((n) => !n.job && !n.locked && runtime.get(n.id)!.scripted)
    .sort((a, b) => runtime.get(b.id)!.waiting - runtime.get(a.id)!.waiting);
  for (const node of idle) {
    const rt = runtime.get(node.id)!;
    const t = targetById(node.targetId);
    if (t && !canHack(state, node, t)) rt.flags.add('ramLow');
    if (online && startHack(state, node, rt, events, traceLimit)) rt.waiting = 0;
    else rt.waiting += dt;
  }
  for (const node of comps) if (!node.job) runtime.get(node.id)!.flags.add('idle');

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
    earn(state, income);
    state.run.data += sold;
    state.stats.dataSold += sold;
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

  // --- Honeypots verbrauchen Köder-Daten ---
  for (const node of state.nodes) {
    if (node.type === 'honeypot') node.buffer = Math.max(0, node.buffer - stat(node, 'baitRate') * dt);
  }

  // --- Botnetze verlieren laufend Geräte ---
  for (const node of state.nodes) {
    if (node.type !== 'botnet') continue;
    const d = (node.devices ?? 0) * Math.exp(-stat(node, 'decay') * dt);
    node.devices = d < 0.5 ? 0 : d;
    if (node.devices > state.stats.maxDevices) state.stats.maxDevices = node.devices;
  }

  // --- Trace: erst prüfen (Hacks können 100 % erreicht haben), dann abbauen ---
  if (state.trace >= 100 && state.raidTimer <= 0) raid(state, events);
  else state.trace = Math.max(0, state.trace - (CONFIG.trace.baseDecay + mods.traceDecay) * dt);
}
