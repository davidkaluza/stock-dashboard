// CSV-Import/-Export (Format unverändert: DEPOT;TICKER;NAME;ANZAHL;KAUFKURS;DATUM) und JSON-Sicherung.

export const BACKUP_VERSION = 1;

const newAccountId = () => 'acc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);

export const emptyAccount = (id, name) => ({
  id, name, watchlist: [], purchasePrices: {}, shareQuantities: {}, purchaseDates: {}, oldShares: [],
});

// ── CSV ────────────────────────────────────────────────────────

export function buildCsv(accounts, stockData = {}) {
  const headers = ['DEPOT', 'TICKER', 'NAME', 'ANZAHL', 'KAUFKURS', 'DATUM'];
  const rows = [];
  for (const acc of accounts) {
    for (const s of acc.watchlist) {
      const name = stockData[s]?.name || '';
      rows.push([
        acc.name,
        s,
        name.includes(';') ? `"${name}"` : name,
        acc.shareQuantities?.[s] || 0,
        acc.purchasePrices?.[s] || 0,
        acc.purchaseDates?.[s] || '',
      ]);
    }
  }
  return [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\n');
}

/** CSV-Text → {depotName: {watchlist, purchasePrices, shareQuantities, purchaseDates}}. Erkennt ; oder , */
export function parseCsv(text, fallbackDepotName = 'Depot 1') {
  const lines = String(text || '').replace(/^﻿/, '').split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return {};
  const header = lines[0].toUpperCase();
  const hasDepot = header.startsWith('DEPOT');
  // Kopfzeile erkennen – auch ältere/fremde Dateien mit SYMBOL statt TICKER, sonst würde sie als Aktie importiert
  const headerCells = header.split(/[;,]/).map((c) => c.trim().replace(/^"|"$/g, ''));
  const isHeader = headerCells.some((c) => ['TICKER', 'SYMBOL', 'ANZAHL', 'KAUFKURS', 'MENGE', 'STÜCK'].includes(c));
  const dataLines = isHeader ? lines.slice(1) : lines;

  const depotEntries = {};
  for (const line of dataLines) {
    const delim = line.includes(';') ? ';' : ',';
    const parts = line.split(delim);
    const off = hasDepot ? 1 : 0;
    if (parts.length < 4 + off) continue;
    const depotName = hasDepot ? parts[0].trim() : fallbackDepotName;
    const ticker = parts[off].trim().toUpperCase();
    if (!ticker) continue;
    const qty = parseInt(parts[2 + off].trim(), 10) || 0;
    const price = parseFloat(parts[3 + off].trim().replace(',', '.')) || 0;
    const date = parts[4 + off] ? parts[4 + off].trim() : '';
    const entry = (depotEntries[depotName] ||= { watchlist: [], purchasePrices: {}, shareQuantities: {}, purchaseDates: {} });
    if (!entry.watchlist.includes(ticker)) entry.watchlist.push(ticker);
    if (qty > 0) entry.shareQuantities[ticker] = qty;
    if (price > 0) entry.purchasePrices[ticker] = price;
    if (date) entry.purchaseDates[ticker] = date;
  }
  return depotEntries;
}

/** Importierte Einträge in Depots einfügen: gleicher Name → zusammenführen, sonst neues Depot. */
export function mergeCsvIntoAccounts(accounts, depotEntries) {
  const updated = [...accounts];
  for (const [depotName, entries] of Object.entries(depotEntries)) {
    const idx = updated.findIndex((a) => a.name === depotName);
    if (idx >= 0) {
      const existing = updated[idx];
      updated[idx] = {
        ...existing,
        watchlist: [...new Set([...existing.watchlist, ...entries.watchlist])],
        purchasePrices: { ...existing.purchasePrices, ...entries.purchasePrices },
        shareQuantities: { ...existing.shareQuantities, ...entries.shareQuantities },
        purchaseDates: { ...existing.purchaseDates, ...entries.purchaseDates },
      };
    } else {
      updated.push({ ...emptyAccount(newAccountId(), depotName), ...entries });
    }
  }
  return updated;
}

// ── JSON-Sicherung ─────────────────────────────────────────────

export function buildBackup({ accounts, settings = {}, alertRules = [] }, now = new Date()) {
  return {
    app: 'stock-dashboard',
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    accounts,
    settings,
    alertRules,
  };
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** JSON-Text → {accounts, settings, alertRules}; wirft bei ungültiger Datei einen deutschen Fehler. */
export function parseBackup(text) {
  let data;
  try {
    data = JSON.parse(String(text || '').replace(/^﻿/, ''));
  } catch {
    throw new Error('Die Datei ist keine gültige JSON-Sicherung.');
  }
  if (!isObj(data) || data.app !== 'stock-dashboard') {
    throw new Error('Die Datei ist keine Sicherung des Stock Dashboards.');
  }
  if (typeof data.version !== 'number' || data.version > BACKUP_VERSION) {
    throw new Error('Die Sicherung stammt aus einer neueren App-Version.');
  }
  if (!Array.isArray(data.accounts) || data.accounts.length === 0) {
    throw new Error('Die Sicherung enthält keine Depots.');
  }
  const accounts = data.accounts.map((a, i) => {
    if (!isObj(a) || !Array.isArray(a.watchlist)) throw new Error(`Depot ${i + 1} ist beschädigt.`);
    return {
      ...emptyAccount(String(a.id || newAccountId()), String(a.name || `Depot ${i + 1}`)),
      watchlist: a.watchlist.map((s) => String(s).toUpperCase()),
      purchasePrices: isObj(a.purchasePrices) ? a.purchasePrices : {},
      shareQuantities: isObj(a.shareQuantities) ? a.shareQuantities : {},
      purchaseDates: isObj(a.purchaseDates) ? a.purchaseDates : {},
      oldShares: Array.isArray(a.oldShares) ? a.oldShares : [],
    };
  });
  return {
    accounts,
    settings: isObj(data.settings) ? data.settings : {},
    alertRules: Array.isArray(data.alertRules) ? data.alertRules : [],
  };
}

/** Datei im Browser herunterladen. */
export function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
