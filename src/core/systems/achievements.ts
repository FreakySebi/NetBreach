import { CONFIG, type AchievementConfig } from '../config';
import type { GameEvent, GameState } from '../types';

/** Aktueller Wert der Messgröße eines Erfolgs. */
export function achievementValue(state: GameState, a: AchievementConfig): number {
  const st = state.stats;
  switch (a.kind) {
    case 'hacks':
      return st.hacks;
    case 'raids':
      return st.raids;
    case 'money':
      return state.allTimeMoney;
    case 'identities':
      return state.prestige.identities;
    case 'collective':
      return state.collective.founded;
    case 'research':
      return state.research.length;
    case 'repelled':
      return st.repelled;
    case 'rivals':
      return st.rivalsBeaten;
    case 'contracts':
      return st.contracts;
    case 'exploits':
      return st.exploits;
    case 'devices':
      return st.maxDevices;
    case 'minigames':
      return st.minigames;
    case 'cryptoSold':
      return st.cryptoSold;
    case 'core':
      return st.coreCracks;
    case 'target':
      return st.targets[a.targetId ?? ''] ?? 0;
    case 'playTime':
      return st.playTime;
  }
}

/** Zielwert eines Erfolgs (Forschung: alle Einträge). */
export function achievementGoal(a: AchievementConfig): number {
  return a.kind === 'research' ? CONFIG.research.length : a.amount;
}

let checkAcc = 0;

/** Erfolge prüfen (gedrosselt auf ~1× pro Sekunde). */
export function checkAchievements(state: GameState, dt: number, events: GameEvent[]): void {
  checkAcc += dt;
  if (checkAcc < 1) return;
  checkAcc = 0;
  for (const a of CONFIG.achievements) {
    if (state.achievements.includes(a.id)) continue;
    if (achievementValue(state, a) >= achievementGoal(a)) {
      state.achievements.push(a.id);
      events.push({ kind: 'achievement', id: a.id });
    }
  }
}
