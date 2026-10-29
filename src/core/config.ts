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
}

export type ModifierKey = 'hackSpeed' | 'money' | 'dataValue' | 'crypto' | 'rep' | 'click' | 'traceGain' | 'traceDecay';

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
  },

  offline: {
    maxHours: 8,
    minSeconds: 30,
    /** Max. Simulationsschritte für die Nachberechnung (Schrittweite passt sich an). */
    maxSteps: 20000,
    /** Bei false bleibt der Trace offline unter 100 % (keine Razzia im Schlaf). */
    allowRaids: false,
  },

  prestige: {
    /** Mindestverdienst im aktuellen Lauf für 1 Token. */
    minMoney: 1e7,
    /** Tokens = floor(factor * sqrt(runMoney / minMoney)) */
    factor: 1,
    moneyPerToken: 0.1,
    speedPerToken: 0.05,
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
      upgrades: [{ id: 'cap', label: 'Leistung +20 %', stat: 'capacity', mode: 'mul', amount: 1.2, cost: { money: 180 }, growth: 1.45, max: 40 }],
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
  } as Partial<Record<NodeTypeId, NodeConfig>>,

  targets: [
    { id: 'webcam', name: 'Webcam', desc: 'Ungesicherte IP-Kamera mit Standardpasswort.', security: 4, ram: 1, money: 4, data: 1.5, rep: 0.25, trace: 0.5, reqRep: 0, gpuFactor: 0.1 },
    { id: 'smarthome', name: 'Smart-Home-Hub', desc: 'Vernetzter Kühlschrank inklusive.', security: 14, ram: 2, money: 18, data: 7, rep: 0.6, trace: 0.9, reqRep: 2, gpuFactor: 0.1 },
    { id: 'webshop', name: 'Kleiner Webshop', desc: 'Veraltetes CMS, Kundendaten unverschlüsselt.', security: 60, ram: 4, money: 90, data: 35, rep: 1.5, trace: 1.6, reqRep: 10, gpuFactor: 0.2 },
    { id: 'uni', name: 'Uni-Netzwerk', desc: 'Tausende Studierenden-Accounts, ein Admin.', security: 260, ram: 8, money: 450, data: 180, rep: 4, trace: 2.5, reqRep: 40, gpuFactor: 0.2 },
    { id: 'firma', name: 'Firmenserver', desc: 'Mittelständler mit Excel-Passwortliste.', security: 1300, ram: 16, money: 2600, data: 1000, rep: 12, trace: 4, reqRep: 150, gpuFactor: 0.3 },
    { id: 'boerse', name: 'Krypto-Börse', desc: 'Hot-Wallets mit schwachen Schlüsseln.', security: 6000, ram: 32, money: 9000, data: 3500, rep: 30, trace: 6, crypto: 0.5, reqRep: 450, gpuFactor: 1.2 },
    { id: 'bank', name: 'Privatbank', desc: 'Mehrstufige Firewall, aber altes Mainframe.', security: 30000, ram: 64, money: 75000, data: 30000, rep: 80, trace: 9, reqRep: 1500, gpuFactor: 0.8 },
    { id: 'cloud', name: 'Konzern-Cloud', desc: 'Falsch konfigurierte Buckets voller Geheimnisse.', security: 150000, ram: 128, money: 4.5e5, data: 1.8e5, rep: 220, trace: 12, crypto: 1, reqRep: 6000, gpuFactor: 0.5 },
    { id: 'gov', name: 'Regierungsnetz', desc: 'Klassifizierte Dokumente. Extrem riskant.', security: 900000, ram: 512, money: 3.2e6, data: 1.3e6, rep: 650, trace: 18, crypto: 5, reqRep: 25000, gpuFactor: 0.6 },
    { id: 'sat', name: 'Militär-Satellit', desc: 'Der heilige Gral. Jede Sekunde zählt.', security: 6e6, ram: 2048, money: 2.4e7, data: 1e7, rep: 2000, trace: 25, crypto: 30, reqRep: 100000, gpuFactor: 0.7 },
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
  ] as ResearchConfig[],

  perks: [
    { id: 'startcash', name: 'Schwarzgeld-Reserve', desc: 'Startkapital nach neuer Identität: 1K € × 5^(Stufe−1).', cost: 1, growth: 2, max: 6 },
    { id: 'contacts', name: 'Alte Kontakte', desc: 'Freelance-Job ×3 pro Stufe.', cost: 1, growth: 1.8, max: 5 },
    { id: 'ghost', name: 'Geisterhafte Spuren', desc: 'Trace-Zuwachs −10 % pro Stufe.', cost: 3, growth: 1.6, max: 5 },
    { id: 'startrep', name: 'Ruf eilt voraus', desc: 'Start-Reputation: 50 × 4^(Stufe−1).', cost: 3, growth: 2, max: 5 },
    { id: 'nightshift', name: 'Nachtschicht', desc: 'Offline-Fortschritt +4 h pro Stufe.', cost: 4, growth: 1.7, max: 4 },
    { id: 'memory', name: 'Altes Wissen', desc: 'Forschung bleibt bei neuer Identität erhalten.', cost: 15, growth: 1, max: 1 },
  ] as PerkConfig[],
};
