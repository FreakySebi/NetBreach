import './style.css';
import { CONFIG } from './core/config';
import { Game } from './core/game';
import { fmt, fmtBytes, fmtMoney, fmtTime } from './core/format';
import type { OfflineReport } from './core/offline';
import { isCompute, targetById } from './core/simulation';
import { worldEventById } from './core/systems/worldEvents';
import type { NodeTypeId } from './core/types';
import { layoutOf } from './nodes/definitions';
import { nodeConfig } from './nodes/stats';
import { Camera } from './ui/camera';
import { esc } from './ui/dom';
import { Hud } from './ui/hud';
import { Input } from './ui/input';
import { Inspector } from './ui/inspector';
import { openMinigame } from './ui/minigame';
import { Panel } from './ui/panel';
import { Renderer } from './ui/renderer';
import { showModal, Toasts } from './ui/toast';
import { UIState } from './ui/uistate';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const { game, offline } = Game.fromStorage();
const ui = new UIState();
const camera = new Camera(game.state.camera);
const canvas = $<HTMLCanvasElement>('canvas');
const renderer = new Renderer(canvas, game, camera, ui);
const toasts = new Toasts($('toasts'));
const hud = new Hud($('topbar'), game, $('ticker'));

/** Freien Platz nahe der Bildschirmmitte für einen neuen Node finden. */
function freeSpot(type: NodeTypeId): [number, number] {
  const lay = layoutOf(type);
  const [cx, cy] = [camera.s.x - lay.w / 2, camera.s.y - lay.h / 2];
  for (let r = 0; r < 30; r++) {
    const steps = Math.max(1, r * 8);
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const x = Math.round(cx + Math.cos(a) * r * 70);
      const y = Math.round(cy + Math.sin(a) * r * 60);
      const overlaps = game.state.nodes.some((n) => {
        const l = layoutOf(n.type);
        return x < n.x + l.w + 40 && x + lay.w + 40 > n.x && y < n.y + l.h + 20 && y + lay.h + 20 > n.y;
      });
      if (!overlaps) return [x, y];
    }
  }
  return [cx, cy];
}

/** Nach dem Austausch des States (Laden, Reset, Prestige) UI neu verknüpfen. */
function rebind(): void {
  camera.s = game.state.camera;
  ui.selectedNode = null;
  ui.selectedConnection = null;
  hud.resetRates();
}

function showOfflineReport(r: OfflineReport): void {
  if (r.cappedSeconds < CONFIG.offline.minSeconds) return;
  const capped = r.cappedSeconds < r.seconds ? ` (gedeckelt auf ${fmtTime(r.cappedSeconds)})` : '';
  const nothing = r.hacks === 0 && r.money < 0.01 && r.crypto < 1e-6;
  showModal(
    'Willkommen zurück',
    `Du warst ${fmtTime(r.seconds)} weg${capped}.<br><br>` +
      (nothing
        ? 'Deine Rechner haben in der Zeit nichts getan. Mit <b>Hack-Scripts</b> (Forschung „Automatisierung“) laufen Hacks auch offline weiter.'
        : `<div class="kv">
            <span>Hacks</span><b>${fmt(r.hacks)}</b>
            <span>Geld</span><b class="c-money">+${fmtMoney(r.money)}</b>
            <span>Daten verkauft</span><b class="c-data">${fmtBytes(r.data)}</b>
            <span>Krypto</span><b class="c-crypto">+${fmt(r.crypto, 3)} ₿</b>
            <span>Reputation</span><b class="c-rep">+${fmt(r.rep)}</b>
          </div>`),
    [{ label: 'Weiter', primary: true }],
  );
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
      rebind();
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
          rebind();
          toasts.show('Neues Spiel gestartet', 'info');
        },
      },
    ]);
  },
  research(id) {
    game.research(id);
  },
  prestige() {
    const n = game.pendingTokens();
    showModal(
      'Neue Identität annehmen?',
      `Du erhältst <b class="c-rep">${fmt(n)} Ghost-Tokens</b>. Geld, Krypto, Reputation, Hardware und Forschung werden zurückgesetzt.`,
      [
        { label: 'Abbrechen' },
        {
          label: 'Spuren verwischen',
          primary: true,
          action: () => {
            if (game.prestige()) {
              rebind();
              toasts.show(`Neue Identität! +${fmt(n)} ◆`, 'ok', 5000);
            }
          },
        },
      ],
    );
  },
  sellCrypto(fraction) {
    const euros = game.sellCrypto(fraction);
    if (euros > 0) toasts.show(`Krypto verkauft: +${fmtMoney(euros)}`, 'ok', 2500);
  },
  buyCrypto(fraction) {
    const coins = game.buyCrypto(fraction);
    if (coins > 0) toasts.show(`Krypto gekauft: +${fmt(coins, 4)} ₿`, 'ok', 2500);
  },
  foundCollective() {
    const n = game.pendingShares();
    showModal(
      'Kollektiv gründen?',
      `Du erhältst <b class="lime">${fmt(n)} Kollektiv-Anteile</b>. Lauf, Ghost-Tokens und Perks werden zurückgesetzt. Erfolge, Statistik und bisherige Kollektiv-Boni bleiben.`,
      [
        { label: 'Abbrechen' },
        {
          label: 'Gründen',
          primary: true,
          action: () => {
            if (game.foundCollective()) {
              rebind();
              toasts.show(`Kollektiv gegründet! +${fmt(n)} ✪`, 'ok', 6000);
            }
          },
        },
      ],
    );
  },
  buyPerk(id) {
    game.buyPerk(id);
  },
  exportSave() {
    showModal(
      'Spielstand exportieren',
      `Kopiere diesen Text, um deinen Spielstand zu sichern:<textarea readonly onclick="this.select()">${esc(game.exportSave())}</textarea>`,
      [{ label: 'Schließen', primary: true }],
    );
  },
  importSave() {
    showModal('Spielstand importieren', 'Füge einen exportierten Spielstand ein:<textarea id="import-text"></textarea>', [
      { label: 'Abbrechen' },
      {
        label: 'Importieren',
        primary: true,
        action: () => {
          const text = (document.getElementById('import-text') as HTMLTextAreaElement | null)?.value ?? '';
          if (game.importSave(text)) {
            rebind();
            toasts.show('Spielstand importiert', 'ok');
          } else toasts.show('Import fehlgeschlagen – ungültiger Text', 'bad');
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
  minigame(nodeId) {
    const n = game.node(nodeId);
    const t = n?.job ? targetById(n.job.targetId) : undefined;
    if (!n || !t || !game.canMinigame(nodeId)) return;
    openMinigame(t.name, (success) => {
      game.minigameResult(nodeId, success);
      toasts.show(success ? 'Aktiver Hack erfolgreich – Restzeit stark verkürzt!' : `Entdeckt! Trace +${CONFIG.minigame.tracePenalty} %`, success ? 'ok' : 'bad');
    });
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
      const text = '+' + fmtMoney(e.money) + (e.crypto > 0 ? `  +${fmt(e.crypto, 3)} ₿` : '') + (e.models > 0 ? `  +${fmt(e.models)} ◇` : '');
      if (targetById(e.targetId)?.phases) toasts.show('DER KERN IST GEKNACKT!', 'ok', 10000);
      ui.addFloating(n.x + lay.w / 2, n.y - 4, text, '#39ff88');
      const t = targetById(e.targetId);
      if (game.state.run.hacks === 1 && t) toasts.show(`Erster Hack erfolgreich: ${t.name}!`, 'ok');
      break;
    }
    case 'phase': {
      const t = targetById(e.targetId);
      const ph = t?.phases?.[e.phase];
      if (ph) toasts.show(`${t!.name}: Phase ${e.phase + 1} – ${ph.name}`, 'info', 5000);
      break;
    }
    case 'achievement': {
      const a = CONFIG.achievements.find((x) => x.id === e.id);
      if (a) toasts.show(`🏆 Erfolg: ${a.name}`, 'ok', 6000);
      break;
    }
    case 'worldEvent': {
      const tone = worldEventById(e.id)?.tone ?? 'info';
      toasts.show((e.started ? '📰 ' : '') + e.text, e.started ? tone : 'info', e.started ? 6000 : 3000);
      break;
    }
    case 'rivalWarning':
      toasts.show(
        `⚔ Rivalen-Angriff in ${CONFIG.rivals.warningSeconds} s! Stärke ${fmt(e.strength)}, deine Abwehr ${fmt(e.defense)}.${e.defense < e.strength ? ' Firewalls ausbauen!' : ''}`,
        e.defense >= e.strength ? 'warn' : 'bad',
        8000,
      );
      break;
    case 'rivalAttack':
      toasts.show(e.text, e.repelled ? 'ok' : 'bad', 8000);
      break;
    case 'contract':
      toasts.show(e.text, e.success ? 'ok' : 'bad', 5000);
      break;
    case 'exploit': {
      const lab = game.state.nodes.find((n) => n.type === 'malware' && n.craft === e.family);
      if (lab) ui.addFloating(lab.x + layoutOf('malware').w / 2, lab.y - 4, `+${e.count} Exploit`, '#ff4fd8');
      break;
    }
    case 'raid':
      toasts.show(
        `RAZZIA! Verloren: ${fmtMoney(e.lostMoney)}, ${fmtBytes(e.lostData)} Daten, ${fmt(e.lostCrypto, 3)} ₿. Systeme ${CONFIG.trace.raidOfflineSeconds} s offline.`,
        'bad',
        8000,
      );
      break;
    case 'traceWarning':
      toasts.show(`Trace über ${CONFIG.trace.warnAt} % – Razzia droht! Pausieren oder VPN/Proxys nutzen.`, 'warn', 5000);
      break;
    case 'research': {
      const r = CONFIG.research.find((x) => x.id === e.id);
      if (r) toasts.show(`Erforscht: ${r.name}`, 'ok');
      break;
    }
    case 'info':
      toasts.show(e.text, e.tone ?? 'info');
      break;
  }
});

// ---------- Loop ----------

window.addEventListener('resize', () => renderer.resize());
window.addEventListener('beforeunload', () => game.save());

// Tab im Hintergrund: requestAnimationFrame pausiert → Zeit beim Zurückkehren nachrechnen.
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    hiddenAt = Date.now();
    game.save();
  } else if (hiddenAt) {
    const report = game.catchUp((Date.now() - hiddenAt) / 1000);
    hiddenAt = 0;
    if (report) showOfflineReport(report);
  }
});

$('btn-zoom-in').onclick = () => camera.zoomAt(camera.width / 2, camera.height / 2, 1.25);
$('btn-zoom-out').onclick = () => camera.zoomAt(camera.width / 2, camera.height / 2, 0.8);
$('btn-center').onclick = () => {
  const ns = game.state.nodes;
  const xs = ns.map((n) => n.x);
  const ys = ns.map((n) => n.y);
  const x1 = Math.max(...ns.map((n) => n.x + layoutOf(n.type).w));
  const y1 = Math.max(...ns.map((n) => n.y + layoutOf(n.type).h));
  camera.fit(Math.min(...xs), Math.min(...ys), x1, y1);
};

renderer.resize();
if (offline) showOfflineReport(offline);

let last = performance.now();
let uiAcc = 0;
function frame(now: number): void {
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;
  ui.time += dt;
  game.update(dt);
  renderer.render(dt);
  uiAcc += dt;
  if (uiAcc >= 0.15) {
    hud.update(uiAcc);
    uiAcc = 0;
    panel.update();
    inspector.update();
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Debug-Zugriff in der Konsole
(window as unknown as { netbreach: Game; netbreachConfig: typeof CONFIG }).netbreach = game;
(window as unknown as { netbreachConfig: typeof CONFIG }).netbreachConfig = CONFIG;
