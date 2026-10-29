import { CONFIG, type TargetConfig } from './config';
import { getModifiers, type Modifiers } from './state';
import type { GameEvent, GameState, NodeInstance, NodeRuntime } from './types';
import { NODE_DEFS } from '../nodes/definitions';
import { stat } from '../nodes/stats';

export type RuntimeMap = Map<number, NodeRuntime>;

export function targetById(id: string | undefined): TargetConfig | undefined {
  return CONFIG.targets.find((t) => t.id === id);
}

export function isCompute(node: NodeInstance): boolean {
  return NODE_DEFS[node.type].category === 'compute';
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
    scripted: false,
    bufferCap: 0,
    flags: new Set(),
    rate: 0,
    demand: 0,
    load: 0,
  };
}

/** Effektive Rechenleistung eines Rechners für ein bestimmtes Ziel. */
export function hackPower(node: NodeInstance, rt: NodeRuntime, target: TargetConfig | undefined, mods: Modifiers): number {
  const base = stat(node, 'cores') * stat(node, 'clock');
  const gpu = rt.gpuBonus * (target?.gpuFactor ?? 0);
  return (base + gpu) * rt.powerRatio * rt.thermalRatio * mods.hackSpeed;
}

export function targetUnlocked(state: GameState, t: TargetConfig): boolean {
  return state.reputation >= t.reqRep;
}

export function canHack(state: GameState, node: NodeInstance, t: TargetConfig): boolean {
  return targetUnlocked(state, t) && stat(node, 'ram') >= t.ram;
}

/** Abgeleitete Laufzeitwerte aller Nodes berechnen. */
export function computeRuntime(state: GameState, runtime: RuntimeMap): void {
  const mods = getModifiers(state);
  const alive = new Set<number>();
  for (const node of state.nodes) {
    alive.add(node.id);
    let rt = runtime.get(node.id);
    if (!rt) {
      rt = emptyRuntime();
      runtime.set(node.id, rt);
    }
    rt.flags.clear();
    rt.powerRatio = 1;
    rt.gpuBonus = 0;
    rt.stealth = 0;
    rt.scripted = false;
    if (isCompute(node)) {
      const cores = stat(node, 'cores');
      const load = stat(node, 'heatBase') + stat(node, 'heatPerCore') * cores;
      const cooling = stat(node, 'coolBuiltIn');
      rt.demand = load;
      rt.thermalRatio = load <= cooling ? 1 : Math.max(0.25, cooling / load);
      rt.temperature = 30 + 55 * Math.min(1.6, load / Math.max(cooling, 0.01));
      if (rt.thermalRatio < 1) rt.flags.add('overheat');
      rt.bandwidth = stat(node, 'nic');
      rt.bufferCap = stat(node, 'buffer');
      rt.power = hackPower(node, rt, targetById(node.job?.targetId ?? node.targetId), mods);
    }
  }
  for (const id of runtime.keys()) if (!alive.has(id)) runtime.delete(id);
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
  const stored = Math.min(free, t.data);
  node.buffer += stored;
  state.trace = Math.min(100, state.trace + t.trace * mods.traceGain * (1 - rt.stealth));
  events.push({ kind: 'hack', nodeId: node.id, targetId: t.id, money, data: t.data, crypto, rep });
}

/** Startet einen Hack, falls möglich. */
export function startHack(state: GameState, node: NodeInstance): boolean {
  if (node.job || state.raidTimer > 0) return false;
  const t = targetById(node.targetId);
  if (!t || !canHack(state, node, t)) return false;
  node.job = { targetId: t.id, progress: 0, required: t.security };
  return true;
}

/** Ein Simulationsschritt. */
export function tick(state: GameState, runtime: RuntimeMap, dt: number, events: GameEvent[]): void {
  const mods = getModifiers(state);
  state.run.playTime += dt;
  computeRuntime(state, runtime);

  for (const node of state.nodes) {
    if (!isCompute(node)) continue;
    const rt = runtime.get(node.id)!;
    if (!node.job) {
      rt.flags.add('idle');
      continue;
    }
    const t = targetById(node.job.targetId);
    if (!t) {
      node.job = null;
      continue;
    }
    const maxRate = t.security / CONFIG.minHackTime;
    node.job.progress += Math.min(rt.power, maxRate) * dt;
    if (node.job.progress >= node.job.required) {
      node.job = null;
      completeHack(state, node, rt, t, mods, events);
    }
    if (node.buffer >= rt.bufferCap - 1e-6) rt.flags.add('bufferFull');
  }
}
