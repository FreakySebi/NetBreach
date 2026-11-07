import { CONFIG, type ModifierKey } from './config';
import type { GameState, LifetimeStats } from './types';

export const SAVE_VERSION = 2;

export function emptyLifetimeStats(): LifetimeStats {
  return {
    hacks: 0,
    clicks: 0,
    raids: 0,
    playTime: 0,
    dataSold: 0,
    contracts: 0,
    repelled: 0,
    attacks: 0,
    exploits: 0,
    minigames: 0,
    coreCracks: 0,
    cryptoSold: 0,
    maxDevices: 0,
    rivalsBeaten: 0,
    targets: {},
  };
}

export function createInitialState(): GameState {
  return {
    version: SAVE_VERSION,
    money: 0,
    crypto: 0,
    models: 0,
    reputation: 0,
    trace: 0,
    raidTimer: 0,
    blackout: 0,
    nodes: [{ id: 1, type: 'job', x: -110, y: -60, levels: {}, buffer: 0 }],
    connections: [],
    nextId: 2,
    research: [],
    prestige: { tokens: 0, tokensTotal: 0, identities: 0, perks: {} },
    collective: { shares: 0, sharesTotal: 0, founded: 0, upgrades: {} },
    run: { money: 0, data: 0, crypto: 0, hacks: 0, clicks: 0, raids: 0, playTime: 0 },
    stats: emptyLifetimeStats(),
    achievements: [],
    allTimeMoney: 0,
    exploits: {},
    exploitAuto: {},
    market: { price: CONFIG.cryptoMarket.basePrice, history: [], sampleIn: 0 },
    contracts: { offers: [], nextIn: CONFIG.contracts.firstDelay, nextId: 1 },
    worldEvents: { active: [], nextIn: CONFIG.worldEvents.firstDelay, news: [] },
    rival: { nextIn: CONFIG.rivals.firstDelay, warning: null, track: 0, located: false, level: 0 },
    rng: (Math.random() * 2 ** 32) >>> 0,
    savedAt: Date.now(),
    camera: { x: 0, y: 0, zoom: 1 },
  };
}

/** Globale Multiplikatoren aus Forschung, Prestige, Kollektiv, Erfolgen und Ereignissen. */
export type Modifiers = Record<ModifierKey, number>;

const ADDITIVE: ModifierKey[] = ['traceDecay'];

function baseModifiers(): Modifiers {
  return {
    hackSpeed: 1,
    money: 1,
    dataValue: 1,
    crypto: 1,
    rep: 1,
    click: 1,
    traceGain: 1,
    traceDecay: 0,
    models: 1,
    botnet: 1,
    craft: 1,
    nodeCost: 1,
    defense: 1,
    tokens: 1,
  };
}

function apply(m: Modifiers, mods: Partial<Record<ModifierKey, number>> | undefined, times = 1): void {
  if (!mods || times <= 0) return;
  for (const [k, v] of Object.entries(mods) as [ModifierKey, number][]) {
    if (ADDITIVE.includes(k)) m[k] += v * times;
    else m[k] *= Math.pow(v, times);
  }
}

export function perkLevel(state: GameState, id: string): number {
  return state.prestige.perks[id] ?? 0;
}

export function collectiveLevel(state: GameState, id: string): number {
  return state.collective.upgrades[id] ?? 0;
}

// Modifikatoren werden pro Tick oft gebraucht → nach Inhalt cachen.
let cacheKey = '';
let cacheValue: Modifiers | null = null;

export function getModifiers(state: GameState): Modifiers {
  const key = [
    state.research.join(','),
    state.prestige.tokensTotal,
    JSON.stringify(state.prestige.perks),
    JSON.stringify(state.collective.upgrades),
    state.achievements.length,
    state.worldEvents.active.map((e) => e.id).join(','),
    Math.floor(Math.log2(1 + state.models)),
  ].join('|');
  if (cacheValue && key === cacheKey) return cacheValue;
  const m = baseModifiers();
  for (const id of state.research) apply(m, CONFIG.research.find((x) => x.id === id)?.mods);
  for (const id of state.achievements) apply(m, CONFIG.achievements.find((x) => x.id === id)?.mods);
  for (const u of CONFIG.collective.upgrades) apply(m, u.mods, collectiveLevel(state, u.id));
  for (const e of state.worldEvents.active) apply(m, CONFIG.worldEvents.types.find((x) => x.id === e.id)?.mods);
  const p = CONFIG.prestige;
  const tokens = state.prestige.tokensTotal;
  m.money *= 1 + tokens * p.moneyPerToken;
  m.crypto *= 1 + tokens * p.moneyPerToken;
  m.hackSpeed *= 1 + tokens * p.speedPerToken;
  m.click *= Math.pow(3, perkLevel(state, 'contacts')) * (1 + tokens * p.moneyPerToken);
  m.traceGain *= Math.pow(0.9, perkLevel(state, 'ghost'));
  // KI-Modelle: Bonus wächst logarithmisch mit dem Bestand, sobald „KI-Assistent“ erforscht ist
  if (state.research.includes(CONFIG.models.bonusResearch)) {
    m.hackSpeed *= 1 + Math.log2(1 + state.models) * CONFIG.models.speedPerLog2;
  }
  cacheKey = key;
  cacheValue = m;
  return m;
}

/** Ghost-Tokens, die eine neue Identität jetzt bringen würde. */
export function pendingTokens(state: GameState): number {
  const p = CONFIG.prestige;
  if (state.run.money < p.minMoney) return 0;
  return Math.floor(p.factor * Math.sqrt(state.run.money / p.minMoney) * getModifiers(state).tokens);
}

export function offlineCapSeconds(state: GameState): number {
  return (CONFIG.offline.maxHours + 4 * perkLevel(state, 'nightshift')) * 3600;
}

/** Felder, die jeder Reset (Identität oder Kollektiv) übernimmt. */
function carryOver(state: GameState, fresh: GameState): void {
  fresh.allTimeMoney = state.allTimeMoney;
  fresh.stats = { ...state.stats, targets: { ...state.stats.targets } };
  fresh.achievements = [...state.achievements];
  fresh.collective = { ...state.collective, upgrades: { ...state.collective.upgrades } };
  fresh.exploitAuto = { ...state.exploitAuto };
  fresh.market = { ...state.market, history: [...state.market.history] };
  fresh.rival = { ...fresh.rival, level: state.rival.level };
  fresh.rng = state.rng;
}

/** Start-Boni aus Perks und Kollektiv auf einen frischen Lauf anwenden. */
function applyStartBonuses(fresh: GameState, research: string[]): void {
  const cash = perkLevel(fresh, 'startcash');
  if (cash > 0) fresh.money = 1000 * Math.pow(5, cash - 1);
  const rep = perkLevel(fresh, 'startrep');
  if (rep > 0) fresh.reputation = 50 * Math.pow(4, rep - 1);
  if (perkLevel(fresh, 'memory') > 0 || collectiveLevel(fresh, 'archive') > 0) fresh.research = [...research];
  const startEx = collectiveLevel(fresh, 'broker') * CONFIG.collective.brokerExploits;
  if (startEx > 0) for (const f of CONFIG.exploits.families) fresh.exploits[f.id] = startEx;
}

/** Neue Identität: Lauf zurücksetzen, Prestige behalten. */
export function prestigeReset(state: GameState): GameState {
  const fresh = createInitialState();
  const gained = pendingTokens(state);
  carryOver(state, fresh);
  fresh.prestige = {
    ...state.prestige,
    perks: { ...state.prestige.perks },
    tokens: state.prestige.tokens + gained,
    tokensTotal: state.prestige.tokensTotal + gained,
    identities: state.prestige.identities + 1,
  };
  applyStartBonuses(fresh, state.research);
  return fresh;
}

/** Kollektiv-Anteile, die eine Gründung jetzt bringen würde. */
export function pendingShares(state: GameState): number {
  const c = CONFIG.collective;
  if (state.prestige.identities < c.minIdentities || state.prestige.tokensTotal < c.minTokens) return 0;
  return Math.floor(Math.sqrt(state.prestige.tokensTotal / c.minTokens) * c.factor);
}

/** Kollektiv gründen: setzt auch Tokens und Perks zurück, gibt Anteile. */
export function collectiveReset(state: GameState): GameState {
  const fresh = createInitialState();
  const gained = pendingShares(state);
  carryOver(state, fresh);
  fresh.prestige = { tokens: 0, tokensTotal: 0, identities: state.prestige.identities, perks: {} };
  fresh.collective.shares += gained;
  fresh.collective.sharesTotal += gained;
  fresh.collective.founded += 1;
  applyStartBonuses(fresh, state.research);
  return fresh;
}
