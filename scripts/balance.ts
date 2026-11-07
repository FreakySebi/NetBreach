/**
 * Headless-Balancing-Bot: spielt NetBreach über mehrere Identitäten mit einer
 * gierigen Strategie und protokolliert Meilensteine.
 * Aufruf: npm run balance [-- stunden [seed]]
 */
import { CONFIG, type TargetConfig } from '../src/core/config';
import { canAfford } from '../src/core/economy';
import { fmt, fmtMoney, fmtTime } from '../src/core/format';
import { Game } from '../src/core/game';
import { canHack, estimateHackTime, hackTrace, isCompute, isStorage, marketPrice, powerDemand, targetUnlocked } from '../src/core/simulation';
import { getModifiers } from '../src/core/state';
import type { Cost, NodeInstance, NodeTypeId } from '../src/core/types';
import { nodeConfig, nodePrice, stat, upgradeCost, upgradeMaxed } from '../src/nodes/stats';

declare const process: { argv: string[] };
const hours = Number(process.argv[2] ?? 40);
const seed = Number(process.argv[3] ?? 1234);
const game = new Game();
game.state.rng = seed;
const s = () => game.state;
const now = () => s().stats.playTime;
const log = (msg: string) => console.log(`[${fmtTime(now()).padStart(8)}] ${msg}`);

// ---------- Protokoll ----------

const firstTarget = new Map<string, { time: number; run: number }>();
const firstHack = new Map<string, { time: number; run: number }>();
const seenResearch = new Set<string>();
const seenTypes = new Set<NodeTypeId>();
let runStart = 0;
let runIndex = 1;
let coreCrackedAt = null as { time: number; run: number } | null;

game.on((e) => {
  if (e.kind === 'hack' && !firstHack.has(e.targetId)) {
    firstHack.set(e.targetId, { time: now(), run: runIndex });
    const t = CONFIG.targets.find((x) => x.id === e.targetId)!;
    if (t.reqRep >= 1500 || t.phases || t.rival) log(`✓ Erster Hack: ${t.name}`);
  }
  if (e.kind === 'hack' && e.targetId === 'kern' && !coreCrackedAt) {
    coreCrackedAt = { time: now(), run: runIndex };
    log(`★★★ DER KERN GEKNACKT (Lauf ${runIndex}, Identitäten ${s().prestige.identities})`);
  }
  if (e.kind === 'phase') log(`  Kern-Phase ${e.phase + 1} erreicht`);
  if (e.kind === 'raid') raidsInRun++;
});
let raidsInRun = 0;

// ---------- Hilfen ----------

function nodes(type?: NodeTypeId): NodeInstance[] {
  return s().nodes.filter((n) => !type || n.type === type);
}
function conns(node: NodeInstance, port: string, dir: 'in' | 'out') {
  return s().connections.filter((c) => (dir === 'in' ? c.to === node.id && c.toPort === port : c.from === node.id && c.fromPort === port));
}
const rt = (n: NodeInstance) => game.runtime.get(n.id)!;
function costValue(c: Cost): number {
  return (c.money ?? 0) + (c.crypto ?? 0) * s().market.price + (c.models ?? 0) * 1e10;
}
function buy(type: NodeTypeId): NodeInstance | null {
  if (!game.isUnlocked(type) || !canAfford(s(), nodePrice(s(), type))) return null;
  const n = game.buyNode(type, Math.random() * 2000, Math.random() * 2000);
  if (n && !seenTypes.has(type)) {
    seenTypes.add(type);
    log(`Erster Kauf: ${nodeConfig(type).name}`);
  }
  return n;
}
/** Upgrade, wenn es weniger als `share` des Geldes kostet. */
function upg(n: NodeInstance, id: string, share = 0.5): boolean {
  const u = nodeConfig(n.type).upgrades.find((x) => x.id === id);
  if (!u || !game.canUpgrade(n, id)) return false;
  return costValue(upgradeCost(n, u)) < s().money * share && game.upgrade(n.id, id);
}
function ensureSupply(consumer: NodeInstance, port: string, supplierType: NodeTypeId, outPort: string, spare: (sup: NodeInstance) => boolean) {
  if (conns(consumer, port, 'in').length) return;
  let sup = nodes(supplierType).find(spare);
  if (!sup) sup = buy(supplierType) ?? undefined;
  if (sup) game.connect(sup.id, outPort, consumer.id, port);
}
const computers = () => nodes().filter(isCompute);

// ---------- Strategie ----------

function doResearch(): void {
  const st = s();
  for (const r of [...CONFIG.research].sort((a, b) => costValue(a.cost) - costValue(b.cost))) {
    if (game.researchState(r) === 'available' && canAfford(st, r.cost)) {
      game.research(r.id);
      if (!seenResearch.has(r.id)) log(`Forschung: ${r.name}`);
      seenResearch.add(r.id);
    }
  }
}

function infrastructure(): void {
  const cs = computers();
  if (game.isUnlocked('market') && !nodes('market').length) buy('market');
  for (const c of cs) {
    if (game.isUnlocked('hdd') && !conns(c, 'dataOut', 'out').length) {
      let store = nodes().find((n) => isStorage(n) && n.buffer < rt(n).bufferCap * 0.5);
      if (!store) store = (buy(game.isUnlocked('ssd') ? 'ssd' : 'hdd') ?? undefined) as NodeInstance | undefined;
      if (store) game.connect(c.id, 'dataOut', store.id, 'dataIn');
    }
    if (powerDemand(c) > 0) ensureSupply(c, 'powerIn', 'psu', 'powerOut', (p) => rt(p).demand + powerDemand(c) < stat(p, 'capacity') * 0.9);
    if (rt(c).flags.has('overheat') && game.isUnlocked('cooler')) ensureSupply(c, 'coolIn', 'cooler', 'coolOut', (p) => rt(p).demand < rt(p).rate * 0.7);
    if (game.isUnlocked('script')) ensureSupply(c, 'scriptIn', 'script', 'scriptOut', (p) => rt(p).load < stat(p, 'slots'));
    const needsNet = rt(c).flags.has('bufferFull') || c.targetId === 'kern';
    if (game.isUnlocked('router') && needsNet && conns(c, 'dataOut', 'out').length) {
      ensureSupply(c, 'netIn', game.isUnlocked('fiber') ? 'fiber' : 'router', 'netOut', (p) => rt(p).load < 4);
    }
    if (game.isUnlocked('gpu')) ensureSupply(c, 'accelIn', 'gpu', 'accelOut', (p) => conns(p, 'accelOut', 'out').length === 0);
    if (game.isUnlocked('vpn')) {
      ensureSupply(c, 'proxyIn', 'vpn', 'proxyOut', (p) => conns(p, 'proxyOut', 'out').length === 0);
      let head = c;
      for (let d = 0; d < 4; d++) {
        const inc = conns(head, 'proxyIn', 'in')[0];
        if (!inc) {
          if (game.isUnlocked('proxy')) {
            const px = buy('proxy');
            if (px) game.connect(px.id, 'proxyOut', head.id, 'proxyIn');
          }
          break;
        }
        head = game.node(inc.from)!;
      }
    }
  }
  for (const n of nodes()) {
    if (powerDemand(n) > 0 && !isCompute(n)) ensureSupply(n, 'powerIn', 'psu', 'powerOut', (p) => rt(p).demand + powerDemand(n) < stat(p, 'capacity') * 0.9);
    if (!isCompute(n) && rt(n).flags.has('overheat') && game.isUnlocked('cooler')) {
      ensureSupply(n, 'coolIn', 'cooler', 'coolOut', (p) => rt(p).demand < rt(p).rate * 0.7);
    }
    if (isStorage(n)) {
      const market = nodes('market')[0];
      if (market && !conns(n, 'dataOut', 'out').length) game.connect(n.id, 'dataOut', market.id, 'dataIn');
    }
  }
  // Botnetz: an den stärksten Rechner, ein Laptop farmt Smart-Homes
  if (game.isUnlocked('botnet') && nodes('botnet').length < 2) buy('botnet');
  const strongest = [...cs].sort((a, b) => rt(b).power - rt(a).power)[0];
  for (const bn of nodes('botnet')) {
    if (strongest && !conns(bn, 'botOut', 'out').length) game.connect(bn.id, 'botOut', strongest.id, 'botIn');
    upg(bn, 'cap', 0.2);
    upg(bn, 'ops', 0.2);
    upg(bn, 'spread', 0.2);
  }
}

function upgrades(): void {
  for (const n of nodes('psu')) {
    if (rt(n).demand > stat(n, 'capacity') * 0.8) upg(n, 'cap');
    if (s().research.includes('quantum')) upg(n, 'ups', 0.3);
  }
  for (const n of nodes('cooler')) if (rt(n).demand > rt(n).rate * 0.8) upg(n, 'cap');
  for (const n of nodes('market')) if (n.buffer > rt(n).bufferCap * 0.8) upg(n, 'rate');
  for (const n of nodes('market')) upg(n, 'price');
  for (const n of nodes().filter(isStorage)) if (n.buffer > rt(n).bufferCap * 0.8) { upg(n, 'tp'); upg(n, 'cap'); }
  for (const n of [...nodes('router'), ...nodes('fiber')]) upg(n, 'bw');
  for (const n of nodes('vpn')) upg(n, 'stealth');
  for (const n of nodes('proxy')) upg(n, 'stealth');
  for (const n of nodes('script')) upg(n, 'boost');
  for (const n of nodes('gpu')) upg(n, 'ops');
  if (game.isUnlocked('miner') && nodes('miner').length < 3) {
    const m = buy('miner');
    if (m && game.isUnlocked('gpu')) {
      const g = buy('gpu');
      if (g) game.connect(g.id, 'accelOut', m.id, 'accelIn');
    }
  }
  for (const n of nodes('miner')) upg(n, 'hash');
}

function growth(): void {
  const st = s();
  const options: { cost: Cost; run: () => void }[] = [];
  for (const c of computers()) {
    for (const u of nodeConfig(c.type).upgrades) {
      if (!upgradeMaxed(c, u)) options.push({ cost: upgradeCost(c, u), run: () => game.upgrade(c.id, u.id) });
    }
  }
  const caps: Partial<Record<NodeTypeId, number>> = { laptop: 2, pc: 12 };
  for (const t of ['laptop', 'pc', 'server', 'quantum'] as NodeTypeId[]) {
    if (game.isUnlocked(t) && nodes(t).length < (caps[t] ?? Infinity)) options.push({ cost: nodePrice(st, t), run: () => buy(t) });
  }
  options.sort((a, b) => costValue(a.cost) - costValue(b.cost));
  // Quanten-Rechner haben Vorrang (Raumstation und Kern brauchen ihren RAM)
  if (game.isUnlocked('quantum') && nodes('quantum').length < 3) buy('quantum');
  for (const o of options.slice(0, 3)) if (canAfford(st, o.cost)) o.run();
  // RAM-Engpass: freigeschaltetes Ziel, das kein Rechner hacken kann → RAM des besten Rechners ausbauen
  const needRam = Math.max(0, ...CONFIG.targets.filter((t) => targetUnlocked(st, t)).map((t) => t.ram));
  const cs = computers();
  if (cs.length && Math.max(...cs.map((c) => stat(c, 'ram'))) < needRam) {
    const cand = cs.filter((c) => nodeConfig(c.type).upgrades.some((u) => u.id === 'ram' && !upgradeMaxed(c, u))).sort((a, b) => stat(b, 'ram') - stat(a, 'ram'))[0];
    if (cand) game.upgrade(cand.id, 'ram');
  }
}

function chooseTargets(): void {
  const st = s();
  const mods = getModifiers(st);
  const market = nodes('market')[0];
  const price = market ? marketPrice(st, market, mods) : 0;
  const cs = computers();
  const strongest = [...cs].sort((a, b) => rt(b).power - rt(a).power)[0];
  const coreTarget = CONFIG.targets.find((t) => t.phases);
  // Ein Rechner bleibt beim Kern, bis er geknackt ist
  const coreNode = cs.find((c) => c.job?.targetId === 'kern') ?? [...cs].filter((c) => coreTarget && canHack(st, c, coreTarget)).sort((a, b) => rt(b).power - rt(a).power)[0];
  const traceRisky = st.trace > 70;
  for (const t of CONFIG.targets) {
    if (targetUnlocked(st, t) && !firstTarget.has(t.id)) {
      firstTarget.set(t.id, { time: now(), run: runIndex });
      if (t.reqRep >= 1500 || t.phases || t.rival) log(`Ziel freigeschaltet: ${t.name}`);
    }
  }
  for (const c of cs) {
    let best: TargetConfig | undefined;
    let bestVal = 0;
    // Kern: der stärkste Rechner versucht es, sobald er offen ist
    if (coreTarget && c === coreNode && canHack(st, c, coreTarget)) best = coreTarget;
    // Botnetz-Farm: der erste Laptop hackt Smart-Homes
    else if (c.type === 'laptop' && c === nodes('laptop')[0] && nodes('botnet').length && cs.length > 2 && st.trace < 50) best = CONFIG.targets.find((t) => t.id === 'smarthome');
    else {
      for (const t of CONFIG.targets) {
        if (t.phases || !canHack(st, c, t)) continue;
        const dur = estimateHackTime(st, c, rt(c), t, mods);
        // Hacks pro Sekunde: begrenzt durch Dauer und durch den Anteil am Trace-Abbau
        const decayShare = (CONFIG.trace.baseDecay + mods.traceDecay) / Math.max(1, cs.length);
        const perSec = Math.min(1 / dur, decayShare / Math.max(1e-6, hackTrace(st, rt(c), t)));
        const val = (t.money + t.data * price * 0.5 + (t.crypto ?? 0) * st.market.price * 0.3 + (t.models ?? 0) * 1e10 + (t.rival ? t.rep * 1000 : 0)) * perSec;
        if (val > bestVal) {
          bestVal = val;
          best = t;
        }
      }
    }
    if (best && best.id !== c.targetId && !(c.job && c.job.targetId === 'kern')) game.setTarget(c.id, best.id);
    if (!traceRisky) game.startHack(c.id);
  }
}

// Einkommen der letzten Minute (für Spar-Entscheidungen)
const incomeSamples: { t: number; v: number }[] = [];
function income(): number {
  incomeSamples.push({ t: now(), v: s().run.money });
  while (incomeSamples.length > 2 && now() - incomeSamples[0].t > 60) incomeSamples.shift();
  const a = incomeSamples[0];
  const b = incomeSamples[incomeSamples.length - 1];
  return b.t > a.t ? Math.max(0, (b.v - a.v) / (b.t - a.t)) : 0;
}

/** Spart auf Forschung, die mit ~15 Minuten Einkommen bezahlbar ist. */
function savingForResearch(): boolean {
  const inc = income();
  const st = s();
  return CONFIG.research.some((r) => {
    if (game.researchState(r) !== 'available') return false;
    if ((r.cost.models ?? 0) > st.models || (r.cost.crypto ?? 0) > st.crypto) return false;
    const m = r.cost.money ?? 0;
    return m >= 1e8 && m > st.money && m <= inc * 900;
  });
}

function playStep(): void {
  if (computers().length < 2) for (let i = 0; i < 4; i++) game.clickJob(nodes('job')[0].id);
  doResearch();
  if (!computers().length) {
    buy('laptop');
    return;
  }
  const saving = savingForResearch();
  infrastructure();
  if (!saving) {
    upgrades();
    growth();
  }
  chooseTargets();
}

// ---------- Prestige ----------

function maybePrestige(): void {
  const st = s();
  const pending = game.pendingTokens();
  const runTime = now() - runStart;
  if (pending < 1) return;
  const coreOpen = st.prestige.identities >= (CONFIG.targets.find((t) => t.phases)?.reqIdentities ?? 99);
  const doubling = pending >= Math.max(2, st.prestige.tokensTotal) && runTime >= 3600;
  const stalled = runTime >= (coreOpen && !coreCrackedAt ? 14 : 7) * 3600;
  if (coreOpen && !coreCrackedAt && !stalled) return;
  if (!doubling && !stalled) return;
  summary(`Lauf ${runIndex} beendet`);
  game.prestige();
  runIndex++;
  runStart = now();
  raidsInRun = 0;
  // Perks: günstigste zuerst, „Altes Wissen“ bevorzugt
  for (let guard = 0; guard < 50; guard++) {
    const affordable = CONFIG.perks
      .filter((p) => (s().prestige.perks[p.id] ?? 0) < p.max && game.perkCost(p) <= s().prestige.tokens)
      .sort((a, b) => (a.id === 'memory' ? -1 : b.id === 'memory' ? 1 : game.perkCost(a) - game.perkCost(b)));
    if (!affordable.length) break;
    game.buyPerk(affordable[0].id);
  }
  log(`══ Neue Identität #${s().prestige.identities} · Tokens gesamt ${s().prestige.tokensTotal} · Perks ${JSON.stringify(s().prestige.perks)}`);
}

function summary(title: string): void {
  const st = s();
  const comp = computers();
  log(
    `${title}: Dauer ${fmtTime(now() - runStart)} · verdient ${fmtMoney(st.run.money)} · Ruf ${fmt(st.reputation)} · ` +
      `${fmt(st.crypto, 1)} ₿ · ${fmt(st.models)} ◇ · ${comp.length} Rechner (max ${fmt(Math.max(0, ...comp.map((c) => rt(c).power)))} OPS) · ` +
      `Forschung ${st.research.length}/${CONFIG.research.length} · Razzien ${raidsInRun} · +${game.pendingTokens()} Tokens`,
  );
}

// ---------- Hauptschleife ----------

const total = hours * 3600;
let lastReport = 0;
const STEP = 5; // Bot entscheidet alle 5 s, Simulation in 0,5-s-Ticks
while (now() < total) {
  playStep();
  game.advance(STEP, 0.5);
  maybePrestige();
  if (process.argv[4] === 'flags' && Math.floor(now()) % 3600 < STEP) {
    const top = [...computers()].sort((a, b) => stat(b, 'cores') * stat(b, 'clock') - stat(a, 'cores') * stat(a, 'clock')).slice(0, 4);
    log('FLG ' + top.map((c) => `${c.type} base ${fmt(stat(c, 'cores') * stat(c, 'clock'))} pow ${fmt(rt(c).power)} pr ${rt(c).powerRatio.toFixed(2)} th ${rt(c).thermalRatio.toFixed(2)} [${[...rt(c).flags].join(',')}] tgt ${c.targetId}`).join(' | '));
  }
  if (process.argv[4] === 'debug' && Math.floor(now()) % 600 < STEP) {
    log(`DBG trace ${s().trace.toFixed(1)} money ${fmt(s().money)} ` + computers().map((c) => `${c.type}:${c.targetId}:${fmt(rt(c).power)}:${c.job ? 'J' : '-'}:${rt(c).scripted ? 'S' : 'm'}:${fmt(rt(c).stealth)}`).join(' '));
  }
  if (now() - lastReport >= 3600) {
    lastReport = now();
    summary(`Status Lauf ${runIndex}`);
  }
  if (coreCrackedAt && now() - coreCrackedAt.time > 600) break;
}
summary('Ende');
console.log('\n── Ziele: freigeschaltet / erster Hack ──');
for (const t of CONFIG.targets) {
  const u = firstTarget.get(t.id);
  const h = firstHack.get(t.id);
  const f = (x?: { time: number; run: number }) => (x ? `${fmtTime(x.time).padStart(8)} (L${x.run})` : '       —     ');
  console.log(`  ${t.name.padEnd(24)} ${f(u)}   ${f(h)}`);
}
console.log(`\nForschung jemals: ${seenResearch.size}/${CONFIG.research.length} · Identitäten: ${s().prestige.identities} · Razzien gesamt: ${s().stats.raids}`);
console.log(coreCrackedAt ? `Der Kern: geknackt nach ${fmtTime(coreCrackedAt.time)} in Lauf ${coreCrackedAt.run}` : 'Der Kern: NICHT geknackt');
