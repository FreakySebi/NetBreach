import type { Game } from '../core/game';
import type { Connection, NodeInstance } from '../core/types';
import {
  CATEGORY_COLORS,
  HEADER_H,
  LINE_H,
  NODE_DEFS,
  PAD,
  PORT_COLORS,
  layoutOf,
  portDef,
} from '../nodes/definitions';
import { nodeConfig } from '../nodes/stats';
import type { Camera } from './camera';
import { describeNode } from './nodeview';
import type { UIState } from './uistate';

const FONT = '"JetBrains Mono", "Fira Code", Consolas, monospace';

interface Packet {
  t: number;
}

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private packets = new Map<number, Packet[]>();
  private spawnAcc = new Map<number, number>();

  constructor(
    private canvas: HTMLCanvasElement,
    private game: Game,
    private camera: Camera,
    private ui: UIState,
  ) {
    this.ctx = canvas.getContext('2d')!;
  }

  resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    this.camera.width = rect.width;
    this.camera.height = rect.height;
  }

  render(dt: number): void {
    const ctx = this.ctx;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.camera.width, this.camera.height);
    this.drawGrid();

    const z = this.camera.s.zoom;
    ctx.save();
    ctx.translate(this.camera.width / 2, this.camera.height / 2);
    ctx.scale(z, z);
    ctx.translate(-this.camera.s.x, -this.camera.s.y);

    for (const c of this.game.state.connections) this.drawConnection(c, dt);
    if (this.ui.cableDrag) this.drawCableDrag();
    for (const n of this.game.state.nodes) this.drawNode(n);
    this.drawFloating(dt);
    ctx.restore();

    if (this.game.state.raidTimer > 0) this.drawRaidOverlay();
  }

  // ---------- Hintergrund ----------

  private drawGrid(): void {
    const ctx = this.ctx;
    const { width, height } = this.camera;
    const z = this.camera.s.zoom;
    let step = 40 * z;
    while (step < 18) step *= 2;
    const [ox, oy] = this.camera.worldToScreen(0, 0);
    const sx = ((ox % step) + step) % step;
    const sy = ((oy % step) + step) % step;
    ctx.fillStyle = '#0f2a1c';
    for (let x = sx; x < width; x += step) {
      for (let y = sy; y < height; y += step) {
        ctx.fillRect(x - 1, y - 1, 2, 2);
      }
    }
    // Achsenkreuz am Ursprung
    ctx.strokeStyle = 'rgba(57,255,136,0.06)';
    ctx.beginPath();
    ctx.moveTo(ox, 0);
    ctx.lineTo(ox, height);
    ctx.moveTo(0, oy);
    ctx.lineTo(width, oy);
    ctx.stroke();
  }

  // ---------- Nodes ----------

  private drawNode(node: NodeInstance): void {
    const ctx = this.ctx;
    const def = NODE_DEFS[node.type];
    const lay = layoutOf(node.type);
    const view = describeNode(this.game, node);
    const selected = this.ui.selectedNode === node.id;
    const blink = Math.sin(this.ui.time * 8) > 0;
    let color = CATEGORY_COLORS[def.category];
    if (view.alert && blink) color = '#ff4d6d';
    else if (view.warn) color = '#ffd23f';

    const { x, y } = node;
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = selected ? 22 : view.alert ? 18 : 10;
    ctx.fillStyle = 'rgba(8,12,14,0.96)';
    roundRect(ctx, x, y, lay.w, lay.h, 6);
    ctx.fill();
    ctx.restore();

    ctx.lineWidth = selected ? 2 : 1.2;
    ctx.strokeStyle = color;
    roundRect(ctx, x, y, lay.w, lay.h, 6);
    ctx.stroke();

    // Kopfzeile
    ctx.save();
    roundRect(ctx, x, y, lay.w, HEADER_H, 6);
    ctx.clip();
    ctx.fillStyle = hexAlpha(color, 0.16);
    ctx.fillRect(x, y, lay.w, HEADER_H);
    ctx.restore();
    ctx.strokeStyle = hexAlpha(color, 0.5);
    ctx.beginPath();
    ctx.moveTo(x, y + HEADER_H);
    ctx.lineTo(x + lay.w, y + HEADER_H);
    ctx.stroke();

    ctx.font = `bold 12px ${FONT}`;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(`${def.icon} ${nodeConfig(node.type).name.toUpperCase()}`, x + PAD, y + HEADER_H / 2 + 1);
    const lvl = Object.values(node.levels).reduce((a, b) => a + b, 0);
    if (lvl > 0) {
      ctx.textAlign = 'right';
      ctx.fillStyle = hexAlpha(color, 0.7);
      ctx.font = `10px ${FONT}`;
      ctx.fillText(`#${node.id} · LV ${lvl}`, x + lay.w - PAD, y + HEADER_H / 2 + 1);
      ctx.textAlign = 'left';
    }

    // Ports
    ctx.font = `10px ${FONT}`;
    for (const p of lay.ports) {
      const pc = PORT_COLORS[p.def.kind];
      const px = x + p.x;
      const py = y + p.y;
      const hovered = this.ui.hoverPort?.nodeId === node.id && this.ui.hoverPort.port.id === p.def.id;
      const dragKind = this.ui.cableDrag?.from.port;
      const compatible = dragKind && dragKind.kind === p.def.kind && dragKind.dir !== p.def.dir;
      ctx.beginPath();
      ctx.arc(px, py, hovered || compatible ? 7 : 5, 0, Math.PI * 2);
      ctx.fillStyle = hovered || compatible ? pc : '#05080a';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = pc;
      ctx.stroke();
      ctx.fillStyle = hexAlpha(pc, 0.85);
      if (p.def.dir === 'in') {
        ctx.textAlign = 'left';
        ctx.fillText(p.def.label, px + 11, py);
      } else {
        ctx.textAlign = 'right';
        ctx.fillText(p.def.label, px - 11, py);
      }
    }
    ctx.textAlign = 'left';

    // Infozeilen
    ctx.font = `11px ${FONT}`;
    view.lines.forEach((l, i) => {
      ctx.fillStyle = l.color ?? '#c8ffe0';
      ctx.fillText(clip(ctx, l.text, lay.w - PAD * 2), x + PAD, y + lay.linesY + i * LINE_H + LINE_H / 2);
    });

    if (lay.bar && view.bar) {
      const b = lay.bar;
      ctx.fillStyle = '#0d1a14';
      ctx.fillRect(x + b.x, y + b.y, b.w, b.h);
      ctx.fillStyle = view.bar.color;
      ctx.shadowColor = view.bar.color;
      ctx.shadowBlur = 6;
      ctx.fillRect(x + b.x, y + b.y, b.w * Math.min(1, Math.max(0, view.bar.ratio)), b.h);
      ctx.shadowBlur = 0;
      ctx.strokeStyle = hexAlpha(view.bar.color, 0.4);
      ctx.strokeRect(x + b.x + 0.5, y + b.y + 0.5, b.w - 1, b.h - 1);
      if (view.bar.label) {
        ctx.font = `9px ${FONT}`;
        ctx.fillStyle = '#e8fff2';
        ctx.textAlign = 'center';
        ctx.fillText(view.bar.label, x + b.x + b.w / 2, y + b.y + b.h / 2 + 1);
        ctx.textAlign = 'left';
      }
    }

    if (lay.button && view.button) {
      const b = lay.button;
      const hovered = this.ui.hoverButton === node.id;
      const en = view.button.enabled;
      const bc = en ? '#39ff88' : '#2c4a3a';
      ctx.fillStyle = en ? (hovered ? 'rgba(57,255,136,0.35)' : 'rgba(57,255,136,0.14)') : 'rgba(20,30,25,0.8)';
      roundRect(ctx, x + b.x, y + b.y, b.w, b.h, 4);
      ctx.fill();
      ctx.strokeStyle = bc;
      ctx.lineWidth = 1;
      roundRect(ctx, x + b.x, y + b.y, b.w, b.h, 4);
      ctx.stroke();
      ctx.font = `bold 11px ${FONT}`;
      ctx.fillStyle = en ? '#d9ffe9' : '#5f8a72';
      ctx.textAlign = 'center';
      ctx.fillText(view.button.label, x + b.x + b.w / 2, y + b.y + b.h / 2 + 1);
      ctx.textAlign = 'left';
    }
  }

  // ---------- Kabel ----------

  private portWorldPos(nodeId: number, portId: string): [number, number] | null {
    const node = this.game.node(nodeId);
    if (!node) return null;
    const p = layoutOf(node.type).ports.find((pp) => pp.def.id === portId);
    if (!p) return null;
    return [node.x + p.x, node.y + p.y];
  }

  private drawConnection(c: Connection, dt: number): void {
    const a = this.portWorldPos(c.from, c.fromPort);
    const b = this.portWorldPos(c.to, c.toPort);
    const fromNode = this.game.node(c.from);
    if (!a || !b || !fromNode) return;
    const kind = portDef(fromNode.type, c.fromPort)?.kind ?? 'data';
    const color = PORT_COLORS[kind];
    const flow = this.game.flows.get(c.id) ?? 0;
    const selected = this.ui.selectedConnection === c.id;
    const hovered = this.ui.hoverConnection === c.id;
    const ctx = this.ctx;
    const pts = bezierPoints(a, b);

    ctx.lineWidth = selected ? 4 : hovered ? 3 : 2;
    ctx.strokeStyle = hexAlpha(color, flow > 0 ? 0.75 : 0.3);
    ctx.shadowColor = color;
    ctx.shadowBlur = selected ? 12 : 0;
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.bezierCurveTo(pts[1][0], pts[1][1], pts[2][0], pts[2][1], b[0], b[1]);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Pakete: Anzahl skaliert logarithmisch mit dem Fluss
    let list = this.packets.get(c.id);
    if (!list) {
      list = [];
      this.packets.set(c.id, list);
    }
    if (flow > 0) {
      const perSec = Math.min(8, 1 + Math.log10(1 + flow) * 1.6);
      const acc = (this.spawnAcc.get(c.id) ?? 0) + perSec * dt;
      if (acc >= 1 && list.length < 24) {
        list.push({ t: 0 });
        this.spawnAcc.set(c.id, acc - 1);
      } else {
        this.spawnAcc.set(c.id, Math.min(acc, 1));
      }
    }
    const speed = 0.7;
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    for (const p of list) {
      p.t += speed * dt;
      const [px, py] = bezierAt(pts, p.t);
      ctx.fillRect(px - 3, py - 3, 6, 6);
    }
    ctx.shadowBlur = 0;
    while (list.length && list[0].t >= 1) list.shift();
  }

  private drawCableDrag(): void {
    const drag = this.ui.cableDrag!;
    const start = this.portWorldPos(drag.from.nodeId, drag.from.port.id);
    if (!start) return;
    const end: [number, number] = [drag.x, drag.y];
    const [a, b] = drag.from.port.dir === 'out' ? [start, end] : [end, start];
    const pts = bezierPoints(a, b);
    const ctx = this.ctx;
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = PORT_COLORS[drag.from.port.kind];
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.bezierCurveTo(pts[1][0], pts[1][1], pts[2][0], pts[2][1], b[0], b[1]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  /** Abstand eines Weltpunkts zum Kabel (für Hit-Tests). */
  connectionDistance(c: Connection, wx: number, wy: number): number {
    const a = this.portWorldPos(c.from, c.fromPort);
    const b = this.portWorldPos(c.to, c.toPort);
    if (!a || !b) return Infinity;
    const pts = bezierPoints(a, b);
    let best = Infinity;
    for (let i = 0; i <= 24; i++) {
      const [px, py] = bezierAt(pts, i / 24);
      best = Math.min(best, Math.hypot(px - wx, py - wy));
    }
    return best;
  }

  // ---------- Effekte ----------

  private drawFloating(dt: number): void {
    const ctx = this.ctx;
    ctx.font = `bold 12px ${FONT}`;
    ctx.textAlign = 'center';
    for (const f of this.ui.floating) {
      f.age += dt;
      const a = Math.max(0, 1 - f.age / 1.6);
      ctx.globalAlpha = a;
      ctx.fillStyle = f.color;
      ctx.shadowColor = f.color;
      ctx.shadowBlur = 8;
      ctx.fillText(f.text, f.x, f.y - f.age * 30);
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.textAlign = 'left';
    this.ui.floating = this.ui.floating.filter((f) => f.age < 1.6);
  }

  private drawRaidOverlay(): void {
    const ctx = this.ctx;
    const a = 0.12 + 0.08 * Math.sin(this.ui.time * 6);
    ctx.fillStyle = `rgba(255,30,60,${a})`;
    ctx.fillRect(0, 0, this.camera.width, this.camera.height);
    ctx.font = `bold 20px ${FONT}`;
    ctx.fillStyle = '#ff4d6d';
    ctx.textAlign = 'center';
    ctx.fillText(`⚠ RAZZIA – SYSTEME OFFLINE (${Math.ceil(this.game.state.raidTimer)} s)`, this.camera.width / 2, 40);
    ctx.textAlign = 'left';
  }
}

// ---------- Hilfsfunktionen ----------

type P = [number, number];

function bezierPoints(a: P, b: P): [P, P, P, P] {
  const dx = Math.max(40, Math.abs(b[0] - a[0]) * 0.5);
  return [a, [a[0] + dx, a[1]], [b[0] - dx, b[1]], b];
}

function bezierAt(p: [P, P, P, P], t: number): P {
  const u = 1 - t;
  const x = u * u * u * p[0][0] + 3 * u * u * t * p[1][0] + 3 * u * t * t * p[2][0] + t * t * t * p[3][0];
  const y = u * u * u * p[0][1] + 3 * u * u * t * p[1][1] + 3 * u * t * t * p[2][1] + t * t * t * p[3][1];
  return [x, y];
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function hexAlpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function clip(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
  return s + '…';
}
