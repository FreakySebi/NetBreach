const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

/** Formatiert große Zahlen: 1234 → 1.23K, 5.6e9 → 5.60B. */
export function fmt(n: number, decimals = 2): string {
  if (!isFinite(n)) return '∞';
  const sign = n < 0 ? '-' : '';
  const a = Math.abs(n);
  if (a < 1000) {
    if (a === 0) return '0';
    if (a < 10) return sign + trim(a.toFixed(decimals));
    if (a < 100) return sign + trim(a.toFixed(Math.min(decimals, 1)));
    return sign + Math.floor(a).toString();
  }
  const tier = Math.floor(Math.log10(a) / 3);
  if (tier >= SUFFIXES.length) return sign + a.toExponential(2).replace('+', '');
  const scaled = a / Math.pow(1000, tier);
  return sign + scaled.toFixed(scaled < 10 ? 2 : scaled < 100 ? 1 : 0) + SUFFIXES[tier];
}

function trim(s: string): string {
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}

export function fmtMoney(n: number): string {
  return fmt(n) + ' €';
}

const BYTE_UNITS = ['MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

/** Formatiert Datenmengen; Eingabe in MB. */
export function fmtBytes(mb: number): string {
  let v = Math.max(0, mb);
  let i = 0;
  while (v >= 1000 && i < BYTE_UNITS.length - 1) {
    v /= 1000;
    i++;
  }
  const s = v < 10 ? v.toFixed(2) : v < 100 ? v.toFixed(1) : v.toFixed(0);
  return trim(s) + ' ' + BYTE_UNITS[i];
}

export function fmtTime(seconds: number): string {
  if (!isFinite(seconds)) return '∞';
  if (seconds < 1) return seconds.toFixed(2) + ' s';
  if (seconds < 60) return seconds.toFixed(1) + ' s';
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m ${Math.floor(seconds % 60)}s`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

export function fmtPct(ratio: number): string {
  return Math.round(ratio * 100) + ' %';
}
