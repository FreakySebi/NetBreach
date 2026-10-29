import { fmtMoney, fmt } from '../core/format';
import type { Cost } from '../core/types';

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/**
 * Rendert HTML nur neu, wenn sich der Inhalt geändert hat –
 * so bleiben Buttons klickbar, obwohl das UI ständig aktualisiert wird.
 */
export class HtmlView {
  private last = '';
  constructor(
    public el: HTMLElement,
    private render: () => string,
  ) {}

  update(force = false): void {
    const html = this.render();
    if (force || html !== this.last) {
      this.el.innerHTML = html;
      this.last = html;
    }
  }
}

/** Event-Delegation über data-action-Attribute. */
export function delegate(el: HTMLElement, handler: (action: string, data: DOMStringMap, ev: MouseEvent) => void): void {
  el.addEventListener('click', (ev) => {
    const target = (ev.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!target || !el.contains(target) || target.hasAttribute('disabled')) return;
    handler(target.dataset.action!, target.dataset, ev);
  });
}

export function costHtml(cost: Cost): string {
  const parts: string[] = [];
  if (cost.money) parts.push(`<span class="c-money">${fmtMoney(cost.money)}</span>`);
  if (cost.crypto) parts.push(`<span class="c-crypto">${fmt(cost.crypto)} ₿</span>`);
  return parts.length ? parts.join(' + ') : '<span class="c-dim">gratis</span>';
}

