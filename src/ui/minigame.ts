import { CONFIG } from '../core/config';
import { esc } from './dom';

/**
 * Terminal-Minispiel: Befehle unter Zeitdruck abtippen.
 * `done(true)` bei Erfolg, `done(false)` bei Zeitablauf oder zu vielen Fehlern,
 * Abbruch (Esc) ruft `done` nicht auf.
 */
export function openMinigame(targetName: string, done: (success: boolean) => void): void {
  const cfg = CONFIG.minigame;
  const pool = [...cfg.commands];
  const cmds: string[] = [];
  while (cmds.length < cfg.count && pool.length) cmds.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  let index = 0;
  let errors = 0;
  let finished = false;
  const start = performance.now();

  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal terminal">
    <h2>⌨ AKTIVER HACK: ${esc(targetName)}</h2>
    <div class="term-log"></div>
    <div class="term-line"><span class="prompt">root@netbreach:~$</span><input class="term-input" autocomplete="off" spellcheck="false" aria-label="Befehl eingeben"></div>
    <div class="term-time"><div></div></div>
    <p class="hint">Tippe die Befehle exakt ab und drücke Enter. Erfolg: −${Math.round(cfg.progressBonus * 100)} % Restzeit ·
      Misserfolg: +${cfg.tracePenalty} % Trace · Esc bricht ohne Folgen ab.</p>
  </div>`;
  document.body.appendChild(back);
  const log = back.querySelector<HTMLElement>('.term-log')!;
  const input = back.querySelector<HTMLInputElement>('.term-input')!;
  const bar = back.querySelector<HTMLElement>('.term-time div')!;

  const render = () => {
    log.innerHTML = cmds
      .map((c, i) => `<div class="${i < index ? 'ok' : i === index ? 'cur' : 'todo'}">${i < index ? '✓' : i === index ? '▸' : '·'} ${esc(c)}</div>`)
      .join('');
  };
  const finish = (success: boolean | null) => {
    if (finished) return;
    finished = true;
    clearInterval(timer);
    back.querySelector('.modal')!.classList.add(success ? 'win' : 'lose');
    if (success !== null) {
      log.innerHTML += `<div class="${success ? 'ok' : 'bad'}">${success ? '>> ZUGRIFF GEWÄHRT' : '>> VERBINDUNG ENTDECKT'}</div>`;
      done(success);
      setTimeout(() => back.remove(), 900);
    } else back.remove();
  };
  const timer = window.setInterval(() => {
    const left = 1 - (performance.now() - start) / (cfg.timeLimit * 1000);
    bar.style.width = `${Math.max(0, left) * 100}%`;
    if (left <= 0) finish(false);
  }, 50);

  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') finish(null);
    if (e.key !== 'Enter') return;
    if (input.value.trim() === cmds[index]) {
      index++;
      input.value = '';
      render();
      if (index >= cmds.length) finish(true);
    } else {
      errors++;
      input.classList.remove('shake');
      void input.offsetWidth;
      input.classList.add('shake');
      if (errors >= 3) finish(false);
    }
  });
  render();
  input.focus();
}
