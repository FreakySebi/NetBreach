import type { Game } from '../core/game';
import { canAfford } from '../core/economy';
import { fmtMoney } from '../core/format';
import { nodePrice } from '../nodes/stats';

/** Kurzer Hinweis, was der Spieler als Nächstes tun kann (Mini-Tutorial). */
export function nextObjective(game: Game): string {
  const s = game.state;
  const computers = s.nodes.filter((n) => n.type === 'laptop' || n.type === 'pc' || n.type === 'server');
  if (computers.length === 0) {
    const price = nodePrice(s, 'laptop').money ?? 0;
    return canAfford(s, { money: price })
      ? 'Kaufe im Shop rechts deinen ersten Laptop.'
      : `Klicke auf ARBEITEN, bis du ${fmtMoney(price)} für einen Laptop hast.`;
  }
  if (s.run.hacks === 0) return 'Klicke am Laptop auf „▶ HACK STARTEN“.';
  const laptop = computers[0];
  if ((laptop.levels.cores ?? 0) === 0) return 'Wähle den Laptop aus und kaufe einen zusätzlichen CPU-Kern.';
  if (s.reputation < 2) return 'Hacke weiter, um Reputation für bessere Ziele zu sammeln.';
  if (laptop.targetId === 'webcam') return 'Neues Ziel verfügbar – wähle es im Inspector oder im Tab „Ziele“.';
  return 'Baue deine Hacking-Infrastruktur aus.';
}
