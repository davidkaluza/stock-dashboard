import { describe, expect, it, vi } from 'vitest';
import { collectSymbols, diffTickers, syncTickers } from './tickers';

describe('collectSymbols', () => {
  it('sammelt eindeutige Ticker aller Depots, ohne alte Positionen', () => {
    const accounts = [
      { watchlist: ['sap.de', 'AAPL'], oldShares: [{ symbol: 'OLD' }] },
      { watchlist: ['AAPL', ' msft '] },
      {},
    ];
    expect(collectSymbols(accounts)).toEqual(['AAPL', 'MSFT', 'SAP.DE']);
  });
});

describe('diffTickers', () => {
  it('ergänzt fehlende und entfernt überzählige', () => {
    expect(diffTickers(['AAPL', 'SAP.DE'], ['SAP.DE', 'OLD'])).toEqual({ toAdd: ['AAPL'], toRemove: ['OLD'] });
  });

  it('entfernt nichts, solange lokal keine Ticker vorhanden sind', () => {
    expect(diffTickers([], ['SAP.DE'])).toEqual({ toAdd: [], toRemove: [] });
  });
});

describe('syncTickers', () => {
  it('führt Upsert und Delete gegen user_tickers aus', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const inFn = vi.fn().mockResolvedValue({ error: null });
    const client = {
      from: vi.fn(() => ({
        select: vi.fn().mockResolvedValue({ data: [{ symbol: 'SAP.DE' }, { symbol: 'OLD' }], error: null }),
        upsert,
        delete: () => ({ in: inFn }),
      })),
    };
    const result = await syncTickers(client, ['AAPL', 'SAP.DE']);
    expect(result).toEqual({ toAdd: ['AAPL'], toRemove: ['OLD'] });
    expect(upsert).toHaveBeenCalledWith([{ symbol: 'AAPL' }], { onConflict: 'user_id,symbol', ignoreDuplicates: true });
    expect(inFn).toHaveBeenCalledWith('symbol', ['OLD']);
  });

  it('gibt Fehler weiter', async () => {
    const client = { from: () => ({ select: vi.fn().mockResolvedValue({ data: null, error: new Error('kaputt') }) }) };
    await expect(syncTickers(client, ['AAPL'])).rejects.toThrow('kaputt');
  });
});
