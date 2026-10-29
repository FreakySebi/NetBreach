/**
 * ZENTRALE BALANCING-DATEI
 * Alle Preise, Wachstumsfaktoren, Hack-Zeiten und Erträge stehen hier.
 * Einheiten: Geld in €, Daten in MB, Rechenleistung in OPS (Security-Punkte pro Sekunde),
 * Strom in W, Kühlung in Wärme-Einheiten (WE).
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
  trace: number; // Trace-Zuwachs in % pro Hack
  crypto?: number;
  reqRep: number;
  /** Wie stark GPUs bei diesem Ziel helfen (Passwort-Cracking). */
  gpuFactor: number;
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

  nodes: {
    job: {
      name: 'Freelance-Job',
      desc: 'Kleine IT-Aufträge. Klick = etwas Geld.',
      cost: {},
      growth: 1,
      startUnlocked: true,
      stats: { reward: 2 },
      upgrades: [
        { id: 'contracts', label: 'Bessere Aufträge', stat: 'reward', mode: 'mul', amount: 1.6, cost: { money: 20 }, growth: 2.2, max: 12 },
      ],
    },
    laptop: {
      name: 'Laptop',
      desc: 'Dein erster Rechner. Läuft auf Akku, schwache Kühlung.',
      cost: { money: 25 },
      growth: 1.8,
      startUnlocked: true,
      stats: { cores: 1, clock: 1, ram: 2, nic: 1, buffer: 64, coolBuiltIn: 6, heatBase: 0, heatPerCore: 1, powerBase: 0, powerPerCore: 0 },
      upgrades: [
        { id: 'cores', label: 'CPU-Kern', stat: 'cores', mode: 'add', amount: 1, cost: { money: 12 }, growth: G, max: 11 },
        { id: 'ram', label: 'RAM ×2', stat: 'ram', mode: 'mul', amount: 2, cost: { money: 60 }, growth: 3, max: 4 },
      ],
    },
  } as Partial<Record<NodeTypeId, NodeConfig>>,

  targets: [
    { id: 'webcam', name: 'Webcam', desc: 'Ungesicherte IP-Kamera mit Standardpasswort.', security: 4, ram: 1, money: 2.5, data: 1, rep: 0.25, trace: 0.5, reqRep: 0, gpuFactor: 0.1 },
    { id: 'smarthome', name: 'Smart-Home-Hub', desc: 'Vernetzter Kühlschrank inklusive.', security: 14, ram: 2, money: 9, data: 4, rep: 0.6, trace: 0.9, reqRep: 2, gpuFactor: 0.1 },
    { id: 'webshop', name: 'Kleiner Webshop', desc: 'Veraltetes CMS, Kundendaten unverschlüsselt.', security: 60, ram: 4, money: 35, data: 20, rep: 1.5, trace: 1.6, reqRep: 10, gpuFactor: 0.2 },
  ] as TargetConfig[],
};

export type NodeConfigMap = typeof CONFIG.nodes;
