// Zahlen- und Positionsformatierung für die Anzeige (deutsch).

const MIN_CAGR_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

const isNum = (v) => v !== null && v !== '' && v !== undefined && Number.isFinite(Number(v));

const formatters = {};
const nf = (digits) => (formatters[digits] ||= new Intl.NumberFormat('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits }));

/** 1234.5 → „1.234,50“; ungültig → „—“ */
export const fmtNum = (v, digits = 2) => (isNum(v) ? nf(digits).format(Number(v)) : '—');

/** mit Vorzeichen: „+1,25“ / „-1,25“ */
export const fmtSigned = (v, digits = 2) => (isNum(v) ? `${Number(v) > 0 ? '+' : ''}${nf(digits).format(Number(v))}` : '—');

export const fmtPct = (v, digits = 2) => (isNum(v) ? `${fmtSigned(v, digits)} %` : '—');

const SYMBOLS = { EUR: '€', USD: '$', GBP: '£', GBp: 'p', CHF: 'CHF', JPY: '¥' };
export const currencySymbol = (cur) => SYMBOLS[cur] || cur || '';

export const fmtMoney = (v, cur, digits = 2) => (isNum(v) ? `${fmtNum(v, digits)} ${currencySymbol(cur)}`.trim() : '—');

/** Großzahlen: 1.2e9 → „1,20 Mrd.“ */
export function fmtLarge(v) {
  if (!isNum(v)) return '—';
  const n = Number(v);
  const abs = Math.abs(n);
  if (abs >= 1e12) return `${fmtNum(n / 1e12)} Bio.`;
  if (abs >= 1e9) return `${fmtNum(n / 1e9)} Mrd.`;
  if (abs >= 1e6) return `${fmtNum(n / 1e6)} Mio.`;
  if (abs >= 1e3) return `${fmtNum(n / 1e3)} Tsd.`;
  return fmtNum(n, 0);
}

export const signOf = (v) => (isNum(v) ? Math.sign(Number(v)) : 0);

export function daysSince(dateStr, now = new Date()) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return Math.max(0, Math.floor((now - d) / DAY_MS));
}

/** Kennzahlen einer Position. Fehlt der Kurs, sind die abhängigen Werte null. */
export function positionMetrics({ price, qty, buyPrice, buyDate }, now = new Date()) {
  const p = isNum(price) ? Number(price) : null;
  const q = isNum(qty) ? Number(qty) : 0;
  const b = isNum(buyPrice) ? Number(buyPrice) : 0;
  const cost = b * q;
  const value = p === null ? null : p * q;
  const pl = p === null || b <= 0 ? null : value - cost;
  const plPct = p === null || b <= 0 ? null : (p / b - 1) * 100;
  const days = daysSince(buyDate, now);
  const cagr = plPct !== null && days !== null && days >= MIN_CAGR_DAYS ? (Math.pow(p / b, 365 / days) - 1) * 100 : null;
  return { value, cost, pl, plPct, days, cagr };
}

// ── Umschaltbares Feld rechts in der Listenzeile ────────────────

export const BADGE_MODES = ['day', 'pl', 'value'];
export const BADGE_LABELS = { day: 'Tagesänderung', pl: 'G/V seit Kauf', value: 'Positionswert' };

export const nextBadgeMode = (mode) => BADGE_MODES[(BADGE_MODES.indexOf(mode) + 1) % BADGE_MODES.length];

/** {text, sign} für das Feld; sign steuert die Farbe (1 grün, -1 rot, 0 neutral) */
export function badgeContent(mode, stock = {}, position = {}) {
  if (mode === 'pl') {
    const { plPct } = positionMetrics({ price: stock.price, ...position });
    return { text: fmtPct(plPct, 2), sign: signOf(plPct) };
  }
  if (mode === 'value') {
    const { value, pl } = positionMetrics({ price: stock.price, ...position });
    return { text: value === null ? '—' : fmtMoney(value, stock.currency, value >= 10000 ? 0 : 2), sign: signOf(pl) };
  }
  return { text: fmtPct(stock.change_percent, 2), sign: signOf(stock.change_percent) };
}
