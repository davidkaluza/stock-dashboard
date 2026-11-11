import { describe, expect, it } from 'vitest';
import { filterHistory, hasHistoryFor, periodStart, SINCE_PURCHASE, daysAgo } from './history';

const today = new Date(Date.UTC(2026, 10, 11)); // 2026-11-11

const rows = [];
for (let d = new Date(Date.UTC(2025, 0, 1)); d <= today; d.setUTCDate(d.getUTCDate() + 1)) {
  rows.push({ date: d.toISOString().slice(0, 10), price: d.getUTCMonth() });
}

describe('periodStart', () => {
  it('rechnet Wochen, Monate und Jahre zurück', () => {
    expect(periodStart('1wk', today)).toBe('2026-11-04');
    expect(periodStart('1mo', today)).toBe('2026-10-11');
    expect(periodStart('1y', today)).toBe('2025-11-11');
    expect(periodStart('10y', today)).toBe('2016-11-11');
  });

  it('begrenzt auf das Monatsende', () => {
    expect(periodStart('1mo', new Date(Date.UTC(2026, 2, 31)))).toBe('2026-02-28');
  });

  it('nutzt das Kaufdatum für „seit Kauf“', () => {
    expect(periodStart(SINCE_PURCHASE, today, '2026-03-15')).toBe('2026-03-15');
    expect(periodStart(SINCE_PURCHASE, today, '')).toBeNull();
    expect(periodStart('quatsch', today)).toBeNull();
  });
});

describe('filterHistory', () => {
  it('beginnt mit dem letzten Kurs vor dem Stichtag', () => {
    const r = filterHistory(rows, '1wk', today);
    expect(r[0].date).toBe('2026-11-03');
    expect(r.at(-1).date).toBe('2026-11-11');
    expect(r).toHaveLength(9);
  });

  it('liefert alles, wenn die Historie kürzer als der Zeitraum ist', () => {
    expect(filterHistory(rows, '5y', today)).toHaveLength(rows.length);
  });

  it('filtert seit Kauf und behandelt leere/unbekannte Eingaben', () => {
    expect(filterHistory(rows, SINCE_PURCHASE, today, '2026-11-10').map((r) => r.date)).toEqual(['2026-11-09', '2026-11-10', '2026-11-11']);
    expect(filterHistory([], '1mo', today)).toEqual([]);
    expect(filterHistory(rows, SINCE_PURCHASE, today, '')).toBe(rows);
    expect(filterHistory(rows, SINCE_PURCHASE, today, '2030-01-01')).toEqual([rows.at(-1)]);
  });
});

describe('hasHistoryFor', () => {
  it('prüft, ob genug Historie geladen ist', () => {
    expect(hasHistoryFor(daysAgo(400, today), '1y', today)).toBe(true);
    expect(hasHistoryFor(daysAgo(400, today), '5y', today)).toBe(false);
    expect(hasHistoryFor(null, '1mo', today)).toBe(false);
    expect(hasHistoryFor(null, SINCE_PURCHASE, today, '')).toBe(true);
  });
});
