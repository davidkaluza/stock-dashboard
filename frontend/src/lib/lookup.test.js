// Tests für die Logik der Edge Function supabase/functions/lookup (läuft dort unter Deno).
import { describe, expect, it, vi } from 'vitest';
import {
  classifyQuery, dedupe, figiToYahoo, isValidIsin, lookup, normalizeYahoo, rankFigi,
} from '../../../supabase/functions/lookup/logic.js';

const figi = (ticker, exchCode, name = 'X', securityType = 'Common Stock') => ({ ticker, exchCode, name, securityType, marketSector: 'Equity' });

// Ausschnitte aus echten OpenFIGI-Antworten (11.11.2026)
const SAP = [figi('SAP', 'GR', 'SAP SE'), figi('SAP', 'GF', 'SAP SE'), figi('SAPUSD', 'EU', 'SAP SE'), figi('SAP', 'GY', 'SAP SE'), figi('SAPGF', 'US', 'SAP SE'), figi('SAP', 'XE', 'SAP SE')];
const MSCI_WORLD = [figi('IWDA', 'NA', 'ISHARES CORE MSCI WORLD', 'ETP'), figi('SWDA', 'LN', 'ISHARES CORE MSCI WORLD', 'ETP'), figi('EUNL', 'GR', 'ISHARES CORE MSCI WORLD', 'ETP'), figi('EUNL', 'GF', 'ISHARES CORE MSCI WORLD', 'ETP'), figi('SWDACHF', 'EO', 'ISHARES CORE MSCI WORLD', 'ETP')];
const BERKSHIRE = [figi('BRK/B', 'US'), figi('BRK/B', 'UN'), figi('BRYN', 'GY'), figi('BRK/BUSD', 'SW'), figi('0R37', 'LN')];

const response = (body, ok = true, status = 200) => Promise.resolve({ ok, status, json: () => Promise.resolve(body) });

describe('classifyQuery / isValidIsin', () => {
  it('erkennt ISINs nur mit gültiger Prüfziffer', () => {
    expect(isValidIsin('DE0007164600')).toBe(true);
    expect(isValidIsin('US0378331005')).toBe(true);
    expect(isValidIsin('IE00B4L5Y983')).toBe(true);
    expect(isValidIsin('DE0007164601')).toBe(false);
    expect(classifyQuery(' de0007164600 ')).toBe('isin');
  });

  it('erkennt WKNs (6 Zeichen, mindestens eine Ziffer)', () => {
    expect(classifyQuery('716460')).toBe('wkn');
    expect(classifyQuery('a1ewww')).toBe('wkn');
    expect(classifyQuery('NVIDIA')).toBe('text');
    expect(classifyQuery('SAP.DE')).toBe('text');
    expect(classifyQuery('Rheinmetall')).toBe('text');
  });
});

describe('OpenFIGI → Yahoo', () => {
  it('übersetzt Börsencodes und verwirft unbekannte Codes und Währungsvarianten', () => {
    expect(figiToYahoo(figi('SAP', 'GY')).symbol).toBe('SAP.DE');
    expect(figiToYahoo(figi('SAP', 'GF')).symbol).toBe('SAP.F');
    expect(figiToYahoo(figi('BRK/B', 'US')).symbol).toBe('BRK-B');
    expect(figiToYahoo(figi('SWDA', 'LN')).symbol).toBe('SWDA.L');
    expect(figiToYahoo(figi('SAP', 'XE'))).toBeNull();
    expect(figiToYahoo(figi('SAPUSD', 'GY'))).toBeNull();
    expect(figiToYahoo(figi('BRK/BUSD', 'SW'))).toBeNull();
  });

  it('sortiert Xetra zuerst und entfernt doppelte Symbole', () => {
    expect(rankFigi(SAP).map((r) => r.symbol)).toEqual(['SAP.DE', 'SAP.F', 'SAPGF']);
    expect(rankFigi(SAP)[0]).toEqual({ symbol: 'SAP.DE', name: 'SAP SE', exchange: 'Xetra', type: 'Common Stock', source: 'openfigi' });
  });

  it('nimmt bei ETFs die deutsche Sammelnotierung (GR) als Xetra', () => {
    expect(rankFigi(MSCI_WORLD, 'IE00B4L5Y983').map((r) => r.symbol)).toEqual(['EUNL.DE', 'EUNL.F', 'SWDA.L', 'IWDA.AS']);
  });

  it('sortiert nach Xetra die Heimatbörse laut ISIN', () => {
    expect(rankFigi(BERKSHIRE, 'US0846707026').map((r) => r.symbol)).toEqual(['BRYN.DE', 'BRK-B', '0R37.L']);
  });
});

describe('Yahoo', () => {
  it('normalisiert Treffer', () => {
    expect(normalizeYahoo({ symbol: 'rhm.de', shortname: 'RHEINMETALL AG   I', longname: 'Rheinmetall AG', exchDisp: 'XETRA', typeDisp: 'Equity' }))
      .toEqual({ symbol: 'RHM.DE', name: 'Rheinmetall AG', exchange: 'XETRA', type: 'Equity', source: 'yahoo' });
    expect(normalizeYahoo({})).toBeNull();
    expect(dedupe([{ symbol: 'A' }, { symbol: 'A' }, { symbol: 'B' }]).map((r) => r.symbol)).toEqual(['A', 'B']);
  });
});

describe('lookup', () => {
  it('WKN → OpenFIGI', async () => {
    const fetchFn = vi.fn(() => response([{ data: SAP }]));
    const r = await lookup('716460', { fetchFn });
    expect(r[0].symbol).toBe('SAP.DE');
    const [url, opts] = fetchFn.mock.calls[0];
    expect(url).toBe('https://api.openfigi.com/v3/mapping');
    expect(JSON.parse(opts.body)).toEqual([{ idType: 'ID_WERTPAPIER', idValue: '716460' }]);
  });

  it('sendet den OpenFIGI-Schlüssel, falls gesetzt', async () => {
    const fetchFn = vi.fn(() => response([{ data: SAP }]));
    await lookup('DE0007164600', { fetchFn, openFigiKey: 'k' });
    expect(fetchFn.mock.calls[0][1].headers['X-OPENFIGI-APIKEY']).toBe('k');
    expect(JSON.parse(fetchFn.mock.calls[0][1].body)[0].idType).toBe('ID_ISIN');
  });

  it('fällt bei unbekannter WKN auf die Yahoo-Suche zurück', async () => {
    const fetchFn = vi.fn()
      .mockReturnValueOnce(response([{ warning: 'No identifier found.' }]))
      .mockReturnValueOnce(response({ quotes: [{ symbol: 'X.DE', longname: 'X AG' }] }));
    const r = await lookup('ZZZZZ9', { fetchFn });
    expect(r.map((x) => x.symbol)).toEqual(['X.DE']);
    expect(fetchFn.mock.calls[1][0]).toContain('query1.finance.yahoo.com/v1/finance/search?q=ZZZZZ9');
  });

  it('Name → Yahoo plus direkte Eingabe als Ticker', async () => {
    const fetchFn = vi.fn(() => response({ quotes: [{ symbol: 'RHM.DE', longname: 'Rheinmetall AG' }] }));
    const r = await lookup('Rheinmetall', { fetchFn });
    expect(r.map((x) => x.symbol)).toEqual(['RHM.DE', 'RHEINMETALL']);
    expect(r[1].source).toBe('direct');
  });

  it('liefert die direkte Eingabe auch, wenn Yahoo ausfällt', async () => {
    const fetchFn = vi.fn(() => response({}, false, 429));
    expect((await lookup('sap.de', { fetchFn })).map((x) => x.symbol)).toEqual(['SAP.DE']);
  });

  it('wirft, wenn bei WKN/ISIN alle Quellen ausfallen', async () => {
    const fetchFn = vi.fn(() => Promise.reject(new Error('offline')));
    await expect(lookup('716460', { fetchFn })).rejects.toThrow('offline');
  });

  it('ignoriert zu kurze Eingaben und begrenzt die Treffer', async () => {
    const fetchFn = vi.fn();
    expect(await lookup('a', { fetchFn })).toEqual([]);
    expect(fetchFn).not.toHaveBeenCalled();
    const many = Array.from({ length: 15 }, (_, i) => ({ symbol: `S${i}` }));
    const r = await lookup('viele', { fetchFn: () => response({ quotes: many }), limit: 10 });
    expect(r).toHaveLength(10);
  });
});
