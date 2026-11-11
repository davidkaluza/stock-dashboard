import { describe, expect, it, vi } from 'vitest';
import { defaultParams, groupRules, hasActiveRules, rulesForBackup, saveRules, validateParams } from './alerts';
import { deviceLabel, pushEnvironment, subscriptionRow, urlBase64ToUint8Array } from './push';

describe('validateParams', () => {
  it('Tagesänderung', () => {
    expect(validateParams('day_change', { pct: '5,5' })).toEqual({ params: { pct: 5.5 } });
    expect(validateParams('day_change', { pct: 0 }).error).toBeTruthy();
    expect(validateParams('day_change', { pct: 'abc' }).error).toBeTruthy();
  });

  it('Kursschwelle', () => {
    expect(validateParams('threshold', { above: '200', below: '' })).toEqual({ params: { above: 200 } });
    expect(validateParams('threshold', { above: 200, below: 180 })).toEqual({ params: { above: 200, below: 180 } });
    expect(validateParams('threshold', { above: '', below: '' }).error).toMatch('Mindestens');
    expect(validateParams('threshold', { above: 180, below: 200 }).error).toMatch('kleiner');
    expect(validateParams('threshold', { above: 'x' }).error).toBe('Ungültige Zahl.');
  });

  it('Referenzkurs und News', () => {
    expect(validateParams('reference', { price: '150,25', pct: '10' })).toEqual({ params: { price: 150.25, pct: 10 } });
    expect(validateParams('reference', { price: 0, pct: 10 }).error).toBeTruthy();
    expect(validateParams('news')).toEqual({ params: {} });
    expect(validateParams('quatsch').error).toBeTruthy();
  });
});

describe('Hilfsfunktionen', () => {
  it('Standardwerte', () => {
    expect(defaultParams('reference', { purchasePrice: 150, price: 200 })).toEqual({ price: 150, pct: 10 });
    expect(defaultParams('reference', { purchasePrice: 0, price: 200 })).toEqual({ price: 200, pct: 10 });
    expect(defaultParams('threshold', { price: 100 })).toEqual({ above: 110, below: 90 });
  });

  it('gruppiert Regeln und erkennt aktive', () => {
    const rows = [{ symbol: 'A', type: 'news', enabled: false }, { symbol: 'A', type: 'day_change', enabled: true }, { symbol: 'B', type: 'news', enabled: false }];
    const g = groupRules(rows);
    expect(Object.keys(g.A)).toEqual(['news', 'day_change']);
    expect(hasActiveRules(g, 'A')).toBe(true);
    expect(hasActiveRules(g, 'B')).toBe(false);
    expect(hasActiveRules(g, 'C')).toBe(false);
    expect(rulesForBackup([{ id: 1, symbol: 'A', type: 'news', params: {}, enabled: true, last_state: {} }]))
      .toEqual([{ symbol: 'A', type: 'news', params: {}, enabled: true }]);
  });

  it('saveRules sendet nur die Nutzerfelder', async () => {
    const select = vi.fn().mockResolvedValue({ data: [{ id: 1 }], error: null });
    const upsert = vi.fn(() => ({ select }));
    const client = { from: vi.fn(() => ({ upsert })) };
    await saveRules(client, [{ id: 9, symbol: 'A', type: 'news', params: {}, enabled: true, last_state: { x: 1 } }]);
    expect(upsert).toHaveBeenCalledWith([{ symbol: 'A', type: 'news', params: {}, enabled: true }], { onConflict: 'user_id,symbol,type' });
  });
});

describe('Push-Hilfen', () => {
  it('wandelt den VAPID-Schlüssel um', () => {
    expect(Array.from(urlBase64ToUint8Array('AQID_-8'))).toEqual([1, 2, 3, 255, 239]);
  });

  it('baut die Abo-Zeile', () => {
    expect(subscriptionRow({ endpoint: 'https://e', keys: { p256dh: 'p', auth: 'a' } }, 'iPhone · Safari'))
      .toEqual({ endpoint: 'https://e', p256dh: 'p', auth: 'a', device_label: 'iPhone · Safari' });
    expect(() => subscriptionRow({ endpoint: 'x' })).toThrow();
  });

  it('erkennt Geräte und iOS ohne Installation', () => {
    const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
    expect(deviceLabel(iphone)).toBe('iPhone · Safari');
    expect(deviceLabel('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/130 Safari/537.36 Edg/130')).toBe('Windows · Edge');
    const env = pushEnvironment({ userAgent: iphone }, { matchMedia: () => ({ matches: false }) });
    expect(env).toEqual({ ios: true, standalone: false, supported: false });
    expect(pushEnvironment({ userAgent: iphone, standalone: true, serviceWorker: {} }, { PushManager: 1, Notification: 1, matchMedia: () => ({ matches: false }) }))
      .toEqual({ ios: true, standalone: true, supported: true });
  });
});
