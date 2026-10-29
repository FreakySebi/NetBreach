import { CONFIG } from '../core/config';
import type { Game } from '../core/game';
import { fmt, fmtBytes, fmtTime } from '../core/format';
import { canHack, hackPower, isCompute, targetUnlocked } from '../core/simulation';
import { getModifiers } from '../core/state';
import type { NodeInstance } from '../core/types';
import { NODE_DEFS, PORT_COLORS, PORT_NAMES } from '../nodes/definitions';
import { nodeConfig, stat, statAfterUpgrade, upgradeCost, upgradeMaxed } from '../nodes/stats';
import { costHtml, delegate, esc, HtmlView } from './dom';
import type { UIState } from './uistate';

export interface InspectorHooks {
  sell(nodeId: number): void;
  hack(nodeId: number): void;
}

export class Inspector {
  private view: HtmlView;

  constructor(
    private el: HTMLElement,
    private game: Game,
    private ui: UIState,
    private hooks: InspectorHooks,
  ) {
    this.view = new HtmlView(el, () => this.html());
    delegate(el, (action, data) => {
      const id = this.ui.selectedNode;
      if (id === null) return;
      if (action === 'upgrade') this.game.upgrade(id, data.id!);
      if (action === 'target') this.game.setTarget(id, data.id!);
      if (action === 'hack') this.hooks.hack(id);
      if (action === 'sell') this.hooks.sell(id);
      if (action === 'close') this.ui.selectedNode = null;
      this.update();
    });
  }

  update(): void {
    const node = this.ui.selectedNode !== null ? this.game.node(this.ui.selectedNode) : undefined;
    this.el.classList.toggle('hidden', !node);
    this.view.update();
  }

  private html(): string {
    const node = this.ui.selectedNode !== null ? this.game.node(this.ui.selectedNode) : undefined;
    if (!node) return '';
    const cfg = nodeConfig(node.type);
    const def = NODE_DEFS[node.type];
    const parts: string[] = [];
    parts.push(`<div class="insp-head"><b>${def.icon} ${esc(cfg.name)}</b><span class="c-dim">#${node.id}</span>
      <button class="x" data-action="close" title="Schließen">✕</button></div>`);
    parts.push(`<p class="hint">${esc(cfg.desc)}</p>`);
    parts.push(this.statsBlock(node));

    if (def.ports.length) {
      parts.push(`<div class="ports">${def.ports
        .map((p) => `<span style="color:${PORT_COLORS[p.kind]}">${p.dir === 'in' ? '◀' : '▶'} ${esc(p.label)} <small>(${PORT_NAMES[p.kind]})</small></span>`)
        .join('')}</div>`);
    }

    if (cfg.upgrades.length) {
      parts.push('<h4>Upgrades</h4>');
      for (const u of cfg.upgrades) {
        const lvl = node.levels[u.id] ?? 0;
        const maxed = upgradeMaxed(node, u);
        const cost = upgradeCost(node, u);
        const now = stat(node, u.stat);
        const next = maxed ? now : statAfterUpgrade(node, u);
        parts.push(`<div class="upg">
          <div><b>${esc(u.label)}</b> <span class="c-dim">Lv ${lvl}${u.max !== undefined ? '/' + u.max : ''}</span><br>
          <small>${fmt(now)} → ${maxed ? 'MAX' : fmt(next)}</small></div>
          <button data-action="upgrade" data-id="${u.id}" ${maxed || !this.game.canUpgrade(node, u.id) ? 'disabled' : ''}>${maxed ? 'MAX' : costHtml(cost)}</button>
        </div>`);
      }
    }

    if (isCompute(node)) parts.push(this.targetBlock(node));
    if (node.type !== 'job') {
      parts.push(`<div class="row"><button class="danger" data-action="sell">Verkaufen (${Math.round(CONFIG.sellRefund * 100)} %)</button></div>`);
    }
    return parts.join('');
  }

  private statsBlock(node: NodeInstance): string {
    const rt = this.game.runtime.get(node.id);
    const kv: [string, string][] = [];
    if (isCompute(node)) {
      kv.push(['Kerne', fmt(stat(node, 'cores'))], ['Takt', fmt(stat(node, 'clock')) + ' GHz'], ['RAM', fmt(stat(node, 'ram')) + ' GB']);
      kv.push(['Leistung', fmt(rt?.power ?? 0) + ' OPS'], ['Temperatur', Math.round(rt?.temperature ?? 30) + ' °C']);
      kv.push(['Bandbreite', fmtBytes(rt?.bandwidth ?? 0) + '/s'], ['Puffer', `${fmtBytes(node.buffer)} / ${fmtBytes(rt?.bufferCap ?? 0)}`]);
    }
    if (!kv.length) return '';
    return `<div class="kv">${kv.map(([k, v]) => `<span>${k}</span><b>${v}</b>`).join('')}</div>`;
  }

  private targetBlock(node: NodeInstance): string {
    const s = this.game.state;
    const rt = this.game.runtime.get(node.id)!;
    const mods = getModifiers(s);
    const list = CONFIG.targets
      .filter((t) => targetUnlocked(s, t))
      .map((t) => {
        const ok = canHack(s, node, t);
        const p = hackPower(node, rt, t, mods);
        const dur = p > 0 ? Math.max(CONFIG.minHackTime, t.security / p) : Infinity;
        const active = node.targetId === t.id;
        return `<button class="target ${active ? 'active' : ''}" data-action="target" data-id="${t.id}" ${ok ? '' : 'disabled'}
          title="${ok ? '' : 'Zu wenig RAM (' + t.ram + ' GB nötig)'}">
          <span>${esc(t.name)}</span><small>${ok ? fmtTime(dur) : t.ram + ' GB RAM'}</small></button>`;
      });
    const canStart = !node.job && !rt.scripted && s.raidTimer <= 0;
    return `<h4>Ziel</h4><div class="targets">${list.join('')}</div>
      <div class="row"><button class="primary" data-action="hack" ${canStart ? '' : 'disabled'}>▶ Hack starten</button></div>`;
  }
}
