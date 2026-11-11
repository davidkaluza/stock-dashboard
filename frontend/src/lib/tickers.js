// Abgleich der lokalen Depot-Ticker mit user_tickers in Supabase.
// Nur die Ticker verlassen das Gerät – Menge, Kaufkurs, Datum und Depot nie.

export const normalizeSymbol = (s) => String(s || '').trim().toUpperCase();

/** Ticker aus allen Depots (ohne alte Positionen), sortiert und eindeutig. */
export function collectSymbols(accounts) {
  const set = new Set();
  for (const a of accounts || []) {
    for (const s of a.watchlist || []) {
      const sym = normalizeSymbol(s);
      if (sym) set.add(sym);
    }
  }
  return [...set].sort();
}

/**
 * Was muss auf dem Server ergänzt/entfernt werden?
 * Ist die lokale Liste leer (frisch installiertes Gerät, noch nichts importiert), wird nichts entfernt.
 */
export function diffTickers(local, remote) {
  const localSet = new Set(local.map(normalizeSymbol));
  const remoteSet = new Set(remote.map(normalizeSymbol));
  const toAdd = [...localSet].filter((s) => !remoteSet.has(s)).sort();
  const toRemove = localSet.size === 0 ? [] : [...remoteSet].filter((s) => !localSet.has(s)).sort();
  return { toAdd, toRemove };
}

export async function syncTickers(client, localSymbols) {
  const { data, error } = await client.from('user_tickers').select('symbol');
  if (error) throw error;
  const { toAdd, toRemove } = diffTickers(localSymbols, (data || []).map((r) => r.symbol));
  if (toAdd.length) {
    const { error: e } = await client
      .from('user_tickers')
      .upsert(toAdd.map((symbol) => ({ symbol })), { onConflict: 'user_id,symbol', ignoreDuplicates: true });
    if (e) throw e;
  }
  if (toRemove.length) {
    const { error: e } = await client.from('user_tickers').delete().in('symbol', toRemove);
    if (e) throw e;
  }
  return { toAdd, toRemove };
}
