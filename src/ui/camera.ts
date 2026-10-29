import type { CameraState } from '../core/types';

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 2.5;

export class Camera {
  width = 1;
  height = 1;

  constructor(public s: CameraState) {}

  worldToScreen(wx: number, wy: number): [number, number] {
    return [(wx - this.s.x) * this.s.zoom + this.width / 2, (wy - this.s.y) * this.s.zoom + this.height / 2];
  }

  screenToWorld(sx: number, sy: number): [number, number] {
    return [(sx - this.width / 2) / this.s.zoom + this.s.x, (sy - this.height / 2) / this.s.zoom + this.s.y];
  }

  pan(dxScreen: number, dyScreen: number): void {
    this.s.x -= dxScreen / this.s.zoom;
    this.s.y -= dyScreen / this.s.zoom;
  }

  /** Zoomt so, dass der Weltpunkt unter dem Cursor fix bleibt. */
  zoomAt(sx: number, sy: number, factor: number): void {
    const [wx, wy] = this.screenToWorld(sx, sy);
    this.s.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.s.zoom * factor));
    const [nx, ny] = this.screenToWorld(sx, sy);
    this.s.x += wx - nx;
    this.s.y += wy - ny;
  }

  centerOn(wx: number, wy: number): void {
    this.s.x = wx;
    this.s.y = wy;
  }
}
