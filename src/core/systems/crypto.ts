import { CONFIG } from '../config';
import type { GameState } from '../types';
import { randNormal } from './rng';

const m = () => CONFIG.cryptoMarket;

/** Kurs als Random Walk im Log-Raum mit Rückkehr zum langfristigen Mittel. */
export function marketTick(state: GameState, dt: number): void {
  const mk = state.market;
  const lnBase = Math.log(m().basePrice);
  let ln = Math.log(mk.price);
  ln += -m().meanReversion * (ln - lnBase) * dt + m().volatility * Math.sqrt(dt) * randNormal(state);
  mk.price = Math.min(m().maxPrice, Math.max(m().minPrice, Math.exp(ln)));
  mk.sampleIn -= dt;
  if (mk.sampleIn <= 0) {
    mk.history.push(mk.price);
    if (mk.history.length > m().historyLength) mk.history.splice(0, mk.history.length - m().historyLength);
    mk.sampleIn = m().sampleSeconds;
  }
}

/** Kurs-Schock (Ereignisse): sofort, danach normale Rückkehr zum Mittel. */
export function priceShock(state: GameState, factor: number): void {
  state.market.price = Math.min(m().maxPrice, Math.max(m().minPrice, state.market.price * factor));
}

/** Verkauft Krypto zum aktuellen Kurs (abzüglich Gebühr). Zählt nicht als Hack-Verdienst. */
export function sellCrypto(state: GameState, amount: number): number {
  const a = Math.min(amount, state.crypto);
  if (a <= 0) return 0;
  const euros = a * state.market.price * (1 - m().fee);
  state.crypto -= a;
  state.money += euros;
  state.stats.cryptoSold += a;
  return euros;
}

/** Kauft Krypto für einen Euro-Betrag (abzüglich Gebühr). */
export function buyCrypto(state: GameState, euros: number): number {
  const e = Math.min(euros, state.money);
  if (e <= 0) return 0;
  const coins = (e / state.market.price) * (1 - m().fee);
  state.money -= e;
  state.crypto += coins;
  return coins;
}

/** Kursänderung gegenüber dem ältesten Wert im Verlauf. */
export function priceTrend(state: GameState): number {
  const h = state.market.history;
  return h.length ? state.market.price / h[0] - 1 : 0;
}
