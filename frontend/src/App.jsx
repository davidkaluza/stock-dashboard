import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import StockRow from './components/StockRow';
import StockSheet from './components/StockSheet';
import TableView from './components/TableView';
import { DepotSheet, MenuSheet, MoveSheet, SearchSheet } from './components/AppSheets';
import Settings from './components/Settings';
import AlertDialog from './components/AlertDialog';
import { ArrowUp, ChevronDown, MoreHorizontal, Plus, Trash2, ShieldAlert } from 'lucide-react';
import { fetchSnapshot, fetchDailyPrices, formatFetchedAt } from './lib/market';
import { CARD_HISTORY_DAYS, daysAgo, hasHistoryFor, periodStart, toIsoDate } from './lib/history';
import { BADGE_LABELS, fmtNum, fmtPct, fmtSigned, nextBadgeMode, signOf } from './lib/format';
import { applyFont, applyTheme, loadThemeSettings } from './lib/theme';
import { collectSymbols, normalizeSymbol, syncTickers } from './lib/tickers';
import { createSearch } from './lib/search';
import { requestRefresh } from './lib/refresh';
import { RULE_TYPES, groupRules, loadAlertLog, loadRules, rulesForBackup, saveRules } from './lib/alerts';
import { disablePush, enablePush, pushStatus, showTestNotification, syncPushSubscription } from './lib/push';
import { buildBackup, buildCsv, downloadFile, emptyAccount, mergeCsvIntoAccounts, parseBackup, parseCsv } from './lib/backup';

const APP_VERSION = '0.3.0';

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
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null); // Hinweis (nicht Fehler), z. B. „Abruf gestartet“
  const [loadingData, setLoadingData] = useState(false);
  const [lastLoadedAt, setLastLoadedAt] = useState(null);
  const [viewMode, setViewMode] = useState(() => (localStorage.getItem('viewMode') === 'table' ? 'table' : 'list'));
  const [badgeMode, setBadgeMode] = useState(() => localStorage.getItem('badgeMode') || 'day');
  const [openSheet, setOpenSheet] = useState(null); // 'depots' | 'menu' | 'search'
  const [themeInit] = useState(loadThemeSettings);
  const [colorScheme, setColorScheme] = useState(themeInit.colorScheme);
  const [detailSymbol, setDetailSymbol] = useState(null);
  const [moveCopySymbol, setMoveCopySymbol] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [colorSettings, setColorSettings] = useState(themeInit.colorSettings);
  const [fontScale, setFontScale] = useState(() => {
    const saved = parseInt(localStorage.getItem('fontScale') || '100', 10);
    return Number.isFinite(saved) ? Math.min(140, Math.max(80, saved)) : 100;
  });
  const [fontFamily, setFontFamily] = useState(themeInit.fontFamily);
  const [refreshInterval, setRefreshInterval] = useState(() => {
    const saved = parseInt(localStorage.getItem('refreshInterval') || '300', 10);  // Sekunden
    return Number.isFinite(saved) ? Math.min(3600, Math.max(60, saved)) : 300;
  });
  const [lastBackupAt, setLastBackupAt] = useState(() => localStorage.getItem('lastBackupAt'));
  const [reminderSnoozedUntil, setReminderSnoozedUntil] = useState(() => Number(localStorage.getItem('backupReminderSnoozedUntil') || 0));
  const [alertRules, setAlertRules] = useState([]);
  const [alertSymbol, setAlertSymbol] = useState(null);
  const [alertLog, setAlertLog] = useState([]);
  const [pushState, setPushState] = useState('off');
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState('');
  const [settingsSection, setSettingsSection] = useState(null);
  const [cardSortKey, setCardSortKey] = useState('name');
  const [cardSortDir, setCardSortDir] = useState('asc');

  const search = useMemo(() => createSearch(client), [client]);

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
      setCardSortDir(key === 'name' ? 'asc' : 'desc');
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
        case 'day':
          va = dataA?.change_percent ?? -Infinity; vb = dataB?.change_percent ?? -Infinity;
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
    applyTheme(colorScheme, colorSettings);
    safeSetItem('colorScheme', colorScheme);
  }, [colorScheme, colorSettings]);

  useEffect(() => {
    const clamped = Math.min(140, Math.max(80, fontScale));
    document.documentElement.style.fontSize = `${16 * clamped / 100}px`;
    safeSetItem('fontScale', String(clamped));
  }, [fontScale]);

  useEffect(() => {
    applyFont(fontFamily);
    safeSetItem('fontFamily', fontFamily);
  }, [fontFamily]);

  useEffect(() => { safeSetItem('badgeMode', badgeMode); }, [badgeMode]);

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

  // ── Push-Regeln und Abo ─────────────────────────────────────

  const rulesBySymbol = useMemo(() => groupRules(alertRules), [alertRules]);
  const alertSymbols = useMemo(() => new Set(alertRules.filter(r => r.enabled).map(r => r.symbol)), [alertRules]);

  const refreshPushState = useCallback(async () => {
    try { setPushState(await pushStatus()); } catch { setPushState('unsupported'); }
  }, []);

  useEffect(() => {
    loadRules(client).then(setAlertRules).catch((e) => console.error('Regeln konnten nicht geladen werden', e));
    // Abo erneuern, falls der Browser es verworfen hat (iOS), danach Status anzeigen
    syncPushSubscription(client).catch((e) => console.warn('Push-Abo nicht erneuert', e)).finally(refreshPushState);
  }, [client, refreshPushState]);

  useEffect(() => {
    if (!showSettings) return;
    refreshPushState();
    loadAlertLog(client).then(setAlertLog).catch((e) => console.error(e));
  }, [showSettings, client, refreshPushState]);

  const handleEnablePush = async () => {
    setPushBusy(true);
    setPushError('');
    try {
      await enablePush(client);
    } catch (e) {
      console.error(e);
      setPushError(e.message || 'Benachrichtigungen konnten nicht aktiviert werden.');
    } finally {
      setPushBusy(false);
      refreshPushState();
    }
  };

  const handleDisablePush = async () => {
    setPushBusy(true);
    setPushError('');
    try {
      await disablePush(client);
    } catch (e) {
      console.error(e);
      setPushError('Deaktivieren fehlgeschlagen.');
    } finally {
      setPushBusy(false);
      refreshPushState();
    }
  };

  const handleTestNotification = () => {
    showTestNotification().catch((e) => setPushError(`Anzeige fehlgeschlagen: ${e.message}`));
  };

  const handleSaveRules = async (rows) => {
    const saved = await saveRules(client, rows);
    setAlertRules(prev => {
      const keep = prev.filter(r => !saved.some(n => n.symbol === r.symbol && n.type === r.type));
      return [...keep, ...saved];
    });
  };

  const openSettings = (section = null) => {
    setSettingsSection(section);
    setShowSettings(true);
  };

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
  const updateShareQuantity = (symbol, qty) => updateAccountField('shareQuantities', symbol, parseFloat(qty) || 0);
  const updatePurchaseDate = (symbol, date) => updateAccountField('purchaseDates', symbol, date || '');

  const addAccount = (name) => {
    const id = 'acc_' + Date.now();
    setAccounts(prev => [...prev, emptyAccount(id, name)]);
    setActiveTab(id);
  };

  const renameAccount = (name) => {
    setAccounts(prev => prev.map(a => a.id === activeAccountId ? { ...a, name } : a));
  };

  const deleteAccount = () => {
    if (!activeAccount || accounts.length < 2) return;
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

  const settingsSnapshot = () => ({ colorScheme, colorSettings, viewMode, badgeMode, fontScale, fontFamily, refreshInterval });

  const handleExportBackup = () => {
    const backup = buildBackup({ accounts, settings: settingsSnapshot(), alertRules: rulesForBackup(alertRules) });
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
        if (['system', 'gold', 'custom'].includes(s.colorScheme)) setColorScheme(s.colorScheme);
        if (s.viewMode) setViewMode(s.viewMode === 'table' ? 'table' : 'list');
        if (['day', 'pl', 'value'].includes(s.badgeMode)) setBadgeMode(s.badgeMode);
        if (Number.isFinite(s.fontScale)) setFontScale(s.fontScale);
        if (typeof s.fontFamily === 'string') setFontFamily(s.fontFamily);
        if (Number.isFinite(s.refreshInterval)) setRefreshInterval(Math.min(3600, Math.max(60, s.refreshInterval)));
        setError(null);
        const types = new Set(RULE_TYPES.map(t => t.type));
        const rules = data.alertRules.filter(r => r && typeof r.symbol === 'string' && types.has(r.type))
          .map(r => ({ symbol: r.symbol.toUpperCase(), type: r.type, params: r.params || {}, enabled: Boolean(r.enabled) }));
        if (rules.length) {
          handleSaveRules(rules).catch((e) => {
            console.error(e);
            setError('Depots wiederhergestellt, Benachrichtigungsregeln aber nicht (Server nicht erreichbar).');
          });
        }
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

  const handleFetchNow = async () => {
    setNotice({ ok: true, text: 'Starte Abruf…' });
    try {
      const result = await requestRefresh(client);
      setNotice(result);
      if (result.ok) {
        // Die Action braucht ca. 1–2 Minuten; danach automatisch nachladen
        setTimeout(loadSnapshot, 75 * 1000);
        setTimeout(loadSnapshot, 150 * 1000);
        setTimeout(() => setNotice(null), 160 * 1000);
      }
    } catch (e) {
      setNotice({ ok: false, text: `Abruf konnte nicht gestartet werden: ${e.message || e}` });
    }
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

  const removeAndClose = (symbol) => {
    removeStock(symbol);
    setDetailSymbol(null);
  };

  const iconButton = 'h-11 w-11 flex items-center justify-center rounded-full text-accent active:bg-surface2';
  const detailStock = detailSymbol ? { symbol: detailSymbol, ...(stockData[detailSymbol] || { status: 'pending' }) } : null;

  return (
    <div className="w-full max-w-6xl mx-auto safe-area">
      {/* Kopf: Depot als Titel, Suche, Menü */}
      <header className="flex items-center gap-1 mb-1 no-print">
        <button
          onClick={() => setOpenSheet('depots')}
          className="min-w-0 flex items-center gap-1 text-[1.75rem] font-bold leading-tight tracking-tight py-1 text-left"
          aria-label="Depot wechseln"
        >
          <span className="truncate">{activeAccount?.name || 'Depot'}</span>
          <ChevronDown size={22} className="shrink-0 text-muted mt-1" />
        </button>
        <div className="ml-auto flex items-center shrink-0">
          <button onClick={() => setOpenSheet('search')} className={iconButton} aria-label="Aktie hinzufügen"><Plus size={24} /></button>
          <button onClick={() => setOpenSheet('menu')} className={iconButton} aria-label="Menü"><MoreHorizontal size={24} /></button>
        </div>
      </header>

      {/* Depotsumme */}
      <div className="mb-4 no-print">
        <div className="text-2xl font-semibold">{fmtNum(portfolioSummary.totalCurrent)}</div>
        <div className={`text-[0.95rem] font-medium ${signOf(portfolioSummary.pl) > 0 ? 'text-pos' : signOf(portfolioSummary.pl) < 0 ? 'text-neg' : 'text-muted'}`}>
          {fmtSigned(portfolioSummary.pl)} ({fmtPct(portfolioSummary.plPct)}) seit Kauf
        </div>
        <div className="text-sm text-muted mt-0.5 flex flex-wrap gap-x-2">
          <span>{formatFetchedAt(newestFetch) || 'Noch keine Kurse'}</span>
          {pendingCount > 0 && <span className="text-accent">· {pendingCount} wird geladen</span>}
          {unknownSymbols.length > 0 && <span className="text-neg">· unbekannt: {unknownSymbols.join(', ')}</span>}
        </div>
      </div>

      {error && <p className="text-neg text-sm mb-3 px-1">{error}</p>}
      {notice && (
        <div className={`bg-surface rounded-xl px-3 py-2 mb-3 text-sm flex items-center gap-2 no-print ${notice.ok ? 'text-fg' : 'text-neg'}`}>
          <span className="flex-1">{notice.text}</span>
          <button onClick={() => setNotice(null)} className="text-muted h-8 px-2" aria-label="Hinweis schließen">OK</button>
        </div>
      )}

      {showBackupReminder && (
        <div className="bg-surface rounded-xl p-3 mb-4 text-sm flex items-center gap-3 no-print">
          <ShieldAlert size={20} className="text-accent shrink-0" />
          <span className="flex-1">
            {lastBackupAt ? `Letzte Sicherung vor über ${BACKUP_REMINDER_DAYS} Tagen.` : 'Deine Depots liegen nur auf diesem Gerät.'}
          </span>
          <button onClick={handleExportBackup} className="h-9 px-3 rounded-lg bg-accent text-accent-fg font-medium shrink-0">Sichern</button>
          <button onClick={snoozeReminder} className="h-9 px-2 text-muted shrink-0">Später</button>
        </div>
      )}

      {viewMode === 'list' ? (
        <>
          {stocks.length === 0 ? (
            <div className="bg-surface rounded-xl px-4 py-10 text-center text-muted">
              <p className="mb-3">Noch keine Aktien in diesem Depot.</p>
              <button onClick={() => setOpenSheet('search')} className="h-11 px-4 rounded-xl bg-accent text-accent-fg font-medium">Aktie hinzufügen</button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between px-1 mb-1.5 text-[0.8rem] uppercase tracking-wide text-muted">
                <span>{stocks.length} Aktien</span>
                <button onClick={() => setBadgeMode(nextBadgeMode(badgeMode))} className="uppercase tracking-wide">
                  {BADGE_LABELS[badgeMode]}
                </button>
              </div>
              <ul className="bg-surface rounded-xl overflow-hidden divide-y divide-line md:divide-y-0 md:grid md:grid-cols-2 md:[&>li]:border-b md:[&>li]:border-line md:[&>li:nth-child(odd)]:border-r">
                {sortedStocks.map(symbol => (
                  <StockRow
                    key={symbol}
                    symbol={symbol}
                    stock={{ symbol, ...(stockData[symbol] || { status: 'pending' }) }}
                    rows={dailyPrices[symbol]?.rows}
                    qty={shareQuantities[symbol]}
                    buyPrice={purchasePrices[symbol]}
                    buyDate={purchaseDates[symbol]}
                    badgeMode={badgeMode}
                    onBadge={() => setBadgeMode(nextBadgeMode(badgeMode))}
                    onOpen={setDetailSymbol}
                    hasAlerts={alertSymbols.has(symbol)}
                  />
                ))}
              </ul>
            </>
          )}
        </>
      ) : (
        <div id="print-area" className="bg-surface rounded-xl overflow-x-auto">
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
            onAlerts={setAlertSymbol}
            alertSymbols={alertSymbols}
            accounts={accounts}
            activeAccountId={activeAccountId}
          />
        </div>
      )}

      {oldShares.length > 0 && (
        <details className="mt-6 group no-print">
          <summary className="list-none cursor-pointer select-none px-1 mb-1.5 text-[0.8rem] uppercase tracking-wide text-muted flex items-center gap-1">
            <ChevronDown size={14} className="-rotate-90 group-open:rotate-0 transition-transform" /> Alte Positionen ({oldShares.length})
          </summary>
          <ul className="bg-surface rounded-xl overflow-hidden divide-y divide-line">
            {oldShares.map(entry => (
              <li key={entry.id} className="flex items-center gap-3 px-4 min-h-[56px] py-2">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold truncate">{entry.name || entry.symbol}</div>
                  <div className="text-sm text-muted truncate">
                    {entry.symbol} · {fmtNum(entry.qty, entry.qty % 1 ? 2 : 0)} Stk. · Kauf {fmtNum(entry.buyPrice)} · zuletzt {fmtNum(entry.lastPrice)}
                    {entry.removedAt ? ` · entfernt ${new Date(entry.removedAt).toLocaleDateString('de-DE')}` : ''}
                  </div>
                </div>
                <button onClick={() => restoreOldShare(entry)} className="h-10 w-10 flex items-center justify-center text-accent" aria-label="Reaktivieren"><ArrowUp size={18} /></button>
                <button onClick={() => deleteOldShare(entry.id)} className="h-10 w-10 flex items-center justify-center text-neg" aria-label="Endgültig löschen"><Trash2 size={18} /></button>
              </li>
            ))}
          </ul>
        </details>
      )}

      <footer className="mt-8 mb-2 text-xs text-muted text-center no-print">
        Kurse von Yahoo Finance, ca. 15 min verzögert · Aktualisierung alle 30 min (Mo–Fr)
        {lastLoadedAt ? ` · geladen ${lastLoadedAt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}` : ''}
        <br />Depotdaten bleiben auf diesem Gerät · Version {APP_VERSION}
      </footer>

      {/* ── Blätter ── */}
      {openSheet === 'depots' && (
        <DepotSheet
          accounts={accounts}
          activeId={activeAccountId}
          onSelect={setActiveTab}
          onAdd={addAccount}
          onRename={renameAccount}
          onDelete={deleteAccount}
          onClose={() => setOpenSheet(null)}
        />
      )}
      {openSheet === 'menu' && (
        <MenuSheet
          sortKey={cardSortKey}
          sortDir={cardSortDir}
          onSort={handleCardSort}
          viewMode={viewMode}
          onViewMode={setViewMode}
          onReload={loadSnapshot}
          onFetchNow={handleFetchNow}
          loading={loadingData}
          onExportCsv={handleExportCsv}
          onImportCsv={handleImportCsv}
          onPrint={() => { setViewMode('table'); setTimeout(() => window.print(), 300); }}
          onSettings={() => openSettings()}
          onClose={() => setOpenSheet(null)}
        />
      )}
      {openSheet === 'search' && <SearchSheet onAdd={addStock} search={search} onClose={() => setOpenSheet(null)} />}

      {detailStock && (
        <StockSheet
          symbol={detailSymbol}
          client={client}
          stock={detailStock}
          stats={statsData[detailSymbol]?.performance || {}}
          dailyRows={dailyPrices[detailSymbol]?.rows || []}
          onEnsureHistory={ensureHistory}
          qty={shareQuantities[detailSymbol]}
          buyPrice={purchasePrices[detailSymbol]}
          buyDate={purchaseDates[detailSymbol]}
          onUpdateQty={updateShareQuantity}
          onUpdateBuyPrice={updatePurchasePrice}
          onUpdateBuyDate={updatePurchaseDate}
          alertCount={Object.values(rulesBySymbol[detailSymbol] || {}).filter(r => r.enabled).length}
          onAlerts={setAlertSymbol}
          canMove={accounts.length > 1}
          onMoveCopy={setMoveCopySymbol}
          onRemove={removeAndClose}
          onClose={() => setDetailSymbol(null)}
        />
      )}

      {moveCopySymbol && accounts.length > 1 && (
        <MoveSheet
          symbol={moveCopySymbol}
          accounts={accounts}
          activeId={activeAccountId}
          onMove={(sym, target) => { handleMoveStock(sym, target); setDetailSymbol(null); }}
          onCopy={handleCopyStock}
          onClose={() => setMoveCopySymbol(null)}
        />
      )}

      {alertSymbol && (
        <AlertDialog
          symbol={alertSymbol}
          name={stockData[alertSymbol]?.name}
          price={stockData[alertSymbol]?.price}
          purchasePrice={purchasePrices[alertSymbol]}
          rules={rulesBySymbol[alertSymbol] || {}}
          pushState={pushState}
          onSave={handleSaveRules}
          onClose={() => setAlertSymbol(null)}
          onOpenSettings={() => { setAlertSymbol(null); openSettings('push'); }}
        />
      )}

      {showSettings && (
        <Settings
          colorScheme={colorScheme}
          onColorScheme={setColorScheme}
          colors={colorSettings}
          onChange={setColorSettings}
          onClose={() => setShowSettings(false)}
          email={session?.user?.email}
          onSignOut={handleSignOut}
          onExportBackup={handleExportBackup}
          onImportFile={handleImportBackup}
          lastBackupAt={lastBackupAt}
          initialSection={settingsSection}
          pushState={pushState}
          pushBusy={pushBusy}
          pushError={pushError}
          onEnablePush={handleEnablePush}
          onDisablePush={handleDisablePush}
          onTestNotification={handleTestNotification}
          alertLog={alertLog}
          fontScale={fontScale}
          onFontScaleChange={setFontScale}
          fontFamily={fontFamily}
          onFontFamilyChange={setFontFamily}
          refreshInterval={refreshInterval}
          onRefreshIntervalChange={setRefreshInterval}
        />
      )}
    </div>
  );
};

export default App;
