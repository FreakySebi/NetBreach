import { CONFIG } from './config';
import { createInitialState, SAVE_VERSION } from './state';
import type { GameState } from './types';

export function serialize(state: GameState): string {
  return JSON.stringify(state);
}

/** Lädt einen Spielstand und füllt fehlende Felder mit Standardwerten auf. */
export function deserialize(json: string): GameState {
  const raw = JSON.parse(json) as Partial<GameState>;
  if (typeof raw !== 'object' || raw === null || !Array.isArray(raw.nodes)) {
    throw new Error('Ungültiger Spielstand');
  }
  const base = createInitialState();
  const state: GameState = {
    ...base,
    ...raw,
    prestige: { ...base.prestige, ...raw.prestige, perks: { ...(raw.prestige?.perks ?? {}) } },
    run: { ...base.run, ...raw.run },
    camera: { ...base.camera, ...raw.camera },
    version: SAVE_VERSION,
  } as GameState;
  state.nodes = state.nodes
    .filter((n) => CONFIG.nodes[n.type] !== undefined)
    .map((n) => ({ ...n, levels: { ...(n.levels ?? {}) }, buffer: n.buffer ?? 0 }));
  const ids = new Set(state.nodes.map((n) => n.id));
  state.connections = (state.connections ?? []).filter((c) => ids.has(c.from) && ids.has(c.to));
  if (!state.nodes.some((n) => n.type === 'job')) state.nodes.unshift(base.nodes[0]);
  state.nextId = Math.max(state.nextId ?? 1, ...state.nodes.map((n) => n.id + 1), ...state.connections.map((c) => c.id + 1));
  return state;
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
