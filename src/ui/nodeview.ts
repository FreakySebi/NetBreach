import type { Game } from '../core/game';
import { fmt, fmtBytes, fmtMoney, fmtTime } from '../core/format';
import { canHack, targetById } from '../core/simulation';
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
      const problems = [...flags].map((f) => FLAG_TEXT[f]).filter(Boolean);
      if (problems.length) {
        view.lines.push({ text: '⚠ ' + problems.join(' · '), color: alert ? C_BAD : C_WARN });
      } else {
        view.lines.push({ text: `${Math.round(rt?.temperature ?? 30)}°C · Puffer ${fmtBytes(node.buffer)}`, color: C_DIM });
      }
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
    default:
      view.lines.push({ text: node.type });
  }
  return view;
}
