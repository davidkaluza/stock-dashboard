import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import StockCard from './components/StockCard';
import AddStock from './components/AddStock';
import TableView from './components/TableView';
import StockDetail from './components/StockDetail';
import Settings from './components/Settings';
import { LayoutGrid, Table, Download, Upload, Printer, Plus, Trash2, Pencil, Settings as SettingsIcon, ArrowUp, ArrowDown, ArrowLeftRight, Copy, X, RefreshCw, ShieldAlert } from 'lucide-react';
import { fetchSnapshot, fetchDailyPrices, formatFetchedAt } from './lib/market';
import { CARD_HISTORY_DAYS, DEFAULT_PERIOD, daysAgo, filterHistory, hasHistoryFor, periodStart, toIsoDate } from './lib/history';
import { collectSymbols, normalizeSymbol, syncTickers } from './lib/tickers';
import { buildBackup, buildCsv, downloadFile, emptyAccount, mergeCsvIntoAccounts, parseBackup, parseCsv } from './lib/backup';

const APP_VERSION = '0.2.0';

const PENDING_POLL_SECONDS = 60;          // solange Ticker auf die Action warten
const BACKUP_REMINDER_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

const safeSetItem = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    console.warn(`localStorage (${key}) nicht verfügbar:`, e);
  }
};

const loadJson = (key, fallback) => {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : fallback;
  } catch {
    return fallback;
  }
};

// Tageskurse nur für den Kartenzeitraum dauerhaft speichern (localStorage ist klein)
const trimDailyForStorage = (dailyPrices) => {
  const since = daysAgo(CARD_HISTORY_DAYS);
  const out = {};
  for (const [sym, entry] of Object.entries(dailyPrices)) {
    const rows = (entry.rows || []).filter((r) => r.date >= since);
    out[sym] = { since: entry.since > since ? entry.since : since, loadedOn: entry.loadedOn, rows };
  }
  return out;
};

const App = ({ client, session }) => {
  const [accounts, setAccounts] = useState(() => {
    const parsed = loadJson('accounts', null);
    if (parsed) {
      return parsed.length ? parsed.map(a => ({ ...a, purchaseDates: a.purchaseDates || {}, oldShares: a.oldShares || [] })) : [emptyAccount('default', 'Depot 1')];
    }
    // Migration vom alten Einzel-Watchlist-Format
    return [{
      ...emptyAccount('default', 'Depot 1'),
      watchlist: loadJson('watchlist', []),
      purchasePrices: loadJson('purchasePrices', {}),
      shareQuantities: loadJson('shareQuantities', {}),
    }];
  });
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('activeTab') || localStorage.getItem('activeAccountId') || 'default');
  const activeAccountId = accounts.some(a => a.id === activeTab) ? activeTab : (accounts[0]?.id || null);
  const [stockData, setStockData] = useState(() => loadJson('stockData', {}));
  const [statsData, setStatsData] = useState(() => loadJson('statsData', {}));
  const [dailyPrices, setDailyPrices] = useState(() => loadJson('dailyPrices', {})); // {symbol: {since, loadedOn, rows}}
  const [chartPeriods, setChartPeriods] = useState({});
  const [error, setError] = useState(null);
  const [loadingData, setLoadingData] = useState(false);
  const [lastLoadedAt, setLastLoadedAt] = useState(null);
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('viewMode') || 'cards');
  const [detailSymbol, setDetailSymbol] = useState(null);
  const [moveCopySymbol, setMoveCopySymbol] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [colorSettings, setColorSettings] = useState(() => ({
    background: '#33312B', surface: '#33312B', accent: '#C09537', muted: '#888888',
    pos: '#22c55e', neg: '#ef4444', posLight: '#86efac', negLight: '#fca5a5',
    ...loadJson('colorSettings', {}),
  }));
  const [fontScale, setFontScale] = useState(() => {
    const saved = parseInt(localStorage.getItem('fontScale') || '100', 10);
    return Number.isFinite(saved) ? Math.min(140, Math.max(80, saved)) : 100;
  });
  const [fontFamily, setFontFamily] = useState(() => localStorage.getItem('fontFamily') || "'JetBrains Mono', monospace");
  const [refreshInterval, setRefreshInterval] = useState(() => {
    const saved = parseInt(localStorage.getItem('refreshInterval') || '300', 10);
    return Number.isFinite(saved) ? Math.min(3600, Math.max(60, saved)) : 300;
  });
  const [lastBackupAt, setLastBackupAt] = useState(() => localStorage.getItem('lastBackupAt'));
  const [reminderSnoozedUntil, setReminderSnoozedUntil] = useState(() => Number(localStorage.getItem('backupReminderSnoozedUntil') || 0));
  const [cardSortKey, setCardSortKey] = useState('name');
  const [cardSortDir, setCardSortDir] = useState('asc');

  const activeAccount = useMemo(() => {
    if (!activeAccountId) return null;
    return accounts.find(a => a.id === activeAccountId) || accounts[0];
  }, [accounts, activeAccountId]);

  const allWatchlistSymbols = useMemo(() => collectSymbols(accounts), [accounts]);
  const symbolsKey = allWatchlistSymbols.join(',');

  const stocks = (activeAccount?.watchlist) || [];
  const oldShares = (activeAccount?.oldShares) || [];
  const purchasePrices = (activeAccount?.purchasePrices) || {};
  const shareQuantities = (activeAccount?.shareQuantities) || {};
  const purchaseDates = (activeAccount?.purchaseDates) || {};

  const handleCardSort = (key) => {
    if (cardSortKey === key) {
      setCardSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setCardSortKey(key);
      setCardSortDir('asc');
    }
  };

  const sortedStocks = useMemo(() => {
    return [...stocks].sort((a, b) => {
      const dataA = stockData[a];
      const dataB = stockData[b];
      const priceA = dataA?.price || 0;
      const priceB = dataB?.price || 0;
      const qtyA = shareQuantities[a] || 0;
      const qtyB = shareQuantities[b] || 0;
      const buyA = purchasePrices[a] || 0;
      const buyB = purchasePrices[b] || 0;
      const dateA = purchaseDates[a] || '';
      const dateB = purchaseDates[b] || '';
      const daysA = dateA ? Math.floor((new Date() - new Date(dateA)) / DAY_MS) : 0;
      const daysB = dateB ? Math.floor((new Date() - new Date(dateB)) / DAY_MS) : 0;

      let va, vb;
      switch (cardSortKey) {
        case 'price':
          va = priceA; vb = priceB;
          break;
        case 'value':
          va = priceA * qtyA; vb = priceB * qtyB;
          break;
        case 'rendite':
          va = buyA > 0 && daysA > 0 ? (Math.pow(priceA / buyA, 365 / daysA) - 1) * 100 : (cardSortDir === 'asc' ? Infinity : -Infinity);
          vb = buyB > 0 && daysB > 0 ? (Math.pow(priceB / buyB, 365 / daysB) - 1) * 100 : (cardSortDir === 'asc' ? Infinity : -Infinity);
          break;
        case 'days':
          va = dateA ? daysA : (cardSortDir === 'asc' ? Infinity : -Infinity);
          vb = dateB ? daysB : (cardSortDir === 'asc' ? Infinity : -Infinity);
          break;
        case 'name':
        default:
          va = dataA?.name || a; vb = dataB?.name || b;
      }

      if (typeof va === 'string') {
        return cardSortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      return cardSortDir === 'asc' ? va - vb : vb - va;
    });
  }, [stocks, stockData, cardSortKey, cardSortDir, purchasePrices, shareQuantities, purchaseDates]);

  // ── Darstellung ──────────────────────────────────────────────

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--bg-background', colorSettings.background);
    root.style.setProperty('--bg-surface', colorSettings.surface);
    root.style.setProperty('--clr-accent', colorSettings.accent);
    root.style.setProperty('--clr-muted', colorSettings.muted);
    root.style.setProperty('--clr-pos', colorSettings.pos);
    root.style.setProperty('--clr-neg', colorSettings.neg);
    root.style.setProperty('--clr-pos-light', colorSettings.posLight);
    root.style.setProperty('--clr-neg-light', colorSettings.negLight);
  }, [colorSettings]);

  useEffect(() => {
    const clamped = Math.min(140, Math.max(80, fontScale));
    document.documentElement.style.fontSize = `${16 * clamped / 100}px`;
    safeSetItem('fontScale', String(clamped));
  }, [fontScale]);

  useEffect(() => {
    document.documentElement.style.setProperty('--font-family', fontFamily);
    safeSetItem('fontFamily', fontFamily);
  }, [fontFamily]);

  // ── Speichern (nur lokal) ────────────────────────────────────

  useEffect(() => {
    safeSetItem('accounts', JSON.stringify(accounts));
    safeSetItem('activeTab', activeTab);
    safeSetItem('viewMode', viewMode);
    safeSetItem('colorSettings', JSON.stringify(colorSettings));
    safeSetItem('refreshInterval', String(refreshInterval));
  }, [accounts, activeTab, viewMode, colorSettings, refreshInterval]);

  useEffect(() => { safeSetItem('stockData', JSON.stringify(stockData)); }, [stockData]);
  useEffect(() => { safeSetItem('statsData', JSON.stringify(statsData)); }, [statsData]);
  useEffect(() => { safeSetItem('dailyPrices', JSON.stringify(trimDailyForStorage(dailyPrices))); }, [dailyPrices]);

  useEffect(() => {
    // Altlasten der Backend-Version entfernen
    ['historyData', 'cachePanelOpen'].forEach((k) => { try { localStorage.removeItem(k); } catch { /* egal */ } });
    // Browser bitten, die lokalen Depotdaten nicht automatisch zu löschen
    navigator.storage?.persist?.().catch(() => {});
    // Deep-Link ?symbol=… (z. B. aus einer Push-Nachricht) öffnet die Aktie
    const params = new URLSearchParams(window.location.search);
    const sym = params.get('symbol');
    if (sym) {
      setDetailSymbol(normalizeSymbol(sym));
      params.delete('symbol');
      const rest = params.toString();
      window.history.replaceState(null, '', window.location.pathname + (rest ? `?${rest}` : ''));
    }
  }, []);

  // ── Daten aus Supabase ───────────────────────────────────────

  const dailyRef = useRef(dailyPrices);
  dailyRef.current = dailyPrices;

  const loadDaily = useCallback(async (symbols, since) => {
    if (!symbols.length) return;
    const bySymbol = await fetchDailyPrices(client, symbols, since);
    const today = toIsoDate(new Date());
    setDailyPrices(prev => {
      const next = { ...prev };
      for (const [sym, rows] of Object.entries(bySymbol)) {
        next[sym] = { since, loadedOn: today, rows };
      }
      return next;
    });
  }, [client]);

  const loadSnapshot = useCallback(async () => {
    const symbols = symbolsKey ? symbolsKey.split(',') : [];
    if (!symbols.length) return;
    setLoadingData(true);
    try {
      const snap = await fetchSnapshot(client, symbols);
      setStockData(prev => ({ ...prev, ...snap.stockData }));
      setStatsData(prev => ({ ...prev, ...snap.statsData }));
      setLastLoadedAt(new Date());
      setError(null);

      // Tageskurse nachladen: fehlend, von gestern oder Symbol inzwischen geladen
      const today = toIsoDate(new Date());
      const stale = symbols.filter((s) => {
        const entry = dailyRef.current[s];
        const ready = snap.stockData[s]?.status === 'ok';
        return ready && (!entry || entry.loadedOn !== today || entry.rows.length === 0);
      });
      if (stale.length) await loadDaily(stale, daysAgo(CARD_HISTORY_DAYS));
    } catch (e) {
      console.error(e);
      setError('Kurse konnten nicht geladen werden. Es werden die zuletzt gespeicherten Daten angezeigt.');
    } finally {
      setLoadingData(false);
    }
  }, [client, symbolsKey, loadDaily]);

  // Ticker abgleichen und Daten laden, sobald sich die Depots ändern
  useEffect(() => {
    if (!symbolsKey) return undefined;
    const t = setTimeout(async () => {
      try {
        await syncTickers(client, symbolsKey.split(','));
      } catch (e) {
        console.error(e);
        setError('Tickerliste konnte nicht mit dem Server abgeglichen werden.');
      }
      loadSnapshot();
    }, 800);
    return () => clearTimeout(t);
  }, [client, symbolsKey, loadSnapshot]);

  // Regelmäßig neu laden; schneller, solange Ticker noch auf den ersten Abruf warten
  const hasPending = allWatchlistSymbols.some((s) => stockData[s]?.status === 'pending' || !stockData[s]);
  useEffect(() => {
    if (!symbolsKey) return undefined;
    const seconds = hasPending ? PENDING_POLL_SECONDS : refreshInterval;
    const id = setInterval(loadSnapshot, seconds * 1000);
    return () => clearInterval(id);
  }, [symbolsKey, hasPending, refreshInterval, loadSnapshot]);

  // Beim Zurückwechseln in die App sofort aktualisieren
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') loadSnapshot(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [loadSnapshot]);

  // Neu hinzugefügte Aktie (Kaufkurs null): mit dem ersten bekannten Kurs vorbelegen.
  // CSV-Importe ohne Kaufkurs bleiben unberührt.
  useEffect(() => {
    setAccounts(prev => {
      let changed = false;
      const next = prev.map(a => {
        const fill = a.watchlist.filter(s => a.purchasePrices?.[s] === null && Number.isFinite(stockData[s]?.price));
        if (!fill.length) return a;
        changed = true;
        const purchasePrices = { ...a.purchasePrices };
        for (const s of fill) purchasePrices[s] = stockData[s].price;
        return { ...a, purchasePrices };
      });
      return changed ? next : prev;
    });
  }, [stockData]);

  /** Sicherstellen, dass genug Tageskurse für einen Zeitraum geladen sind. */
  const ensureHistory = useCallback((symbol, period) => {
    const entry = dailyRef.current[symbol];
    const date = purchaseDates[symbol] || '';
    if (hasHistoryFor(entry?.since, period, new Date(), date)) return;
    const since = periodStart(period, new Date(), date);
    loadDaily([symbol], since).catch((e) => console.error(e));
  }, [purchaseDates, loadDaily]);

  const handlePeriodChange = useCallback((symbol, period) => {
    setChartPeriods(prev => ({ ...prev, [symbol]: period }));
    ensureHistory(symbol, period);
  }, [ensureHistory]);

  const cardHistory = (symbol) =>
    filterHistory(dailyPrices[symbol]?.rows, chartPeriods[symbol] || DEFAULT_PERIOD, new Date(), purchaseDates[symbol]);

  // ── Depots bearbeiten ────────────────────────────────────────

  const addStock = (input) => {
    const symbol = normalizeSymbol(input);
    if (!symbol) return;
    setError(null);
    const today = toIsoDate(new Date());
    setAccounts(prev => prev.map(a =>
      a.id === activeAccountId && !a.watchlist.includes(symbol)
        ? {
            ...a,
            watchlist: [...a.watchlist, symbol],
            // null = „mit dem ersten Kurs vorbelegen“ (siehe Effekt oben)
            purchasePrices: { ...a.purchasePrices, [symbol]: Number.isFinite(stockData[symbol]?.price) ? stockData[symbol].price : null },
            shareQuantities: { ...a.shareQuantities, [symbol]: 1 },
            purchaseDates: { ...a.purchaseDates, [symbol]: today },
          }
        : a
    ));
  };

  const removeStock = (symbol) => {
    setAccounts(prev => prev.map(a => {
      if (a.id !== activeAccountId) return a;
      const data = stockData[symbol];
      return {
        ...a,
        watchlist: a.watchlist.filter(s => s !== symbol),
        oldShares: [
          ...a.oldShares,
          {
            id: symbol + '-' + Date.now(),
            symbol,
            name: data?.name || symbol,
            qty: a.shareQuantities[symbol] || 0,
            buyPrice: a.purchasePrices[symbol] || 0,
            buyDate: a.purchaseDates[symbol] || '',
            lastPrice: data?.price || 0,
            removedAt: new Date().toISOString(),
          }
        ]
      };
    }));
  };

  const restoreOldShare = (entry) => {
    setAccounts(prev => prev.map(a => {
      if (a.id !== activeAccountId) return a;
      if (a.watchlist.includes(entry.symbol)) return a;
      return {
        ...a,
        watchlist: [...a.watchlist, entry.symbol],
        shareQuantities: { ...a.shareQuantities, [entry.symbol]: entry.qty },
        purchasePrices: { ...a.purchasePrices, [entry.symbol]: entry.buyPrice },
        purchaseDates: { ...a.purchaseDates, [entry.symbol]: entry.buyDate },
        oldShares: a.oldShares.filter(o => o.id !== entry.id),
      };
    }));
  };

  const deleteOldShare = (id) => {
    setAccounts(prev => prev.map(a =>
      a.id === activeAccountId
        ? { ...a, oldShares: a.oldShares.filter(o => o.id !== id) }
        : a
    ));
  };

  const handleMoveStock = useCallback((symbol, targetAccountId) => {
    const source = accounts.find(acc => acc.id === activeAccountId);
    setAccounts(prev => prev.map(a => {
      if (a.id === activeAccountId) {
        const { [symbol]: _q, ...shareQuantities } = a.shareQuantities;
        const { [symbol]: _p, ...purchasePrices } = a.purchasePrices;
        const { [symbol]: _d, ...purchaseDates } = a.purchaseDates;
        return { ...a, watchlist: a.watchlist.filter(s => s !== symbol), shareQuantities, purchasePrices, purchaseDates };
      }
      if (a.id === targetAccountId) {
        return {
          ...a,
          watchlist: a.watchlist.includes(symbol) ? a.watchlist : [...a.watchlist, symbol],
          shareQuantities: { ...a.shareQuantities, [symbol]: source?.shareQuantities?.[symbol] || 1 },
          purchasePrices: { ...a.purchasePrices, [symbol]: source?.purchasePrices?.[symbol] || 0 },
          purchaseDates: { ...a.purchaseDates, [symbol]: source?.purchaseDates?.[symbol] || '' },
        };
      }
      return a;
    }));
    setMoveCopySymbol(null);
  }, [activeAccountId, accounts]);

  const handleCopyStock = useCallback((symbol, targetAccountId) => {
    const source = accounts.find(acc => acc.id === activeAccountId);
    setAccounts(prev => prev.map(a => {
      if (a.id === targetAccountId && !a.watchlist.includes(symbol)) {
        return {
          ...a,
          watchlist: [...a.watchlist, symbol],
          shareQuantities: { ...a.shareQuantities, [symbol]: source?.shareQuantities?.[symbol] || 1 },
          purchasePrices: { ...a.purchasePrices, [symbol]: source?.purchasePrices?.[symbol] || 0 },
          purchaseDates: { ...a.purchaseDates, [symbol]: source?.purchaseDates?.[symbol] || '' },
        };
      }
      return a;
    }));
    setMoveCopySymbol(null);
  }, [activeAccountId, accounts]);

  const updateAccountField = (field, symbol, value) => {
    setAccounts(prev => prev.map(a =>
      a.id === activeAccountId ? { ...a, [field]: { ...a[field], [symbol]: value } } : a
    ));
  };
  const updatePurchasePrice = (symbol, price) => updateAccountField('purchasePrices', symbol, parseFloat(price) || 0);
  const updateShareQuantity = (symbol, qty) => updateAccountField('shareQuantities', symbol, parseInt(qty, 10) || 0);
  const updatePurchaseDate = (symbol, date) => updateAccountField('purchaseDates', symbol, date || '');

  const addAccount = () => {
    const name = window.prompt('Neues Depot anlegen:\nName:', `Depot ${accounts.length + 1}`);
    if (!name) return;
    const id = 'acc_' + Date.now();
    setAccounts(prev => [...prev, emptyAccount(id, name)]);
    setActiveTab(id);
  };

  const renameAccount = () => {
    if (!activeAccount) return;
    const name = window.prompt('Depot umbenennen:', activeAccount.name);
    if (!name || name === activeAccount.name) return;
    setAccounts(prev => prev.map(a => a.id === activeAccountId ? { ...a, name } : a));
  };

  const deleteAccount = () => {
    if (!activeAccount || accounts.length < 2) return;
    if (!window.confirm(`Depot "${activeAccount.name}" löschen?`)) return;
    const remaining = accounts.filter(a => a.id !== activeAccountId);
    setAccounts(remaining);
    setActiveTab(remaining[0]?.id || 'default');
  };

  // ── Import / Export ──────────────────────────────────────────

  const handleExportCsv = () => {
    downloadFile('portfolio.csv', '﻿' + buildCsv(accounts, stockData), 'text/csv;charset=utf-8;');
  };

  const handleImportCsv = (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const entries = parseCsv(String(evt.target.result || ''), activeAccount?.name || 'Depot 1');
        setAccounts(prev => mergeCsvIntoAccounts(prev, entries));
      } catch (err) {
        console.error('CSV-Import fehlgeschlagen:', err);
        setError('CSV-Import fehlgeschlagen: Datei konnte nicht gelesen werden.');
      }
    };
    reader.readAsText(file);
  };

  const settingsSnapshot = () => ({ colorSettings, viewMode, fontScale, fontFamily, refreshInterval });

  const handleExportBackup = () => {
    const backup = buildBackup({ accounts, settings: settingsSnapshot() });
    downloadFile(`stock-dashboard-${toIsoDate(new Date())}.json`, JSON.stringify(backup, null, 2), 'application/json');
    const now = new Date().toISOString();
    setLastBackupAt(now);
    safeSetItem('lastBackupAt', now);
  };

  const handleImportBackup = (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = parseBackup(evt.target.result);
        if (!window.confirm(`Sicherung mit ${data.accounts.length} Depot(s) einspielen? Die Depots auf diesem Gerät werden ersetzt.`)) return;
        setAccounts(data.accounts);
        setActiveTab(data.accounts[0].id);
        const s = data.settings;
        if (s.colorSettings) setColorSettings(prev => ({ ...prev, ...s.colorSettings }));
        if (s.viewMode === 'cards' || s.viewMode === 'table') setViewMode(s.viewMode);
        if (Number.isFinite(s.fontScale)) setFontScale(s.fontScale);
        if (typeof s.fontFamily === 'string') setFontFamily(s.fontFamily);
        if (Number.isFinite(s.refreshInterval)) setRefreshInterval(Math.min(3600, Math.max(60, s.refreshInterval)));
        setError(null);
      } catch (err) {
        setError(err.message);
      }
    };
    reader.readAsText(file);
  };

  const showBackupReminder = allWatchlistSymbols.length > 0
    && Date.now() > reminderSnoozedUntil
    && (!lastBackupAt || Date.now() - new Date(lastBackupAt).getTime() > BACKUP_REMINDER_DAYS * DAY_MS);

  const snoozeReminder = () => {
    const until = Date.now() + 7 * DAY_MS;
    setReminderSnoozedUntil(until);
    safeSetItem('backupReminderSnoozedUntil', String(until));
  };

  const handleSignOut = async () => {
    await client.auth.signOut();
  };

  // ── Anzeige ──────────────────────────────────────────────────

  const portfolioSummary = useMemo(() => {
    let totalBuy = 0;
    let totalCurrent = 0;
    for (const symbol of stocks) {
      const price = stockData[symbol]?.price || 0;
      const qty = shareQuantities[symbol] || 0;
      const buyPrice = purchasePrices[symbol] || 0;
      totalBuy += buyPrice * qty;
      totalCurrent += price * qty;
    }
    const pl = totalCurrent - totalBuy;
    const plPct = totalBuy > 0 ? (pl / totalBuy) * 100 : 0;
    return { totalBuy, totalCurrent, pl, plPct };
  }, [stocks, stockData, purchasePrices, shareQuantities]);

  const newestFetch = useMemo(() => {
    const times = allWatchlistSymbols.map(s => stockData[s]?.fetched_at).filter(Boolean).sort();
    return times.at(-1) || null;
  }, [allWatchlistSymbols, stockData]);
  const pendingCount = allWatchlistSymbols.filter(s => stockData[s]?.status === 'pending' || !stockData[s]).length;
  const unknownSymbols = allWatchlistSymbols.filter(s => stockData[s]?.status === 'unknown');

  const iconButton = 'text-muted hover:text-white p-2 transition-colors border border-accent rounded';

  return (
    <div className="w-full px-4 py-4 md:px-6 md:py-6 safe-area">
      <header className="mb-4 flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-end">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tighter uppercase">Stock Dashboard {APP_VERSION}</h1>
        </div>
        <div className="text-right">
          <div className="text-sm-mono">
            <span className="text-muted">Port:</span>{' '}
            <span className={portfolioSummary.pl >= 0 ? 'text-pos' : 'text-neg'}>
              {portfolioSummary.totalCurrent.toFixed(2)}{' '}
              ({portfolioSummary.pl >= 0 ? '+' : ''}{portfolioSummary.pl.toFixed(2)}/{portfolioSummary.plPct.toFixed(2)}%)
            </span>
          </div>
        </div>
      </header>

      {showBackupReminder && (
        <div className="border border-accent rounded p-2 mb-4 text-xs-mono flex flex-wrap items-center gap-2">
          <ShieldAlert size={14} className="text-accent" />
          <span className="flex-1 min-w-[12rem]">
            Deine Depots liegen nur auf diesem Gerät.{' '}
            {lastBackupAt ? `Letzte Sicherung vor über ${BACKUP_REMINDER_DAYS} Tagen.` : 'Es gibt noch keine Sicherung.'}
          </span>
          <button onClick={handleExportBackup} className="border border-accent bg-accent text-white px-2 py-1 rounded">Jetzt sichern</button>
          <button onClick={snoozeReminder} className="text-muted hover:text-white px-2 py-1">Später</button>
        </div>
      )}

      <div className="flex items-center gap-1 border border-accent rounded p-1 mb-4 overflow-x-auto">
        {accounts.map(a => (
          <button
            key={a.id}
            onClick={() => setActiveTab(a.id)}
            className={`text-xs-mono px-3 py-1.5 uppercase transition-colors whitespace-nowrap ${activeAccountId === a.id ? 'bg-accent text-white' : 'text-muted hover:text-white'}`}
          >
            {a.name}
          </button>
        ))}
        <div className="flex items-center gap-1 ml-auto border-l border-accent pl-2">
          <button onClick={addAccount} className="text-muted hover:text-white transition-colors" title="Neues Depot">
            <Plus size={14} />
          </button>
          {activeAccount && (
            <>
              <button onClick={renameAccount} className="text-muted hover:text-white transition-colors" title="Umbenennen">
                <Pencil size={12} />
              </button>
              {accounts.length > 1 && (
                <button onClick={deleteAccount} className="text-muted hover:text-neg transition-colors" title="Depot löschen">
                  <Trash2 size={12} />
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex border border-accent rounded">
          <button
            onClick={() => setViewMode('cards')}
            className={`p-2 transition-colors ${viewMode === 'cards' ? 'bg-accent text-white' : 'text-muted hover:text-white'}`}
            title="Kartenansicht"
          >
            <LayoutGrid size={16} />
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={`p-2 transition-colors ${viewMode === 'table' ? 'bg-accent text-white' : 'text-muted hover:text-white'}`}
            title="Tabellenansicht"
          >
            <Table size={16} />
          </button>
        </div>
        <AddStock onAdd={addStock} className="flex-1 min-w-[14rem]" />
        <button onClick={loadSnapshot} disabled={loadingData} className={`${iconButton} disabled:opacity-40`} title="Kurse neu laden">
          <RefreshCw size={16} className={loadingData ? 'animate-spin' : ''} />
        </button>
        <button onClick={handleExportCsv} className={iconButton} title="Export CSV">
          <Download size={16} />
        </button>
        {viewMode === 'table' && (
          <button onClick={() => window.print()} className={`${iconButton} no-print`} title="Drucken (A4)">
            <Printer size={16} />
          </button>
        )}
        <label className={`${iconButton} cursor-pointer`} title="Import CSV">
          <Upload size={16} />
          <input type="file" accept=".csv,text/csv" onChange={handleImportCsv} className="hidden" />
        </label>
        <button onClick={() => setShowSettings(true)} className={iconButton} title="Einstellungen">
          <SettingsIcon size={16} />
        </button>
      </div>

      <div className="text-xs-mono text-muted mb-4 flex flex-wrap gap-x-3 gap-y-1">
        <span>{formatFetchedAt(newestFetch) || 'Noch keine Kurse in der Datenbank'}</span>
        {lastLoadedAt && <span>geladen {lastLoadedAt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</span>}
        {pendingCount > 0 && <span className="text-accent">{pendingCount} Ticker warten auf den ersten Abruf</span>}
        {unknownSymbols.length > 0 && <span className="text-neg">unbekannt: {unknownSymbols.join(', ')}</span>}
      </div>

      {error && <p className="text-neg text-xs-mono mb-4">{error}</p>}

      {viewMode === 'cards' && (
        <div className="flex gap-2 mb-4 flex-wrap">
          {[
            { key: 'name', label: 'Name' },
            { key: 'price', label: 'Kurs' },
            { key: 'value', label: 'Wert' },
            { key: 'rendite', label: 'Rendite' },
            { key: 'days', label: 'Tage' },
          ].map(opt => (
            <button
              key={opt.key}
              onClick={() => handleCardSort(opt.key)}
              className={`text-xs-mono px-2 py-1 border rounded transition-colors ${cardSortKey === opt.key ? 'bg-accent text-white border-accent' : 'text-muted border-accent hover:text-white hover:border-muted'}`}
            >
              {opt.label}
              {cardSortKey === opt.key && (
                cardSortDir === 'asc' ? <ArrowUp size={10} className="inline ml-1" /> : <ArrowDown size={10} className="inline ml-1" />
              )}
            </button>
          ))}
        </div>
      )}

      {viewMode === 'cards' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-1">
          {stocks.length === 0 && (
            <div className="col-span-full text-center p-10 border border-dashed border-accent text-muted text-xs-mono">
              DEPOT LEER. OBEN EINEN TICKER HINZUFÜGEN ODER EINE SICHERUNG EINSPIELEN.
            </div>
          )}
          {sortedStocks.map(symbol => (
            <StockCard
              key={symbol}
              stock={{ symbol, ...(stockData[symbol] || { status: 'pending' }) }}
              history={cardHistory(symbol)}
              stats={statsData[symbol] || { performance: {} }}
              purchasePrice={purchasePrices[symbol] || 0}
              shareQuantity={shareQuantities[symbol] || 0}
              purchaseDate={purchaseDates[symbol] || ''}
              onUpdatePurchasePrice={updatePurchasePrice}
              onUpdateShareQuantity={updateShareQuantity}
              onUpdatePurchaseDate={updatePurchaseDate}
              onRemove={removeStock}
              onPeriodChange={handlePeriodChange}
              onShowDetail={setDetailSymbol}
              onMoveCopy={setMoveCopySymbol}
              accounts={accounts}
              activeAccountId={activeAccountId}
            />
          ))}
        </div>
      ) : (
        <div id="print-area">
          <TableView
            stocks={sortedStocks}
            stockData={stockData}
            statsData={statsData}
            purchasePrices={purchasePrices}
            shareQuantities={shareQuantities}
            purchaseDates={purchaseDates}
            onUpdatePurchasePrice={updatePurchasePrice}
            onUpdateShareQuantity={updateShareQuantity}
            onUpdatePurchaseDate={updatePurchaseDate}
            onRemove={removeStock}
            onShowDetail={setDetailSymbol}
            onMoveCopy={setMoveCopySymbol}
            accounts={accounts}
            activeAccountId={activeAccountId}
          />
        </div>
      )}

      {moveCopySymbol && accounts.length > 1 && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/70" onClick={() => setMoveCopySymbol(null)}>
          <div className="bg-surface border border-accent w-full max-w-[400px] mx-4 p-6 relative" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-title-mono font-bold uppercase">{moveCopySymbol} verschieben/kopieren</h2>
              <button onClick={() => setMoveCopySymbol(null)} className="text-muted hover:text-white transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-2">
              {accounts.filter(a => a.id !== activeAccountId).map(target => (
                <div key={target.id} className="border border-accent p-3 flex items-center justify-between">
                  <span className="text-xs-mono">{target.name}</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleMoveStock(moveCopySymbol, target.id)}
                      className="text-xs-mono px-2 py-1 border border-accent text-muted hover:text-white hover:border-muted transition-colors flex items-center gap-1"
                    >
                      <ArrowLeftRight size={12} /> Verschieben
                    </button>
                    <button
                      onClick={() => handleCopyStock(moveCopySymbol, target.id)}
                      className="text-xs-mono px-2 py-1 border border-accent text-muted hover:text-white hover:border-muted transition-colors flex items-center gap-1"
                    >
                      <Copy size={12} /> Kopieren
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {oldShares.length > 0 && (
        <details className="mt-8 border border-accent">
          <summary className="text-xs-mono text-muted uppercase p-2 cursor-pointer hover:text-white transition-colors select-none">
            Alte Positionen ({oldShares.length})
          </summary>
          <div className="overflow-x-auto">
            <table className="w-full text-table-mono border-collapse">
              <thead>
                <tr className="border-b border-accent text-muted uppercase">
                  <th className="text-left p-2 font-normal">Symbol</th>
                  <th className="text-left p-2 font-normal">Name</th>
                  <th className="text-center p-2 font-normal">Anzahl</th>
                  <th className="text-center p-2 font-normal">Kaufkurs</th>
                  <th className="text-center p-2 font-normal">Kaufdatum</th>
                  <th className="text-right p-2 font-normal">Letzter Kurs</th>
                  <th className="text-right p-2 font-normal">Entfernt am</th>
                  <th className="w-16 p-2"></th>
                </tr>
              </thead>
              <tbody>
                {oldShares.map(entry => (
                  <tr key={entry.id} className="border-b border-accent">
                    <td className="p-2 font-bold">{entry.symbol}</td>
                    <td className="p-2 text-muted">{entry.name}</td>
                    <td className="p-2 text-center">{entry.qty || '-'}</td>
                    <td className="p-2 text-center">{entry.buyPrice || '-'}</td>
                    <td className="p-2 text-center">{entry.buyDate || '-'}</td>
                    <td className="p-2 text-right">{entry.lastPrice || '-'}</td>
                    <td className="p-2 text-right text-muted text-[0.72rem]">
                      {entry.removedAt ? new Date(entry.removedAt).toLocaleDateString() : '-'}
                    </td>
                    <td className="p-2 text-center whitespace-nowrap">
                      <button onClick={() => restoreOldShare(entry)} className="text-muted hover:text-pos transition-colors mr-2" title="Reaktivieren">
                        <ArrowUp size={12} />
                      </button>
                      <button onClick={() => deleteOldShare(entry.id)} className="text-muted hover:text-neg transition-colors" title="Endgültig löschen">
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      {showSettings && (
        <Settings
          colors={colorSettings}
          onChange={setColorSettings}
          onClose={() => setShowSettings(false)}
          email={session?.user?.email}
          onSignOut={handleSignOut}
          onExportBackup={handleExportBackup}
          onImportFile={handleImportBackup}
          lastBackupAt={lastBackupAt}
          fontScale={fontScale}
          onFontScaleChange={setFontScale}
          fontFamily={fontFamily}
          onFontFamilyChange={setFontFamily}
          refreshInterval={refreshInterval}
          onRefreshIntervalChange={setRefreshInterval}
        />
      )}

      {detailSymbol && (
        <StockDetail
          symbol={detailSymbol}
          client={client}
          stockData={stockData}
          dailyRows={dailyPrices[detailSymbol]?.rows || []}
          statsData={statsData}
          onEnsureHistory={ensureHistory}
          purchasePrice={purchasePrices[detailSymbol] || 0}
          shareQuantity={shareQuantities[detailSymbol] || 0}
          purchaseDate={purchaseDates[detailSymbol] || ''}
          onUpdatePurchasePrice={updatePurchasePrice}
          onUpdateShareQuantity={updateShareQuantity}
          onUpdatePurchaseDate={updatePurchaseDate}
          onClose={() => setDetailSymbol(null)}
        />
      )}

      <footer className="mt-8 text-[0.7rem] text-muted text-center no-print">
        Kurse von Yahoo Finance, ca. 15 min verzögert, Aktualisierung alle 30 min (Mo–Fr). Depotdaten bleiben auf diesem Gerät.
      </footer>
    </div>
  );
};

export default App;
