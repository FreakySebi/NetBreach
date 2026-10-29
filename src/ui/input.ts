import type { Game } from '../core/game';
import { layoutOf } from '../nodes/definitions';
import type { Camera } from './camera';
import type { Renderer } from './renderer';
import type { PortRef, UIState } from './uistate';

type Mode =
  | { kind: 'none' }
  | { kind: 'pan'; lastX: number; lastY: number; moved: number }
  | { kind: 'node'; id: number; offX: number; offY: number }
  | { kind: 'cable' };

interface Hit {
  type: 'port' | 'button' | 'node' | 'connection' | 'empty';
  nodeId?: number;
  port?: PortRef;
  connectionId?: number;
}

export class Input {
  private mode: Mode = { kind: 'none' };

  constructor(
    private canvas: HTMLCanvasElement,
    private game: Game,
    private camera: Camera,
    private ui: UIState,
    private renderer: Renderer,
    private onAction: (action: 'button', nodeId: number) => void,
  ) {
    canvas.addEventListener('pointerdown', (e) => this.down(e));
    window.addEventListener('pointermove', (e) => this.move(e));
    window.addEventListener('pointerup', (e) => this.up(e));
    canvas.addEventListener('wheel', (e) => this.wheel(e), { passive: false });
    canvas.addEventListener('contextmenu', (e) => this.context(e));
    window.addEventListener('keydown', (e) => this.key(e));
  }

  private local(e: PointerEvent | MouseEvent): [number, number] {
    const r = this.canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  hitTest(sx: number, sy: number): Hit {
    const [wx, wy] = this.camera.screenToWorld(sx, sy);
    const portR = Math.max(9, 9 / this.camera.s.zoom);
    const nodes = this.game.state.nodes;
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      const lay = layoutOf(n.type);
      for (const p of lay.ports) {
        if (Math.hypot(wx - (n.x + p.x), wy - (n.y + p.y)) <= portR) {
          return { type: 'port', nodeId: n.id, port: { nodeId: n.id, port: p.def } };
        }
      }
      if (wx >= n.x && wx <= n.x + lay.w && wy >= n.y && wy <= n.y + lay.h) {
        const b = lay.button;
        if (b && wx >= n.x + b.x && wx <= n.x + b.x + b.w && wy >= n.y + b.y && wy <= n.y + b.y + b.h) {
          return { type: 'button', nodeId: n.id };
        }
        return { type: 'node', nodeId: n.id };
      }
    }
    const tol = 7 / this.camera.s.zoom;
    for (const c of this.game.state.connections) {
      if (this.renderer.connectionDistance(c, wx, wy) <= tol) return { type: 'connection', connectionId: c.id };
    }
    return { type: 'empty' };
  }

  private down(e: PointerEvent): void {
    const [sx, sy] = this.local(e);
    const hit = this.hitTest(sx, sy);
    const [wx, wy] = this.camera.screenToWorld(sx, sy);
    if (e.button === 1 || (e.button === 0 && hit.type === 'empty')) {
      this.mode = { kind: 'pan', lastX: sx, lastY: sy, moved: 0 };
      this.canvas.classList.add('panning');
      return;
    }
    if (e.button !== 0) return;
    switch (hit.type) {
      case 'button':
        this.ui.selectedNode = hit.nodeId!;
        this.ui.selectedConnection = null;
        this.onAction('button', hit.nodeId!);
        break;
      case 'port': {
        const ref = hit.port!;
        if (ref.port.dir === 'in') {
          // Vorhandenes Kabel am Eingang aufnehmen und neu stecken
          const existing = this.game.state.connections.find((c) => c.to === ref.nodeId && c.toPort === ref.port.id);
          if (existing) {
            const src = this.game.node(existing.from);
            const srcPort = src && layoutOf(src.type).ports.find((p) => p.def.id === existing.fromPort);
            this.game.disconnect(existing.id);
            if (src && srcPort) {
              this.ui.cableDrag = { from: { nodeId: src.id, port: srcPort.def }, x: wx, y: wy };
              this.mode = { kind: 'cable' };
              return;
            }
          }
        }
        this.ui.cableDrag = { from: ref, x: wx, y: wy };
        this.mode = { kind: 'cable' };
        break;
      }
      case 'node': {
        const n = this.game.node(hit.nodeId!)!;
        this.ui.selectedNode = n.id;
        this.ui.selectedConnection = null;
        // nach vorne holen
        const arr = this.game.state.nodes;
        arr.splice(arr.indexOf(n), 1);
        arr.push(n);
        this.mode = { kind: 'node', id: n.id, offX: wx - n.x, offY: wy - n.y };
        break;
      }
      case 'connection':
        this.ui.selectedConnection = hit.connectionId!;
        this.ui.selectedNode = null;
        break;
    }
  }

  private move(e: PointerEvent): void {
    const [sx, sy] = this.local(e);
    const [wx, wy] = this.camera.screenToWorld(sx, sy);
    switch (this.mode.kind) {
      case 'pan': {
        const dx = sx - this.mode.lastX;
        const dy = sy - this.mode.lastY;
        this.camera.pan(dx, dy);
        this.mode.moved += Math.abs(dx) + Math.abs(dy);
        this.mode.lastX = sx;
        this.mode.lastY = sy;
        return;
      }
      case 'node':
        this.game.moveNode(this.mode.id, Math.round(wx - this.mode.offX), Math.round(wy - this.mode.offY));
        return;
      case 'cable':
        if (this.ui.cableDrag) {
          this.ui.cableDrag.x = wx;
          this.ui.cableDrag.y = wy;
        }
        break;
    }
    if (e.target !== this.canvas && this.mode.kind === 'none') {
      this.clearHover();
      return;
    }
    const hit = this.hitTest(sx, sy);
    this.ui.hoverPort = hit.type === 'port' ? hit.port! : null;
    this.ui.hoverButton = hit.type === 'button' ? hit.nodeId! : null;
    this.ui.hoverNode = hit.nodeId ?? null;
    this.ui.hoverConnection = hit.type === 'connection' ? hit.connectionId! : null;
    this.canvas.style.cursor =
      hit.type === 'port' || hit.type === 'button' || hit.type === 'connection' ? 'pointer' : hit.type === 'node' ? 'move' : 'grab';
  }

  private clearHover(): void {
    this.ui.hoverPort = null;
    this.ui.hoverButton = null;
    this.ui.hoverConnection = null;
  }

  private up(e: PointerEvent): void {
    if (this.mode.kind === 'pan') {
      if (this.mode.moved < 4) {
        this.ui.selectedNode = null;
        this.ui.selectedConnection = null;
      }
      this.canvas.classList.remove('panning');
    }
    if (this.mode.kind === 'cable' && this.ui.cableDrag) {
      const [sx, sy] = this.local(e);
      const hit = this.hitTest(sx, sy);
      const from = this.ui.cableDrag.from;
      if (hit.type === 'port' && hit.port) {
        const to = hit.port;
        if (from.port.dir === 'out') this.game.connect(from.nodeId, from.port.id, to.nodeId, to.port.id);
        else this.game.connect(to.nodeId, to.port.id, from.nodeId, from.port.id);
      }
      this.ui.cableDrag = null;
    }
    this.mode = { kind: 'none' };
  }

  private wheel(e: WheelEvent): void {
    e.preventDefault();
    const [sx, sy] = this.local(e);
    this.camera.zoomAt(sx, sy, Math.exp(-e.deltaY * 0.0015));
  }

  private context(e: MouseEvent): void {
    e.preventDefault();
    const [sx, sy] = this.local(e);
    const hit = this.hitTest(sx, sy);
    if (hit.type === 'connection') this.game.disconnect(hit.connectionId!);
  }

  private key(e: KeyboardEvent): void {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && this.ui.selectedConnection !== null) {
      this.game.disconnect(this.ui.selectedConnection);
      this.ui.selectedConnection = null;
    }
    if (e.key === 'Escape') {
      this.ui.cableDrag = null;
      this.ui.selectedNode = null;
      this.ui.selectedConnection = null;
      this.mode = { kind: 'none' };
    }
  }
}
