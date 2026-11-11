// Chart-Zeiträume, lokal aus Tagesschlusskursen (daily_prices) berechnet.
// Das Kaufdatum verlässt dabei nie das Gerät.

export const CHART_PERIODS = [
  { label: '1W', value: '1wk' },
  { label: '1M', value: '1mo' },
  { label: '3M', value: '3mo' },
  { label: '6M', value: '6mo' },
  { label: '1Y', value: '1y' },
  { label: '5Y', value: '5y' },
  { label: '10Y', value: '10y' },
];

export const SINCE_PURCHASE = 'since_purchase';
export const DEFAULT_PERIOD = '1mo';

// Wie viel Historie für die Karten beim Start geladen wird (Rest bei Bedarf)
export const CARD_HISTORY_DAYS = 400;

const OFFSETS = {
  '1wk': { days: 7 },
  '1mo': { months: 1 },
  '3mo': { months: 3 },
  '6mo': { months: 6 },
  '1y': { months: 12 },
  '5y': { months: 60 },
  '10y': { months: 120 },
};

const pad = (n) => String(n).padStart(2, '0');

/** Date → 'YYYY-MM-DD' (UTC) */
export const toIsoDate = (date) =>
  `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;

const isIsoDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value);

/** Stichtag 'YYYY-MM-DD' für einen Zeitraum, oder null bei unbekanntem Zeitraum/fehlendem Kaufdatum. */
export function periodStart(period, today = new Date(), purchaseDate = '') {
  if (period === SINCE_PURCHASE) {
    return isIsoDate(purchaseDate) ? purchaseDate.slice(0, 10) : null;
  }
  const offset = OFFSETS[period];
  if (!offset) return null;
  const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  if (offset.days) d.setUTCDate(d.getUTCDate() - offset.days);
  if (offset.months) {
    const day = d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() - offset.months);
    // auf Monatsende begrenzen (31.03. − 1 Monat → 28./29.02.)
    const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(day, lastDay));
  }
  return toIsoDate(d);
}

/** Datum, ab dem Tageskurse für einen Zeitraum geladen sein müssen. */
export function daysAgo(days, today = new Date()) {
  const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - days);
  return toIsoDate(d);
}

/**
 * Tageskurse ([{date, price}], aufsteigend) auf einen Zeitraum filtern.
 * Für den Chart wird der letzte Kurs vor dem Stichtag mitgenommen, damit die Linie am Stichtag beginnt.
 */
export function filterHistory(rows, period, today = new Date(), purchaseDate = '') {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const start = periodStart(period, today, purchaseDate);
  if (!start) return rows;
  const idx = rows.findIndex((r) => r.date >= start);
  if (idx === -1) return rows.slice(-1);
  return rows.slice(Math.max(0, idx - 1));
}

/** Ist die geladene Historie (ab `loadedSince`) lang genug für den Zeitraum? */
export function hasHistoryFor(loadedSince, period, today = new Date(), purchaseDate = '') {
  const start = periodStart(period, today, purchaseDate);
  if (!start) return true;
  return Boolean(loadedSince) && loadedSince <= start;
}
