/*
 * js/lib/format.js: numbers for people. Raw amounts are BigInt in token units; display values are plain numbers.
 * Nothing here touches the DOM, so the API routes and tools can import it too.
 */

const nf = (min, max) => new Intl.NumberFormat('en-US', { minimumFractionDigits: min, maximumFractionDigits: max });
const NF = new Map();
const fmt = (n, min, max) => { const k = min + ':' + max; if (!NF.has(k)) NF.set(k, nf(min, max)); return NF.get(k).format(n); };

/** BigInt raw amount -> exact decimal string ("1.5" for 1500000n at 6 decimals). */
export function formatUnits(raw, decimals = 18) {
  const v = BigInt(raw);
  const neg = v < 0n;
  const s = (neg ? -v : v).toString().padStart(decimals + 1, '0');
  const int = s.slice(0, s.length - decimals);
  const frac = decimals ? s.slice(s.length - decimals).replace(/0+$/, '') : '';
  return (neg ? '-' : '') + int + (frac ? '.' + frac : '');
}

/** BigInt raw amount -> Number in whole units (display only, never for math that sends). */
export const toNum = (raw, decimals = 18) => (raw === null || raw === undefined ? NaN : Number(formatUnits(raw, decimals)));

/**
 * A typed amount -> BigInt raw units, exactly, or null when it is not a plain positive decimal.
 * Accepts "1,234.5" and ".5", and a lone comma as the decimal mark ("0,5" is 0.5: a European phone keypad types
 * a comma for the decimal key). Refuses "1.234,5" (grouping that would be guessed) and more fraction digits than the
 * token has.
 */
export function parseAmount(text, decimals = 18) {
  let s = String(text ?? '').trim().replace(/[\s_]/g, '');
  const commas = (s.match(/,/g) || []).length;
  if (commas && !s.includes('.')) s = commas === 1 ? s.replace(',', '.') : s.replace(/,/g, '');
  else if (commas) {
    if (s.lastIndexOf(',') > s.indexOf('.')) return null;
    s = s.replace(/,/g, '');
  }
  if (!/^(\d+\.?\d*|\.\d+)$/.test(s)) return null;
  const [i, f = ''] = s.split('.');
  if (f.length > decimals) return null;
  return BigInt((i || '0') + f.padEnd(decimals, '0'));
}

/** "$1,234.56"; compact: "$1.23M". Tiny positive values read "<$0.01". */
export function usd(n, { compact = false, dp = 2 } = {}) {
  if (n === null || n === undefined || !Number.isFinite(n)) return '-';
  if (n > 0 && n < 0.01) return '<$0.01';
  if (compact && Math.abs(n) >= 1e4) {
    const units = [[1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
    for (const [v, u] of units) if (Math.abs(n) >= v) return '$' + fmt(n / v, 0, Math.abs(n / v) >= 100 ? 0 : Math.abs(n / v) >= 10 ? 1 : 2) + u;
  }
  return '$' + fmt(n, dp, dp);
}

/** A price: more digits below a dollar. */
export const price = (n) => (!Number.isFinite(n) ? '-' : n >= 1000 ? usd(n, { dp: 2 }) : n >= 1 ? usd(n, { dp: 2 }) : '$' + fmt(n, 4, 4));

/** A plain number with up to dp decimals (trailing zeros dropped). */
export function num(n, dp = 4) {
  if (n === null || n === undefined || !Number.isFinite(n)) return '-';
  if (n > 0 && n < 10 ** -dp) return '<' + fmt(10 ** -dp, 0, dp);
  return fmt(n, 0, dp);
}

/** A token amount from raw units: tok(1234500000n, 6) -> "1,234.5". */
export const tok = (raw, decimals, dp = 4) => num(toNum(raw, decimals), dp);

/** A fraction as a percent: pct(0.625) -> "62.5%". */
export function pct(x, dp = 2) {
  if (x === null || x === undefined || !Number.isFinite(x)) return '-';
  if (x > 0 && x < 10 ** -(dp + 2)) return '<' + fmt(10 ** -dp, 0, dp) + '%';
  return fmt(x * 100, 0, dp) + '%';
}

/** Per-second WAD rate (Morpho) -> APY as a fraction, compounded every second as Morpho does. */
export const rateToApy = (perSecondWad, year = 31536000) => {
  const r = Number(perSecondWad) / 1e18;
  return Number.isFinite(r) ? Math.expm1(r * year) : NaN;
};

export const short = (a) => (a ? a.slice(0, 6) + '...' + a.slice(-4) : '');

/** "3m ago", "2h ago", "5d ago". */
export function ago(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '';
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
  if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
  return Math.floor(seconds / 86400) + 'd ago';
}

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
