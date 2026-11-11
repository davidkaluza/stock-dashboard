// Marktdaten aus Supabase, in denselben Formen, die die Komponenten vom alten Backend kannten:
//   stockData[symbol] = {symbol, name, price, change, change_percent, currency, status, fetched_at}
//   statsData[symbol] = {performance: {'1d': {pct, abs}, …}}
//   Tageskurse        = [{date: 'YYYY-MM-DD', price}]

const PAGE = 1000; // PostgREST liefert höchstens 1000 Zeilen pro Abfrage

/** Alle Seiten einer Abfrage laden. `build` erzeugt die Abfrage neu (ein Builder ist nur einmal nutzbar). */
async function selectAll(build) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PAGE) return rows;
  }
}

/** Kurse, Stammdaten und Performance für viele Symbole in drei Abfragen. */
export async function fetchSnapshot(client, symbols) {
  if (!symbols.length) return { stockData: {}, statsData: {} };
  const [sym, quotes, stats] = await Promise.all([
    client.from('symbols').select('symbol,name,currency,status').in('symbol', symbols),
    client.from('quotes').select('symbol,price,prev_close,change,change_pct,fetched_at').in('symbol', symbols),
    client.from('stats').select('symbol,data').in('symbol', symbols),
  ]);
  for (const r of [sym, quotes, stats]) if (r.error) throw r.error;

  const stockData = {};
  for (const s of symbols) stockData[s] = { symbol: s, status: 'pending' };
  for (const r of sym.data) {
    stockData[r.symbol] = { ...stockData[r.symbol], name: r.name, currency: r.currency, status: r.status };
  }
  for (const q of quotes.data) {
    stockData[q.symbol] = {
      ...stockData[q.symbol],
      price: q.price,
      prev_close: q.prev_close,
      change: q.change,
      change_percent: q.change_pct,
      fetched_at: q.fetched_at,
    };
  }
  const statsData = {};
  for (const r of stats.data) statsData[r.symbol] = { performance: r.data?.performance || {} };
  return { stockData, statsData };
}

/** Tageskurse ab `since` für mehrere Symbole → {symbol: [{date, price}]} (aufsteigend). */
export async function fetchDailyPrices(client, symbols, since) {
  const result = Object.fromEntries(symbols.map((s) => [s, []]));
  if (!symbols.length) return result;
  const rows = await selectAll(() => {
    let q = client.from('daily_prices').select('symbol,date,close').in('symbol', symbols);
    if (since) q = q.gte('date', since);
    return q.order('symbol').order('date');
  });
  for (const r of rows) result[r.symbol]?.push({ date: r.date, price: r.close });
  return result;
}

export async function fetchDetails(client, symbol) {
  const { data, error } = await client.from('details').select('data,fetched_at').eq('symbol', symbol).maybeSingle();
  if (error) throw error;
  return data ? { ...data.data, fetched_at: data.fetched_at } : null;
}

export async function fetchNews(client, symbol, limit = 10) {
  const { data, error } = await client
    .from('news')
    .select('id,title,publisher,link,published_at')
    .eq('symbol', symbol)
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

/** „Stand: 14:30“ bzw. „Stand: 10.11. 22:00“, wenn nicht von heute */
export function formatFetchedAt(iso, now = new Date()) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const time = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return `Stand: ${time}`;
  return `Stand: ${d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })} ${time}`;
}
