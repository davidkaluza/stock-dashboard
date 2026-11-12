import { describe, expect, it } from 'vitest';
import { badgeContent, fmtLarge, fmtMoney, fmtNum, fmtPct, nextBadgeMode, positionMetrics } from './format';
import { OLD_DEFAULT_COLORS, SYSTEM_FONT, migrateDesign } from './theme';

describe('Formatierung', () => {
  it('formatiert deutsch', () => {
    expect(fmtNum(1234.5)).toBe('1.234,50');
    expect(fmtNum(null)).toBe('—');
    expect(fmtNum('')).toBe('—');
    expect(fmtPct(1.234)).toBe('+1,23 %');
    expect(fmtPct(-0.5)).toBe('-0,50 %');
    expect(fmtPct(0)).toBe('0,00 %');
    expect(fmtMoney(13238.7, 'EUR')).toBe('13.238,70 €');
    expect(fmtMoney(5, 'USD')).toBe('5,00 $');
    expect(fmtMoney(5, 'XYZ')).toBe('5,00 XYZ');
    expect(fmtLarge(2.5e9)).toBe('2,50 Mrd.');
  });
});

describe('positionMetrics', () => {
  const now = new Date('2026-11-11T12:00:00Z');

  it('rechnet Wert, G/V und Rendite p. a.', () => {
    const m = positionMetrics({ price: 121, qty: 10, buyPrice: 100, buyDate: '2025-11-11' }, now);
    expect(m.value).toBe(1210);
    expect(m.cost).toBe(1000);
    expect(m.pl).toBeCloseTo(210);
    expect(m.plPct).toBeCloseTo(21);
    expect(m.days).toBe(365);
    expect(m.cagr).toBeCloseTo(21);
  });

  it('ohne Kurs oder Kaufkurs keine G/V; unter 30 Tagen keine Rendite p. a.', () => {
    expect(positionMetrics({ price: undefined, qty: 5, buyPrice: 100 }, now)).toMatchObject({ value: null, pl: null, plPct: null });
    expect(positionMetrics({ price: 10, qty: 5, buyPrice: 0 }, now)).toMatchObject({ value: 50, pl: null });
    expect(positionMetrics({ price: 110, qty: 1, buyPrice: 100, buyDate: '2026-11-01' }, now).cagr).toBeNull();
  });
});

describe('Feld in der Listenzeile', () => {
  const stock = { price: 110, change_percent: -1.5, currency: 'EUR' };
  const position = { qty: 100, buyPrice: 100 };

  it('wechselt reihum', () => {
    expect(nextBadgeMode('day')).toBe('pl');
    expect(nextBadgeMode('pl')).toBe('value');
    expect(nextBadgeMode('value')).toBe('day');
    expect(nextBadgeMode('quatsch')).toBe('day');
  });

  it('zeigt Tagesänderung, G/V und Wert mit Vorzeichen für die Farbe', () => {
    expect(badgeContent('day', stock, position)).toEqual({ text: '-1,50 %', sign: -1 });
    expect(badgeContent('pl', stock, position)).toEqual({ text: '+10,00 %', sign: 1 });
    expect(badgeContent('value', stock, position)).toEqual({ text: '11.000 €', sign: 1 });
    expect(badgeContent('day', {}, {})).toEqual({ text: '—', sign: 0 });
  });
});

describe('Umstellung auf das iPhone-Design', () => {
  it('Standardfarben → System, eigene Farben → Eigene', () => {
    expect(migrateDesign({ colorSettings: {}, fontFamily: null })).toEqual({ colorScheme: 'system', fontFamily: SYSTEM_FONT });
    expect(migrateDesign({ colorSettings: { ...OLD_DEFAULT_COLORS }, fontFamily: "'JetBrains Mono', monospace" }).colorScheme).toBe('system');
    expect(migrateDesign({ colorSettings: { ...OLD_DEFAULT_COLORS, accent: '#ff0000' }, fontFamily: "'Inter', sans-serif" }))
      .toEqual({ colorScheme: 'custom', fontFamily: "'Inter', sans-serif" });
  });
});
