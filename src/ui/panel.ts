import { CONFIG } from '../core/config';
import { canAfford } from '../core/economy';
import type { Game } from '../core/game';
import { fmt, fmtBytes, fmtMoney, fmtTime } from '../core/format';
import { targetUnlocked } from '../core/simulation';
import type { NodeTypeId } from '../core/types';
import { NODE_DEFS, CATEGORY_COLORS } from '../nodes/definitions';
import { nodeConfig, nodePrice } from '../nodes/stats';
import { costHtml, delegate, esc, HtmlView } from './dom';

export interface PanelHooks {
  buy(type: NodeTypeId): void;
  setTargetAll(targetId: string): void;
  setTargetSelected(targetId: string): void;
  selectedCompute(): number | null;
  save(): void;
  load(): void;
  reset(): void;
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
      const open = targetUnlocked(s, t);
      if (!open) {
        return `<div class="card locked"><div class="card-head"><span>🔒 ${esc(t.name)}</span></div>
          <div class="card-desc">Benötigt ${fmt(t.reqRep)} Reputation</div></div>`;
      }
      return `<div class="card" style="--accent:#00e5ff">
        <div class="card-head"><span>${esc(t.name)}</span><span class="c-dim">SEC ${fmt(t.security)}</span></div>
        <div class="card-desc">${esc(t.desc)}</div>
        <div class="kv"><span>RAM</span><b>${fmt(t.ram)} GB</b><span>Beute</span><b class="c-money">${fmtMoney(t.money)}</b>
        <span>Daten</span><b class="c-data">${fmtBytes(t.data)}</b><span>Ruf</span><b class="c-rep">+${fmt(t.rep)}</b>
        ${t.crypto ? `<span>Krypto</span><b class="c-crypto">${fmt(t.crypto)} ₿</b>` : ''}
        <span>Trace</span><b class="c-bad">+${fmt(t.trace)} %</b><span>Dauer @1 OPS</span><b>${fmtTime(t.security)}</b></div>
        <div class="row">
          <button data-action="target-sel" data-id="${t.id}" ${sel === null ? 'disabled' : ''}>Für Auswahl</button>
          <button data-action="target-all" data-id="${t.id}">Für alle Rechner</button>
        </div>
      </div>`;
    });
    return `<h3>Hack-Ziele</h3><p class="hint">Hack-Dauer = Security ÷ Rechenleistung. Rechner brauchen genug RAM.</p>${rows.join('')}`;
  }

  private system(): string {
    const s = this.game.state;
    return `<h3>System</h3>
      <div class="row"><button data-action="save">💾 Speichern</button><button data-action="load">⟳ Laden</button></div>
      <p class="hint">Autosave alle ${CONFIG.autosaveSeconds} s im Browser (localStorage).</p>
      <h3>Statistik</h3>
      <div class="kv">
        <span>Spielzeit</span><b>${fmtTime(s.run.playTime)}</b>
        <span>Hacks</span><b>${fmt(s.run.hacks)}</b>
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
