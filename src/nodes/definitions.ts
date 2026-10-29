import type { NodeTypeId, PortKind } from '../core/types';

export interface PortDef {
  id: string;
  kind: PortKind;
  label: string;
  dir: 'in' | 'out';
  /** Maximale Anzahl Kabel an diesem Port (Standard: unbegrenzt). */
  max?: number;
}

export type NodeCategory = 'job' | 'compute' | 'module' | 'network' | 'storage' | 'market' | 'power' | 'security' | 'automation';

export interface NodeDef {
  category: NodeCategory;
  icon: string;
  ports: PortDef[];
  /** Anzahl Info-Zeilen im Node-Fenster. */
  lines: number;
  bar?: boolean;
  button?: string;
}

export const PORT_COLORS: Record<PortKind, string> = {
  data: '#00e5ff',
  power: '#ffd23f',
  cool: '#6fa8ff',
  net: '#39ff88',
  accel: '#ff4fd8',
  proxy: '#b388ff',
  script: '#ff9f40',
};

export const PORT_NAMES: Record<PortKind, string> = {
  data: 'Daten',
  power: 'Strom',
  cool: 'Kühlung',
  net: 'Bandbreite',
  accel: 'GPU',
  proxy: 'Proxy',
  script: 'Script',
};

export const CATEGORY_COLORS: Record<NodeCategory, string> = {
  job: '#39ff88',
  compute: '#39ff88',
  module: '#ff4fd8',
  network: '#39ff88',
  storage: '#00e5ff',
  market: '#00e5ff',
  power: '#ffd23f',
  security: '#b388ff',
  automation: '#ff9f40',
};

const computePorts: PortDef[] = [{ id: 'dataOut', kind: 'data', label: 'Daten', dir: 'out' }];

export const NODE_DEFS: Record<NodeTypeId, NodeDef> = {
  job: { category: 'job', icon: '$', ports: [], lines: 2, button: 'ARBEITEN' },
  laptop: { category: 'compute', icon: '▣', ports: computePorts, lines: 4, bar: true, button: 'HACK' },
  pc: { category: 'compute', icon: '▣', ports: computePorts, lines: 4, bar: true, button: 'HACK' },
  server: { category: 'compute', icon: '▤', ports: computePorts, lines: 4, bar: true, button: 'HACK' },
  gpu: { category: 'module', icon: '◈', ports: [], lines: 2 },
  router: { category: 'network', icon: '⇄', ports: [], lines: 2 },
  fiber: { category: 'network', icon: '≋', ports: [], lines: 2 },
  hdd: { category: 'storage', icon: '◍', ports: [], lines: 2, bar: true },
  ssd: { category: 'storage', icon: '◍', ports: [], lines: 2, bar: true },
  datacenter: { category: 'storage', icon: '▦', ports: [], lines: 2, bar: true },
  market: { category: 'market', icon: '¤', ports: [], lines: 2 },
  miner: { category: 'module', icon: '₿', ports: [], lines: 2 },
  psu: { category: 'power', icon: 'ϟ', ports: [], lines: 2, bar: true },
  cooler: { category: 'power', icon: '❄', ports: [], lines: 2, bar: true },
  vpn: { category: 'security', icon: '⛨', ports: [], lines: 2 },
  proxy: { category: 'security', icon: '⛨', ports: [], lines: 2 },
  script: { category: 'automation', icon: '⌘', ports: [], lines: 2 },
};

// ---------- Layout ----------

export const NODE_WIDTH = 220;
export const HEADER_H = 24;
export const PORT_ROW_H = 20;
export const LINE_H = 15;
export const BAR_H = 10;
export const BUTTON_H = 24;
export const PAD = 8;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface NodeLayout {
  w: number;
  h: number;
  ports: { def: PortDef; x: number; y: number }[];
  linesY: number;
  bar?: Rect;
  button?: Rect;
}

const layoutCache = new Map<NodeTypeId, NodeLayout>();

/** Relatives Layout eines Node-Fensters (Koordinaten relativ zur linken oberen Ecke). */
export function layoutOf(type: NodeTypeId): NodeLayout {
  const cached = layoutCache.get(type);
  if (cached) return cached;
  const def = NODE_DEFS[type];
  const ins = def.ports.filter((p) => p.dir === 'in');
  const outs = def.ports.filter((p) => p.dir === 'out');
  const rows = Math.max(ins.length, outs.length);
  let y = HEADER_H + PAD;
  const ports: NodeLayout['ports'] = [];
  ins.forEach((p, i) => ports.push({ def: p, x: 0, y: y + i * PORT_ROW_H + PORT_ROW_H / 2 }));
  outs.forEach((p, i) => ports.push({ def: p, x: NODE_WIDTH, y: y + i * PORT_ROW_H + PORT_ROW_H / 2 }));
  y += rows * PORT_ROW_H;
  if (rows > 0) y += 4;
  const linesY = y;
  y += def.lines * LINE_H;
  let bar: Rect | undefined;
  if (def.bar) {
    y += 4;
    bar = { x: PAD, y, w: NODE_WIDTH - PAD * 2, h: BAR_H };
    y += BAR_H;
  }
  let button: Rect | undefined;
  if (def.button) {
    y += 6;
    button = { x: PAD, y, w: NODE_WIDTH - PAD * 2, h: BUTTON_H };
    y += BUTTON_H;
  }
  const layout: NodeLayout = { w: NODE_WIDTH, h: y + PAD, ports, linesY, bar, button };
  layoutCache.set(type, layout);
  return layout;
}

export function portDef(type: NodeTypeId, portId: string): PortDef | undefined {
  return NODE_DEFS[type].ports.find((p) => p.id === portId);
}
