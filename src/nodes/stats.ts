import { CONFIG, type NodeConfig, type UpgradeConfig } from '../core/config';
import { scaleCost } from '../core/economy';
import type { Cost, GameState, NodeInstance, NodeTypeId } from '../core/types';

export function nodeConfig(type: NodeTypeId): NodeConfig {
  const cfg = CONFIG.nodes[type];
  if (!cfg) throw new Error(`Keine Config für Node-Typ ${type}`);
  return cfg;
}

export function hasConfig(type: NodeTypeId): boolean {
  return CONFIG.nodes[type] !== undefined;
}

/** Wert eines Stats inklusive aller Upgrade-Stufen. */
export function stat(node: NodeInstance, name: string): number {
  const cfg = nodeConfig(node.type);
  let v = cfg.stats[name] ?? 0;
  for (const u of cfg.upgrades) {
    if (u.stat !== name) continue;
    const lvl = node.levels[u.id] ?? 0;
    v = u.mode === 'add' ? v + u.amount * lvl : v * Math.pow(u.amount, lvl);
  }
  return v;
}

/** Wert eines Stats nach dem nächsten Upgrade (für Vorschau). */
export function statAfterUpgrade(node: NodeInstance, upg: UpgradeConfig): number {
  const lvl = node.levels[upg.id] ?? 0;
  node.levels[upg.id] = lvl + 1;
  const v = stat(node, upg.stat);
  node.levels[upg.id] = lvl;
  return v;
}

export function upgradeCost(node: NodeInstance, upg: UpgradeConfig): Cost {
  return scaleCost(upg.cost, upg.growth, node.levels[upg.id] ?? 0);
}

export function upgradeMaxed(node: NodeInstance, upg: UpgradeConfig): boolean {
  return upg.max !== undefined && (node.levels[upg.id] ?? 0) >= upg.max;
}

export function countOf(state: GameState, type: NodeTypeId): number {
  let n = 0;
  for (const node of state.nodes) if (node.type === type) n++;
  return n;
}

export function nodePrice(state: GameState, type: NodeTypeId): Cost {
  const cfg = nodeConfig(type);
  return scaleCost(cfg.cost, cfg.growth, countOf(state, type));
}

/** Gesamtwert, der in einen Node investiert wurde (Kaufpreis + Upgrades). */
export function investedValue(state: GameState, node: NodeInstance): Cost {
  const cfg = nodeConfig(node.type);
  const base = scaleCost(cfg.cost, cfg.growth, Math.max(0, countOf(state, node.type) - 1));
  const total: Cost = { money: base.money ?? 0, crypto: base.crypto ?? 0 };
  for (const u of cfg.upgrades) {
    const lvl = node.levels[u.id] ?? 0;
    for (let i = 0; i < lvl; i++) {
      const c = scaleCost(u.cost, u.growth, i);
      total.money! += c.money ?? 0;
      total.crypto! += c.crypto ?? 0;
    }
  }
  return total;
}
