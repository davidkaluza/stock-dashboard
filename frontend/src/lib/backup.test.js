import { describe, expect, it } from 'vitest';
import { buildBackup, buildCsv, mergeCsvIntoAccounts, parseBackup, parseCsv } from './backup';

const accounts = [
  {
    id: 'a1', name: 'Depot 1', watchlist: ['SAP.DE', 'AAPL'],
    purchasePrices: { 'SAP.DE': 180.5, AAPL: 150 }, shareQuantities: { 'SAP.DE': 10, AAPL: 3 },
    purchaseDates: { 'SAP.DE': '2024-05-01' }, oldShares: [],
  },
  {
    id: 'a2', name: 'Langfrist', watchlist: ['MSFT'],
    purchasePrices: { MSFT: 300 }, shareQuantities: { MSFT: 1 }, purchaseDates: { MSFT: '2020-01-02' }, oldShares: [],
  },
];

describe('CSV', () => {
  it('Export → Import ergibt dieselben Depotdaten', () => {
    const csv = buildCsv(accounts, { 'SAP.DE': { name: 'SAP SE' } });
    expect(csv.split('\n')[0]).toBe('DEPOT;TICKER;NAME;ANZAHL;KAUFKURS;DATUM');
    expect(csv).toContain('Depot 1;SAP.DE;SAP SE;10;180.5;2024-05-01');

    const merged = mergeCsvIntoAccounts([], parseCsv('﻿' + csv));
    expect(merged.map((a) => a.name)).toEqual(['Depot 1', 'Langfrist']);
    for (const field of ['watchlist', 'purchasePrices', 'shareQuantities', 'purchaseDates']) {
      expect(merged[0][field]).toEqual(accounts[0][field]);
      expect(merged[1][field]).toEqual(accounts[1][field]);
    }
  });

  it('liest Komma-CSV ohne Depot-Spalte und Dezimalkomma', () => {
    const entries = parseCsv('TICKER,NAME,ANZAHL,KAUFKURS\nsap.de,SAP,5,"180"\n', 'Mein Depot');
    expect(entries['Mein Depot'].watchlist).toEqual(['SAP.DE']);
    expect(parseCsv('DEPOT;TICKER;NAME;ANZAHL;KAUFKURS;DATUM\nX;SAP.DE;SAP;2;180,25;')['X'].purchasePrices['SAP.DE']).toBe(180.25);
  });

  it('führt gleichnamige Depots zusammen', () => {
    const merged = mergeCsvIntoAccounts(accounts, parseCsv('DEPOT;TICKER;NAME;ANZAHL;KAUFKURS;DATUM\nDepot 1;MSFT;;4;310;'));
    expect(merged).toHaveLength(2);
    expect(merged[0].watchlist).toEqual(['SAP.DE', 'AAPL', 'MSFT']);
    expect(merged[0].shareQuantities.MSFT).toBe(4);
  });
});

describe('JSON-Sicherung', () => {
  it('Export → Import ergibt dieselben Daten', () => {
    const backup = buildBackup({ accounts, settings: { viewMode: 'table' } }, new Date('2026-11-11T12:00:00Z'));
    const parsed = parseBackup(JSON.stringify(backup));
    expect(parsed.accounts).toEqual(accounts);
    expect(parsed.settings).toEqual({ viewMode: 'table' });
    expect(parsed.alertRules).toEqual([]);
  });

  it('lehnt fremde, kaputte und neuere Dateien ab', () => {
    expect(() => parseBackup('kein json')).toThrow('keine gültige JSON-Sicherung');
    expect(() => parseBackup('{"foo":1}')).toThrow('keine Sicherung des Stock Dashboards');
    expect(() => parseBackup(JSON.stringify({ app: 'stock-dashboard', version: 99, accounts }))).toThrow('neueren App-Version');
    expect(() => parseBackup(JSON.stringify({ app: 'stock-dashboard', version: 1, accounts: [] }))).toThrow('keine Depots');
    expect(() => parseBackup(JSON.stringify({ app: 'stock-dashboard', version: 1, accounts: [{ name: 'x' }] }))).toThrow('Depot 1 ist beschädigt');
  });

  it('ergänzt fehlende Felder', () => {
    const parsed = parseBackup(JSON.stringify({ app: 'stock-dashboard', version: 1, accounts: [{ id: 'x', name: 'X', watchlist: ['sap.de'] }] }));
    expect(parsed.accounts[0]).toEqual({ id: 'x', name: 'X', watchlist: ['SAP.DE'], purchasePrices: {}, shareQuantities: {}, purchaseDates: {}, oldShares: [] });
  });
});
