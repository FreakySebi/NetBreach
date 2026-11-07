/**
 * ZENTRALE BALANCING-DATEI
 * Alle Preise, Wachstumsfaktoren, Hack-Zeiten und Erträge stehen hier.
 *
 * Einheiten: Geld in €, Krypto in ₿, Daten in MB, Rechenleistung in OPS
 * (Security-Punkte pro Sekunde), Strom in W, Kühlung in Wärme-Einheiten (WE).
 *
 * Upgrade-Kosten: cost * growth ^ level   (typisch: 1.15)
 * Node-Preise:    cost * growth ^ anzahlBereitsBesessen
 */
import type { Cost, NodeTypeId } from './types';

export interface UpgradeConfig {
  id: string;
  label: string;
  stat: string;
  /** add: base + amount * level · mul: base * amount ^ level */
  mode: 'add' | 'mul';
  amount: number;
  cost: Cost;
  growth: number;
  max?: number;
}

export interface NodeConfig {
  name: string;
  desc: string;
  cost: Cost;
  /** Preisfaktor pro bereits besessenem Node dieses Typs. */
  growth: number;
  /** Ohne Forschung verfügbar. */
  startUnlocked?: boolean;
  stats: Record<string, number>;
  upgrades: UpgradeConfig[];
}

export interface TargetConfig {
  id: string;
  name: string;
  desc: string;
  /** Security-Level: Hack-Dauer = security / Rechenleistung */
  security: number;
  ram: number; // benötigter RAM in GB
  money: number;
  data: number; // MB
  rep: number;
  trace: number; // Trace-Zuwachs in % pro Hack (vor Stealth)
  crypto?: number;
  reqRep: number;
  /** Wie stark GPUs bei diesem Ziel helfen (Passwort-Cracking), Faktor auf GPU-OPS. */
  gpuFactor: number;
  /** Exploit-Familie, deren Exploits die Security dieses Ziels senken. */
  family: string;
  /** KI-Modelle pro Hack. */
  models?: number;
  /** Neue Geräte für jedes Botnetz pro Hack. */
  botnet?: number;
  /** Sondereffekt nach erfolgreichem Hack. */
  effect?: 'blackout';
  /** Mehrstufiger Hack: jede Phase braucht eine andere Ressource. */
  phases?: TargetPhase[];
  reqIdentities?: number;
  reqResearch?: string;
  /** Nur angreifbar, nachdem Honeypots den Rivalen geortet haben. */
  rival?: boolean;
}

export type PhaseResource = 'ops' | 'gpu' | 'bandwidth';

export interface TargetPhase {
  name: string;
  resource: PhaseResource;
  /** Benötigte Menge: OPS-Sekunden, GPU-OPS-Sekunden oder MB. */
  amount: number;
}

export type ModifierKey =
  | 'hackSpeed'
  | 'money'
  | 'dataValue'
  | 'crypto'
  | 'rep'
  | 'click'
  | 'traceGain'
  | 'traceDecay'
  | 'models'
  | 'botnet'
  | 'craft'
  | 'nodeCost'
  | 'defense'
  | 'tokens';

export interface ResearchConfig {
  id: string;
  name: string;
  desc: string;
  cost: Cost;
  requires: string[];
  unlocks?: NodeTypeId[];
  /** Multiplikatoren (traceDecay wird addiert). */
  mods?: Partial<Record<ModifierKey, number>>;
  /** Spalte im Forschungsbaum. */
  tier: number;
}

export interface PerkConfig {
  id: string;
  name: string;
  desc: string;
  cost: number; // Ghost-Tokens für Stufe 1
  growth: number;
  max: number;
}

export interface ExploitFamilyConfig {
  id: string;
  name: string;
  /** Kosten pro Exploit im Malware-Labor. */
  data: number; // MB
  ops: number; // OPS-Sekunden
}

export interface WorldEventConfig {
  id: string;
  name: string;
  desc: string;
  duration: number;
  weight: number;
  tone: 'ok' | 'warn' | 'bad';
  mods?: Partial<Record<ModifierKey, number>>;
  /** Kurs-Schock beim Start (Faktor auf den Kryptokurs). */
  priceShock?: number;
  /** Zero-Day: Security-Faktor für eine zufällige Exploit-Familie. */
  securityMult?: number;
}

export type AchievementKind =
  | 'hacks'
  | 'raids'
  | 'money'
  | 'identities'
  | 'collective'
  | 'research'
  | 'repelled'
  | 'rivals'
  | 'contracts'
  | 'exploits'
  | 'devices'
  | 'minigames'
  | 'cryptoSold'
  | 'core'
  | 'target'
  | 'playTime';

export interface AchievementConfig {
  id: string;
  name: string;
  desc: string;
  kind: AchievementKind;
  amount: number;
  targetId?: string;
  mods?: Partial<Record<ModifierKey, number>>;
}

export interface CollectiveUpgradeConfig {
  id: string;
  name: string;
  desc: string;
  cost: number;
  growth: number;
  max: number;
  /** Multiplikatoren pro Stufe. */
  mods?: Partial<Record<ModifierKey, number>>;
}

/** Standard-Wachstumsfaktor für Upgrades (typische Incremental-Kurve). */
const G = 1.15;

export const CONFIG = {
  tickRate: 10,
  autosaveSeconds: 30,
  saveKey: 'netbreach.save.v1',
  /** Kürzestmögliche Hack-Dauer in Sekunden. */
  minHackTime: 0.5,
  /** Anteil des investierten Werts, den man beim Verkauf eines Nodes zurückbekommt. */
  sellRefund: 0.5,

  data: {
    /** Grundpreis pro MB am Darknet-Markt. */
    pricePerMB: 1.2,
    /** +x Preis pro Zehnerpotenz Reputation. */
    repBonusPerLog10: 0.1,
  },

  mining: {
    cryptoPerHash: 0.0002, // ₿ pro Hash und Sekunde
    gpuToHash: 0.5, // GPU-OPS → Hashrate
  },

  trace: {
    baseDecay: 0.35, // % pro Sekunde
    warnAt: 75,
    raidMoneyLoss: 0.25,
    raidDataLoss: 0.5,
    raidCryptoLoss: 0.15,
    raidOfflineSeconds: 30,
    afterRaid: 0,
    /** Hack-Scripts starten ab diesem Trace keine neuen Hacks (Sicherheitsabschaltung). */
    scriptPauseAt: 85,
  },

  offline: {
    maxHours: 8,
    minSeconds: 30,
    /** Max. Simulationsschritte für die Nachberechnung (Schrittweite passt sich an). */
    maxSteps: 20000,
    /** Bei false bleibt der Trace offline unter 100 % (keine Razzia im Schlaf). */
    allowRaids: false,
    /** Offline starten Scripts ab diesem Trace keine neuen Hacks (Sicherheitsabschaltung). */
    scriptTraceLimit: 90,
  },

  prestige: {
    /** Mindestverdienst im aktuellen Lauf für 1 Token. */
    minMoney: 1e7,
    /** Tokens = floor(factor * sqrt(runMoney / minMoney)) */
    factor: 1,
    moneyPerToken: 0.1,
    speedPerToken: 0.05,
  },

  models: {
    /** Forschung, ab der KI-Modelle einen Dauerbonus geben. */
    bonusResearch: 'aiassist',
    /** Hack-Speed +x pro Verdopplung des Modell-Bestands. */
    speedPerLog2: 0.1,
  },

  /** Stromnetz-Leitstelle: Netzteile ohne USV fallen so lange aus. */
  blackout: { seconds: 20 },

  exploits: {
    /** Security-Reduktion durch einen Exploit (0.6 = −60 %). */
    reduction: 0.6,
    /** GPU-OPS zählen im Labor so viel. */
    gpuFactor: 4,
    families: [
      { id: 'iot', name: 'IoT', data: 40, ops: 150 },
      { id: 'web', name: 'Web', data: 400, ops: 2500 },
      { id: 'corp', name: 'Konzern', data: 15000, ops: 80000 },
      { id: 'finance', name: 'Finanz', data: 150000, ops: 1.5e6 },
      { id: 'gov', name: 'Staat', data: 1.5e6, ops: 2.5e7 },
      { id: 'ai', name: 'KI', data: 1.5e7, ops: 3e8 },
    ] as ExploitFamilyConfig[],
  },

  cryptoMarket: {
    basePrice: 15000, // € pro ₿ (langfristiges Mittel)
    volatility: 0.006, // Schwankung pro √Sekunde
    meanReversion: 0.0015, // Rückkehr zum Mittel pro Sekunde
    minPrice: 1500,
    maxPrice: 150000,
    sampleSeconds: 10,
    historyLength: 90,
    fee: 0.02, // Gebühr beim Tauschen
  },

  contracts: {
    minRep: 10,
    firstDelay: 30,
    slots: 3,
    offerSeconds: 300,
    refillSeconds: 40,
    /** Belohnung in Geld = Zielertrag × Anzahl × Faktor. */
    moneyFactor: 2.5,
    repFactor: 1.5,
    hackCount: { min: 3, max: 8, timeSlack: 3, minDuration: 180, maxDuration: 1800 },
    sellData: { hacksWorth: 12, duration: 900 },
    earnMoney: { hacksWorth: 15, duration: 600, cryptoShare: 0.5 },
    lowTrace: { below: 25, seconds: 300, duration: 600 },
    craft: { count: 2, duration: 1200 },
    defend: { duration: 1500 },
  },

  worldEvents: {
    minRep: 5,
    firstDelay: 240,
    minInterval: 180,
    maxInterval: 420,
    types: [
      { id: 'police', name: 'Polizei-Großrazzia', desc: 'Ermittler sind überall: Trace steigt 50 % schneller.', duration: 120, weight: 3, tone: 'bad', mods: { traceGain: 1.5 } },
      { id: 'zeroday', name: 'Zero-Day geleakt', desc: 'Eine Ziel-Familie ist kurz 50 % leichter.', duration: 150, weight: 3, tone: 'ok', securityMult: 0.5 },
      { id: 'cryptocrash', name: 'Kryptocrash', desc: 'Der Kurs bricht ein.', duration: 90, weight: 2, tone: 'bad', priceShock: 0.55 },
      { id: 'cryptohype', name: 'Krypto-Hype', desc: 'Alle wollen Coins – der Kurs explodiert.', duration: 90, weight: 2, tone: 'ok', priceShock: 1.7 },
      { id: 'hwsale', name: 'Hardware-Sale', desc: 'Alle Nodes 25 % günstiger.', duration: 180, weight: 2, tone: 'ok', mods: { nodeCost: 0.75 } },
      { id: 'dataleak', name: 'Datenleck in den Medien', desc: 'Der Markt ist geflutet: Daten bringen 40 % weniger.', duration: 150, weight: 2, tone: 'bad', mods: { dataValue: 0.6 } },
      { id: 'vacation', name: 'Admins im Urlaub', desc: 'Hack-Geschwindigkeit +30 %.', duration: 120, weight: 2, tone: 'ok', mods: { hackSpeed: 1.3 } },
    ] as WorldEventConfig[],
    headlines: [
      'Studie: 80 % aller Passwörter lauten „passwort123“',
      'Cyberversicherer erhöhen erneut die Prämien',
      'Smarter Toaster nimmt an DDoS-Angriff teil',
      'Regierung kündigt „digitale Offensive“ an',
      'Darknet-Forum feiert 10-jähriges Bestehen',
      'Firmen-CEO klickt auf Phishing-Mail – schon wieder',
      'Neue Quantenchips sollen RSA brechen können',
    ],
  },

  rivals: {
    /** Angriffe erst ab dieser Reputation (mittlerer Spielfortschritt). */
    minRep: 1500,
    firstDelay: 300,
    minInterval: 420,
    maxInterval: 840,
    warningSeconds: 45,
    /** Stärke = base × (Ruf / minRep)^repExponent × levelGrowth^Rivalen-Stufe */
    baseStrength: 100,
    repExponent: 0.6,
    levelGrowth: 1.8,
    /** Honeypot-Lockwert zählt so viel zur Abwehr. */
    honeypotDefense: 15,
    lockSeconds: 45,
    lockMaxNodes: 3,
    dataSteal: 0.4,
    moneySteal: 0.08,
    /** Reputation für eine erfolgreiche Abwehr = repelRep × Stärke / base */
    repelRep: 40,
    honeypotRep: 25,
    /** Rückverfolgung pro Lockwert und Angriff in %. */
    trackPerLure: 12,
    /** Security des Rivalen-Ziels wächst pro besiegtem Rivalen. */
    rivalSecurityGrowth: 3,
  },

  collective: {
    minIdentities: 3,
    minTokens: 30,
    /** Anteile = floor(factor × √(Tokens gesamt / minTokens)) */
    factor: 1,
    brokerExploits: 3,
    upgrades: [
      { id: 'shadow', name: 'Schattennetz', desc: 'Alle Geld-Erträge ×2 pro Stufe.', cost: 1, growth: 2, max: 10, mods: { money: 2 } },
      { id: 'swarm', name: 'Schwarmintelligenz', desc: 'Hack-Geschwindigkeit ×1.5 pro Stufe.', cost: 1, growth: 2, max: 10, mods: { hackSpeed: 1.5 } },
      { id: 'mint', name: 'Token-Druckerei', desc: 'Ghost-Tokens ×1.25 pro Stufe.', cost: 2, growth: 2, max: 8, mods: { tokens: 1.25 } },
      { id: 'phantom', name: 'Phantom-Protokoll', desc: 'Trace-Zuwachs −20 % pro Stufe.', cost: 2, growth: 2, max: 5, mods: { traceGain: 0.8 } },
      { id: 'broker', name: 'Zero-Day-Broker', desc: 'Jeder Lauf startet mit 3 Exploits pro Familie und Stufe.', cost: 1, growth: 1.8, max: 5 },
      { id: 'archive', name: 'Kollektives Archiv', desc: 'Forschung bleibt bei jedem Neustart erhalten.', cost: 3, growth: 1, max: 1 },
    ] as CollectiveUpgradeConfig[],
  },

  minigame: {
    /** Befehle, die im Terminal abgetippt werden müssen. */
    commands: ['nmap -sV', 'ssh root@', 'sudo -i', 'cat /etc/shadow', 'hydra -l admin', 'nc -lvp 4444', 'chmod +x', 'wget payload', 'rm -rf logs', 'exfil --all'],
    count: 3,
    timeLimit: 15,
    /** Erfolg: dieser Anteil der Restarbeit fällt weg. */
    progressBonus: 0.6,
    /** Misserfolg: Trace +x %. */
    tracePenalty: 8,
    /** Nur bei Hacks mit mindestens so viel Restzeit. */
    minSecondsLeft: 4,
  },

  nodes: {
    job: {
      name: 'Freelance-Job',
      desc: 'Kleine IT-Aufträge. Klick = etwas Geld.',
      cost: {},
      growth: 1,
      startUnlocked: true,
      stats: { reward: 2 },
      upgrades: [{ id: 'contracts', label: 'Bessere Aufträge', stat: 'reward', mode: 'mul', amount: 1.6, cost: { money: 20 }, growth: 2.2, max: 12 }],
    },
    laptop: {
      name: 'Laptop',
      desc: 'Dein erster Rechner. Läuft auf Akku, schwache Kühlung.',
      cost: { money: 25 },
      growth: 1.8,
      startUnlocked: true,
      stats: { cores: 1, clock: 1, ram: 2, nic: 1, buffer: 64, coolBuiltIn: 6, heatPerCore: 1 },
      upgrades: [
        { id: 'cores', label: 'CPU-Kern', stat: 'cores', mode: 'add', amount: 1, cost: { money: 12 }, growth: G, max: 11 },
        { id: 'ram', label: 'RAM ×2', stat: 'ram', mode: 'mul', amount: 2, cost: { money: 60 }, growth: 3, max: 4 },
      ],
    },
    pc: {
      name: 'Gaming-PC',
      desc: 'Mehr Kerne, mehr RAM. Braucht Netzteil und ab vielen Kernen Kühlung.',
      cost: { money: 1500 },
      growth: 1.6,
      stats: { cores: 2, clock: 1.5, ram: 8, nic: 5, buffer: 1000, coolBuiltIn: 8, heatBase: 2, heatPerCore: 1, powerBase: 60, powerPerCore: 12 },
      upgrades: [
        { id: 'cores', label: 'CPU-Kern', stat: 'cores', mode: 'add', amount: 1, cost: { money: 150 }, growth: G, max: 30 },
        { id: 'clock', label: 'Übertakten +15 %', stat: 'clock', mode: 'mul', amount: 1.15, cost: { money: 800 }, growth: 1.9, max: 10 },
        { id: 'ram', label: 'RAM ×2', stat: 'ram', mode: 'mul', amount: 2, cost: { money: 600 }, growth: 2.6, max: 6 },
      ],
    },
    server: {
      name: 'Server-Rack',
      desc: 'Professionelle Rechenleistung. Hungrig nach Strom und Kühlung.',
      cost: { money: 250000, crypto: 10 },
      growth: 1.5,
      stats: { cores: 16, clock: 2.5, ram: 128, nic: 40, buffer: 32000, coolBuiltIn: 10, heatBase: 10, heatPerCore: 1.2, powerBase: 300, powerPerCore: 18 },
      upgrades: [
        { id: 'cores', label: 'CPU-Kerne +4', stat: 'cores', mode: 'add', amount: 4, cost: { money: 40000 }, growth: G, max: 60 },
        { id: 'clock', label: 'Übertakten +15 %', stat: 'clock', mode: 'mul', amount: 1.15, cost: { money: 150000 }, growth: 1.9, max: 12 },
        { id: 'ram', label: 'RAM ×2', stat: 'ram', mode: 'mul', amount: 2, cost: { money: 100000 }, growth: 2.4, max: 6 },
      ],
    },
    gpu: {
      name: 'GPU',
      desc: 'Beschleunigt Passwort-Cracking. An Rechner oder Krypto-Miner anschließen.',
      cost: { money: 12000 },
      growth: 1.5,
      stats: { ops: 40, powerBase: 180, heatBase: 12 },
      upgrades: [{ id: 'ops', label: 'Shader-Einheiten +30 %', stat: 'ops', mode: 'mul', amount: 1.3, cost: { money: 8000 }, growth: 1.8, max: 15 }],
    },
    router: {
      name: 'Router',
      desc: 'Zusätzliche Bandbreite, geteilt auf alle angeschlossenen Rechner.',
      cost: { money: 400 },
      growth: 1.6,
      stats: { bandwidth: 12 },
      upgrades: [{ id: 'bw', label: 'Bandbreite +12 MB/s', stat: 'bandwidth', mode: 'add', amount: 12, cost: { money: 250 }, growth: 1.35, max: 20 }],
    },
    fiber: {
      name: 'Glasfaser',
      desc: 'Riesige Bandbreite für viele Rechner. Braucht Strom.',
      cost: { money: 120000 },
      growth: 1.6,
      stats: { bandwidth: 400, powerBase: 40 },
      upgrades: [{ id: 'bw', label: 'Bandbreite +35 %', stat: 'bandwidth', mode: 'mul', amount: 1.35, cost: { money: 60000 }, growth: 1.6, max: 20 }],
    },
    hdd: {
      name: 'Festplatte',
      desc: 'Puffert gestohlene Daten und gibt sie langsam weiter.',
      cost: { money: 80 },
      growth: 1.4,
      stats: { capacity: 500, throughput: 2 },
      upgrades: [
        { id: 'cap', label: 'Kapazität ×2', stat: 'capacity', mode: 'mul', amount: 2, cost: { money: 60 }, growth: 1.9, max: 10 },
        { id: 'tp', label: 'Durchsatz +50 %', stat: 'throughput', mode: 'mul', amount: 1.5, cost: { money: 50 }, growth: 1.7, max: 12 },
      ],
    },
    ssd: {
      name: 'SSD-Array',
      desc: 'Schneller und größer als jede Festplatte. Braucht etwas Strom.',
      cost: { money: 18000 },
      growth: 1.4,
      stats: { capacity: 25000, throughput: 60, powerBase: 15 },
      upgrades: [
        { id: 'cap', label: 'Kapazität ×2', stat: 'capacity', mode: 'mul', amount: 2, cost: { money: 12000 }, growth: 1.9, max: 12 },
        { id: 'tp', label: 'Durchsatz +50 %', stat: 'throughput', mode: 'mul', amount: 1.5, cost: { money: 9000 }, growth: 1.7, max: 14 },
      ],
    },
    datacenter: {
      name: 'Rechenzentrum',
      desc: 'Petabyte-Speicher mit enormem Durchsatz. Braucht viel Strom und Kühlung.',
      cost: { money: 2500000, crypto: 40 },
      growth: 1.5,
      stats: { capacity: 5e6, throughput: 5000, powerBase: 2500, heatBase: 40 },
      upgrades: [
        { id: 'cap', label: 'Kapazität ×2', stat: 'capacity', mode: 'mul', amount: 2, cost: { money: 1e6 }, growth: 1.9, max: 15 },
        { id: 'tp', label: 'Durchsatz +50 %', stat: 'throughput', mode: 'mul', amount: 1.5, cost: { money: 8e5 }, growth: 1.7, max: 15 },
      ],
    },
    market: {
      name: 'Darknet-Markt',
      desc: 'Verkauft eingehende Daten. Preis steigt mit deiner Reputation.',
      cost: { money: 150 },
      growth: 2.2,
      stats: { sellRate: 1, price: 1 },
      upgrades: [
        { id: 'rate', label: 'Käufer +40 %', stat: 'sellRate', mode: 'mul', amount: 1.4, cost: { money: 100 }, growth: 1.6, max: 30 },
        { id: 'price', label: 'Bessere Kontakte', stat: 'price', mode: 'add', amount: 0.2, cost: { money: 600 }, growth: 2.5, max: 10 },
      ],
    },
    miner: {
      name: 'Krypto-Miner',
      desc: 'Passives Krypto-Einkommen. Braucht Strom; GPUs erhöhen die Hashrate.',
      cost: { money: 40000 },
      growth: 1.5,
      stats: { hashrate: 10, powerBase: 250, heatBase: 15 },
      upgrades: [{ id: 'hash', label: 'ASIC-Chips +30 %', stat: 'hashrate', mode: 'mul', amount: 1.3, cost: { money: 25000 }, growth: 1.7, max: 20 }],
    },
    psu: {
      name: 'Netzteil',
      desc: 'Versorgt angeschlossene Hardware mit Strom. Überlast drosselt alle Verbraucher.',
      cost: { money: 250 },
      growth: 1.5,
      stats: { capacity: 300 },
      upgrades: [
        { id: 'cap', label: 'Leistung +20 %', stat: 'capacity', mode: 'mul', amount: 1.2, cost: { money: 180 }, growth: 1.45, max: 40 },
        { id: 'ups', label: 'USV-Puffer (Blackout-sicher)', stat: 'ups', mode: 'add', amount: 1, cost: { money: 2e6 }, growth: 1, max: 1 },
      ],
    },
    cooler: {
      name: 'Kühlung',
      desc: 'Wasserkühlung für angeschlossene Hardware. Braucht Strom.',
      cost: { money: 600 },
      growth: 1.5,
      stats: { capacity: 15, powerBase: 40 },
      upgrades: [{ id: 'cap', label: 'Radiator +25 %', stat: 'capacity', mode: 'mul', amount: 1.25, cost: { money: 400 }, growth: 1.5, max: 30 }],
    },
    vpn: {
      name: 'VPN',
      desc: 'Senkt den Trace-Zuwachs angeschlossener Rechner. Verkettbar.',
      cost: { money: 2500 },
      growth: 1.7,
      stats: { stealth: 0.25 },
      upgrades: [{ id: 'stealth', label: 'Verschlüsselung +4 %', stat: 'stealth', mode: 'add', amount: 0.04, cost: { money: 1500 }, growth: 1.8, max: 10 }],
    },
    proxy: {
      name: 'Proxy',
      desc: 'Zwischenstation einer Proxy-Kette. Jeder Hop senkt den Trace weiter.',
      cost: { money: 8000 },
      growth: 1.4,
      stats: { stealth: 0.15 },
      upgrades: [{ id: 'stealth', label: 'Hop-Tarnung +3 %', stat: 'stealth', mode: 'add', amount: 0.03, cost: { money: 5000 }, growth: 1.8, max: 10 }],
    },
    script: {
      name: 'Hack-Script',
      desc: 'Startet Hacks angeschlossener Rechner automatisch neu (Idle-Fortschritt).',
      cost: { money: 2000 },
      growth: 1.6,
      stats: { slots: 1, boost: 0 },
      upgrades: [
        { id: 'slots', label: 'Weitere Verbindung', stat: 'slots', mode: 'add', amount: 1, cost: { money: 3000 }, growth: 2.2, max: 9 },
        { id: 'boost', label: 'Optimierter Code +5 %', stat: 'boost', mode: 'add', amount: 0.05, cost: { money: 5000 }, growth: 1.9, max: 10 },
      ],
    },
    quantum: {
      name: 'Quanten-Rechner',
      desc: 'Endgame-Rechenmonster. Braucht extrem viel Strom und Kühlung.',
      cost: { money: 2e10, crypto: 4000 },
      growth: 1.8,
      stats: { cores: 32, clock: 40, ram: 131072, nic: 2000, buffer: 5e7, coolBuiltIn: 0, heatBase: 300, heatPerCore: 3, powerBase: 20000, powerPerCore: 200 },
      upgrades: [
        { id: 'cores', label: 'Qubits +32', stat: 'cores', mode: 'add', amount: 32, cost: { money: 5e9 }, growth: 1.3, max: 15 },
        { id: 'clock', label: 'Kohärenz +20 %', stat: 'clock', mode: 'mul', amount: 1.2, cost: { money: 1e10 }, growth: 1.7, max: 15 },
      ],
    },
    firewall: {
      name: 'Firewall',
      desc: 'Wehrt Angriffe rivalisierender Hacker ab. Wirkt auf das ganze Netzwerk.',
      cost: { money: 150000 },
      growth: 1.6,
      stats: { defense: 60, powerBase: 150, heatBase: 8 },
      upgrades: [{ id: 'def', label: 'Regelwerk +30 %', stat: 'defense', mode: 'mul', amount: 1.3, cost: { money: 80000 }, growth: 1.6, max: 30 }],
    },
    honeypot: {
      name: 'Honeypot',
      desc: 'Köder-System: braucht Daten als Köder, lockt Angreifer an, gibt Ruf und verfolgt Rivalen zurück.',
      cost: { money: 250000 },
      growth: 1.7,
      stats: { lure: 1, baitRate: 2, capacity: 2000, powerBase: 80 },
      upgrades: [
        { id: 'lure', label: 'Glaubwürdigkeit +1', stat: 'lure', mode: 'add', amount: 1, cost: { money: 200000 }, growth: 1.8, max: 10 },
        { id: 'cap', label: 'Köderspeicher ×2', stat: 'capacity', mode: 'mul', amount: 2, cost: { money: 100000 }, growth: 1.8, max: 10 },
      ],
    },
    botnet: {
      name: 'Botnetz',
      desc: 'Infizierte Geräte als Rechenquelle. Wächst durch Hacks auf Webcams und Smart-Homes, verliert aber laufend Geräte.',
      cost: { money: 8000 },
      growth: 1.6,
      stats: { capacity: 400, opsPerDevice: 0.05, spread: 1, decay: 0.002, slots: 2 },
      upgrades: [
        { id: 'cap', label: 'C&C-Server ×2', stat: 'capacity', mode: 'mul', amount: 2, cost: { money: 5000 }, growth: 1.9, max: 20 },
        { id: 'ops', label: 'Payload +30 %', stat: 'opsPerDevice', mode: 'mul', amount: 1.3, cost: { money: 8000 }, growth: 1.8, max: 20 },
        { id: 'spread', label: 'Wurm-Ausbreitung +25 %', stat: 'spread', mode: 'mul', amount: 1.25, cost: { money: 6000 }, growth: 1.7, max: 15 },
        { id: 'slots', label: 'Weitere Verbindung', stat: 'slots', mode: 'add', amount: 1, cost: { money: 20000 }, growth: 2.5, max: 6 },
      ],
    },
    malware: {
      name: 'Malware-Labor',
      desc: 'Stellt Exploits aus Daten und Rechenleistung her. GPUs beschleunigen die Entwicklung.',
      cost: { money: 300000 },
      growth: 1.8,
      stats: { ops: 60, capacity: 20000, powerBase: 300, heatBase: 10 },
      upgrades: [
        { id: 'ops', label: 'Entwickler-Team +40 %', stat: 'ops', mode: 'mul', amount: 1.4, cost: { money: 100000 }, growth: 1.6, max: 30 },
        { id: 'cap', label: 'Datenspeicher ×2', stat: 'capacity', mode: 'mul', amount: 2, cost: { money: 50000 }, growth: 1.7, max: 20 },
      ],
    },
  } as Partial<Record<NodeTypeId, NodeConfig>>,

  targets: [
    { id: 'webcam', name: 'Webcam', desc: 'Ungesicherte IP-Kamera mit Standardpasswort.', security: 4, ram: 1, money: 4, data: 1.5, rep: 0.25, trace: 0.5, reqRep: 0, gpuFactor: 0.1, family: 'iot', botnet: 2 },
    { id: 'smarthome', name: 'Smart-Home-Hub', desc: 'Vernetzter Kühlschrank inklusive.', security: 14, ram: 2, money: 18, data: 7, rep: 0.6, trace: 0.9, reqRep: 2, gpuFactor: 0.1, family: 'iot', botnet: 5 },
    { id: 'webshop', name: 'Kleiner Webshop', desc: 'Veraltetes CMS, Kundendaten unverschlüsselt.', security: 60, ram: 4, money: 90, data: 35, rep: 1.5, trace: 1.6, reqRep: 10, gpuFactor: 0.2, family: 'web' },
    { id: 'uni', name: 'Uni-Netzwerk', desc: 'Tausende Studierenden-Accounts, ein Admin.', security: 260, ram: 8, money: 450, data: 180, rep: 4, trace: 2.5, reqRep: 40, gpuFactor: 0.2, family: 'web' },
    { id: 'firma', name: 'Firmenserver', desc: 'Mittelständler mit Excel-Passwortliste.', security: 1300, ram: 16, money: 2600, data: 1000, rep: 12, trace: 4, reqRep: 150, gpuFactor: 0.3, family: 'corp' },
    { id: 'boerse', name: 'Krypto-Börse', desc: 'Hot-Wallets mit schwachen Schlüsseln.', security: 6000, ram: 32, money: 9000, data: 3500, rep: 30, trace: 6, crypto: 0.5, reqRep: 450, gpuFactor: 1.2, family: 'finance' },
    { id: 'bank', name: 'Privatbank', desc: 'Mehrstufige Firewall, aber altes Mainframe.', security: 30000, ram: 64, money: 75000, data: 30000, rep: 80, trace: 9, reqRep: 1500, gpuFactor: 0.8, family: 'finance' },
    { id: 'mobilfunk', name: 'Mobilfunk-Netz', desc: 'Millionen SIM-Karten, ein vergessener Testzugang.', security: 70000, ram: 96, money: 230000, data: 70000, rep: 130, trace: 10, reqRep: 3200, gpuFactor: 0.6, family: 'corp' },
    { id: 'cloud', name: 'Konzern-Cloud', desc: 'Falsch konfigurierte Buckets voller Geheimnisse.', security: 150000, ram: 128, money: 4.5e5, data: 1.8e5, rep: 220, trace: 12, crypto: 1, reqRep: 6000, gpuFactor: 0.5, family: 'corp' },
    { id: 'logistik', name: 'Logistik-Konzern', desc: 'Lieferketten-Software aus den 90ern.', security: 380000, ram: 256, money: 1.25e6, data: 4.5e5, rep: 380, trace: 14, crypto: 2, reqRep: 12000, gpuFactor: 0.5, family: 'corp' },
    { id: 'gov', name: 'Regierungsnetz', desc: 'Klassifizierte Dokumente. Extrem riskant.', security: 900000, ram: 512, money: 3.2e6, data: 1.3e6, rep: 650, trace: 18, crypto: 5, reqRep: 25000, gpuFactor: 0.6, family: 'gov' },
    { id: 'geheimdienst', name: 'Geheimdienst-Relais', desc: 'Abhörstation mit erstaunlich schlechter Wartung.', security: 2.4e6, ram: 1024, money: 9e6, data: 3.5e6, rep: 1100, trace: 21, crypto: 12, reqRep: 50000, gpuFactor: 0.6, family: 'gov' },
    { id: 'sat', name: 'Militär-Satellit', desc: 'Der heilige Gral. Jede Sekunde zählt.', security: 6e6, ram: 2048, money: 2.4e7, data: 1e7, rep: 2000, trace: 25, crypto: 30, reqRep: 100000, gpuFactor: 0.7, family: 'gov' },
    { id: 'stromnetz', name: 'Stromnetz-Leitstelle', desc: 'Löst bei Erfolg einen Stromausfall aus – Netzteile ohne USV fallen kurz aus.', security: 3e7, ram: 2048, money: 1.4e8, data: 5e7, rep: 5500, trace: 30, crypto: 80, reqRep: 250000, gpuFactor: 0.6, family: 'gov', effect: 'blackout' },
    { id: 'zentralbank', name: 'Zentralbank', desc: 'Gelddruckmaschine mit extrem wachsamen Ermittlern.', security: 1.5e8, ram: 4096, money: 1e9, data: 2e8, rep: 14000, trace: 70, crypto: 200, reqRep: 700000, gpuFactor: 0.9, family: 'finance' },
    { id: 'kilabor', name: 'KI-Forschungslabor', desc: 'Trainierte Modelle als Beute – Grundlage für KI-Forschung.', security: 3e8, ram: 8192, money: 2.5e9, data: 8e8, rep: 35000, trace: 35, models: 5, reqRep: 1.8e6, gpuFactor: 1, family: 'ai' },
    { id: 'raumstation', name: 'Orbitale Raumstation', desc: 'Steuerung über ein Uplink-Fenster pro Orbit.', security: 3e9, ram: 32768, money: 1.5e10, data: 4e9, rep: 90000, trace: 40, crypto: 1500, models: 10, reqRep: 5e6, gpuFactor: 0.7, family: 'gov' },
    {
      id: 'kern',
      name: 'Der Kern',
      desc: 'Das Herz des Internets. Drei Phasen: Rechenleistung, GPU-Cracking, Bandbreite.',
      security: 4e10,
      ram: 65536,
      money: 1e12,
      data: 0,
      rep: 1e6,
      trace: 50,
      crypto: 50000,
      models: 100,
      reqRep: 1.2e7,
      reqIdentities: 3,
      reqResearch: 'coreaccess',
      gpuFactor: 0,
      family: 'core',
      phases: [
        { name: 'Firewall-Matrix durchbrechen', resource: 'ops', amount: 4e10 },
        { name: 'Master-Schlüssel knacken', resource: 'gpu', amount: 2e8 },
        { name: 'Kern-Daten exfiltrieren', resource: 'bandwidth', amount: 2e8 },
      ],
    },
    { id: 'rival', name: 'Rivalen-Netz', desc: 'Die Gruppe, die dich angreift. Geortet durch deine Honeypots.', security: 4e5, ram: 128, money: 3e6, data: 1e6, rep: 3000, trace: 15, crypto: 40, reqRep: 0, gpuFactor: 0.5, family: 'corp', rival: true },
  ] as TargetConfig[],

  research: [
    { id: 'darknet', tier: 0, name: 'Darknet-Zugang', desc: 'Festplatten und Darknet-Markt: Daten speichern und verkaufen.', cost: { money: 60 }, requires: [], unlocks: ['hdd', 'market'] },
    { id: 'net', tier: 1, name: 'Netzwerktechnik', desc: 'Router für mehr Bandbreite.', cost: { money: 300 }, requires: ['darknet'], unlocks: ['router'] },
    { id: 'power', tier: 1, name: 'Stromtechnik', desc: 'Netzteile und Gaming-PCs.', cost: { money: 900 }, requires: ['darknet'], unlocks: ['psu', 'pc'] },
    { id: 'thermo', tier: 2, name: 'Thermodynamik', desc: 'Kühlung gegen überhitzte Hardware.', cost: { money: 1200 }, requires: ['power'], unlocks: ['cooler'] },
    { id: 'anon', tier: 2, name: 'Anonymität', desc: 'VPNs senken den Trace-Zuwachs.', cost: { money: 1500 }, requires: ['net'], unlocks: ['vpn'] },
    { id: 'auto', tier: 2, name: 'Automatisierung', desc: 'Hack-Scripts hacken Ziele automatisch.', cost: { money: 1800 }, requires: ['net'], unlocks: ['script'] },
    { id: 'exploit1', tier: 3, name: 'Exploit-Kits', desc: 'Hack-Geschwindigkeit +25 %.', cost: { money: 4000 }, requires: ['auto'], mods: { hackSpeed: 1.25 } },
    { id: 'proxy', tier: 3, name: 'Proxy-Ketten', desc: 'Proxys zum Verketten hinter VPNs.', cost: { money: 9000 }, requires: ['anon'], unlocks: ['proxy'] },
    { id: 'gpu', tier: 3, name: 'GPU-Cracking', desc: 'GPUs beschleunigen Passwort-Angriffe.', cost: { money: 15000 }, requires: ['thermo'], unlocks: ['gpu'] },
    { id: 'ssd', tier: 3, name: 'SSD-Technologie', desc: 'Schnelle SSD-Arrays.', cost: { money: 20000 }, requires: ['net', 'power'], unlocks: ['ssd'] },
    { id: 'social', tier: 4, name: 'Social Engineering', desc: 'Reputation +50 %.', cost: { money: 30000 }, requires: ['exploit1'], mods: { rep: 1.5 } },
    { id: 'mining', tier: 4, name: 'Krypto-Mining', desc: 'Krypto-Miner für passives ₿-Einkommen.', cost: { money: 35000 }, requires: ['gpu'], unlocks: ['miner'] },
    { id: 'compress', tier: 4, name: 'Datenkompression', desc: 'Datenwert +50 %.', cost: { money: 50000 }, requires: ['ssd'], mods: { dataValue: 1.5 } },
    { id: 'cleaner', tier: 4, name: 'Spurenverwischung', desc: 'Trace sinkt 0.4 %/s schneller.', cost: { money: 75000 }, requires: ['proxy'], mods: { traceDecay: 0.4 } },
    { id: 'fiber', tier: 5, name: 'Glasfaser', desc: 'Glasfaser-Anschluss mit riesiger Bandbreite.', cost: { money: 150000 }, requires: ['ssd'], unlocks: ['fiber'] },
    { id: 'server', tier: 5, name: 'Server-Hardware', desc: 'Server-Racks mit vielen Kernen.', cost: { money: 400000, crypto: 10 }, requires: ['mining', 'fiber'], unlocks: ['server'] },
    { id: 'exploit2', tier: 6, name: 'Zero-Day-Archiv', desc: 'Hack-Geschwindigkeit +50 %.', cost: { money: 1.5e6, crypto: 25 }, requires: ['exploit1', 'server'], mods: { hackSpeed: 1.5 } },
    { id: 'ghost', tier: 6, name: 'Ghost-Protokoll', desc: 'Trace-Zuwachs −30 %.', cost: { money: 3e6, crypto: 60 }, requires: ['cleaner', 'server'], mods: { traceGain: 0.7 } },
    { id: 'dc', tier: 6, name: 'Rechenzentrum', desc: 'Eigene Rechenzentren für Petabytes.', cost: { money: 5e6, crypto: 80 }, requires: ['server'], unlocks: ['datacenter'] },
    { id: 'launder', tier: 7, name: 'Geldwäsche-Netz', desc: 'Alle Geld-Erträge +100 %.', cost: { money: 2e7, crypto: 150 }, requires: ['dc', 'compress'], mods: { money: 2 } },
    { id: 'ai', tier: 7, name: 'KI-Exploits', desc: 'Hack-Geschwindigkeit ×2.', cost: { money: 5e7, crypto: 300 }, requires: ['exploit2', 'dc'], mods: { hackSpeed: 2 } },
    { id: 'quantum', tier: 8, name: 'Quanten-Cracking', desc: 'Hack-Geschwindigkeit ×3, Krypto ×2.', cost: { money: 1e9, crypto: 2000 }, requires: ['ai', 'launder'], mods: { hackSpeed: 3, crypto: 2 } },
    { id: 'botnet', tier: 3, name: 'Botnetze', desc: 'Infizierte Geräte als Rechenquelle.', cost: { money: 6000 }, requires: ['auto'], unlocks: ['botnet'] },
    { id: 'firewall', tier: 5, name: 'Firewall-Technik', desc: 'Firewalls gegen Rivalen-Angriffe.', cost: { money: 120000 }, requires: ['proxy'], unlocks: ['firewall'] },
    { id: 'malware', tier: 5, name: 'Malware-Labor', desc: 'Eigene Exploits herstellen.', cost: { money: 250000 }, requires: ['exploit1', 'ssd'], unlocks: ['malware'] },
    { id: 'honeypot', tier: 6, name: 'Honeypots', desc: 'Köder-Systeme: Ruf und Rückverfolgung von Rivalen.', cost: { money: 400000 }, requires: ['firewall'], unlocks: ['honeypot'] },
    { id: 'qcomputer', tier: 9, name: 'Quanten-Hardware', desc: 'Eigene Quanten-Rechner.', cost: { money: 5e9, crypto: 3000 }, requires: ['quantum'], unlocks: ['quantum'] },
    { id: 'aiassist', tier: 9, name: 'KI-Assistent', desc: 'KI-Modelle geben Hack-Speed (wächst mit dem Bestand), Trace sinkt 1 %/s schneller, Exploits ×2.', cost: { money: 2e9, models: 3 }, requires: ['quantum'], mods: { craft: 2, traceDecay: 1 } },
    { id: 'neural', tier: 10, name: 'Neuronale Exploits', desc: 'Hack-Geschwindigkeit ×2, Exploit-Herstellung ×2.', cost: { money: 5e10, models: 15 }, requires: ['aiassist'], mods: { hackSpeed: 2, craft: 2 } },
    { id: 'coreaccess', tier: 11, name: 'Kern-Protokolle', desc: 'Macht „Der Kern“ angreifbar (ab 3 Identitätswechseln).', cost: { money: 2e11, crypto: 20000, models: 40 }, requires: ['qcomputer', 'neural'] },
  ] as ResearchConfig[],

  perks: [
    { id: 'startcash', name: 'Schwarzgeld-Reserve', desc: 'Startkapital nach neuer Identität: 1K € × 5^(Stufe−1).', cost: 1, growth: 2, max: 6 },
    { id: 'contacts', name: 'Alte Kontakte', desc: 'Freelance-Job ×3 pro Stufe.', cost: 1, growth: 1.8, max: 5 },
    { id: 'ghost', name: 'Geisterhafte Spuren', desc: 'Trace-Zuwachs −10 % pro Stufe.', cost: 3, growth: 1.6, max: 5 },
    { id: 'startrep', name: 'Ruf eilt voraus', desc: 'Start-Reputation: 50 × 4^(Stufe−1).', cost: 3, growth: 2, max: 5 },
    { id: 'nightshift', name: 'Nachtschicht', desc: 'Offline-Fortschritt +4 h pro Stufe.', cost: 4, growth: 1.7, max: 4 },
    { id: 'memory', name: 'Altes Wissen', desc: 'Forschung bleibt bei neuer Identität erhalten.', cost: 15, growth: 1, max: 1 },
  ] as PerkConfig[],

  achievements: [
    { id: 'firsthack', name: 'Erster Hack', desc: 'Einen Hack abschließen.', kind: 'hacks', amount: 1 },
    { id: 'hacks1k', name: 'Fließbandarbeit', desc: '1.000 Hacks. Bonus: Geld +2 %.', kind: 'hacks', amount: 1000, mods: { money: 1.02 } },
    { id: 'hacks100k', name: 'Maschine', desc: '100.000 Hacks. Bonus: Hack-Speed +5 %.', kind: 'hacks', amount: 100000, mods: { hackSpeed: 1.05 } },
    { id: 'raid1', name: 'Erwischt', desc: 'Die erste Razzia überleben.', kind: 'raids', amount: 1 },
    { id: 'raids100', name: '100 Razzien überlebt', desc: 'Bonus: Trace-Zuwachs −5 %.', kind: 'raids', amount: 100, mods: { traceGain: 0.95 } },
    { id: 'million', name: 'Millionär', desc: '1 Mio. € verdienen (gesamt).', kind: 'money', amount: 1e6 },
    { id: 'billion', name: 'Milliardär', desc: '1 Mrd. € verdienen. Bonus: Geld +5 %.', kind: 'money', amount: 1e9, mods: { money: 1.05 } },
    { id: 'trillion', name: 'Billionär', desc: '1 Bio. € verdienen. Bonus: Geld +10 %.', kind: 'money', amount: 1e12, mods: { money: 1.1 } },
    { id: 'identity1', name: 'Neues Gesicht', desc: 'Die erste neue Identität annehmen.', kind: 'identities', amount: 1 },
    { id: 'identity3', name: 'Schattenexistenz', desc: '3 Identitätswechsel. Bonus: Tokens +5 %.', kind: 'identities', amount: 3, mods: { tokens: 1.05 } },
    { id: 'collective', name: 'Wir sind viele', desc: 'Ein Kollektiv gründen.', kind: 'collective', amount: 1 },
    { id: 'research', name: 'Allwissend', desc: 'Alle Forschungen in einem Lauf abschließen.', kind: 'research', amount: 0 },
    { id: 'defend10', name: 'Bollwerk', desc: '10 Rivalen-Angriffe abwehren. Bonus: Abwehr +10 %.', kind: 'repelled', amount: 10, mods: { defense: 1.1 } },
    { id: 'rival1', name: 'Jäger', desc: 'Einen Rivalen zurückhacken. Bonus: Ruf +5 %.', kind: 'rivals', amount: 1, mods: { rep: 1.05 } },
    { id: 'contracts10', name: 'Auftragshacker', desc: '10 Aufträge erfüllen. Bonus: Geld +3 %.', kind: 'contracts', amount: 10, mods: { money: 1.03 } },
    { id: 'exploits50', name: 'Waffenschmied', desc: '50 Exploits herstellen. Bonus: Herstellung +10 %.', kind: 'exploits', amount: 50, mods: { craft: 1.1 } },
    { id: 'botnet1k', name: 'Zombie-Armee', desc: '1.000 Geräte in einem Botnetz. Bonus: Botnetz-Wachstum +10 %.', kind: 'devices', amount: 1000, mods: { botnet: 1.1 } },
    { id: 'minigame10', name: 'Tastenvirtuose', desc: '10 Terminal-Minispiele gewinnen. Bonus: Hack-Speed +3 %.', kind: 'minigames', amount: 10, mods: { hackSpeed: 1.03 } },
    { id: 'trader', name: 'Händler', desc: '100 ₿ verkaufen.', kind: 'cryptoSold', amount: 100 },
    { id: 'sat', name: 'Orbit erreicht', desc: 'Den Militär-Satelliten hacken.', kind: 'target', amount: 1, targetId: 'sat' },
    { id: 'zentralbank', name: 'Geld drucken', desc: 'Die Zentralbank hacken.', kind: 'target', amount: 1, targetId: 'zentralbank' },
    { id: 'core', name: 'Den Kern geknackt', desc: 'Alle drei Phasen des Kerns abschließen. Bonus: Geld +25 %.', kind: 'core', amount: 1, mods: { money: 1.25 } },
    { id: 'marathon', name: 'Dauerbrenner', desc: '24 Stunden Spielzeit.', kind: 'playTime', amount: 86400 },
  ] as AchievementConfig[],
};
