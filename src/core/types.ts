export type PortKind = 'data' | 'power' | 'cool' | 'net' | 'accel' | 'proxy' | 'script';

export type NodeTypeId =
  | 'job'
  | 'laptop'
  | 'pc'
  | 'server'
  | 'gpu'
  | 'router'
  | 'fiber'
  | 'hdd'
  | 'ssd'
  | 'datacenter'
  | 'market'
  | 'miner'
  | 'psu'
  | 'cooler'
  | 'vpn'
  | 'proxy'
  | 'script';

export type Currency = 'money' | 'crypto';

export interface Cost {
  money?: number;
  crypto?: number;
}

export interface HackJob {
  targetId: string;
  progress: number;
  required: number;
}

export interface NodeInstance {
  id: number;
  type: NodeTypeId;
  x: number;
  y: number;
  levels: Record<string, number>;
  targetId?: string;
  job?: HackJob | null;
  /** Gespeicherte Daten in MB (Puffer eines Rechners oder Inhalt eines Speichers). */
  buffer: number;
}

export interface Connection {
  id: number;
  from: number;
  fromPort: string;
  to: number;
  toPort: string;
}

export interface PrestigeState {
  tokens: number;
  tokensTotal: number;
  identities: number;
  perks: Record<string, number>;
}

export interface RunStats {
  money: number;
  data: number;
  crypto: number;
  hacks: number;
  clicks: number;
  raids: number;
  playTime: number;
}

export interface CameraState {
  x: number;
  y: number;
  zoom: number;
}

export interface GameState {
  version: number;
  money: number;
  crypto: number;
  reputation: number;
  trace: number;
  raidTimer: number;
  nodes: NodeInstance[];
  connections: Connection[];
  nextId: number;
  research: string[];
  prestige: PrestigeState;
  run: RunStats;
  /** Über alle Identitäten hinweg verdientes Geld. */
  allTimeMoney: number;
  savedAt: number;
  camera: CameraState;
}

/** Zur Laufzeit berechnete, nicht gespeicherte Werte eines Nodes. */
export interface NodeRuntime {
  power: number; // effektive Rechenleistung (OPS)
  powerRatio: number; // 0..1 Stromversorgung
  thermalRatio: number; // 0..1 (1 = ausreichend gekühlt)
  temperature: number;
  bandwidth: number; // MB/s
  stealth: number; // 0..1
  gpuBonus: number;
  scripted: boolean;
  bufferCap: number;
  flags: Set<NodeFlag>;
  /** Tatsächlicher Durchsatz im letzten Tick (z. B. MB/s, Krypto/s). */
  rate: number;
  demand: number; // Strombedarf in W oder Kühlbedarf
  load: number; // Auslastung eines Versorgers 0..n
}

export type NodeFlag =
  | 'bufferFull'
  | 'storageFull'
  | 'noPower'
  | 'lowPower'
  | 'overheat'
  | 'ramLow'
  | 'idle'
  | 'overload'
  | 'raided';

export type GameEvent =
  | { kind: 'hack'; nodeId: number; targetId: string; money: number; data: number; crypto: number; rep: number }
  | { kind: 'click'; amount: number }
  | { kind: 'raid'; lostMoney: number; lostData: number; lostCrypto: number }
  | { kind: 'traceWarning' }
  | { kind: 'research'; id: string }
  | { kind: 'info'; text: string; tone?: 'ok' | 'warn' | 'bad' };
