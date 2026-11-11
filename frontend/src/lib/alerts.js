// Push-Regeln pro Aktie (Tabelle alert_rules). Auswertung und Versand macht die GitHub Action (pipeline/alerts.py).

export const RULE_TYPES = [
  { type: 'day_change', label: 'Tagesänderung', hint: 'Meldung, wenn sich der Kurs gegenüber dem Vortag um mindestens X % ändert (je Richtung einmal pro Tag).' },
  { type: 'threshold', label: 'Kursschwelle', hint: 'Meldung, wenn der Kurs über bzw. unter einen festen Wert geht (erneut erst nach Rückkehr).' },
  { type: 'reference', label: 'Referenzkurs', hint: 'Meldung bei ±X % gegenüber einem Referenzkurs, z. B. deinem Kaufkurs.' },
  { type: 'news', label: 'News', hint: 'Meldung bei neuen Nachrichten zur Aktie.' },
];

export const REFERENCE_PRIVACY_HINT = 'Der Referenzkurs wird für die Benachrichtigung auf dem Server gespeichert. Menge, Kaufdatum und Depot bleiben auf diesem Gerät.';

const num = (v) => {
  if (v === '' || v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
};

/** Eingaben prüfen und normalisieren → {params} oder {error} */
export function validateParams(type, input = {}) {
  if (type === 'day_change') {
    const pct = num(input.pct);
    if (!(pct > 0 && pct <= 100)) return { error: 'Prozentwert zwischen 0 und 100 angeben.' };
    return { params: { pct } };
  }
  if (type === 'threshold') {
    const above = num(input.above);
    const below = num(input.below);
    if (Number.isNaN(above) || Number.isNaN(below)) return { error: 'Ungültige Zahl.' };
    if (above === null && below === null) return { error: 'Mindestens eine Schwelle angeben.' };
    if ((above !== null && above <= 0) || (below !== null && below <= 0)) return { error: 'Schwellen müssen größer als 0 sein.' };
    if (above !== null && below !== null && below >= above) return { error: '„Unter“ muss kleiner als „über“ sein.' };
    const params = {};
    if (above !== null) params.above = above;
    if (below !== null) params.below = below;
    return { params };
  }
  if (type === 'reference') {
    const price = num(input.price);
    const pct = num(input.pct);
    if (!(price > 0)) return { error: 'Referenzkurs größer als 0 angeben.' };
    if (!(pct > 0 && pct <= 1000)) return { error: 'Prozentwert größer als 0 angeben.' };
    return { params: { price, pct } };
  }
  if (type === 'news') return { params: {} };
  return { error: 'Unbekannter Regeltyp.' };
}

/** Standardwerte für den Dialog */
export function defaultParams(type, { purchasePrice, price } = {}) {
  if (type === 'day_change') return { pct: 5 };
  if (type === 'threshold') {
    const p = Number(price);
    return Number.isFinite(p) && p > 0 ? { above: +(p * 1.1).toFixed(2), below: +(p * 0.9).toFixed(2) } : { above: '', below: '' };
  }
  if (type === 'reference') return { price: Number(purchasePrice) > 0 ? purchasePrice : (Number(price) > 0 ? price : ''), pct: 10 };
  return {};
}

/** [{symbol, type, …}] → {symbol: {type: rule}} */
export function groupRules(rows) {
  const out = {};
  for (const r of rows || []) (out[r.symbol] ||= {})[r.type] = r;
  return out;
}

export const hasActiveRules = (bySymbol, symbol) => Object.values(bySymbol?.[symbol] || {}).some((r) => r.enabled);

/** Regeln für die JSON-Sicherung (ohne Server-Felder) */
export const rulesForBackup = (rows) => (rows || []).map(({ symbol, type, params, enabled }) => ({ symbol, type, params, enabled }));

// ── Supabase ───────────────────────────────────────────────────

export async function loadRules(client) {
  const { data, error } = await client.from('alert_rules').select('id,symbol,type,params,enabled');
  if (error) throw error;
  return data || [];
}

export async function saveRules(client, rows) {
  if (!rows.length) return [];
  const { data, error } = await client
    .from('alert_rules')
    .upsert(rows.map(({ symbol, type, params, enabled }) => ({ symbol, type, params, enabled })), { onConflict: 'user_id,symbol,type' })
    .select('id,symbol,type,params,enabled');
  if (error) throw error;
  return data || [];
}

export async function deleteRules(client, ids) {
  if (!ids.length) return;
  const { error } = await client.from('alert_rules').delete().in('id', ids);
  if (error) throw error;
}

export async function loadAlertLog(client, limit = 50) {
  const { data, error } = await client
    .from('alert_log')
    .select('id,symbol,title,body,sent_at')
    .order('sent_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}
