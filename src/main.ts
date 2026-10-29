import './style.css';
import { Game } from './core/game';
import { fmt, fmtMoney } from './core/format';
import { isCompute, targetById } from './core/simulation';
import type { NodeTypeId } from './core/types';
import { layoutOf } from './nodes/definitions';
import { nodeConfig } from './nodes/stats';
import { Camera } from './ui/camera';
import { Hud } from './ui/hud';
import { Input } from './ui/input';
import { Inspector } from './ui/inspector';
import { Panel } from './ui/panel';
import { Renderer } from './ui/renderer';
import { showModal, Toasts } from './ui/toast';
import { UIState } from './ui/uistate';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const game = new Game();
const ui = new UIState();
const camera = new Camera(game.state.camera);
const canvas = $<HTMLCanvasElement>('canvas');
const renderer = new Renderer(canvas, game, camera, ui);
const toasts = new Toasts($('toasts'));
const hud = new Hud($('topbar'), game);

/** Freien Platz nahe der Bildschirmmitte für einen neuen Node finden. */
function freeSpot(type: NodeTypeId): [number, number] {
  const lay = layoutOf(type);
  const [cx, cy] = [camera.s.x - lay.w / 2, camera.s.y - lay.h / 2];
  for (let r = 0; r < 30; r++) {
    for (let i = 0; i < Math.max(1, r * 6); i++) {
      const a = (i / Math.max(1, r * 6)) * Math.PI * 2;
      const x = Math.round(cx + Math.cos(a) * r * 60);
      const y = Math.round(cy + Math.sin(a) * r * 50);
      const overlaps = game.state.nodes.some((n) => {
        const l = layoutOf(n.type);
        return x < n.x + l.w + 30 && x + lay.w + 30 > n.x && y < n.y + l.h + 20 && y + lay.h + 20 > n.y;
      });
      if (!overlaps) return [x, y];
    }
  }
  return [cx, cy];
}

function bindCamera(): void {
  camera.s = game.state.camera;
}

const panel = new Panel($('sidepanel'), game, {
  buy(type) {
    const [x, y] = freeSpot(type);
    const node = game.buyNode(type, x, y);
    if (node) {
      ui.selectedNode = node.id;
      toasts.show(`${nodeConfig(type).name} gekauft`, 'ok', 2000);
    }
  },
  setTargetAll(targetId) {
    for (const n of game.state.nodes) if (isCompute(n)) game.setTarget(n.id, targetId);
  },
  setTargetSelected(targetId) {
    if (ui.selectedNode !== null) game.setTarget(ui.selectedNode, targetId);
  },
  selectedCompute() {
    const n = ui.selectedNode !== null ? game.node(ui.selectedNode) : undefined;
    return n && isCompute(n) ? n.id : null;
  },
  save() {
    const ok = game.save();
    toasts.show(ok ? 'Spielstand gespeichert' : 'Speichern fehlgeschlagen', ok ? 'ok' : 'bad', 2000);
  },
  load() {
    if (game.load()) {
      bindCamera();
      ui.selectedNode = null;
      hud.resetRates();
      toasts.show('Spielstand geladen', 'ok', 2000);
    } else toasts.show('Kein Spielstand gefunden', 'warn');
  },
  reset() {
    showModal('Spielstand löschen?', 'Alle Fortschritte (inklusive Prestige) gehen verloren.', [
      { label: 'Abbrechen' },
      {
        label: 'Löschen',
        primary: true,
        action: () => {
          game.hardReset();
          bindCamera();
          ui.selectedNode = null;
          hud.resetRates();
          toasts.show('Neues Spiel gestartet', 'info');
        },
      },
    ]);
  },
});

const inspector = new Inspector($('inspector'), game, ui, {
  sell(nodeId) {
    const n = game.node(nodeId);
    if (n && game.sellNode(nodeId)) {
      ui.selectedNode = null;
      toasts.show(`${nodeConfig(n.type).name} verkauft`, 'info', 2000);
    }
  },
  hack(nodeId) {
    game.startHack(nodeId);
  },
});

new Input(canvas, game, camera, ui, renderer, (_action, nodeId) => {
  const n = game.node(nodeId);
  if (!n) return;
  if (n.type === 'job') game.clickJob(nodeId);
  else if (isCompute(n)) game.startHack(nodeId);
});

// ---------- Events → Effekte ----------

game.on((e) => {
  switch (e.kind) {
    case 'click': {
      const job = game.state.nodes.find((n) => n.type === 'job');
      if (job) {
        const lay = layoutOf('job');
        ui.addFloating(job.x + lay.w / 2 + (Math.random() - 0.5) * 60, job.y + 10, '+' + fmtMoney(e.amount), '#39ff88');
      }
      break;
    }
    case 'hack': {
      const n = game.node(e.nodeId);
      if (!n) break;
      const lay = layoutOf(n.type);
      const text = '+' + fmtMoney(e.money) + (e.crypto > 0 ? `  +${fmt(e.crypto, 3)} ₿` : '');
      ui.addFloating(n.x + lay.w / 2, n.y - 4, text, '#39ff88');
      const t = targetById(e.targetId);
      if (game.state.run.hacks === 1 && t) toasts.show(`Erster Hack erfolgreich: ${t.name}!`, 'ok');
      break;
    }
    case 'raid':
      toasts.show(`RAZZIA! Verloren: ${fmtMoney(e.lostMoney)}, Daten und Krypto. Systeme offline.`, 'bad', 7000);
      break;
    case 'traceWarning':
      toasts.show('Trace über 75 % – Razzia droht! Hacks pausieren oder VPN nutzen.', 'warn', 5000);
      break;
    case 'research':
      toasts.show('Forschung abgeschlossen', 'ok');
      break;
    case 'info':
      toasts.show(e.text, e.tone ?? 'info');
      break;
  }
});

// ---------- Loop ----------

window.addEventListener('resize', () => renderer.resize());
window.addEventListener('beforeunload', () => game.save());
renderer.resize();

let last = performance.now();
let uiAcc = 0;
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  ui.time += dt;
  game.update(dt);
  renderer.render(dt);
  uiAcc += dt;
  if (uiAcc >= 0.15) {
    uiAcc = 0;
    hud.update(0.15);
    panel.update();
    inspector.update();
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Debug-Zugriff in der Konsole
(window as unknown as { netbreach: Game }).netbreach = game;
