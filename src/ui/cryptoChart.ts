import { CONFIG } from '../core/config';
import { fmtMoney } from '../core/format';

/** Kleines Kurs-Diagramm als SVG (Verlauf + aktueller Kurs, gestrichelt das Mittel). */
export function cryptoChartSvg(history: number[], current: number): string {
  const pts = [...history, current];
  if (pts.length < 2) return '<div class="chart-empty">Kursdaten werden gesammelt …</div>';
  const W = 300;
  const H = 110;
  const pad = 6;
  const base = CONFIG.cryptoMarket.basePrice;
  const min = Math.min(...pts, base) * 0.97;
  const max = Math.max(...pts, base) * 1.03;
  const x = (i: number) => pad + (i / (pts.length - 1)) * (W - pad * 2);
  const y = (v: number) => H - pad - ((v - min) / (max - min)) * (H - pad * 2);
  const line = pts.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const up = current >= pts[0];
  const color = up ? '#39ff88' : '#ff4d6d';
  const area = `${x(0).toFixed(1)},${H - pad} ${line} ${x(pts.length - 1).toFixed(1)},${H - pad}`;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Kryptokurs">
    <line x1="${pad}" x2="${W - pad}" y1="${y(base).toFixed(1)}" y2="${y(base).toFixed(1)}" stroke="#6b8f7a" stroke-dasharray="4 4" stroke-width="1"/>
    <polygon points="${area}" fill="${color}" fill-opacity="0.12"/>
    <polyline points="${line}" fill="none" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke"/>
    <circle cx="${x(pts.length - 1).toFixed(1)}" cy="${y(current).toFixed(1)}" r="3" fill="${color}"/>
  </svg>
  <div class="chart-axis"><span>${fmtMoney(max)}</span><span>Mittel ${fmtMoney(base)}</span><span>${fmtMoney(min)}</span></div>`;
}
