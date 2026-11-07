import { CONFIG, type CollectiveUpgradeConfig, type PerkConfig, type ResearchConfig } from './config';
import { canAfford, pay, refund } from './economy';
import { simulateOffline, type OfflineReport } from './offline';
import { abandonContract, acceptContract } from './systems/contracts';
import { buyCrypto, sellCrypto } from './systems/crypto';
import { exploitAutoOn, familyById } from './systems/exploits';
import { clearStorage, deserialize, loadFromStorage, saveToStorage, serialize } from './save';
import { collectiveLevel, collectiveReset, createInitialState, getModifiers, pendingShares, pendingTokens, perkLevel, prestigeReset } from './state';
import { addTrace, canHack, computeRuntime, earn, isCompute, startHack, targetById, tick, type FlowMap, type RuntimeMap } from './simulation';
import type { GameEvent, GameState, NodeInstance, NodeTypeId } from './types';
import { NODE_DEFS, PORT_NAMES, portDef } from '../nodes/definitions';
import { countOf, hasConfig, investedValue, nodeConfig, nodePrice, stat, upgradeCost, upgradeMaxed } from '../nodes/stats';

type Listener = (e: GameEvent) => void;

export class Game {
  state: GameState;
  runtime: RuntimeMap = new Map();
  /** Fluss pro Verbindung im letzten Tick (Einheiten/s) – für die Paket-Animation. */
  flows: FlowMap = new Map();
  private listeners: Listener[] = [];
  private accumulator = 0;
  private sinceSave = 0;

  constructor(state?: GameState) {
    this.state = state ?? createInitialState();
    computeRuntime(this.state, this.runtime);
  }

  /** Lädt den gespeicherten Stand und rechnet die Offline-Zeit nach. */
  static fromStorage(): { game: Game; offline: OfflineReport | null } {
    const saved = loadFromStorage();
    const game = new Game(saved ?? undefined);
    let offline: OfflineReport | null = null;
    if (saved) offline = game.catchUp((Date.now() - saved.savedAt) / 1000);
    return { game, offline };
  }

  /** Verstrichene Zeit nachsimulieren (Offline-Fortschritt / Tab im Hintergrund). */
  catchUp(seconds: number): OfflineReport | null {
    if (!(seconds > 1)) return null;
    const report = simulateOffline(this.state, this.runtime, seconds);
    computeRuntime(this.state, this.runtime);
    return report;
  }

  on(fn: Listener): void {
    this.listeners.push(fn);
  }

  emit(e: GameEvent): void {
    for (const l of this.listeners) l(e);
  }

  /** Echtzeit-Update: führt feste Simulationsschritte aus. */
  update(realDt: number): void {
    const step = 1 / CONFIG.tickRate;
    this.accumulator += Math.min(realDt, 1);
    const events: GameEvent[] = [];
    while (this.accumulator >= step) {
      tick(this.state, this.runtime, step, events, this.flows);
      this.accumulator -= step;
    }
    for (const e of events) this.emit(e);
    this.sinceSave += realDt;
    if (this.sinceSave >= CONFIG.autosaveSeconds) this.save();
  }

  /** Simuliert `seconds` mit grober Schrittweite (Balancing-Bot, Tests). Events werden ausgelöst. */
  advance(seconds: number, dt: number): void {
    const events: GameEvent[] = [];
    for (let left = seconds; left > 1e-9; left -= dt) {
      tick(this.state, this.runtime, Math.min(dt, left), events, this.flows);
    }
    for (const e of events) this.emit(e);
  }

  node(id: number): NodeInstance | undefined {
    return this.state.nodes.find((n) => n.id === id);
  }

  // ---------- Freischaltungen ----------

  isUnlocked(type: NodeTypeId): boolean {
    if (!hasConfig(type)) return false;
    if (nodeConfig(type).startUnlocked) return true;
    return CONFIG.research.some((r) => r.unlocks?.includes(type) && this.state.research.includes(r.id));
  }

  lockHint(type: NodeTypeId): string {
    const r = CONFIG.research.find((x) => x.unlocks?.includes(type));
    return r ? `Forschung „${r.name}“ nötig.` : 'Noch nicht verfügbar.';
  }

  count(type: NodeTypeId): number {
    return countOf(this.state, type);
  }

  // ---------- Aktionen ----------

  clickJob(nodeId: number): void {
    const node = this.node(nodeId);
    if (!node || node.type !== 'job') return;
    const amount = stat(node, 'reward') * getModifiers(this.state).click;
    earn(this.state, amount);
    this.state.run.clicks++;
    this.state.stats.clicks++;
    this.emit({ kind: 'click', amount });
  }

  buyNode(type: NodeTypeId, x: number, y: number): NodeInstance | null {
    if (!this.isUnlocked(type) || type === 'job') return null;
    if (!pay(this.state, nodePrice(this.state, type))) return null;
    const node: NodeInstance = { id: this.state.nextId++, type, x, y, levels: {}, buffer: 0 };
    if (NODE_DEFS[type].category === 'compute') node.targetId = this.bestTargetFor(node) ?? CONFIG.targets[0].id;
    this.state.nodes.push(node);
    computeRuntime(this.state, this.runtime);
    return node;
  }

  /** Schwierigstes Ziel, das ein Rechner gerade hacken kann. */
  bestTargetFor(node: NodeInstance): string | undefined {
    const ok = CONFIG.targets.filter((t) => !t.phases && !t.rival && canHack(this.state, node, t));
    return ok[ok.length - 1]?.id;
  }

  sellNode(nodeId: number): boolean {
    const node = this.node(nodeId);
    if (!node || node.type === 'job') return false;
    refund(this.state, investedValue(this.state, node), CONFIG.sellRefund);
    this.state.connections = this.state.connections.filter((c) => c.from !== nodeId && c.to !== nodeId);
    this.state.nodes = this.state.nodes.filter((n) => n.id !== nodeId);
    computeRuntime(this.state, this.runtime);
    return true;
  }

  upgrade(nodeId: number, upgradeId: string): boolean {
    const node = this.node(nodeId);
    if (!node) return false;
    const upg = nodeConfig(node.type).upgrades.find((u) => u.id === upgradeId);
    if (!upg || upgradeMaxed(node, upg)) return false;
    if (!pay(this.state, upgradeCost(node, upg))) return false;
    node.levels[upg.id] = (node.levels[upg.id] ?? 0) + 1;
    computeRuntime(this.state, this.runtime);
    return true;
  }

  canUpgrade(node: NodeInstance, upgradeId: string): boolean {
    const upg = nodeConfig(node.type).upgrades.find((u) => u.id === upgradeId);
    return !!upg && !upgradeMaxed(node, upg) && canAfford(this.state, upgradeCost(node, upg));
  }

  setTarget(nodeId: number, targetId: string): void {
    const node = this.node(nodeId);
    if (!node || !isCompute(node) || !targetById(targetId)) return;
    node.targetId = targetId;
    if (node.job && node.job.targetId !== targetId) node.job = null;
    computeRuntime(this.state, this.runtime);
  }

  startHack(nodeId: number): boolean {
    const node = this.node(nodeId);
    if (!node) return false;
    const events: GameEvent[] = [];
    const ok = startHack(this.state, node, this.runtime.get(node.id), events);
    for (const e of events) this.emit(e);
    return ok;
  }

  // ---------- Terminal-Minispiel ----------

  /** Minispiel nur bei laufenden, manuellen Hacks mit genug Restzeit – einmal pro Hack. */
  canMinigame(nodeId: number): boolean {
    const node = this.node(nodeId);
    const rt = node && this.runtime.get(node.id);
    if (!node?.job || !rt || node.job.minigame || rt.scripted || rt.power <= 0) return false;
    return (node.job.required - node.job.progress) / rt.power >= CONFIG.minigame.minSecondsLeft;
  }

  minigameResult(nodeId: number, success: boolean): void {
    const node = this.node(nodeId);
    if (!node?.job || node.job.minigame) return;
    node.job.minigame = true;
    if (success) {
      node.job.progress += (node.job.required - node.job.progress) * CONFIG.minigame.progressBonus;
      this.state.stats.minigames++;
    } else {
      const events: GameEvent[] = [];
      addTrace(this.state, CONFIG.minigame.tracePenalty, events);
      for (const e of events) this.emit(e);
    }
  }

  // ---------- Aufträge ----------

  acceptContract(id: number): boolean {
    return acceptContract(this.state, id);
  }

  abandonContract(id: number): void {
    abandonContract(this.state, id);
  }

  // ---------- Exploits & Krypto ----------

  setCraft(nodeId: number, family: string): void {
    const node = this.node(nodeId);
    if (!node || node.type !== 'malware' || !familyById(family)) return;
    if (node.craft !== family) node.craftProgress = 0;
    node.craft = family;
  }

  toggleExploitAuto(family: string): void {
    this.state.exploitAuto[family] = !exploitAutoOn(this.state, family);
  }

  /** Verkauft einen Anteil des Krypto-Bestands. */
  sellCrypto(fraction: number): number {
    return sellCrypto(this.state, this.state.crypto * fraction);
  }

  /** Kauft Krypto für einen Anteil des Geldes. */
  buyCrypto(fraction: number): number {
    return buyCrypto(this.state, this.state.money * fraction);
  }

  /** Maximale Kabelanzahl an einem Port. */
  portCapacity(node: NodeInstance, portId: string): number {
    const p = portDef(node.type, portId);
    if (!p) return 0;
    if (p.maxStat) return Math.floor(stat(node, p.maxStat));
    return p.max ?? (p.dir === 'in' ? 1 : Infinity);
  }

  /** Verbindet einen Ausgang mit einem Eingang gleicher Art. */
  connect(fromId: number, fromPort: string, toId: number, toPort: string): boolean {
    const a = this.node(fromId);
    const b = this.node(toId);
    if (!a || !b || a.id === b.id) return false;
    const pa = portDef(a.type, fromPort);
    const pb = portDef(b.type, toPort);
    if (!pa || !pb || pa.dir !== 'out' || pb.dir !== 'in') return false;
    if (pa.kind !== pb.kind) {
      this.emit({ kind: 'info', text: `${PORT_NAMES[pa.kind]} passt nicht an ${PORT_NAMES[pb.kind]}.`, tone: 'warn' });
      return false;
    }
    const conns = this.state.connections;
    if (conns.some((c) => c.from === fromId && c.fromPort === fromPort && c.to === toId && c.toPort === toPort)) return false;
    if (pa.kind === 'proxy' && this.proxyCycle(fromId, toId)) {
      this.emit({ kind: 'info', text: 'Proxy-Kette darf keinen Kreis bilden.', tone: 'warn' });
      return false;
    }
    const inMax = this.portCapacity(b, toPort);
    const atIn = conns.filter((c) => c.to === toId && c.toPort === toPort);
    if (atIn.length >= inMax) {
      // Bei Einzel-Eingängen das alte Kabel ersetzen
      if (inMax === 1) this.removeConnection(atIn[0].id);
      else return false;
    }
    const outMax = this.portCapacity(a, fromPort);
    const atOut = this.state.connections.filter((c) => c.from === fromId && c.fromPort === fromPort);
    if (atOut.length >= outMax) {
      if (outMax === 1) this.removeConnection(atOut[0].id);
      else {
        this.emit({ kind: 'info', text: `Ausgang „${pa.label}“ ist voll belegt (max. ${outMax}).`, tone: 'warn' });
        return false;
      }
    }
    this.state.connections.push({ id: this.state.nextId++, from: fromId, fromPort, to: toId, toPort });
    computeRuntime(this.state, this.runtime);
    return true;
  }

  /** Würde die Verbindung from → to einen Kreis in der Proxy-Kette erzeugen? */
  private proxyCycle(fromId: number, toId: number): boolean {
    let cur: number | undefined = fromId;
    for (let i = 0; cur !== undefined && i < 64; i++) {
      if (cur === toId) return true;
      const id: number = cur;
      cur = this.state.connections.find((c) => c.to === id && c.toPort === 'proxyIn')?.from;
    }
    return false;
  }

  private removeConnection(connectionId: number): void {
    this.state.connections = this.state.connections.filter((c) => c.id !== connectionId);
    this.flows.delete(connectionId);
  }

  disconnect(connectionId: number): void {
    this.removeConnection(connectionId);
    computeRuntime(this.state, this.runtime);
  }

  moveNode(nodeId: number, x: number, y: number): void {
    const node = this.node(nodeId);
    if (!node) return;
    node.x = x;
    node.y = y;
  }

  // ---------- Forschung ----------

  researchState(r: ResearchConfig): 'done' | 'available' | 'locked' {
    if (this.state.research.includes(r.id)) return 'done';
    return r.requires.every((q) => this.state.research.includes(q)) ? 'available' : 'locked';
  }

  research(id: string): boolean {
    const r = CONFIG.research.find((x) => x.id === id);
    if (!r || this.researchState(r) !== 'available') return false;
    if (!pay(this.state, r.cost)) return false;
    this.state.research.push(r.id);
    computeRuntime(this.state, this.runtime);
    this.emit({ kind: 'research', id: r.id });
    return true;
  }

  // ---------- Prestige ----------

  pendingTokens(): number {
    return pendingTokens(this.state);
  }

  prestige(): boolean {
    if (this.pendingTokens() < 1) return false;
    const camera = this.state.camera;
    this.replaceState(prestigeReset(this.state));
    this.state.camera = camera;
    this.save();
    return true;
  }

  // ---------- Kollektiv (zweite Prestige-Ebene) ----------

  pendingShares(): number {
    return pendingShares(this.state);
  }

  foundCollective(): boolean {
    if (this.pendingShares() < 1) return false;
    const camera = this.state.camera;
    this.replaceState(collectiveReset(this.state));
    this.state.camera = camera;
    this.save();
    return true;
  }

  collectiveCost(u: CollectiveUpgradeConfig): number {
    return Math.ceil(u.cost * Math.pow(u.growth, collectiveLevel(this.state, u.id)));
  }

  buyCollective(id: string): boolean {
    const u = CONFIG.collective.upgrades.find((x) => x.id === id);
    if (!u || collectiveLevel(this.state, u.id) >= u.max) return false;
    const cost = this.collectiveCost(u);
    if (this.state.collective.shares < cost) return false;
    this.state.collective.shares -= cost;
    this.state.collective.upgrades[u.id] = collectiveLevel(this.state, u.id) + 1;
    computeRuntime(this.state, this.runtime);
    return true;
  }

  perkCost(p: PerkConfig): number {
    return Math.ceil(p.cost * Math.pow(p.growth, perkLevel(this.state, p.id)));
  }

  buyPerk(id: string): boolean {
    const p = CONFIG.perks.find((x) => x.id === id);
    if (!p || perkLevel(this.state, p.id) >= p.max) return false;
    const cost = this.perkCost(p);
    if (this.state.prestige.tokens < cost) return false;
    this.state.prestige.tokens -= cost;
    this.state.prestige.perks[p.id] = perkLevel(this.state, p.id) + 1;
    computeRuntime(this.state, this.runtime);
    return true;
  }

  // ---------- Speichern ----------

  save(): boolean {
    this.sinceSave = 0;
    return saveToStorage(this.state);
  }

  load(): boolean {
    const s = loadFromStorage();
    if (!s) return false;
    this.replaceState(s);
    return true;
  }

  exportSave(): string {
    this.state.savedAt = Date.now();
    return btoa(unescape(encodeURIComponent(serialize(this.state))));
  }

  importSave(text: string): boolean {
    try {
      const json = decodeURIComponent(escape(atob(text.trim())));
      this.replaceState(deserialize(json));
      this.save();
      return true;
    } catch {
      return false;
    }
  }

  hardReset(): void {
    clearStorage();
    this.replaceState(createInitialState());
  }

  replaceState(s: GameState): void {
    this.state = s;
    this.runtime.clear();
    this.flows.clear();
    this.accumulator = 0;
    computeRuntime(this.state, this.runtime);
  }
}
