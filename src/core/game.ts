import { CONFIG } from './config';
import { canAfford, pay, refund } from './economy';
import { loadFromStorage, saveToStorage, clearStorage } from './save';
import { createInitialState, getModifiers } from './state';
import { computeRuntime, startHack, targetById, tick, type RuntimeMap } from './simulation';
import type { GameEvent, GameState, NodeInstance, NodeTypeId } from './types';
import { NODE_DEFS, PORT_NAMES, portDef } from '../nodes/definitions';
import { countOf, hasConfig, investedValue, nodeConfig, nodePrice, stat, upgradeCost, upgradeMaxed } from '../nodes/stats';

type Listener = (e: GameEvent) => void;

export class Game {
  state: GameState;
  runtime: RuntimeMap = new Map();
  /** Fluss pro Verbindung im letzten Tick (Einheiten/s) – für die Paket-Animation. */
  flows = new Map<number, number>();
  private listeners: Listener[] = [];
  private accumulator = 0;
  private sinceSave = 0;

  constructor(state?: GameState) {
    this.state = state ?? loadFromStorage() ?? createInitialState();
    computeRuntime(this.state, this.runtime);
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
      tick(this.state, this.runtime, step, events);
      this.accumulator -= step;
    }
    for (const e of events) this.emit(e);
    this.sinceSave += realDt;
    if (this.sinceSave >= CONFIG.autosaveSeconds) {
      this.save();
    }
  }

  node(id: number): NodeInstance | undefined {
    return this.state.nodes.find((n) => n.id === id);
  }

  // ---------- Aktionen ----------

  clickJob(nodeId: number): void {
    const node = this.node(nodeId);
    if (!node || node.type !== 'job') return;
    const amount = stat(node, 'reward') * getModifiers(this.state).click;
    this.state.money += amount;
    this.state.run.money += amount;
    this.state.allTimeMoney += amount;
    this.state.run.clicks++;
    this.emit({ kind: 'click', amount });
  }

  isUnlocked(type: NodeTypeId): boolean {
    return hasConfig(type) && (nodeConfig(type).startUnlocked === true);
  }

  lockHint(_type: NodeTypeId): string {
    return 'Noch nicht verfügbar.';
  }

  count(type: NodeTypeId): number {
    return countOf(this.state, type);
  }

  buyNode(type: NodeTypeId, x: number, y: number): NodeInstance | null {
    if (!this.isUnlocked(type) || type === 'job') return null;
    if (!pay(this.state, nodePrice(this.state, type))) return null;
    const node: NodeInstance = { id: this.state.nextId++, type, x, y, levels: {}, buffer: 0 };
    if (NODE_DEFS[type].category === 'compute') node.targetId = CONFIG.targets[0].id;
    this.state.nodes.push(node);
    computeRuntime(this.state, this.runtime);
    return node;
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
    if (!node || !targetById(targetId)) return;
    node.targetId = targetId;
    if (node.job && node.job.targetId !== targetId) node.job = null;
  }

  startHack(nodeId: number): boolean {
    const node = this.node(nodeId);
    return !!node && startHack(this.state, node);
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
      this.emit({ kind: 'info', text: `${PORT_NAMES[pa.kind]} passt nicht an ${PORT_NAMES[pb.kind]}`, tone: 'warn' });
      return false;
    }
    const conns = this.state.connections;
    if (conns.some((c) => c.from === fromId && c.fromPort === fromPort && c.to === toId && c.toPort === toPort)) return false;
    const inMax = pb.max ?? 1;
    const atIn = conns.filter((c) => c.to === toId && c.toPort === toPort);
    if (atIn.length >= inMax) {
      // Bei Einzel-Eingängen das alte Kabel ersetzen
      if (inMax === 1) this.disconnect(atIn[0].id);
      else return false;
    }
    if (pa.max !== undefined && conns.filter((c) => c.from === fromId && c.fromPort === fromPort).length >= pa.max) {
      this.emit({ kind: 'info', text: `Ausgang ${pa.label} ist voll belegt (max. ${pa.max})`, tone: 'warn' });
      return false;
    }
    conns.push({ id: this.state.nextId++, from: fromId, fromPort, to: toId, toPort });
    computeRuntime(this.state, this.runtime);
    return true;
  }

  disconnect(connectionId: number): void {
    this.state.connections = this.state.connections.filter((c) => c.id !== connectionId);
    this.flows.delete(connectionId);
    computeRuntime(this.state, this.runtime);
  }

  moveNode(nodeId: number, x: number, y: number): void {
    const node = this.node(nodeId);
    if (!node) return;
    node.x = x;
    node.y = y;
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

  hardReset(): void {
    clearStorage();
    this.replaceState(createInitialState());
  }

  replaceState(s: GameState): void {
    this.state = s;
    this.runtime.clear();
    computeRuntime(this.state, this.runtime);
  }
}
