import type { Game } from '../core/game';
import { CONFIG } from '../core/config';
import { fmt, fmtBytes, fmtMoney, fmtPct, fmtTime } from '../core/format';
import { canHack, estimateHackTime, hackTrace, marketPrice, targetById } from '../core/simulation';
import { PHASE_NAMES } from './dom';
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
  blackout: 'BLACKOUT',
  locked: 'GESPERRT',
  noBait: 'KEIN KÖDER',
};

const ALERT_FLAGS: NodeFlag[] = ['bufferFull', 'storageFull', 'noPower', 'overheat', 'overload', 'raided', 'blackout', 'locked'];

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
    case 'server':
    case 'quantum': {
      const t = targetById(node.job?.targetId ?? node.targetId);
      const power = rt?.power ?? 0;
      view.lines.push({ text: `${fmt(stat(node, 'cores'))} ${node.type === 'quantum' ? 'Qubits' : 'Kerne'} · ${fmt(stat(node, 'clock'))} GHz · ${fmt(stat(node, 'ram'))} GB` });
      const phase = node.job?.phase ?? 0;
      const phaseText = t?.phases ? ` · Phase ${phase + 1}/${t.phases.length} ${PHASE_NAMES[t.phases[phase].resource]}` : '';
      view.lines.push({ text: `Ziel: ${t ? t.name : '—'}${phaseText}`, color: t?.phases ? '#ff4fd8' : '#00e5ff' });
      const dur = node.job ? (node.job.required - node.job.progress) / Math.max(power, 1e-9) : t && rt ? estimateHackTime(state, node, rt, t, getModifiers(state)) : Infinity;
      const fill = node.buffer / Math.max(1, rt?.bufferCap ?? 1);
      const bufText = fill > 0.5 ? ` · Puffer ${Math.round(fill * 100)}%` : '/Hack';
      const unit = t?.phases?.[phase]?.resource === 'bandwidth' ? 'MB/s' : 'OPS';
      view.lines.push({ text: `${fmt(power)} ${unit} · ${fmtTime(dur)}${bufText}`, color: fill > 0.9 ? C_WARN : C_DIM });
      view.lines.push(
        problemLine(flags, alert) ?? {
          text: `${Math.round(rt?.temperature ?? 30)}°C · ${fmtBytes(rt?.bandwidth ?? 0)}/s · ${rt && rt.stealth > 0 ? 'Tarnung ' + fmtPct(rt.stealth) : 'ungetarnt'}`,
          color: C_DIM,
        },
      );
      const ok = !!t && canHack(state, node, t) && state.raidTimer <= 0 && !node.locked;
      if (node.job) {
        const ratio = node.job.progress / node.job.required;
        view.bar = { ratio, color: '#39ff88' };
        view.button = { label: rt?.scripted ? 'AUTO-HACK LÄUFT' : `HACKT… ${Math.floor(ratio * 100)}%`, enabled: false };
        if (t?.phases) view.bar.color = '#ff4fd8';
      } else {
        view.bar = { ratio: 0, color: '#39ff88' };
        const paused = rt?.scripted && t && (state.trace >= CONFIG.trace.scriptPauseAt || state.trace + hackTrace(state, rt, t) >= 100);
        view.button = { label: paused ? '⏸ TRACE-PAUSE' : rt?.scripted ? 'AUTO: WARTET' : '▶ HACK STARTEN', enabled: ok && !rt?.scripted };
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
    case 'firewall':
      view.lines.push({ text: `Abwehr ${fmt(rt?.power ?? 0)}` });
      view.lines.push(problemLine(flags, alert) ?? { text: `${fmt(rt?.demand ?? 0)} W · ${Math.round(rt?.temperature ?? 30)}°C`, color: C_DIM });
      break;
    case 'honeypot': {
      const cap = rt?.bufferCap ?? 1;
      view.lines.push({ text: `Lockwert ${fmt(rt?.power ?? 0)} · Köder ${fmtBytes(stat(node, 'baitRate'))}/s` });
      view.lines.push(problemLine(flags, alert) ?? { text: `Rückverfolgung ${Math.floor(state.rival.track)} %`, color: '#b388ff' });
      view.bar = { ratio: node.buffer / cap, color: '#b388ff', label: `Köder ${fmtBytes(node.buffer)}` };
      view.alert = flags.has('noPower') || flags.has('locked');
      view.warn = flags.has('noBait');
      break;
    }
    case 'botnet': {
      const cap = rt?.bufferCap ?? 1;
      const dev = node.devices ?? 0;
      view.lines.push({ text: `${fmt(dev, 0)} Geräte · ${fmt(rt?.power ?? 0)} OPS`, color: '#c6ff00' });
      view.lines.push(problemLine(flags, alert) ?? { text: `Verlust ${fmtPct(stat(node, 'decay') * 60)}/min · ${rt?.load ?? 0} Ziele`, color: C_DIM });
      view.bar = { ratio: dev / cap, color: '#c6ff00', label: `${fmt(dev, 0)} / ${fmt(cap, 0)}` };
      break;
    }
    case 'malware': {
      const fam = CONFIG.exploits.families.find((f) => f.id === node.craft);
      view.lines.push({ text: `Baut: ${fam ? fam.name + '-Exploit' : '—'}`, color: '#ff4fd8' });
      view.lines.push({ text: `${fmt(rt?.power ?? 0)} OPS · Daten ${fmtBytes(node.buffer)}`, color: C_DIM });
      view.lines.push(problemLine(flags, alert) ?? { text: `Lager: ${fam ? fmt(state.exploits[fam.id] ?? 0) : 0} Stück` });
      view.bar = { ratio: fam ? (node.craftProgress ?? 0) / fam.ops : 0, color: '#ff4fd8' };
      break;
    }
    case 'script': {
      const slots = Math.floor(stat(node, 'slots'));
      view.lines.push({ text: `Verbunden: ${rt?.load ?? 0} / ${slots} Rechner` });
      view.lines.push({ text: `Speed-Bonus +${fmtPct(stat(node, 'boost'))}`, color: C_DIM });
      break;
    }
  }
  return view;
}
