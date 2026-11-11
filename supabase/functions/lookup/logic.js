// Suche nach Name, WKN, ISIN oder Ticker → Yahoo-Ticker.
// Reines ESM ohne Deno- oder Browser-APIs: läuft in der Edge Function (Deno) und in vitest.

export const MAX_RESULTS = 10;

/**
 * Nur angemeldete Nutzer dürfen suchen. Die Signatur des JWT prüft das Supabase-Gateway
 * (verify_jwt = true, ungültige Tokens werden dort abgewiesen); hier wird geprüft, dass überhaupt
 * ein Nutzer-JWT kommt – der öffentliche Schlüssel allein (Rolle anon) reicht nicht.
 */
export function isUserRequest(authorization) {
  const match = /^Bearer\s+([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+$/.exec(String(authorization || '').trim());
  if (!match) return false;
  try {
    const b64 = match[2].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)));
    return payload.role === 'authenticated' && typeof payload.sub === 'string' && payload.sub.length > 0;
  } catch {
    return false;
  }
}

// Bloomberg/OpenFIGI-Börsencode → [Yahoo-Endung, Anzeigename].
// Nur Codes, deren Bedeutung gesichert ist; alles andere wird verworfen.
export const EXCHANGES = {
  GY: ['.DE', 'Xetra'],
  GR: ['.DE', 'Xetra'], // deutsche Sammelnotierung (Composite) – bei ETFs oft die einzige deutsche Zeile
  GF: ['.F', 'Frankfurt'],
  GM: ['.MU', 'München'],
  GS: ['.SG', 'Stuttgart'],
  GD: ['.DU', 'Düsseldorf'],
  GH: ['.HM', 'Hamburg'],
  US: ['', 'USA'],
  UN: ['', 'NYSE'],
  UW: ['', 'Nasdaq'],
  UQ: ['', 'Nasdaq'],
  UA: ['', 'NYSE American'],
  LN: ['.L', 'London'],
  FP: ['.PA', 'Paris'],
  NA: ['.AS', 'Amsterdam'],
  SW: ['.SW', 'SIX Zürich'],
  IM: ['.MI', 'Mailand'],
  SM: ['.MC', 'Madrid'],
  AV: ['.VI', 'Wien'],
};

// Heimatbörse nach ISIN-Länderpräfix (für die Sortierung nach Xetra)
const HOME = { DE: ['GY', 'GR'], US: ['US', 'UN', 'UW', 'UQ', 'UA'], GB: ['LN'], FR: ['FP'], NL: ['NA'], CH: ['SW'], IT: ['IM'], ES: ['SM'], AT: ['AV'] };
const GERMAN = ['GY', 'GR'];
const CURRENCY_SUFFIX = /(USD|EUR|CHF|GBP|GBX|NOK|SEK|DKK|AUD|CAD|JPY)$/;

/** Gültige ISIN inkl. Prüfziffer? */
export function isValidIsin(value) {
  const s = String(value || '').toUpperCase();
  if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(s)) return false;
  const digits = s.split('').map((c) => (/[A-Z]/.test(c) ? String(c.charCodeAt(0) - 55) : c)).join('');
  let sum = 0;
  for (let i = 0; i < digits.length; i += 1) {
    let n = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  }
  return sum % 10 === 0;
}

/** 'isin' | 'wkn' | 'text'. WKNs haben 6 Zeichen und mindestens eine Ziffer (sonst wäre z. B. „NVIDIA“ eine WKN). */
export function classifyQuery(query) {
  const q = String(query || '').trim().toUpperCase();
  if (isValidIsin(q)) return 'isin';
  if (/^[A-Z0-9]{6}$/.test(q) && /\d/.test(q)) return 'wkn';
  return 'text';
}

/** Eingabe als direkter Ticker (wie AddStock.sanitizeSymbol) */
export const sanitizeTicker = (value) => String(value || '').trim().replace(/\s+/g, '').replace(/[^A-Z0-9.^=-]/gi, '').toUpperCase();

/** Ein OpenFIGI-Treffer → Yahoo-Ergebnis oder null */
export function figiToYahoo(item) {
  if (!item || typeof item.ticker !== 'string') return null;
  const exch = EXCHANGES[item.exchCode];
  if (!exch) return null;
  const ticker = item.ticker.trim().toUpperCase();
  if (!ticker || /\s/.test(ticker)) return null;
  if (ticker.length > 4 && CURRENCY_SUFFIX.test(ticker)) return null; // Währungsvarianten wie SAPUSD
  const symbol = ticker.replace(/\//g, '-') + exch[0];
  return { symbol, name: item.name || '', exchange: exch[1], type: item.securityType || item.marketSector || '', source: 'openfigi', exchCode: item.exchCode };
}

/** OpenFIGI-Treffer übersetzen, nach Börse sortieren (Xetra, Heimatbörse, Rest) und doppelte Symbole entfernen */
export function rankFigi(items, isin = '') {
  const home = HOME[String(isin).slice(0, 2).toUpperCase()] || [];
  const order = Object.keys(EXCHANGES);
  const rank = (code) => (GERMAN.includes(code) ? 0 : home.includes(code) ? 1 : 2) * 100 + order.indexOf(code);
  const mapped = (items || []).map(figiToYahoo).filter(Boolean).sort((a, b) => rank(a.exchCode) - rank(b.exchCode));
  return dedupe(mapped).map(({ exchCode, ...rest }) => rest);
}

/** Ein Yahoo-Suchtreffer → Ergebnis oder null */
export function normalizeYahoo(item) {
  if (!item || !item.symbol) return null;
  return {
    symbol: String(item.symbol).toUpperCase(),
    name: item.longname || item.shortname || item.name || '',
    exchange: item.exchDisp || item.exchange || '',
    type: item.typeDisp || item.quoteType || '',
    source: 'yahoo',
  };
}

export function dedupe(results) {
  const seen = new Set();
  return results.filter((r) => {
    if (!r?.symbol || seen.has(r.symbol)) return false;
    seen.add(r.symbol);
    return true;
  });
}

async function openFigi(fetchFn, idType, idValue, apiKey) {
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers['X-OPENFIGI-APIKEY'] = apiKey;
  const res = await fetchFn('https://api.openfigi.com/v3/mapping', {
    method: 'POST',
    headers,
    body: JSON.stringify([{ idType, idValue }]),
  });
  if (!res.ok) throw new Error(`OpenFIGI ${res.status}`);
  const [first] = await res.json();
  return first?.data || [];
}

async function yahooSearch(fetchFn, query, limit) {
  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=${limit}&newsCount=0&listsCount=0`;
  const res = await fetchFn(url, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Yahoo ${res.status}`);
  const data = await res.json();
  return (data?.quotes || []).map(normalizeYahoo).filter(Boolean);
}

/**
 * Hauptfunktion. Fehler einzelner Quellen werden geschluckt, solange eine Quelle etwas liefert.
 * @returns {Promise<Array<{symbol, name, exchange, type, source}>>}
 */
export async function lookup(query, { fetchFn, openFigiKey = '', limit = MAX_RESULTS } = {}) {
  const q = String(query || '').trim();
  if (q.length < 2) return [];
  const kind = classifyQuery(q);
  const upper = q.toUpperCase();
  let results = [];
  const errors = [];

  if (kind === 'isin' || kind === 'wkn') {
    try {
      const items = await openFigi(fetchFn, kind === 'isin' ? 'ID_ISIN' : 'ID_WERTPAPIER', upper, openFigiKey);
      results = rankFigi(items, kind === 'isin' ? upper : '');
    } catch (e) {
      errors.push(e);
    }
  }
  if (results.length === 0) {
    try {
      results = await yahooSearch(fetchFn, q, limit);
    } catch (e) {
      errors.push(e);
    }
  }
  if (kind === 'text') {
    const direct = sanitizeTicker(q);
    if (direct && !results.some((r) => r.symbol === direct)) {
      results.push({ symbol: direct, name: 'Direkte Eingabe', exchange: '', type: 'Ticker', source: 'direct' });
    }
  }
  if (results.length === 0 && errors.length) throw errors[0];
  return dedupe(results).slice(0, limit);
}
