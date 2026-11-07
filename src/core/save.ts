import { CONFIG } from './config';
import { createInitialState, SAVE_VERSION } from './state';
import type { GameState } from './types';

export function serialize(state: GameState): string {
  return JSON.stringify(state);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Füllt fehlende Felder rekursiv mit Standardwerten auf (Arrays und Werte aus dem Spielstand gewinnen). */
function mergeDefaults<T>(defaults: T, raw: unknown): T {
  if (!isPlainObject(defaults) || !isPlainObject(raw)) return (raw === undefined || raw === null ? defaults : raw) as T;
  const out: Record<string, unknown> = { ...raw };
  for (const [k, d] of Object.entries(defaults)) out[k] = mergeDefaults(d, raw[k]);
  return out as T;
}

/** Lädt einen Spielstand und füllt fehlende Felder mit Standardwerten auf. */
export function deserialize(json: string): GameState {
  const raw = JSON.parse(json) as Partial<GameState>;
  if (typeof raw !== 'object' || raw === null || !Array.isArray(raw.nodes)) {
    throw new Error('Ungültiger Spielstand');
  }
  const base = createInitialState();
  const fromVersion = raw.version ?? 1;
  const state = mergeDefaults(base, raw);
  if (fromVersion < 2) migrateV1(state);
  state.version = SAVE_VERSION;
  state.nodes = state.nodes
    .filter((n) => CONFIG.nodes[n.type] !== undefined)
    .map((n) => ({ ...n, levels: { ...(n.levels ?? {}) }, buffer: n.buffer ?? 0 }));
  const ids = new Set(state.nodes.map((n) => n.id));
  state.connections = (state.connections ?? []).filter((c) => ids.has(c.from) && ids.has(c.to));
  if (!state.nodes.some((n) => n.type === 'job')) state.nodes.unshift(base.nodes[0]);
  state.nextId = Math.max(state.nextId ?? 1, ...state.nodes.map((n) => n.id + 1), ...state.connections.map((c) => c.id + 1));
  return state;
}

/** v1 → v2: lebenslange Statistik aus den Lauf-Werten übernehmen. */
function migrateV1(state: GameState): void {
  state.stats.hacks = state.run.hacks;
  state.stats.clicks = state.run.clicks;
  state.stats.raids = state.run.raids;
  state.stats.playTime = state.run.playTime;
  state.stats.dataSold = state.run.data;
}

export function saveToStorage(state: GameState): boolean {
  try {
    state.savedAt = Date.now();
    localStorage.setItem(CONFIG.saveKey, serialize(state));
    return true;
  } catch {
    return false;
  }
}

export function loadFromStorage(): GameState | null {
  try {
    const json = localStorage.getItem(CONFIG.saveKey);
    return json ? deserialize(json) : null;
  } catch {
    return null;
  }
}

export function clearStorage(): void {
  try {
    localStorage.removeItem(CONFIG.saveKey);
  } catch {
    /* ignorieren */
  }
}
