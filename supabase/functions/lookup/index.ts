// Supabase Edge Function `lookup`: Suche nach Name, WKN, ISIN oder Ticker.
// Aufruf aus der PWA: supabase.functions.invoke('lookup', { body: { q } }) – nur mit gültiger Anmeldung
// (JWT-Prüfung der Edge Function ist standardmäßig an).
// Die Logik steckt in logic.js (ohne Deno-APIs, mit vitest getestet).
import { lookup } from './logic.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Nur POST' }, 405);

  let q = '';
  try {
    const body = await req.json();
    q = typeof body?.q === 'string' ? body.q.slice(0, 64) : '';
  } catch {
    return json({ error: 'Ungültige Anfrage' }, 400);
  }

  try {
    const results = await lookup(q, { fetchFn: fetch, openFigiKey: Deno.env.get('OPENFIGI_API_KEY') ?? '' });
    return json(results);
  } catch (e) {
    console.error('lookup', q, e);
    return json({ error: 'Suche derzeit nicht verfügbar' }, 502);
  }
});
