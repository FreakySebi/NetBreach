import type { PortDef } from '../nodes/definitions';

export interface PortRef {
  nodeId: number;
  port: PortDef;
}

export interface FloatingText {
  x: number;
  y: number;
  text: string;
  color: string;
  age: number;
}

export interface CableDrag {
  from: PortRef;
  x: number; // Weltkoordinaten der Maus
  y: number;
}

/** Reiner UI-Zustand (wird nicht gespeichert). */
export class UIState {
  selectedNode: number | null = null;
  selectedConnection: number | null = null;
  hoverPort: PortRef | null = null;
  hoverNode: number | null = null;
  hoverButton: number | null = null;
  hoverConnection: number | null = null;
  cableDrag: CableDrag | null = null;
  floating: FloatingText[] = [];
  time = 0;

  addFloating(x: number, y: number, text: string, color: string): void {
    if (this.floating.length > 80) this.floating.shift();
    this.floating.push({ x, y, text, color, age: 0 });
  }
}
