import type { Game } from '../core/game';
import { fmt, fmtBytes, fmtMoney } from '../core/format';
import { HtmlView } from './dom';
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

  constructor(
    el: HTMLElement,
    private game: Game,
  ) {
    this.view = new HtmlView(el, () => this.html());
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
