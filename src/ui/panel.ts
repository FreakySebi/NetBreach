import { CONFIG, type ResearchConfig } from '../core/config';
import { canAfford } from '../core/economy';
import type { Game } from '../core/game';
import { fmt, fmtBytes, fmtMoney, fmtPct, fmtTime } from '../core/format';
import { lockReason, targetWork } from '../core/simulation';
import { priceTrend } from '../core/systems/crypto';
import { exploitAutoOn } from '../core/systems/exploits';
import { cryptoChartSvg } from './cryptoChart';
import type { NodeTypeId } from '../core/types';
import { NODE_DEFS, CATEGORY_COLORS } from '../nodes/definitions';
import { nodeConfig, nodePrice } from '../nodes/stats';
import { costHtml, delegate, esc, familyName, HtmlView, PHASE_NAMES } from './dom';

export interface PanelHooks {
  buy(type: NodeTypeId): void;
  setTargetAll(targetId: string): void;
  setTargetSelected(targetId: string): void;
  selectedCompute(): number | null;
  save(): void;
  load(): void;
  reset(): void;
  research(id: string): void;
  prestige(): void;
  buyPerk(id: string): void;
  exportSave(): void;
  importSave(): void;
  sellCrypto(fraction: number): void;
  buyCrypto(fraction: number): void;
}

interface Tab {
  id: string;
  label: string;
  visible: () => boolean;
  render: () => string;
}

export class Panel {
  private active = 'shop';
  private tabsView: HtmlView;
  private bodyView: HtmlView;
  private tabs: Tab[];

  constructor(
    root: HTMLElement,
    private game: Game,
    private hooks: PanelHooks,
  ) {
    root.innerHTML = `<nav class="tabs"></nav><div class="panel-body"><div class="panel-content"></div></div>`;
    const nav = root.querySelector<HTMLElement>('.tabs')!;
    const content = root.querySelector<HTMLElement>('.panel-content')!;
    this.tabs = [
      { id: 'shop', label: 'Shop', visible: () => true, render: () => this.shop() },
      { id: 'targets', label: 'Ziele', visible: () => true, render: () => this.targets() },
      { id: 'research', label: 'Forschung', visible: () => true, render: () => this.researchTab() },
      { id: 'crypto', label: 'Krypto', visible: () => this.cryptoVisible(), render: () => this.cryptoTab() },
      { id: 'identity', label: 'Identität', visible: () => this.identityVisible(), render: () => this.identity() },
      { id: 'system', label: 'System', visible: () => true, render: () => this.system() },
    ];
    this.tabsView = new HtmlView(nav, () =>
      this.tabs
        .filter((t) => t.visible())
        .map((t) => `<button data-action="tab" data-tab="${t.id}" class="${t.id === this.active ? 'active' : ''}">${t.label}</button>`)
        .join(''),
    );
    this.bodyView = new HtmlView(content, () => (this.tabs.find((t) => t.id === this.active) ?? this.tabs[0]).render());
    delegate(nav, (action, data) => {
      if (action === 'tab' && data.tab) {
        this.active = data.tab;
        this.update();
      }
    });
    delegate(content, (action, data) => this.onAction(action, data));
  }

  update(): void {
    this.tabsView.update();
    this.bodyView.update();
  }

  private onAction(action: string, data: DOMStringMap): void {
    switch (action) {
      case 'buy':
        this.hooks.buy(data.type as NodeTypeId);
        break;
      case 'target-all':
        this.hooks.setTargetAll(data.id!);
        break;
      case 'target-sel':
        this.hooks.setTargetSelected(data.id!);
        break;
      case 'save':
        this.hooks.save();
        break;
      case 'load':
        this.hooks.load();
        break;
      case 'reset':
        this.hooks.reset();
        break;
      case 'research':
        this.hooks.research(data.id!);
        break;
      case 'prestige':
        this.hooks.prestige();
        break;
      case 'perk':
        this.hooks.buyPerk(data.id!);
        break;
      case 'export':
        this.hooks.exportSave();
        break;
      case 'import':
        this.hooks.importSave();
        break;
      case 'sell':
        this.hooks.sellCrypto(Number(data.f));
        break;
      case 'buy-crypto':
        this.hooks.buyCrypto(Number(data.f));
        break;
      case 'exploit-auto':
        this.game.toggleExploitAuto(data.id!);
        break;
    }
    this.update();
  }

  // ---------- Tabs ----------

  private shop(): string {
    const types = Object.keys(CONFIG.nodes).filter((t) => t !== 'job') as NodeTypeId[];
    const items = types.map((type) => {
      const cfg = nodeConfig(type);
      const def = NODE_DEFS[type];
      const unlocked = this.game.isUnlocked(type);
      const price = nodePrice(this.game.state, type);
      const afford = canAfford(this.game.state, price);
      const color = CATEGORY_COLORS[def.category];
      if (!unlocked) {
        return `<div class="card locked"><div class="card-head"><span>${def.icon} ???</span></div>
          <div class="card-desc">${esc(this.game.lockHint(type))}</div></div>`;
      }
      return `<div class="card" style="--accent:${color}">
        <div class="card-head"><span>${def.icon} ${esc(cfg.name)}</span><span class="c-dim">×${this.game.count(type)}</span></div>
        <div class="card-desc">${esc(cfg.desc)}</div>
        <button data-action="buy" data-type="${type}" ${afford ? '' : 'disabled'}>Kaufen · ${costHtml(price)}</button>
      </div>`;
    });
    return `<h3>Hardware & Software</h3><p class="hint">Gekaufte Nodes erscheinen in der Mitte der Arbeitsfläche.</p>${items.join('')}`;
  }

  private targets(): string {
    const s = this.game.state;
    const sel = this.hooks.selectedCompute();
    const rows = CONFIG.targets.map((t) => {
      const reason = lockReason(s, t);
      if (reason) {
        if (t.rival) return '';
        return `<div class="card locked"><div class="card-head"><span>🔒 ${esc(t.name)}</span></div>
          <div class="card-desc">${esc(reason)}</div></div>`;
      }
      const work = targetWork(s, t);
      const phases = t.phases
        ? `<div class="phases">${t.phases
            .map((p, i) => `<span>${i + 1}. ${esc(p.name)} <small>(${PHASE_NAMES[p.resource]} ${p.resource === 'bandwidth' ? fmtBytes(p.amount) : fmt(p.amount)})</small></span>`)
            .join('')}</div>`
        : '';
      const special = [
        t.effect === 'blackout' ? '<span class="tag warn">Blackout</span>' : '',
        t.models ? `<span class="tag">+${fmt(t.models)} Modelle</span>` : '',
        t.botnet ? `<span class="tag lime">+${fmt(t.botnet)} Bots</span>` : '',
        t.rival ? '<span class="tag bad">Rivale</span>' : '',
        t.trace >= 50 ? '<span class="tag bad">Extremer Trace</span>' : '',
      ].join('');
      return `<div class="card" style="--accent:${t.rival ? '#ff4d6d' : '#00e5ff'}">
        <div class="card-head"><span>${esc(t.name)}</span><span class="c-dim">SEC ${fmt(work)}</span></div>
        <div class="card-desc">${esc(t.desc)}</div>${special ? `<div class="tags">${special}</div>` : ''}${phases}
        <div class="kv"><span>RAM</span><b>${fmt(t.ram)} GB</b><span>Beute</span><b class="c-money">${fmtMoney(t.money)}</b>
        <span>Daten</span><b class="c-data">${fmtBytes(t.data)}</b><span>Ruf</span><b class="c-rep">+${fmt(t.rep)}</b>
        ${t.crypto ? `<span>Krypto</span><b class="c-crypto">${fmt(t.crypto)} ₿</b>` : ''}
        <span>Trace</span><b class="c-bad">+${fmt(t.trace)} %</b>
        <span>Exploit-Familie</span><b>${esc(familyName(t.family))}</b></div>
        <div class="row">
          <button data-action="target-sel" data-id="${t.id}" ${sel === null ? 'disabled' : ''}>Für Auswahl</button>
          <button data-action="target-all" data-id="${t.id}">Für alle Rechner</button>
        </div>
      </div>`;
    });
    return `${this.exploitInventory()}<h3>Hack-Ziele</h3><p class="hint">Hack-Dauer = Security ÷ Rechenleistung. Rechner brauchen genug RAM.</p>${rows.join('')}`;
  }

  private exploitInventory(): string {
    const s = this.game.state;
    const any = CONFIG.exploits.families.some((f) => (s.exploits[f.id] ?? 0) > 0) || s.research.includes('malware');
    if (!any) return '';
    const rows = CONFIG.exploits.families.map((f) => {
      const on = exploitAutoOn(s, f.id);
      return `<div class="exploit-row"><span>${esc(f.name)}</span><b>${fmt(s.exploits[f.id] ?? 0)}</b>
        <button data-action="exploit-auto" data-id="${f.id}" class="${on ? 'primary' : ''}" title="Beim Hack-Start automatisch verbrauchen">${on ? 'AUTO' : 'AUS'}</button></div>`;
    });
    return `<h3>Exploit-Lager</h3><p class="hint">Exploits senken die Security um ${fmtPct(CONFIG.exploits.reduction)} und werden beim Hack-Start verbraucht.</p>
      <div class="exploits">${rows.join('')}</div>`;
  }

  private cryptoVisible(): boolean {
    const s = this.game.state;
    return s.crypto > 0 || s.run.crypto > 0 || s.stats.cryptoSold > 0;
  }

  private cryptoTab(): string {
    const s = this.game.state;
    const trend = priceTrend(s);
    const value = s.crypto * s.market.price;
    const fee = CONFIG.cryptoMarket.fee;
    return `<h3>Krypto-Börse</h3>
      <div class="price-head"><b class="c-crypto">${fmtMoney(s.market.price)}</b><span class="${trend >= 0 ? 'c-money' : 'c-bad'}">${trend >= 0 ? '▲' : '▼'} ${fmtPct(Math.abs(trend))}</span></div>
      <p class="hint">Kurs pro ₿ · Verlauf der letzten ${fmtTime(s.market.history.length * CONFIG.cryptoMarket.sampleSeconds)}</p>
      ${cryptoChartSvg(s.market.history, s.market.price)}
      <div class="kv"><span>Bestand</span><b class="c-crypto">${fmt(s.crypto, 3)} ₿</b><span>Wert</span><b>${fmtMoney(value)}</b>
      <span>Gebühr</span><b>${fmtPct(fee)}</b><span>Verkauft (gesamt)</span><b>${fmt(s.stats.cryptoSold, 2)} ₿</b></div>
      <h4>Verkaufen</h4>
      <div class="row"><button data-action="sell" data-f="0.1" ${s.crypto > 0 ? '' : 'disabled'}>10 %</button>
        <button data-action="sell" data-f="0.5" ${s.crypto > 0 ? '' : 'disabled'}>50 %</button>
        <button data-action="sell" data-f="1" ${s.crypto > 0 ? '' : 'disabled'}>Alles</button></div>
      <h4>Kaufen</h4>
      <div class="row"><button data-action="buy-crypto" data-f="0.1" ${s.money > 0 ? '' : 'disabled'}>10 % Geld</button>
        <button data-action="buy-crypto" data-f="0.5" ${s.money > 0 ? '' : 'disabled'}>50 % Geld</button></div>
      <p class="hint">Krypto bezahlt späte Hardware und Forschung. Der Kurs schwankt und kehrt langfristig zum Mittel zurück – günstig kaufen, teuer verkaufen.</p>`;
  }

  private researchTab(): string {
    const s = this.game.state;
    const tiers = new Map<number, ResearchConfig[]>();
    for (const r of CONFIG.research) {
      const list = tiers.get(r.tier) ?? [];
      list.push(r);
      tiers.set(r.tier, list);
    }
    const name = (id: string) => CONFIG.research.find((x) => x.id === id)?.name ?? id;
    const blocks = [...tiers.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([tier, all]) => {
        const list = all.filter((r) => this.game.researchState(r) !== 'done');
        if (!list.length) return '';
        const cards = list.map((r) => {
          const st = this.game.researchState(r);
          const unlocks = r.unlocks?.length ? `<div class="unlocks">▸ ${r.unlocks.map((u) => esc(nodeConfig(u).name)).join(', ')}</div>` : '';
          if (st === 'locked') {
            const missing = r.requires.filter((q) => !s.research.includes(q)).map(name);
            return `<div class="card locked"><div class="card-head"><span>🔒 ${esc(r.name)}</span></div>
              <div class="card-desc">${esc(r.desc)}<br>Benötigt: ${esc(missing.join(', '))}</div></div>`;
          }
          return `<div class="card" style="--accent:#b388ff"><div class="card-head"><span>${esc(r.name)}</span></div>
            <div class="card-desc">${esc(r.desc)}</div>${unlocks}
            <button data-action="research" data-id="${r.id}" ${canAfford(s, r.cost) ? '' : 'disabled'}>Erforschen · ${costHtml(r.cost)}</button></div>`;
        });
        return `<h4>Stufe ${tier + 1}</h4>${cards.join('')}`;
      });
    const done = CONFIG.research.filter((r) => s.research.includes(r.id));
    const doneHtml = done.length
      ? `<h4>Abgeschlossen</h4><div class="done-list">${done.map((r) => `<span title="${esc(r.desc)}">✓ ${esc(r.name)}</span>`).join('')}</div>`
      : '';
    return `<h3>Forschung (${done.length}/${CONFIG.research.length})</h3><p class="hint">Schaltet neue Nodes und globale Boni frei.</p>${blocks.join('')}${doneHtml}`;
  }

  private identityVisible(): boolean {
    const s = this.game.state;
    return s.prestige.identities > 0 || s.run.money >= CONFIG.prestige.minMoney * 0.1;
  }

  private identity(): string {
    const s = this.game.state;
    const p = s.prestige;
    const pending = this.game.pendingTokens();
    const perks = CONFIG.perks.map((pk) => {
      const lvl = p.perks[pk.id] ?? 0;
      const maxed = lvl >= pk.max;
      const cost = this.game.perkCost(pk);
      return `<div class="card" style="--accent:#ff4fd8"><div class="card-head"><span>${esc(pk.name)}</span><span class="c-dim">${lvl}/${pk.max}</span></div>
        <div class="card-desc">${esc(pk.desc)}</div>
        <button data-action="perk" data-id="${pk.id}" ${maxed || p.tokens < cost ? 'disabled' : ''}>${maxed ? 'MAX' : `Kaufen · ${cost} ◆`}</button></div>`;
    });
    return `<h3>Neue Identität</h3>
      <p class="hint">Verwische alle Spuren und starte neu. Du verlierst Geld, Hardware, Forschung und Reputation,
      erhältst aber Ghost-Tokens (◆). Jeder jemals verdiente Token gibt dauerhaft
      +${fmtPct(CONFIG.prestige.moneyPerToken)} Erträge und +${fmtPct(CONFIG.prestige.speedPerToken)} Hack-Speed.</p>
      <div class="kv">
        <span>Ghost-Tokens</span><b class="c-rep">${fmt(p.tokens)} ◆</b>
        <span>Insgesamt verdient</span><b>${fmt(p.tokensTotal)} ◆</b>
        <span>Aktueller Bonus</span><b class="c-money">+${fmtPct(p.tokensTotal * CONFIG.prestige.moneyPerToken)} Geld</b>
        <span>Verdient (Lauf)</span><b>${fmtMoney(s.run.money)}</b>
        <span>Bei Neustart</span><b class="c-rep">+${fmt(pending)} ◆</b>
      </div>
      <p class="hint">Mindestens ${fmtMoney(CONFIG.prestige.minMoney)} in diesem Lauf verdienen für den ersten Token.</p>
      <button class="primary wide" data-action="prestige" ${pending >= 1 ? '' : 'disabled'}>☠ Neue Identität annehmen (+${fmt(pending)} ◆)</button>
      <h3>Permanente Perks</h3>${perks.join('')}`;
  }

  private system(): string {
    const s = this.game.state;
    return `<h3>System</h3>
      <div class="row"><button data-action="save">💾 Speichern</button><button data-action="load">⟳ Laden</button></div>
      <div class="row"><button data-action="export">⇪ Export</button><button data-action="import">⇩ Import</button></div>
      <p class="hint">Autosave alle ${CONFIG.autosaveSeconds} s im Browser (localStorage).</p>
      <h3>Statistik</h3>
      <div class="kv">
        <span>Spielzeit</span><b>${fmtTime(s.run.playTime)}</b>
        <span>Hacks</span><b>${fmt(s.run.hacks)}</b>
        <span>Daten verkauft</span><b>${fmtBytes(s.run.data)}</b>
        <span>Krypto (Lauf)</span><b>${fmt(s.run.crypto, 3)} ₿</b>
        <span>Razzien</span><b>${fmt(s.run.raids)}</b>
        <span>Identitäten</span><b>${fmt(s.prestige.identities)}</b>
        <span>Verdient (Lauf)</span><b>${fmtMoney(s.run.money)}</b>
        <span>Verdient (gesamt)</span><b>${fmtMoney(s.allTimeMoney)}</b>
      </div>
      <h3>Gefahrenzone</h3>
      <button class="danger" data-action="reset">Spielstand löschen</button>
      <h3>Steuerung</h3>
      <ul class="help">
        <li>Leere Fläche ziehen: Arbeitsfläche verschieben</li>
        <li>Mausrad: Zoom</li>
        <li>Node ziehen: verschieben · Klick: auswählen</li>
        <li>Ausgang → Eingang ziehen: Kabel verbinden</li>
        <li>Rechtsklick auf Kabel / Entf: Kabel entfernen</li>
      </ul>`;
  }
}
