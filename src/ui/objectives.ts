import type { Game } from '../core/game';
import { CONFIG } from '../core/config';
import { canAfford } from '../core/economy';
import { fmt, fmtMoney } from '../core/format';
import { isCompute, isStorage } from '../core/simulation';
import { nodePrice } from '../nodes/stats';

/** Kurzer Hinweis, was der Spieler als Nächstes tun kann (Mini-Tutorial). */
export function nextObjective(game: Game): string {
  const s = game.state;
  const has = (id: string) => s.research.includes(id);
  const count = (pred: (t: string) => boolean) => s.nodes.filter((n) => pred(n.type)).length;
  const computers = s.nodes.filter(isCompute);

  if (s.raidTimer > 0) return 'Razzia! Warte, bis die Systeme wieder online sind.';
  if (computers.length === 0) {
    const price = nodePrice(s, 'laptop').money ?? 0;
    return canAfford(s, { money: price })
      ? 'Kaufe im Shop rechts deinen ersten Laptop.'
      : `Klicke auf ARBEITEN, bis du ${fmtMoney(price)} für einen Laptop hast.`;
  }
  if (s.run.hacks === 0) return 'Klicke am Laptop auf „▶ HACK STARTEN“.';
  if ((computers[0].levels.cores ?? 0) === 0) return 'Wähle den Laptop aus und kaufe einen zusätzlichen CPU-Kern.';
  if (s.reputation < 2) return 'Hacke weiter, um Reputation für bessere Ziele zu sammeln.';
  if (!has('darknet')) return 'Erforsche „Darknet-Zugang“ (Tab Forschung), um gestohlene Daten zu verkaufen.';
  if (!count((t) => t === 'market') || !count((t) => t === 'hdd' || t === 'ssd' || t === 'datacenter'))
    return 'Kaufe eine Festplatte und einen Darknet-Markt.';
  if (!s.connections.some((c) => game.node(c.to)?.type === 'market'))
    return 'Ziehe Kabel: Rechner „Daten“ → Festplatte → Darknet-Markt.';
  if (!computers.some((c) => s.connections.some((x) => x.from === c.id && x.fromPort === 'dataOut')))
    return 'Verbinde den Daten-Ausgang deines Rechners mit dem Speicher.';
  if (s.trace > 60 && !count((t) => t === 'vpn'))
    return has('anon') ? 'Trace hoch! Kaufe ein VPN und verbinde es mit dem Proxy-Eingang.' : 'Trace hoch! Erforsche „Anonymität“ für VPNs – oder pausiere.';
  if (s.nodes.some((n) => isStorage(n) && n.buffer >= (game.runtime.get(n.id)?.bufferCap ?? Infinity) * 0.99))
    return 'Speicher voll – upgrade den Markt (Käufer) oder den Speicher-Durchsatz.';
  if (!has('auto')) return 'Spare auf „Automatisierung“: Hack-Scripts hacken auch offline weiter.';
  if (!count((t) => t === 'script')) return 'Kaufe ein Hack-Script und verbinde es mit dem Script-Eingang eines Rechners.';
  if (!has('power')) return 'Erforsche „Stromtechnik“ für Gaming-PCs.';
  if (!count((t) => t === 'pc' || t === 'server')) return 'Kaufe einen Gaming-PC und versorge ihn mit einem Netzteil.';
  if (computers.some((c) => game.runtime.get(c.id)?.flags.has('noPower'))) return 'Ein Rechner hat keinen Strom – verbinde ein Netzteil.';
  if (computers.some((c) => game.runtime.get(c.id)?.flags.has('overheat')))
    return has('thermo') ? 'Ein Rechner überhitzt – schließe eine Kühlung an.' : 'Ein Rechner überhitzt – erforsche „Thermodynamik“.';
  if (computers.some((c) => !s.connections.some((x) => x.to === c.id && x.toPort === 'scriptIn')))
    return 'Nicht alle Rechner sind automatisiert – Script-Verbindungen erweitern.';
  if (game.pendingTokens() >= 1) return `Neue Identität möglich: +${fmt(game.pendingTokens())} Ghost-Tokens (Tab Identität).`;
  const next = CONFIG.targets.find((t) => s.reputation < t.reqRep);
  if (next) return `Nächstes Ziel „${next.name}“ ab ${fmt(next.reqRep)} Reputation.`;
  return `Verdiene ${fmtMoney(CONFIG.prestige.minMoney)} für eine neue Identität.`;
}
