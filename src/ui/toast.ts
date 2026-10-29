import { esc } from './dom';

export type Tone = 'ok' | 'warn' | 'bad' | 'info';

export class Toasts {
  constructor(private el: HTMLElement) {}

  show(text: string, tone: Tone = 'info', ms = 3500): void {
    const div = document.createElement('div');
    div.className = `toast ${tone}`;
    div.innerHTML = esc(text);
    this.el.appendChild(div);
    while (this.el.children.length > 6) this.el.firstElementChild?.remove();
    setTimeout(() => div.classList.add('out'), ms);
    setTimeout(() => div.remove(), ms + 400);
  }
}

/** Einfaches Modal-Fenster. */
export function showModal(title: string, bodyHtml: string, buttons: { label: string; action?: () => void; primary?: boolean }[]): void {
  const back = document.createElement('div');
  back.className = 'modal-back';
  const box = document.createElement('div');
  box.className = 'modal';
  box.innerHTML = `<h2>${esc(title)}</h2><div class="modal-body">${bodyHtml}</div><div class="modal-buttons"></div>`;
  const bar = box.querySelector('.modal-buttons')!;
  for (const b of buttons) {
    const btn = document.createElement('button');
    btn.textContent = b.label;
    if (b.primary) btn.classList.add('primary');
    btn.onclick = () => {
      back.remove();
      b.action?.();
    };
    bar.appendChild(btn);
  }
  back.appendChild(box);
  document.body.appendChild(back);
}
