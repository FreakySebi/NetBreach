export type PortKind = 'data' | 'power' | 'cool' | 'net' | 'accel' | 'proxy' | 'script' | 'bot';

export type NodeTypeId =
  | 'job'
  | 'laptop'
  | 'pc'
  | 'server'
  | 'quantum'
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
  | 'script'
  | 'firewall'
  | 'honeypot'
  | 'botnet'
  | 'malware';

export type Currency = 'money' | 'crypto' | 'models';

export interface Cost {
  money?: number;
  crypto?: number;
  models?: number;
}

export interface HackJob {
  targetId: string;
  progress: number;
  required: number;
  /** Aktuelle Phase bei mehrstufigen Zielen (Der Kern). */
  phase?: number;
  /** Ein Exploit wurde für diesen Hack verbraucht. */
  exploit?: boolean;
  /** Minispiel für diesen Hack bereits gespielt. */
  minigame?: boolean;
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
  /** Botnetz: Anzahl infizierter Geräte. */
  devices?: number;
  /** Sekunden, die der Node nach einem Rivalen-Angriff noch gesperrt ist. */
  locked?: number;
  /** Malware-Labor: Exploit-Familie, die hergestellt wird, und Fortschritt (OPS). */
  craft?: string;
  craftProgress?: number;
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
  /** Identitätswechsel insgesamt (wird auch vom Kollektiv nicht zurückgesetzt). */
  identities: number;
  perks: Record<string, number>;
}

export interface CollectiveState {
  shares: number;
  sharesTotal: number;
  founded: number;
  upgrades: Record<string, number>;
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

/** Lebenslange Statistik (übersteht Prestige und Kollektiv). */
export interface LifetimeStats {
  hacks: number;
  clicks: number;
  raids: number;
  playTime: number;
  dataSold: number;
  contracts: number;
  repelled: number;
  attacks: number;
  exploits: number;
  minigames: number;
  coreCracks: number;
  cryptoSold: number;
  maxDevices: number;
  rivalsBeaten: number;
  /** Erfolgreiche Hacks pro Ziel. */
  targets: Record<string, number>;
}

export interface CameraState {
  x: number;
  y: number;
  zoom: number;
}

export interface MarketState {
  /** Kurs in € pro ₿. */
  price: number;
  history: number[];
  sampleIn: number;
}

export type ContractKind = 'hackCount' | 'sellData' | 'earnMoney' | 'craft' | 'defend' | 'lowTrace';

export interface ContractReward {
  money?: number;
  crypto?: number;
  rep?: number;
  exploits?: { family: string; count: number };
}

export interface Contract {
  id: number;
  kind: ContractKind;
  targetId?: string;
  goal: number;
  progress: number;
  /** Zeitlimit nach Annahme in Sekunden. */
  duration: number;
  /** Restzeit: als Angebot bis zum Verfall, angenommen bis zum Scheitern. */
  left: number;
  accepted: boolean;
  reward: ContractReward;
}

export interface ContractsState {
  offers: Contract[];
  nextIn: number;
  nextId: number;
}

export interface ActiveWorldEvent {
  id: string;
  left: number;
  /** Betroffene Exploit-Familie (Zero-Day). */
  family?: string;
}

export interface WorldEventsState {
  active: ActiveWorldEvent[];
  nextIn: number;
  /** Letzte Schlagzeilen für den Ticker. */
  news: string[];
}

export interface RivalState {
  nextIn: number;
  warning: { left: number; strength: number } | null;
  /** Rückverfolgung durch Honeypots in %. */
  track: number;
  located: boolean;
  /** Stärke-Stufe, steigt mit jedem besiegten Rivalen. */
  level: number;
}

export interface GameState {
  version: number;
  money: number;
  crypto: number;
  models: number;
  reputation: number;
  trace: number;
  raidTimer: number;
  /** Sekunden Stromausfall (Stromnetz-Leitstelle). */
  blackout: number;
  nodes: NodeInstance[];
  connections: Connection[];
  nextId: number;
  research: string[];
  prestige: PrestigeState;
  collective: CollectiveState;
  run: RunStats;
  stats: LifetimeStats;
  achievements: string[];
  /** Über alle Identitäten hinweg verdientes Geld. */
  allTimeMoney: number;
  exploits: Record<string, number>;
  /** Exploits automatisch beim Hack-Start verbrauchen (pro Familie). */
  exploitAuto: Record<string, boolean>;
  market: MarketState;
  contracts: ContractsState;
  worldEvents: WorldEventsState;
  rival: RivalState;
  /** Zustand des Zufallsgenerators. */
  rng: number;
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
  /** OPS von angeschlossenen Botnetzen. */
  botOps: number;
  /** Geschwindigkeitsbonus durch ein angeschlossenes Script (0.1 = +10 %). */
  boost: number;
  scripted: boolean;
  /** Sekunden, die ein Script-Rechner schon auf einen Start wartet (faire Reihenfolge). */
  waiting: number;
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
  | 'raided'
  | 'blackout'
  | 'locked'
  | 'noBait';

export type GameEvent =
  | { kind: 'hack'; nodeId: number; targetId: string; money: number; data: number; crypto: number; rep: number; models: number }
  | { kind: 'phase'; nodeId: number; targetId: string; phase: number }
  | { kind: 'click'; amount: number }
  | { kind: 'raid'; lostMoney: number; lostData: number; lostCrypto: number }
  | { kind: 'traceWarning' }
  | { kind: 'research'; id: string }
  | { kind: 'achievement'; id: string }
  | { kind: 'exploit'; family: string; count: number }
  | { kind: 'info'; text: string; tone?: 'ok' | 'warn' | 'bad' };
