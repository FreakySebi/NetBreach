import type { Game } from '../core/game';
import { CONFIG } from '../core/config';
import { fmt, fmtBytes, fmtMoney, fmtPct, fmtTime } from '../core/format';
import { canHack, marketPrice, targetById } from '../core/simulation';
import { getModifiers } from '../core/state';
import type { NodeFlag, NodeInstance } from '../core/types';
import { stat } from '../nodes/stats';

export interface Line {
  text: string;
  color?: string;
}

export interface NodeView {
  lines: Line[];
  bar?: { ratio: number; color: string; label?: string };
  button?: { label: string; enabled: boolean };
  /** Kritischer Engpass → Node blinkt rot. */
  alert: boolean;
  /** Leichter Hinweis → gelber Rahmen. */
  warn: boolean;
}

const C_DIM = '#6b8f7a';
const C_WARN = '#ffd23f';
const C_BAD = '#ff4d6d';

const FLAG_TEXT: Partial<Record<NodeFlag, string>> = {
  bufferFull: 'PUFFER VOLL',
  storageFull: 'SPEICHER VOLL',
  noPower: 'KEIN STROM',
  lowPower: 'STROM KNAPP',
  overheat: 'ÜBERHITZT',
  ramLow: 'ZU WENIG RAM',
  overload: 'ÜBERLASTET',
  raided: 'BESCHLAGNAHMT',
};

const ALERT_FLAGS: NodeFlag[] = ['bufferFull', 'storageFull', 'noPower', 'overheat', 'overload', 'raided'];

function problemLine(flags: Set<NodeFlag>, alert: boolean): Line | null {
  const problems = [...flags].map((f) => FLAG_TEXT[f]).filter(Boolean);
  return problems.length ? { text: '⚠ ' + problems.join(' · '), color: alert ? C_BAD : C_WARN } : null;
}

export function describeNode(game: Game, node: NodeInstance): NodeView {
  const rt = game.runtime.get(node.id);
  const flags = rt?.flags ?? new Set<NodeFlag>();
  const alert = ALERT_FLAGS.some((f) => flags.has(f));
  const warn = flags.has('lowPower') || flags.has('ramLow');
  const view: NodeView = { lines: [], alert, warn };
  const state = game.state;

  switch (node.type) {
    case 'job': {
      const reward = stat(node, 'reward') * getModifiers(state).click;
      view.lines.push({ text: `Auftrag: +${fmtMoney(reward)}` });
      view.lines.push({ text: `Erledigt: ${fmt(state.run.clicks)}`, color: C_DIM });
      view.button = { label: 'ARBEITEN', enabled: true };
      break;
    }
    case 'laptop':
    case 'pc':
    case 'server': {
      const t = targetById(node.job?.targetId ?? node.targetId);
      const power = rt?.power ?? 0;
      view.lines.push({ text: `${fmt(stat(node, 'cores'))} Kerne · ${fmt(stat(node, 'clock'))} GHz · ${fmt(stat(node, 'ram'))} GB` });
      view.lines.push({ text: `Ziel: ${t ? t.name : '—'}`, color: '#00e5ff' });
      const dur = t && power > 0 ? t.security / power : Infinity;
      view.lines.push({ text: `${fmt(power)} OPS · ${fmtTime(dur)}/Hack`, color: C_DIM });
      view.lines.push(
        problemLine(flags, alert) ?? {
          text: `${Math.round(rt?.temperature ?? 30)}°C · ${fmtBytes(rt?.bandwidth ?? 0)}/s · ${rt && rt.stealth > 0 ? 'Tarnung ' + fmtPct(rt.stealth) : 'ungetarnt'}`,
          color: C_DIM,
        },
      );
      const fill = node.buffer / Math.max(1, rt?.bufferCap ?? 1);
      if (fill > 0.02) view.lines[0] = { text: view.lines[0].text + ` · Puffer ${Math.round(fill * 100)}%` };
      const ok = !!t && canHack(state, node, t) && state.raidTimer <= 0;
      if (node.job) {
        const ratio = node.job.progress / node.job.required;
        view.bar = { ratio, color: '#39ff88' };
        view.button = { label: rt?.scripted ? 'AUTO-HACK LÄUFT' : `HACKT… ${Math.floor(ratio * 100)}%`, enabled: false };
      } else {
        view.bar = { ratio: 0, color: '#39ff88' };
        view.button = { label: rt?.scripted ? 'AUTO: WARTET' : '▶ HACK STARTEN', enabled: ok && !rt?.scripted };
      }
      break;
    }
    case 'hdd':
    case 'ssd':
    case 'datacenter': {
      const cap = rt?.bufferCap ?? 1;
      const ratio = node.buffer / cap;
      view.lines.push({ text: `Durchsatz ${fmtBytes(stat(node, 'throughput') * (rt?.powerRatio ?? 1))}/s`, color: C_DIM });
      view.lines.push(problemLine(flags, alert) ?? { text: `Ausgang: ${fmtBytes(rt?.rate ?? 0)}/s` });
      view.bar = { ratio, color: ratio > 0.95 ? C_BAD : '#00e5ff', label: `${fmtBytes(node.buffer)} / ${fmtBytes(cap)}` };
      break;
    }
    case 'market': {
      const mods = getModifiers(state);
      view.lines.push({ text: `Kauft ${fmtBytes(stat(node, 'sellRate'))}/s` });
      view.lines.push({ text: `Preis ${fmtMoney(marketPrice(state, node, mods))}/MB`, color: C_DIM });
      view.lines.push({ text: `Umsatz +${fmtMoney(rt?.rate ?? 0)}/s`, color: '#39ff88' });
      const cap = rt?.bufferCap ?? 1;
      view.bar = { ratio: node.buffer / cap, color: flags.has('overload') ? C_WARN : '#00e5ff', label: flags.has('overload') ? 'ÜBERLASTET' : 'Auslastung' };
      view.warn = flags.has('overload');
      view.alert = false;
      break;
    }
    case 'psu': {
      const cap = stat(node, 'capacity');
      const demand = rt?.demand ?? 0;
      view.lines.push({ text: `Leistung ${fmt(cap)} W` });
      view.lines.push(problemLine(flags, alert) ?? { text: `Last ${fmt(demand)} W`, color: C_DIM });
      view.bar = { ratio: demand / cap, color: demand > cap ? C_BAD : '#ffd23f', label: `${Math.round((demand / cap) * 100)} %` };
      break;
    }
    case 'cooler': {
      const cap = rt?.rate ?? 0;
      const need = rt?.demand ?? 0;
      view.lines.push({ text: `Kühlleistung ${fmt(cap)} WE` });
      view.lines.push(problemLine(flags, alert) ?? { text: `Bedarf ${fmt(need)} WE`, color: C_DIM });
      view.bar = { ratio: cap > 0 ? need / cap : 1, color: need > cap ? C_BAD : '#6fa8ff', label: cap > 0 ? `${Math.round((need / cap) * 100)} %` : 'KEIN STROM' };
      break;
    }
    case 'gpu':
      view.lines.push({ text: `${fmt(rt?.power ?? 0)} GPU-OPS` });
      view.lines.push(problemLine(flags, alert) ?? { text: `${Math.round(rt?.temperature ?? 30)}°C · ${fmt(rt?.demand ?? 0)} W`, color: C_DIM });
      break;
    case 'router':
    case 'fiber':
      view.lines.push({ text: `${fmtBytes(rt?.rate ?? 0)}/s Bandbreite` });
      view.lines.push(problemLine(flags, alert) ?? { text: `geteilt auf ${rt?.load ?? 0} Rechner`, color: C_DIM });
      break;
    case 'miner':
      view.lines.push({ text: `${fmt(stat(node, 'hashrate') + (rt?.gpuBonus ?? 0) * CONFIG.mining.gpuToHash)} H/s` });
      view.lines.push({ text: `+${fmt((rt?.rate ?? 0) * 3600, 3)} ₿/h`, color: '#ffd23f' });
      view.lines.push(problemLine(flags, alert) ?? { text: `${Math.round(rt?.temperature ?? 30)}°C · ${fmt(rt?.demand ?? 0)} W`, color: C_DIM });
      break;
    case 'vpn':
    case 'proxy':
      view.lines.push({ text: `Eigene Tarnung ${fmtPct(stat(node, 'stealth'))}` });
      view.lines.push({ text: `Kette gesamt ${fmtPct(rt?.stealth ?? 0)}`, color: '#b388ff' });
      break;
    case 'script': {
      const slots = Math.floor(stat(node, 'slots'));
      view.lines.push({ text: `Verbunden: ${rt?.load ?? 0} / ${slots} Rechner` });
      view.lines.push({ text: `Speed-Bonus +${fmtPct(stat(node, 'boost'))}`, color: C_DIM });
      break;
    }
  }
  return view;
}
