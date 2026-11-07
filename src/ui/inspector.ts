import { CONFIG } from '../core/config';
import type { Game } from '../core/game';
import { fmt, fmtBytes, fmtMoney, fmtPct, fmtTime } from '../core/format';
import { defenseRating, rivalStrength, rivalsActive } from '../core/systems/rivals';
import { canHack, estimateHackTime, heatLoad, isCompute, isStorage, marketPrice, powerDemand, targetById, targetUnlocked } from '../core/simulation';
import { getModifiers } from '../core/state';
import type { NodeInstance } from '../core/types';
import { NODE_DEFS, PORT_COLORS, PORT_NAMES } from '../nodes/definitions';
import { nodeConfig, stat, statAfterUpgrade, upgradeCost, upgradeMaxed } from '../nodes/stats';
import { costHtml, delegate, esc, HtmlView, PHASE_NAMES } from './dom';
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
      if (action === 'craft') this.game.setCraft(id, data.id!);
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
      const conns = this.game.state.connections;
      parts.push(`<h4>Anschlüsse</h4><div class="ports">${def.ports
        .map((p) => {
          const n = conns.filter((c) => (p.dir === 'in' ? c.to === node.id && c.toPort === p.id : c.from === node.id && c.fromPort === p.id)).length;
          const cap = this.game.portCapacity(node, p.id);
          const capText = cap === Infinity ? '' : '/' + cap;
          return `<span class="${n ? 'on' : 'off'}" style="color:${PORT_COLORS[p.kind]}" title="${PORT_NAMES[p.kind]}">${p.dir === 'in' ? '◀ Ein' : '▶ Aus'}: ${esc(p.label)} <small>${n}${capText}</small></span>`;
        })
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
    if (node.type === 'malware') parts.push(this.craftBlock(node));
    if (node.type !== 'job') {
      parts.push(`<div class="row"><button class="danger" data-action="sell">Verkaufen (${Math.round(CONFIG.sellRefund * 100)} %)</button></div>`);
    }
    return parts.join('');
  }

  private statsBlock(node: NodeInstance): string {
    const rt = this.game.runtime.get(node.id);
    if (!rt) return '';
    const kv: [string, string][] = [];
    const s = this.game.state;
    if (isCompute(node)) {
      kv.push(['Kerne', fmt(stat(node, 'cores'))], ['Takt', fmt(stat(node, 'clock')) + ' GHz'], ['RAM', fmt(stat(node, 'ram')) + ' GB']);
      kv.push(['Leistung', fmt(rt.power) + ' OPS']);
      if (rt.gpuBonus > 0) kv.push(['GPU-Boost', fmt(rt.gpuBonus) + ' OPS (zielabhängig)']);
      if (rt.botOps > 0) kv.push(['Botnetz', '+' + fmt(rt.botOps) + ' OPS']);
      if (rt.boost > 0) kv.push(['Script-Bonus', '+' + fmtPct(rt.boost)]);
      kv.push(['Temperatur', `${Math.round(rt.temperature)} °C${rt.thermalRatio < 1 ? ' (gedrosselt ' + fmtPct(rt.thermalRatio) + ')' : ''}`]);
      if (powerDemand(node) > 0) kv.push(['Strom', `${fmt(powerDemand(node))} W · ${fmtPct(rt.powerRatio)}`]);
      kv.push(['Wärme', `${fmt(heatLoad(node))} / ${fmt(stat(node, 'coolBuiltIn'))} WE intern`]);
      kv.push(['Bandbreite', fmtBytes(rt.bandwidth) + '/s'], ['Puffer', `${fmtBytes(node.buffer)} / ${fmtBytes(rt.bufferCap)}`]);
      kv.push(['Tarnung', fmtPct(rt.stealth)], ['Automatik', rt.scripted ? 'Script aktiv' : 'manuell']);
    } else if (isStorage(node)) {
      kv.push(['Belegt', `${fmtBytes(node.buffer)} / ${fmtBytes(rt.bufferCap)}`], ['Durchsatz', fmtBytes(stat(node, 'throughput')) + '/s']);
      kv.push(['Ausgang', fmtBytes(rt.rate) + '/s']);
    } else if (node.type === 'market') {
      kv.push(['Kaufrate', fmtBytes(stat(node, 'sellRate')) + '/s'], ['Preis', fmtMoney(marketPrice(s, node, getModifiers(s))) + '/MB']);
      kv.push(['Umsatz', fmtMoney(rt.rate) + '/s']);
    } else if (node.type === 'psu') {
      kv.push(['Leistung', fmt(stat(node, 'capacity')) + ' W'], ['Last', fmt(rt.demand) + ' W']);
    } else if (node.type === 'cooler') {
      kv.push(['Kühlleistung', fmt(rt.rate) + ' WE'], ['Bedarf', fmt(rt.demand) + ' WE']);
    } else if (node.type === 'gpu') {
      kv.push(['GPU-OPS', fmt(rt.power)], ['Strom', fmt(powerDemand(node)) + ' W']);
    } else if (node.type === 'router' || node.type === 'fiber') {
      kv.push(['Bandbreite', fmtBytes(rt.rate) + '/s'], ['Rechner', String(rt.load)]);
    } else if (node.type === 'miner') {
      kv.push(['Krypto', fmt(rt.rate * 3600, 3) + ' ₿/h'], ['Strom', fmt(powerDemand(node)) + ' W']);
    } else if (node.type === 'vpn' || node.type === 'proxy') {
      kv.push(['Tarnung', fmtPct(stat(node, 'stealth'))], ['Kette', fmtPct(rt.stealth)]);
    } else if (node.type === 'firewall') {
      kv.push(['Abwehr', fmt(rt.power)], ['Netzwerk gesamt', fmt(defenseRating(s, this.game.runtime))], ['Strom', fmt(powerDemand(node)) + ' W']);
      if (rivalsActive(s)) kv.push(['Rivalen-Stärke', fmt(s.rival.warning?.strength ?? rivalStrength(s))]);
    } else if (node.type === 'honeypot') {
      kv.push(['Lockwert', fmt(rt.power)], ['Köder', `${fmtBytes(node.buffer)} / ${fmtBytes(rt.bufferCap)}`]);
      kv.push(['Köderverbrauch', fmtBytes(stat(node, 'baitRate')) + '/s'], ['Rückverfolgung', Math.floor(s.rival.track) + ' %']);
      kv.push(['Abwehr-Beitrag', fmt(rt.power * CONFIG.rivals.honeypotDefense)]);
    } else if (node.type === 'botnet') {
      kv.push(['Geräte', `${fmt(node.devices ?? 0, 0)} / ${fmt(stat(node, 'capacity'), 0)}`], ['OPS', fmt(rt.power)]);
      kv.push(['OPS pro Gerät', fmt(stat(node, 'opsPerDevice'), 3)], ['Ausbreitung', '×' + fmt(stat(node, 'spread'))]);
      kv.push(['Verlust', fmtPct(stat(node, 'decay') * 60) + ' / min'], ['Verbindungen', `${rt.load} / ${Math.floor(stat(node, 'slots'))}`]);
    } else if (node.type === 'malware') {
      kv.push(['Entwicklung', fmt(rt.power) + ' OPS'], ['Daten', `${fmtBytes(node.buffer)} / ${fmtBytes(rt.bufferCap)}`]);
      if (rt.gpuBonus > 0) kv.push(['GPU-Anteil', fmt(rt.gpuBonus * CONFIG.exploits.gpuFactor) + ' OPS']);
    } else if (node.type === 'script') {
      kv.push(['Verbindungen', `${rt.load} / ${Math.floor(stat(node, 'slots'))}`], ['Speed-Bonus', '+' + fmtPct(stat(node, 'boost'))]);
    }
    if (!kv.length) return '';
    return `<div class="kv">${kv.map(([k, v]) => `<span>${k}</span><b>${v}</b>`).join('')}</div>`;
  }

  private craftBlock(node: NodeInstance): string {
    const s = this.game.state;
    const rt = this.game.runtime.get(node.id)!;
    const list = CONFIG.exploits.families.map((f) => {
      const active = node.craft === f.id;
      const time = rt.power > 0 ? fmtTime(f.ops / rt.power) : '∞';
      return `<button class="target ${active ? 'active' : ''}" data-action="craft" data-id="${f.id}">
        <span>${esc(f.name)} <small>×${fmt(s.exploits[f.id] ?? 0)}</small></span><small>${fmtBytes(f.data)} · ${time}</small></button>`;
    });
    const fam = CONFIG.exploits.families.find((f) => f.id === node.craft);
    const hint = !fam
      ? 'Wähle eine Exploit-Familie.'
      : node.buffer < fam.data
        ? `Wartet auf Daten: ${fmtBytes(node.buffer)} / ${fmtBytes(fam.data)} – Daten-Kabel anschließen.`
        : `Fortschritt ${fmtPct((node.craftProgress ?? 0) / fam.ops)}`;
    return `<h4>Exploit herstellen</h4><p class="hint">Ein Exploit senkt die Security eines Ziels seiner Familie um
      ${fmtPct(CONFIG.exploits.reduction)} und wird beim Hack-Start verbraucht. ${esc(hint)}</p><div class="targets">${list.join('')}</div>`;
  }

  private targetBlock(node: NodeInstance): string {
    const s = this.game.state;
    const rt = this.game.runtime.get(node.id)!;
    const mods = getModifiers(s);
    const list = CONFIG.targets
      .filter((t) => targetUnlocked(s, t))
      .map((t) => {
        const ok = canHack(s, node, t);
        const dur = estimateHackTime(s, node, rt, t, mods);
        const active = node.targetId === t.id;
        return `<button class="target ${active ? 'active' : ''}" data-action="target" data-id="${t.id}" ${ok ? '' : 'disabled'}
          title="${ok ? '' : 'Zu wenig RAM (' + t.ram + ' GB nötig)'}">
          <span>${esc(t.name)}</span><small>${ok ? fmtTime(dur) : t.ram + ' GB RAM'}</small></button>`;
      });
    const canStart = !node.job && !rt.scripted && s.raidTimer <= 0 && !node.locked;
    let phaseInfo = '';
    const jt = node.job ? targetById(node.job.targetId) : undefined;
    if (node.job && jt?.phases) {
      const ph = jt.phases[node.job.phase ?? 0];
      phaseInfo = `<p class="hint">Phase ${(node.job.phase ?? 0) + 1}/${jt.phases.length}: <b>${esc(ph.name)}</b> – braucht ${PHASE_NAMES[ph.resource]}.</p>`;
    }
    return `<h4>Ziel</h4>${phaseInfo}<div class="targets">${list.join('')}</div>
      <div class="row"><button class="primary" data-action="hack" ${canStart ? '' : 'disabled'}>▶ Hack starten</button></div>`;
  }
}
