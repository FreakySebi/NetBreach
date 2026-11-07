import type { Game } from '../core/game';
import { fmt, fmtBytes, fmtMoney } from '../core/format';
import { CONFIG } from '../core/config';
import { defenseRating } from '../core/systems/rivals';
import { worldEventById } from '../core/systems/worldEvents';
import { esc, HtmlView } from './dom';
import { nextObjective } from './objectives';

/** Misst Einnahmen pro Sekunde über ein gleitendes Fenster. */
class RateMeter {
  private samples: { t: number; v: number }[] = [];
  push(t: number, v: number): void {
    this.samples.push({ t, v });
    while (this.samples.length > 2 && t - this.samples[0].t > 10) this.samples.shift();
  }
  rate(): number {
    if (this.samples.length < 2) return 0;
    const a = this.samples[0];
    const b = this.samples[this.samples.length - 1];
    return b.t > a.t ? Math.max(0, (b.v - a.v) / (b.t - a.t)) : 0;
  }
  reset(): void {
    this.samples = [];
  }
}

export class Hud {
  private view: HtmlView;
  private moneyRate = new RateMeter();
  private dataRate = new RateMeter();
  private sampleAcc = 0;

  private eventsView: HtmlView | null = null;
  private newsView: HtmlView | null = null;

  constructor(
    el: HTMLElement,
    private game: Game,
    ticker?: HTMLElement,
  ) {
    this.view = new HtmlView(el, () => this.html());
    if (ticker) {
      this.eventsView = new HtmlView(ticker.querySelector<HTMLElement>('.ticker-events')!, () => this.eventsHtml());
      this.newsView = new HtmlView(ticker.querySelector<HTMLElement>('.ticker-track')!, () => this.newsHtml());
    }
  }

  /** Aktive Ereignisse mit Restzeit (links im Ticker). */
  private eventsHtml(): string {
    const s = this.game.state;
    const chips = s.worldEvents.active.map((e) => {
      const cfg = worldEventById(e.id);
      const fam = CONFIG.exploits.families.find((f) => f.id === e.family);
      return `<span class="chip ${cfg?.tone ?? 'info'}" title="${esc(cfg?.desc ?? '')}">${esc(cfg?.name ?? e.id)}${fam ? ' · ' + esc(fam.name) : ''} <b>${Math.ceil(e.left)}s</b></span>`;
    });
    const w = s.rival.warning;
    if (w) {
      const def = defenseRating(s, this.game.runtime);
      chips.unshift(`<span class="chip ${def >= w.strength ? 'warn' : 'bad'}" title="Abwehr gegen Angriffsstärke">⚔ RIVALEN-ANGRIFF ${Math.ceil(w.left)}s · Abwehr ${fmt(def)} / ${fmt(w.strength)}</span>`);
    } else if (s.rival.located) chips.unshift('<span class="chip ok">⌖ Rivale geortet</span>');
    return chips.length ? chips.join('') : '<span class="chip idle">▣ NEWS</span>';
  }

  /** Laufende Schlagzeilen (ändern sich selten → Animation läuft ungestört weiter). */
  private newsHtml(): string {
    const news = this.game.state.worldEvents.news;
    const items = news.length ? [...news].reverse() : ['Keine besonderen Vorkommnisse im Netz.'];
    const text = items.map((n) => `<span>${esc(n)}</span>`).join('<span class="sep">///</span>');
    return `<div class="ticker-scroll">${text}<span class="sep">///</span>${text}</div>`;
  }

  resetRates(): void {
    this.moneyRate.reset();
    this.dataRate.reset();
  }

  update(dt: number): void {
    this.sampleAcc += dt;
    if (this.sampleAcc >= 0.5) {
      this.sampleAcc = 0;
      const t = performance.now() / 1000;
      this.moneyRate.push(t, this.game.state.run.money);
      this.dataRate.push(t, this.game.state.run.data);
    }
    this.view.update();
    this.eventsView?.update();
    this.newsView?.update();
  }

  private html(): string {
    const s = this.game.state;
    const data = s.nodes.reduce((a, n) => a + n.buffer, 0);
    const traceCls = s.trace >= 75 ? 'bad' : s.trace >= 40 ? 'warn' : '';
    const showCrypto = s.crypto > 0 || s.run.crypto > 0;
    return `
      <div class="brand">NET<span>BREACH</span></div>
      <div class="res"><label>Geld</label><b class="c-money">${fmtMoney(s.money)}</b><small>+${fmtMoney(this.moneyRate.rate())}/s</small></div>
      <div class="res"><label>Daten</label><b class="c-data">${fmtBytes(data)}</b><small>${fmtBytes(this.dataRate.rate())}/s verkauft</small></div>
      ${showCrypto ? `<div class="res"><label>Krypto</label><b class="c-crypto">${fmt(s.crypto, 3)} ₿</b></div>` : ''}
      ${s.models > 0 || s.research.includes('quantum') ? `<div class="res"><label>Modelle</label><b class="c-models">${fmt(s.models)} ◇</b></div>` : ''}
      <div class="res"><label>Reputation</label><b class="c-rep">${fmt(s.reputation)}</b></div>
      <div class="res trace ${traceCls}">
        <label>Trace</label>
        <div class="tracebar"><div style="width:${Math.min(100, s.trace).toFixed(1)}%"></div></div>
        <small>${s.trace.toFixed(1)} %</small>
      </div>
      <div class="objective" title="Nächstes Ziel">▸ ${nextObjective(this.game)}</div>
    `;
  }
}
