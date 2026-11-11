// Suche nach Name, WKN, ISIN oder Ticker über die Edge Function `lookup` (supabase/functions/lookup).

/** Liefert eine search(query, signal)-Funktion für AddStock. */
export function createSearch(client) {
  return async (query, signal) => {
    const { data, error } = await client.functions.invoke('lookup', { body: { q: query }, signal });
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  };
}
