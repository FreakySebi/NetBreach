/**
 * Headless-Balancing-Bot: spielt NetBreach mit einer gierigen Strategie und
 * protokolliert Meilensteine. Aufruf: npm run balance [-- stunden]
 */
import { CONFIG } from '../src/core/config';
import { canAfford } from '../src/core/economy';
import { fmt, fmtMoney, fmtTime } from '../src/core/format';
import { Game } from '../src/core/game';
import { canHack, isCompute, isStorage, marketPrice, powerDemand } from '../src/core/simulation';
import { getModifiers } from '../src/core/state';
import type { Cost, NodeInstance, NodeTypeId } from '../src/core/types';
import { nodeConfig, nodePrice, stat, upgradeCost, upgradeMaxed } from '../src/nodes/stats';

const hours = Number(process.argv[2] ?? 4);
const game = new Game();
const s = () => game.state;
const log = (msg: string) => console.log(`[${fmtTime(s().run.playTime).padStart(8)}] ${msg}`);

const seenResearch = new Set<string>();
const seenTargets = new Set<string>();
const seenTypes = new Set<NodeTypeId>();
let prestigeLogged = false;

function nodes(type?: NodeTypeId): NodeInstance[] {
  return s().nodes.filter((n) => !type || n.type === type);
}
function conns(node: NodeInstance, port: string, dir: 'in' | 'out') {
  return s().connections.filter((c) => (dir === 'in' ? c.to === node.id && c.toPort === port : c.from === node.id && c.fromPort === port));
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
function costValue(c: Cost): number {
  return (c.money ?? 0) + (c.crypto ?? 0) * 50000;
}
const rt = (n: NodeInstance) => game.runtime.get(n.id)!;

function ensureSupply(consumer: NodeInstance, port: string, supplierType: NodeTypeId, outPort: string, spare: (sup: NodeInstance) => boolean) {
  if (conns(consumer, port, 'in').length) return;
  let sup = nodes(supplierType).find(spare);
  if (!sup) sup = buy(supplierType) ?? undefined;
  if (sup) game.connect(sup.id, outPort, consumer.id, port);
}

function botStep(): void {
  const st = s();
  const mods = getModifiers(st);
  // 1. Klicken solange das Einkommen klein ist
  const computers = nodes().filter(isCompute);
  if (computers.length < 2) for (let i = 0; i < 4; i++) game.clickJob(nodes('job')[0].id);
  for (const r of [...CONFIG.research].sort((a, b) => costValue(a.cost) - costValue(b.cost))) {
    if (game.researchState(r) === 'available' && canAfford(st, r.cost) && costValue(r.cost) < st.money * 0.8 + (st.crypto * 50000) ) {
      game.research(r.id);
      log(`Forschung: ${r.name}`);
      seenResearch.add(r.id);
    }
  }
  if (!computers.length) {
    buy('laptop');
    return;
  }

  // 2. Infrastruktur
  for (const c of computers) {
    if (game.isUnlocked('market') && !nodes('market').length) buy('market');
    if (game.isUnlocked('hdd') && !conns(c, 'dataOut', 'out').length) {
      let store = nodes().find((n) => isStorage(n) && n.buffer < rt(n).bufferCap * 0.5);
      if (!store) store = (buy(game.isUnlocked('ssd') ? 'ssd' : 'hdd') ?? undefined) as NodeInstance | undefined;
      if (store) game.connect(c.id, 'dataOut', store.id, 'dataIn');
    }
    if (powerDemand(c) > 0) ensureSupply(c, 'powerIn', 'psu', 'powerOut', (p) => rt(p).demand < stat(p, 'capacity') * 0.7);
    if (rt(c).flags.has('overheat') && game.isUnlocked('cooler')) ensureSupply(c, 'coolIn', 'cooler', 'coolOut', (p) => rt(p).demand < rt(p).rate * 0.7);
    if (game.isUnlocked('script')) ensureSupply(c, 'scriptIn', 'script', 'scriptOut', (p) => rt(p).load < stat(p, 'slots'));
    if (game.isUnlocked('router') && rt(c).flags.has('bufferFull') && conns(c, 'dataOut', 'out').length) {
      ensureSupply(c, 'netIn', game.isUnlocked('fiber') ? 'fiber' : 'router', 'netOut', (p) => rt(p).load < 4);
    }
    if (game.isUnlocked('gpu')) ensureSupply(c, 'accelIn', 'gpu', 'accelOut', (p) => conns(p, 'accelOut', 'out').length === 0);
    if (game.isUnlocked('vpn')) {
      ensureSupply(c, 'proxyIn', 'vpn', 'proxyOut', (p) => conns(p, 'proxyOut', 'out').length === 0);
      // Kette verlängern
      let head = c;
      for (let d = 0; d < 4; d++) {
        const inc = conns(head, 'proxyIn', 'in')[0];
        if (!inc) {
          if (game.isUnlocked('proxy') && d < 4) {
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
    if (rt(n).demand > 0 && powerDemand(n) > 0 && !isCompute(n)) ensureSupply(n, 'powerIn', 'psu', 'powerOut', (p) => rt(p).demand < stat(p, 'capacity') * 0.7);
    if ((n.type === 'gpu' || n.type === 'miner' || n.type === 'datacenter') && rt(n).flags.has('overheat') && game.isUnlocked('cooler')) {
      ensureSupply(n, 'coolIn', 'cooler', 'coolOut', (p) => rt(p).demand < rt(p).rate * 0.7);
    }
    if (isStorage(n)) {
      const market = nodes('market')[0];
      if (market && !conns(n, 'dataOut', 'out').length) game.connect(n.id, 'dataOut', market.id, 'dataIn');
    }
  }
  // Engpässe per Upgrade lösen
  const upg = (n: NodeInstance, id: string) => game.canUpgrade(n, id) && costValue(upgradeCost(n, nodeConfig(n.type).upgrades.find((u) => u.id === id)!)) < st.money * 0.5 && game.upgrade(n.id, id);
  for (const n of nodes('psu')) if (rt(n).demand > stat(n, 'capacity') * 0.8) upg(n, 'cap');
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

  // 3. Wachstum: günstigste Option bei Rechnern
  const options: { cost: Cost; run: () => void }[] = [];
  for (const c of computers) {
    for (const u of nodeConfig(c.type).upgrades) {
      if (!upgradeMaxed(c, u)) options.push({ cost: upgradeCost(c, u), run: () => game.upgrade(c.id, u.id) });
    }
  }
  for (const t of ['laptop', 'pc', 'server'] as NodeTypeId[]) {
    if (game.isUnlocked(t) && (t !== 'laptop' || nodes('laptop').length < 2)) options.push({ cost: nodePrice(st, t), run: () => buy(t) });
  }
  options.sort((a, b) => costValue(a.cost) - costValue(b.cost));
  for (const o of options.slice(0, 3)) if (canAfford(st, o.cost)) o.run();

  // 4. Ziele & Hacks
  const price = nodes('market')[0] ? marketPrice(st, nodes('market')[0], mods) : 0;
  const traceRisky = st.trace > 70;
  for (const c of nodes().filter(isCompute)) {
    let best: string | undefined;
    let bestVal = 0;
    for (const t of CONFIG.targets) {
      if (!canHack(st, c, t)) continue;
      const dur = Math.max(CONFIG.minHackTime, t.security / Math.max(0.001, rt(c).power || stat(c, 'cores')));
      const val = (t.money + t.data * price * 0.5) / dur;
      if (val > bestVal) {
        bestVal = val;
        best = t.id;
      }
      if (!seenTargets.has(t.id)) {
        seenTargets.add(t.id);
        log(`Ziel freigeschaltet: ${t.name}`);
      }
    }
    if (best && best !== c.targetId) game.setTarget(c.id, best);
    if (!traceRisky) game.startHack(c.id);
  }
}

const total = hours * 3600;
let lastReport = 0;
let lastRaids = 0;
while (s().run.playTime < total) {
  botStep();
  game.update(1);
  if (s().run.raids > lastRaids) {
    lastRaids = s().run.raids;
    log(`⚠ Razzia #${lastRaids}`);
  }
  if (!prestigeLogged && game.pendingTokens() >= 1) {
    prestigeLogged = true;
    log(`★ Prestige möglich (${fmtMoney(s().run.money)} verdient)`);
  }
  if (s().run.playTime - lastReport >= 1800) {
    lastReport = s().run.playTime;
    const comp = nodes().filter(isCompute);
    log(
      `Status: ${fmtMoney(s().money)} · ${fmt(s().crypto, 2)} ₿ · Ruf ${fmt(s().reputation)} · Trace ${s().trace.toFixed(0)}% · ` +
        `${comp.length} Rechner (${comp.map((c) => fmt(rt(c).power)).join('/')} OPS) · ${nodes().length} Nodes · Tokens ${game.pendingTokens()}`,
    );
  }
}
log(`Ende: Forschung ${seenResearch.size}/${CONFIG.research.length}, Ziele ${seenTargets.size}/${CONFIG.targets.length}, Razzien ${s().run.raids}`);
