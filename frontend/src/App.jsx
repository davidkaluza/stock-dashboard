import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import StockCard from './components/StockCard';
import AddStock from './components/AddStock';
import TableView from './components/TableView';
import StockDetail from './components/StockDetail';
import Settings from './components/Settings';
import { LayoutGrid, Table, Download, Upload, Printer, Plus, Trash2, Pencil, Settings as SettingsIcon, ArrowUp, ArrowDown, ArrowLeftRight, Copy, X, Database, RefreshCw, Power } from 'lucide-react';

const APP_VERSION = '0.1.0';

const API_BASE = import.meta.env.DEV ? 'http://localhost:8001' : '';

const formatCacheAge = (ts) => {
  if (!ts) return null;
  const diffSec = (Date.now() / 1000) - ts;
  if (diffSec < 60) return 'gerade eben';
  if (diffSec < 3600) return `vor ${Math.floor(diffSec / 60)} Min`;
  if (diffSec < 86400) return `vor ${Math.floor(diffSec / 3600)} Std`;
  return `vor ${Math.floor(diffSec / 86400)} Tagen`;
};

const App = () => {
  const [accounts, setAccounts] = useState(() => {
    const saved = localStorage.getItem('accounts');
    if (saved) {
      const parsed = JSON.parse(saved);
      return parsed.length ? parsed.map(a => ({ ...a, purchaseDates: a.purchaseDates || {}, oldShares: a.oldShares || [] })) : [{ id: 'default', name: 'Depot 1', watchlist: [], purchasePrices: {}, shareQuantities: {}, purchaseDates: {}, oldShares: [] }];
    }
    const oldWatchlist = JSON.parse(localStorage.getItem('watchlist') || '[]');
    const oldPrices = JSON.parse(localStorage.getItem('purchasePrices') || '{}');
    const oldQtys = JSON.parse(localStorage.getItem('shareQuantities') || '{}');
    return [{ id: 'default', name: 'Depot 1', watchlist: oldWatchlist, purchasePrices: oldPrices, shareQuantities: oldQtys, purchaseDates: {}, oldShares: [] }];
  });
  const [activeTab, setActiveTab] = useState(() => {
    return localStorage.getItem('activeTab') || localStorage.getItem('activeAccountId') || 'default';
  });
  const activeAccountId = accounts.some(a => a.id === activeTab) ? activeTab : (accounts[0]?.id || null);
  const [stockData, setStockData] = useState(() => {
    const saved = localStorage.getItem('stockData');
    return saved ? JSON.parse(saved) : {};
  });
  const [statsData, setStatsData] = useState(() => {
    const saved = localStorage.getItem('statsData');
    return saved ? JSON.parse(saved) : {};
  });
  const [historyData, setHistoryData] = useState(() => {
    const saved = localStorage.getItem('historyData');
    return saved ? JSON.parse(saved) : {};
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState(() => {
    return localStorage.getItem('viewMode') || 'cards';
  });
  const [detailSymbol, setDetailSymbol] = useState(null);
  const [moveCopySymbol, setMoveCopySymbol] = useState(null);
  const [moveCopyAction, setMoveCopyAction] = useState('move');
  const [showSettings, setShowSettings] = useState(false);
  const [colorSettings, setColorSettings] = useState(() => {
    const saved = localStorage.getItem('colorSettings');
    const base = saved ? JSON.parse(saved) : {};
    return {
      background: '#33312B', surface: '#33312B', accent: '#C09537', muted: '#888888',
      pos: '#22c55e', neg: '#ef4444', posLight: '#86efac', negLight: '#fca5a5',
      ...base,
    };
  });
  const [dbConfig, setDbConfig] = useState({ uri: '', ttl: 3600, enabled: false, offline: false, connected: false });
  const [cacheSummary, setCacheSummary] = useState({ items: {}, total_keys: 0 });
  const [cachePanelOpen, setCachePanelOpen] = useState(() => localStorage.getItem('cachePanelOpen') === 'true');
  const [refreshingDb, setRefreshingDb] = useState(false);
  const [refreshProgress, setRefreshProgress] = useState({ done: 0, total: 0, current: '' });
  const [fontScale, setFontScale] = useState(() => {
    const saved = parseInt(localStorage.getItem('fontScale') || '100', 10);
    return Number.isFinite(saved) ? Math.min(140, Math.max(80, saved)) : 100;
  });
  const [cardSortKey, setCardSortKey] = useState('name');
  const [cardSortDir, setCardSortDir] = useState('asc');

  const activeAccount = useMemo(() => {
    if (!activeAccountId) return null;
    return accounts.find(a => a.id === activeAccountId) || accounts[0];
  }, [accounts, activeAccountId]);

  const allWatchlistSymbols = useMemo(() => {
    const set = new Set();
    accounts.forEach(a => a.watchlist?.forEach(s => set.add(s)));
    return [...set];
  }, [accounts]);

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
      const daysA = dateA ? Math.floor((new Date() - new Date(dateA)) / (1000 * 60 * 60 * 24)) : 0;
      const daysB = dateB ? Math.floor((new Date() - new Date(dateB)) / (1000 * 60 * 60 * 24)) : 0;

      let va, vb;
      switch (cardSortKey) {
        case 'name':
          va = dataA?.name || a; vb = dataB?.name || b;
          break;
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
        default:
          va = dataA?.name || a; vb = dataB?.name || b;
      }

      if (typeof va === 'string') {
        return cardSortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      return cardSortDir === 'asc' ? va - vb : vb - va;
    });
  }, [stocks, stockData, cardSortKey, cardSortDir, purchasePrices, shareQuantities, purchaseDates]);

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
    localStorage.setItem('fontScale', String(clamped));
  }, [fontScale]);

  useEffect(() => {
    localStorage.setItem('accounts', JSON.stringify(accounts));
    localStorage.setItem('activeTab', activeTab);
    localStorage.setItem('viewMode', viewMode);
    localStorage.setItem('colorSettings', JSON.stringify(colorSettings));
    localStorage.setItem('cachePanelOpen', String(cachePanelOpen));
  }, [accounts, activeTab, viewMode, purchaseDates, colorSettings, cachePanelOpen]);

  useEffect(() => { localStorage.setItem('stockData', JSON.stringify(stockData)); }, [stockData]);
  useEffect(() => { localStorage.setItem('statsData', JSON.stringify(statsData)); }, [statsData]);
  useEffect(() => { localStorage.setItem('historyData', JSON.stringify(historyData)); }, [historyData]);

  useEffect(() => {
    const fetchDbConfig = async () => {
      try {
        const res = await axios.get(`${API_BASE}/db/config`);
        setDbConfig(res.data);
      } catch (e) { /* DB nicht verfuegbar */ }
    };
    fetchDbConfig();
  }, []);


  const fetchCacheSummary = useCallback(async () => {
    if (!allWatchlistSymbols.length) {
      setCacheSummary({ items: {}, total_keys: 0 });
      return;
    }
    try {
      const res = await axios.get(`${API_BASE}/db/cache/summary?symbols=${encodeURIComponent(allWatchlistSymbols.join(','))}`);
      setCacheSummary(res.data);
    } catch (e) {
      setCacheSummary({ items: {}, total_keys: 0 });
    }
  }, [allWatchlistSymbols]);

  useEffect(() => {
    fetchCacheSummary();
  }, [fetchCacheSummary, dbConfig.connected, dbConfig.enabled, dbConfig.offline]);

  const saveDbConfig = async (patch) => {
    const next = { ...dbConfig, ...patch };
    const payload = {
      uri: next.uri || '',
      ttl: Number(next.ttl) || 3600,
      enabled: Boolean(next.enabled),
      offline: Boolean(next.offline),
    };
    const res = await axios.post(`${API_BASE}/db/config`, payload);
    setDbConfig({ ...next, ...res.data });
    return { ...next, ...res.data };
  };

  const handleToggleOffline = async () => {
    try {
      await saveDbConfig({ offline: !dbConfig.offline });
      await fetchCacheSummary();
    } catch (e) {
      setError('Offline-Modus konnte nicht umgeschaltet werden. Bitte MongoDB-Verbindung prüfen.');
    }
  };

  const handleRefreshDatabase = async () => {
    if (!allWatchlistSymbols.length) return;
    const symbols = [...allWatchlistSymbols];
    const total = symbols.length;
    const historyPeriods = ['1mo', '6mo', '1y', '5y', 'max'];

    setRefreshingDb(true);
    setRefreshProgress({ done: 0, total, current: '' });
    setCachePanelOpen(true);
    setError(null);

    let wasOffline = dbConfig.offline;
    try {
      if (wasOffline) {
        await saveDbConfig({ offline: false });
      }

      for (let index = 0; index < symbols.length; index += 1) {
        const symbol = symbols[index];
        setRefreshProgress({ done: index, total, current: symbol });
        await axios.post(`${API_BASE}/db/refresh`, {
          symbols: [symbol],
          history_periods: historyPeriods,
          include_detail: true,
          include_news: true,
        });
        setRefreshProgress({ done: index + 1, total, current: symbol });
        await fetchCacheSummary();
      }

      await fetchCacheSummary();
      for (const symbol of symbols) {
        try {
          const [priceRes, histRes, statsRes] = await Promise.all([
            axios.get(`${API_BASE}/price/${symbol}`),
            axios.get(`${API_BASE}/history/${symbol}`),
            axios.get(`${API_BASE}/stats/${symbol}`),
          ]);
          setStockData(prev => ({ ...prev, [symbol]: priceRes.data }));
          setHistoryData(prev => ({ ...prev, [symbol]: histRes.data.prices.map((p, i) => ({ price: p, date: histRes.data.dates[i] })) }));
          setStatsData(prev => ({ ...prev, [symbol]: statsRes.data }));
        } catch (e) {
          console.error(`Error reloading cached data for ${symbol}:`, e);
        }
      }

      if (wasOffline) {
        await saveDbConfig({ offline: true });
      }
    } catch (e) {
      setError('Datenbank-Aktualisierung fehlgeschlagen. Prüfe MongoDB, Internet und yfinance.');
      if (wasOffline) {
        try { await saveDbConfig({ offline: true }); } catch (restoreError) { console.error(restoreError); }
      }
    } finally {
      setRefreshingDb(false);
    }
  };

  const fetchSpecificHistory = async (symbol, period, startDate) => {
    try {
      const params = startDate ? `?start=${startDate}` : `?period=${period}`;
      const res = await axios.get(`${API_BASE}/history/${symbol}${params}`);
      setHistoryData(prev => ({
        ...prev,
        [symbol]: res.data.prices.map((p, i) => ({ price: p, date: res.data.dates[i] }))
      }));
    } catch (e) {
      console.error(`Error fetching history for ${symbol}:`, e);
    }
  };

  useEffect(() => {
    if (allWatchlistSymbols.length === 0) return;

    const fetchPriceStats = async () => {
      for (const symbol of allWatchlistSymbols) {
        try {
          const [priceRes, statsRes] = await Promise.all([
            axios.get(`${API_BASE}/price/${symbol}`),
            axios.get(`${API_BASE}/stats/${symbol}`),
          ]);
          setStockData(prev => ({ ...prev, [symbol]: priceRes.data }));
          setStatsData(prev => ({ ...prev, [symbol]: statsRes.data }));
        } catch (e) {
          console.error(`Error fetching ${symbol}:`, e);
        }
      }
    };

    const fetchAll = async () => {
      for (const symbol of allWatchlistSymbols) {
        try {
          const [priceRes, histRes, statsRes] = await Promise.all([
            axios.get(`${API_BASE}/price/${symbol}`),
            axios.get(`${API_BASE}/history/${symbol}`),
            axios.get(`${API_BASE}/stats/${symbol}`),
          ]);
          setStockData(prev => ({ ...prev, [symbol]: priceRes.data }));
          setHistoryData(prev => {
            if (prev[symbol] !== undefined) return prev;
            return { ...prev, [symbol]: histRes.data.prices.map((p, i) => ({ price: p, date: histRes.data.dates[i] })) };
          });
          setStatsData(prev => ({ ...prev, [symbol]: statsRes.data }));
        } catch (e) {
          console.error(`Error fetching ${symbol}:`, e);
        }
      }
    };

    fetchAll();
    if (dbConfig.offline) return undefined;
    const interval = setInterval(fetchPriceStats, 60000);
    return () => clearInterval(interval);
  }, [allWatchlistSymbols, dbConfig.offline]);

  const addStock = async (symbol) => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(`${API_BASE}/price/${symbol}`);
      const today = new Date().toISOString().split('T')[0];
      setAccounts(prev => prev.map(a =>
        a.id === activeAccountId && !a.watchlist.includes(symbol)
          ? {
              ...a,
              watchlist: [...a.watchlist, symbol],
              purchasePrices: { ...a.purchasePrices, [symbol]: res.data.price },
              shareQuantities: { ...a.shareQuantities, [symbol]: 1 },
              purchaseDates: { ...a.purchaseDates, [symbol]: today },
            }
          : a
      ));
    } catch (e) {
      setError(`Could not find ${symbol}. Try a different symbol or Ticker (e.g. SAP.DE).`);
    } finally {
      setLoading(false);
    }
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
    setAccounts(prev => prev.map(a => {
      if (a.id === activeAccountId) {
        return {
          ...a,
          watchlist: a.watchlist.filter(s => s !== symbol),
          shareQuantities: { ...a.shareQuantities, [symbol]: undefined },
          purchasePrices: { ...a.purchasePrices, [symbol]: undefined },
          purchaseDates: { ...a.purchaseDates, [symbol]: undefined },
        };
      }
      if (a.id === targetAccountId) {
        return {
          ...a,
          watchlist: [...a.watchlist, symbol],
          shareQuantities: { ...a.shareQuantities, [symbol]: accounts.find(acc => acc.id === activeAccountId)?.shareQuantities?.[symbol] || 1 },
          purchasePrices: { ...a.purchasePrices, [symbol]: accounts.find(acc => acc.id === activeAccountId)?.purchasePrices?.[symbol] || 0 },
          purchaseDates: { ...a.purchaseDates, [symbol]: accounts.find(acc => acc.id === activeAccountId)?.purchaseDates?.[symbol] || '' },
        };
      }
      return a;
    }));
    setMoveCopySymbol(null);
  }, [activeAccountId, accounts]);

  const handleCopyStock = useCallback((symbol, targetAccountId) => {
    setAccounts(prev => prev.map(a => {
      if (a.id === targetAccountId && !a.watchlist.includes(symbol)) {
        return {
          ...a,
          watchlist: [...a.watchlist, symbol],
          shareQuantities: { ...a.shareQuantities, [symbol]: accounts.find(acc => acc.id === activeAccountId)?.shareQuantities?.[symbol] || 1 },
          purchasePrices: { ...a.purchasePrices, [symbol]: accounts.find(acc => acc.id === activeAccountId)?.purchasePrices?.[symbol] || 0 },
          purchaseDates: { ...a.purchaseDates, [symbol]: accounts.find(acc => acc.id === activeAccountId)?.purchaseDates?.[symbol] || '' },
        };
      }
      return a;
    }));
    setMoveCopySymbol(null);
  }, [activeAccountId, accounts]);

  const updatePurchasePrice = (symbol, price) => {
    setAccounts(prev => prev.map(a =>
      a.id === activeAccountId
        ? { ...a, purchasePrices: { ...a.purchasePrices, [symbol]: parseFloat(price) || 0 } }
        : a
    ));
  };

  const updateShareQuantity = (symbol, qty) => {
    setAccounts(prev => prev.map(a =>
      a.id === activeAccountId
        ? { ...a, shareQuantities: { ...a.shareQuantities, [symbol]: parseInt(qty) || 0 } }
        : a
    ));
  };

  const updatePurchaseDate = (symbol, date) => {
    setAccounts(prev => prev.map(a =>
      a.id === activeAccountId
        ? { ...a, purchaseDates: { ...a.purchaseDates, [symbol]: date || '' } }
        : a
    ));
  };

  const addAccount = () => {
    const name = window.prompt('Neues Depot anlegen:\nName:', `Depot ${accounts.length + 1}`);
    if (!name) return;
    const id = 'acc_' + Date.now();
    setAccounts(prev => [...prev, { id, name, watchlist: [], purchasePrices: {}, shareQuantities: {}, purchaseDates: {}, oldShares: [] }]);
    setActiveTab(id);
  };

  const renameAccount = () => {
    if (!activeAccount) return;
    const name = window.prompt('Depot umbenennen:', activeAccount.name);
    if (!name || name === activeAccount.name) return;
    setAccounts(prev => prev.map(a =>
      a.id === activeAccountId ? { ...a, name } : a
    ));
  };

  const deleteAccount = () => {
    if (!activeAccount || accounts.length < 2) return;
    if (!window.confirm(`Depot "${activeAccount.name}" löschen?`)) return;
    const remaining = accounts.filter(a => a.id !== activeAccountId);
    setAccounts(remaining);
    setActiveTab(remaining[0]?.id || 'default');
  };

  const handleExport = () => {
    const headers = ['DEPOT', 'TICKER', 'NAME', 'ANZAHL', 'KAUFKURS', 'DATUM'];
    const rows = [];
    for (const acc of accounts) {
      for (const s of acc.watchlist) {
        const data = stockData[s];
        rows.push([
          acc.name,
          s,
          (data?.name || '').includes(';') ? `"${data?.name || ''}"` : (data?.name || ''),
          acc.shareQuantities?.[s] || 0,
          acc.purchasePrices?.[s] || 0,
          acc.purchaseDates?.[s] || ''
        ]);
      }
    }
    const csv = [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'portfolio.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target.result;
      const lines = text.split('\n').map(l => l.trim()).filter(l => l);
      if (lines.length < 2) return;
      const header = lines[0].toUpperCase();
      const hasDepot = header.startsWith('DEPOT');
      const dataLines = header.includes('TICKER') ? lines.slice(1) : lines;

      const depotEntries = {};
      for (const line of dataLines) {
        const delim = line.includes(';') ? ';' : ',';
        const parts = line.split(delim);
        const off = hasDepot ? 1 : 0;
        if (parts.length >= 4 + off) {
          const depotName = hasDepot ? parts[0].trim() : (accounts.find(a => a.id === activeAccountId)?.name || 'Depot 1');
          const ticker = parts[off].trim().toUpperCase();
          const qty = parseInt(parts[2 + off].trim()) || 0;
          const price = parseFloat(parts[3 + off].trim().replace(',', '.')) || 0;
          const date = parts[4 + off] ? parts[4 + off].trim() : '';
          if (!ticker) continue;
          if (!depotEntries[depotName]) depotEntries[depotName] = { watchlist: [], purchasePrices: {}, shareQuantities: {}, purchaseDates: {} };
          if (!depotEntries[depotName].watchlist.includes(ticker)) depotEntries[depotName].watchlist.push(ticker);
          if (qty > 0) depotEntries[depotName].shareQuantities[ticker] = qty;
          if (price > 0) depotEntries[depotName].purchasePrices[ticker] = price;
          if (date) depotEntries[depotName].purchaseDates[ticker] = date;
        }
      }

      setAccounts(prev => {
        const updated = [...prev];
        for (const [depotName, entries] of Object.entries(depotEntries)) {
          const existing = updated.find(a => a.name === depotName);
          if (existing) {
            const idx = updated.indexOf(existing);
            updated[idx] = {
              ...existing,
              watchlist: [...new Set([...existing.watchlist, ...entries.watchlist])],
              purchasePrices: { ...existing.purchasePrices, ...entries.purchasePrices },
              shareQuantities: { ...existing.shareQuantities, ...entries.shareQuantities },
              purchaseDates: { ...existing.purchaseDates, ...entries.purchaseDates },
            };
          } else {
            updated.push({
              id: 'acc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
              name: depotName,
              watchlist: entries.watchlist,
              purchasePrices: entries.purchasePrices,
              shareQuantities: entries.shareQuantities,
              purchaseDates: entries.purchaseDates,
              oldShares: [],
            });
          }
        }
        return updated;
      });
    };
    reader.readAsText(file);
    e.target.value = '';
  };

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

  return (
    <div className="w-full px-4 py-4 md:px-6 md:py-6">
      <header className="mb-4 flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-end">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tighter uppercase">Stock_Dashboard_{APP_VERSION.replace(/\./g, '_')}</h1>
        </div>
        <div className="text-right">
          <div className="text-xs-mono text-muted mb-1">
            {new Date().toLocaleDateString()} | {new Date().toLocaleTimeString()}
          </div>
          <div className="text-sm-mono">
            <span className="text-muted">Port:</span>{' '}
            <span className={portfolioSummary.pl >= 0 ? 'text-pos' : 'text-neg'}>
              {portfolioSummary.totalCurrent.toFixed(2)}{' '}
              ({portfolioSummary.pl >= 0 ? '+' : ''}{portfolioSummary.pl.toFixed(2)}/{portfolioSummary.plPct.toFixed(2)}%)
            </span>
          </div>
        </div>
      </header>

      <div className="flex items-center gap-1 border border-accent rounded p-1 mb-4 overflow-x-auto">
        {accounts.map(a => (
          <button
            key={a.id}
            onClick={() => setActiveTab(a.id)}
            className={`text-xs-mono px-3 py-1.5 uppercase transition-colors whitespace-nowrap ${activeTab === a.id ? 'bg-accent text-white' : 'text-muted hover:text-white'}`}
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

      <div className="flex items-center gap-2 mb-4">
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
        <AddStock onAdd={addStock} className="flex-1" />
        <button
          onClick={handleRefreshDatabase}
          disabled={refreshingDb || !dbConfig.connected || !dbConfig.enabled || allWatchlistSymbols.length === 0}
          className="text-muted hover:text-white p-2 transition-colors border border-accent rounded disabled:opacity-40"
          title="MongoDB mit yfinance-Daten aktualisieren"
        >
          <RefreshCw size={16} className={refreshingDb ? 'animate-spin' : ''} />
        </button>
        <button
          onClick={handleToggleOffline}
          disabled={!dbConfig.connected || !dbConfig.enabled}
          className={`p-2 transition-colors border border-accent rounded disabled:opacity-40 ${dbConfig.offline ? 'bg-accent text-white' : 'text-muted hover:text-white'}`}
          title={dbConfig.offline ? 'Offline-Modus aktiv: nur MongoDB' : 'Online-Modus: Cache + yfinance'}
        >
          <Power size={16} />
        </button>
        <button
          onClick={handleExport}
          className="text-muted hover:text-white p-2 transition-colors border border-accent rounded"
          title="Export CSV"
        >
          <Download size={16} />
        </button>
        {viewMode === 'table' && (
          <button
            onClick={() => window.print()}
            className="text-muted hover:text-white p-2 transition-colors border border-accent rounded no-print"
            title="Drucken (A4)"
          >
            <Printer size={16} />
          </button>
        )}
        <label className="text-muted hover:text-white p-2 transition-colors border border-accent rounded cursor-pointer" title="Import CSV">
          <Upload size={16} />
          <input type="file" accept=".csv" onChange={handleImport} className="hidden" />
        </label>
        <button
          onClick={() => setShowSettings(true)}
          className="text-muted hover:text-white p-2 transition-colors border border-accent rounded"
          title="Einstellungen"
        >
          <SettingsIcon size={16} />
        </button>
      </div>
      <div className="border border-accent rounded p-2 mb-4 text-xs-mono text-muted flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1 text-white"><Database size={13} /> MongoDB</span>
          <span className={dbConfig.connected ? 'text-pos' : 'text-neg'}>{dbConfig.connected ? 'verbunden' : 'nicht verbunden'}</span>
          <span>{dbConfig.enabled ? 'Cache aktiv' : 'Cache aus'}</span>
          <span className={dbConfig.offline ? 'text-accent' : 'text-muted'}>{dbConfig.offline ? 'OFFLINE: nur Datenbank' : 'ONLINE: yfinance erlaubt'}</span>
          <span>{cacheSummary.total_keys || 0} gespeicherte Cache-Einträge</span>
          {cacheSummary.total_keys ? (
            <span className={cacheSummary.stale_all ? 'text-yellow-400' : 'text-pos'}>
              zuletzt aktualisiert {formatCacheAge(cacheSummary.last_fetched_at)}
            </span>
          ) : null}
          {refreshingDb && (
            <span className="text-accent animate-pulse">
              {refreshProgress.done} von {refreshProgress.total} geladen{refreshProgress.current ? ` · ${refreshProgress.current}` : ''}
            </span>
          )}
          <button
            onClick={() => setCachePanelOpen(prev => !prev)}
            className="ml-auto border border-accent px-2 py-1 rounded text-muted hover:text-white transition-colors"
            title={cachePanelOpen ? 'MongoDB-Fenster minimieren' : 'MongoDB-Fenster anzeigen'}
          >
            {cachePanelOpen ? 'Minimieren' : 'Anzeigen'}
          </button>
        </div>
        {cachePanelOpen && allWatchlistSymbols.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {allWatchlistSymbols.map(symbol => {
              const item = cacheSummary.items?.[symbol];
              const types = item?.types || {};
              const typeText = Object.entries(types).map(([k, v]) => `${k}:${v}`).join(' · ');
              const age = formatCacheAge(item?.last_fetched_at);
              const isStale = !!(item?.last_fetched_at && (Date.now() / 1000 - item.last_fetched_at) > (dbConfig.ttl || 3600));
              return (
                <span key={symbol} className="border border-accent px-2 py-1 rounded">
                  <span className="text-white">{symbol}</span>{' '}
                  {item
                    ? <>{item.keys.length} Einträge ({typeText}) · <span className={isStale ? 'text-yellow-400' : 'text-pos'}>{age}</span></>
                    : <span className="text-neg">noch nicht gespeichert</span>}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {error && <p className="text-neg text-xs-mono mb-4">{error}</p>}
      {loading && <p className="text-muted text-xs-mono mb-4 animate-pulse">Verifying symbol...</p>}

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
              WATCHLIST EMPTY. ADD SYMBOLS ABOVE.
            </div>
          )}
          {sortedStocks.map(symbol => (
            <StockCard
              key={symbol}
              stock={stockData[symbol] || { symbol, price: '...', change: 0, change_percent: 0, currency: '...' }}
              history={historyData[symbol] || []}
              stats={statsData[symbol] || { performance: {} }}
              purchasePrice={purchasePrices[symbol] || 0}
              shareQuantity={shareQuantities[symbol] || 0}
              purchaseDate={purchaseDates[symbol] || ''}
              onUpdatePurchasePrice={updatePurchasePrice}
              onUpdateShareQuantity={updateShareQuantity}
              onUpdatePurchaseDate={updatePurchaseDate}
              onRemove={removeStock}
              onPeriodChange={(s, p, d) => fetchSpecificHistory(s, p, d)}
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
                      <button
                        onClick={() => restoreOldShare(entry)}
                        className="text-muted hover:text-pos transition-colors mr-2"
                        title="Reaktivieren"
                      >
                        <ArrowUp size={12} />
                      </button>
                      <button
                        onClick={() => deleteOldShare(entry.id)}
                        className="text-muted hover:text-neg transition-colors"
                        title="Endgültig löschen"
                      >
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
          dbConfig={dbConfig}
          onDbConfig={setDbConfig}
          API_BASE={API_BASE}
          fontScale={fontScale}
          onFontScaleChange={setFontScale}
        />
      )}

      {detailSymbol && (
        <StockDetail
          symbol={detailSymbol}
          stockData={stockData}
          historyData={historyData}
          statsData={statsData}
          purchasePrice={purchasePrices[detailSymbol] || 0}
          shareQuantity={shareQuantities[detailSymbol] || 0}
          purchaseDate={purchaseDates[detailSymbol] || ''}
          onUpdatePurchasePrice={updatePurchasePrice}
          onUpdateShareQuantity={updateShareQuantity}
          onUpdatePurchaseDate={updatePurchaseDate}
          onClose={() => setDetailSymbol(null)}
        />
      )}
    </div>
  );
};

export default App;
