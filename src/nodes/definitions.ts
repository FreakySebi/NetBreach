import type { NodeTypeId, PortKind } from '../core/types';

export interface PortDef {
  id: string;
  kind: PortKind;
  label: string;
  dir: 'in' | 'out';
  /** Maximale Anzahl Kabel (Standard: Eingänge 1, Ausgänge unbegrenzt). */
  max?: number;
  /** Stat des Nodes, der die maximale Kabelanzahl bestimmt. */
  maxStat?: string;
}

export type NodeCategory = 'job' | 'compute' | 'module' | 'network' | 'storage' | 'market' | 'power' | 'security' | 'automation' | 'infect';

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
  bot: '#c6ff00',
};

export const PORT_NAMES: Record<PortKind, string> = {
  data: 'Daten',
  power: 'Strom',
  cool: 'Kühlung',
  net: 'Bandbreite',
  accel: 'GPU',
  proxy: 'Proxy',
  script: 'Script',
  bot: 'Botnetz',
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
  infect: '#c6ff00',
};

const P = {
  dataIn: { id: 'dataIn', kind: 'data', label: 'Daten', dir: 'in', max: 99 },
  dataOut: { id: 'dataOut', kind: 'data', label: 'Daten', dir: 'out' },
  powerIn: { id: 'powerIn', kind: 'power', label: 'Strom', dir: 'in' },
  powerOut: { id: 'powerOut', kind: 'power', label: 'Strom', dir: 'out' },
  coolIn: { id: 'coolIn', kind: 'cool', label: 'Kühlung', dir: 'in' },
  coolOut: { id: 'coolOut', kind: 'cool', label: 'Kühlung', dir: 'out' },
  netIn: { id: 'netIn', kind: 'net', label: 'Uplink', dir: 'in' },
  netOut: { id: 'netOut', kind: 'net', label: 'Uplink', dir: 'out' },
  accelIn: { id: 'accelIn', kind: 'accel', label: 'GPU', dir: 'in' },
  accelOut: { id: 'accelOut', kind: 'accel', label: 'GPU', dir: 'out', max: 1 },
  proxyIn: { id: 'proxyIn', kind: 'proxy', label: 'Proxy', dir: 'in' },
  proxyOut: { id: 'proxyOut', kind: 'proxy', label: 'Proxy', dir: 'out', max: 1 },
  scriptIn: { id: 'scriptIn', kind: 'script', label: 'Script', dir: 'in' },
  scriptOut: { id: 'scriptOut', kind: 'script', label: 'Script', dir: 'out', maxStat: 'slots' },
  botIn: { id: 'botIn', kind: 'bot', label: 'Botnetz', dir: 'in', max: 4 },
  botOut: { id: 'botOut', kind: 'bot', label: 'Bots', dir: 'out', maxStat: 'slots' },
} satisfies Record<string, PortDef>;

const laptopPorts: PortDef[] = [P.coolIn, P.netIn, P.accelIn, P.botIn, P.proxyIn, P.scriptIn, P.dataOut];
const computePorts: PortDef[] = [P.powerIn, P.coolIn, P.netIn, P.accelIn, P.botIn, P.proxyIn, P.scriptIn, P.dataOut];

export const NODE_DEFS: Record<NodeTypeId, NodeDef> = {
  job: { category: 'job', icon: '$', ports: [], lines: 2, button: 'ARBEITEN' },
  laptop: { category: 'compute', icon: '▣', ports: laptopPorts, lines: 4, bar: true, button: 'HACK' },
  pc: { category: 'compute', icon: '▣', ports: computePorts, lines: 4, bar: true, button: 'HACK' },
  server: { category: 'compute', icon: '▤', ports: computePorts, lines: 4, bar: true, button: 'HACK' },
  gpu: { category: 'module', icon: '◈', ports: [P.powerIn, P.coolIn, P.accelOut], lines: 2 },
  router: { category: 'network', icon: '⇄', ports: [P.netOut], lines: 2 },
  fiber: { category: 'network', icon: '≋', ports: [P.powerIn, P.netOut], lines: 2 },
  hdd: { category: 'storage', icon: '◍', ports: [P.dataIn, P.dataOut], lines: 2, bar: true },
  ssd: { category: 'storage', icon: '◍', ports: [P.powerIn, P.dataIn, P.dataOut], lines: 2, bar: true },
  datacenter: { category: 'storage', icon: '▦', ports: [P.powerIn, P.coolIn, P.dataIn, P.dataOut], lines: 2, bar: true },
  market: { category: 'market', icon: '¤', ports: [P.dataIn], lines: 3, bar: true },
  miner: { category: 'module', icon: '₿', ports: [P.powerIn, P.coolIn, P.accelIn], lines: 3 },
  psu: { category: 'power', icon: 'ϟ', ports: [P.powerOut], lines: 2, bar: true },
  cooler: { category: 'power', icon: '❄', ports: [P.powerIn, P.coolOut], lines: 2, bar: true },
  vpn: { category: 'security', icon: '⛨', ports: [P.proxyIn, P.proxyOut], lines: 2 },
  proxy: { category: 'security', icon: '⛨', ports: [P.proxyIn, P.proxyOut], lines: 2 },
  script: { category: 'automation', icon: '⌘', ports: [P.scriptOut], lines: 2 },
  quantum: { category: 'compute', icon: '⚛', ports: computePorts, lines: 4, bar: true, button: 'HACK' },
  firewall: { category: 'security', icon: '▥', ports: [P.powerIn, P.coolIn], lines: 2 },
  honeypot: { category: 'security', icon: '◎', ports: [P.powerIn, P.dataIn], lines: 2, bar: true },
  botnet: { category: 'infect', icon: '☣', ports: [P.botOut], lines: 2, bar: true },
  malware: { category: 'module', icon: '⚗', ports: [P.powerIn, P.coolIn, P.accelIn, P.dataIn], lines: 3, bar: true },
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
