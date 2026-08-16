import React, { useState, useMemo } from 'react';
import { Trash2, ArrowUp, ArrowDown } from 'lucide-react';

const COLUMNS = [
  { key: 'ticker', label: 'Ticker', align: 'text-left' },
  { key: 'name', label: 'Name', align: 'text-left' },
  { key: 'price', label: 'Preis', align: 'text-right' },
  { key: 'change', label: 'Änd.', align: 'text-right' },
  { key: '1d', label: '1D', align: 'text-right' },
  { key: '1wk', label: '1W', align: 'text-right' },
  { key: '1mo', label: '1M', align: 'text-right' },
  { key: '6mo', label: '6M', align: 'text-right' },
  { key: '1y', label: '1Y', align: 'text-right' },
  { key: '5y', label: '5Y', align: 'text-right' },
  { key: 'qty', label: 'Anzahl', align: 'text-center' },
  { key: 'buyPrice', label: 'Kaufkurs', align: 'text-center' },
  { key: 'buyDate', label: 'Datum', align: 'text-center' },
  { key: 'value', label: 'Wert', align: 'text-right' },
  { key: 'pl', label: 'G/V', align: 'text-right' },
  { key: 'plPct', label: 'G/V %', align: 'text-right' },
  { key: 'rendite', label: 'Rendite', align: 'text-right' },
];

const TableView = ({ stocks, stockData, statsData, purchasePrices, shareQuantities, purchaseDates, onUpdatePurchasePrice, onUpdateShareQuantity, onUpdatePurchaseDate, onRemove, onShowDetail }) => {
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc');

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sortedStocks = useMemo(() => {
    if (!sortKey) return stocks;
    return [...stocks].sort((a, b) => {
      const dataA = stockData[a];
      const dataB = stockData[b];
      const statsA = statsData[a]?.performance || {};
      const statsB = statsData[b]?.performance || {};
      const priceA = dataA?.price || 0;
      const priceB = dataB?.price || 0;
      const qtyA = shareQuantities[a] || 0;
      const qtyB = shareQuantities[b] || 0;
      const buyA = purchasePrices[a] || 0;
      const buyB = purchasePrices[b] || 0;

      let va, vb;
      switch (sortKey) {
        case 'ticker': va = a; vb = b; break;
        case 'name': va = dataA?.name || ''; vb = dataB?.name || ''; break;
        case 'price': va = priceA; vb = priceB; break;
        case 'change': va = dataA?.change || 0; vb = dataB?.change || 0; break;
        case '1d': va = statsA['1d']?.pct ?? 0; vb = statsB['1d']?.pct ?? 0; break;
        case '1wk': va = statsA['1wk']?.pct ?? 0; vb = statsB['1wk']?.pct ?? 0; break;
        case '1mo': va = statsA['1mo']?.pct ?? 0; vb = statsB['1mo']?.pct ?? 0; break;
        case '6mo': va = statsA['6mo']?.pct ?? 0; vb = statsB['6mo']?.pct ?? 0; break;
        case '1y': va = statsA['1y']?.pct ?? 0; vb = statsB['1y']?.pct ?? 0; break;
        case '5y': va = statsA['5y']?.pct ?? 0; vb = statsB['5y']?.pct ?? 0; break;
        case 'qty': va = qtyA; vb = qtyB; break;
        case 'buyPrice': va = buyA; vb = buyB; break;
        case 'buyDate': va = purchaseDates[a] || ''; vb = purchaseDates[b] || ''; break;
        case 'value': va = priceA * qtyA; vb = priceB * qtyB; break;
        case 'pl': {
          const plA = priceA * qtyA - buyA * qtyA;
          const plB = priceB * qtyB - buyB * qtyB;
          va = plA; vb = plB;
          break;
        }
        case 'plPct': {
          va = buyA > 0 ? (priceA - buyA) / buyA * 100 : 0;
          vb = buyB > 0 ? (priceB - buyB) / buyB * 100 : 0;
          break;
        }
        case 'rendite': {
          const daysA = purchaseDates[a] ? Math.floor((new Date() - new Date(purchaseDates[a])) / (1000 * 60 * 60 * 24)) : 0;
          const daysB = purchaseDates[b] ? Math.floor((new Date() - new Date(purchaseDates[b])) / (1000 * 60 * 60 * 24)) : 0;
          const hasDateA = purchaseDates[a] && buyA > 0 && daysA > 0;
          const hasDateB = purchaseDates[b] && buyB > 0 && daysB > 0;
          const rA = hasDateA ? (Math.pow(priceA / buyA, 365 / daysA) - 1) * 100 : (sortDir === 'asc' ? Infinity : -Infinity);
          const rB = hasDateB ? (Math.pow(priceB / buyB, 365 / daysB) - 1) * 100 : (sortDir === 'asc' ? Infinity : -Infinity);
          va = rA; vb = rB;
          break;
        }
        default: va = a; vb = b;
      }

      if (typeof va === 'string') {
        return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      return sortDir === 'asc' ? va - vb : vb - va;
    });
  }, [stocks, sortKey, sortDir, stockData, statsData, purchasePrices, shareQuantities, purchaseDates]);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-table-mono border-collapse">
        <thead>
          <tr className="border-b border-accent text-muted uppercase">
            {COLUMNS.map(col => (
              <th
                key={col.key}
                onClick={() => handleSort(col.key)}
                className={`${col.align} p-2 font-normal cursor-pointer hover:text-white transition-colors select-none`}
              >
                <span className="inline-flex items-center gap-1">
                  {col.label}
                  {sortKey === col.key && (
                    sortDir === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />
                  )}
                </span>
              </th>
            ))}
            <th className="w-8 p-2"></th>
          </tr>
        </thead>
        <tbody>
          {stocks.length === 0 && (
            <tr>
              <td colSpan={20} className="text-center p-10 text-muted border-b border-accent">
                WATCHLIST EMPTY. ADD SYMBOLS ABOVE.
              </td>
            </tr>
          )}
          {sortedStocks.map(symbol => {
            const data = stockData[symbol];
            const stats = statsData[symbol]?.performance || {};
            const price = data?.price || 0;
            const change = data?.change || 0;
            const changePct = data?.change_percent || 0;
            const isPositive = change >= 0;
            const qty = shareQuantities[symbol] || 0;
            const buyPrice = purchasePrices[symbol] || 0;
            const buyDate = purchaseDates[symbol] || '';
            const buyValue = buyPrice * qty;
            const currentValue = price * qty;
            const pl = currentValue - buyValue;
            const plPct = buyPrice > 0 ? ((price - buyPrice) / buyPrice) * 100 : 0;
            const daysHeld = buyDate ? Math.floor((new Date() - new Date(buyDate)) / (1000 * 60 * 60 * 24)) : 0;
            const cagr = buyDate && buyPrice > 0 && daysHeld > 0
              ? (Math.pow(price / buyPrice, 365 / daysHeld) - 1) * 100
              : 0;
            const showRendite = buyDate && buyPrice > 0;

            const normPerf = (v) => {
              if (v === null || v === undefined) return { pct: null, abs: null };
              if (typeof v === 'number') return { pct: v, abs: null };
              return { pct: v.pct ?? 0, abs: v.abs ?? null };
            };

            const formatPct = (v) => {
              const n = normPerf(v);
              if (n.pct === null) return '-';
              const pctStr = `${n.pct >= 0 ? '+' : ''}${n.pct.toFixed(2)}%`;
              if (n.abs !== null) {
                return `${pctStr} (${n.abs >= 0 ? '+' : ''}${n.abs.toFixed(2)})`;
              }
              return pctStr;
            };

            const pctClass = (v) => {
              const n = normPerf(v);
              if (n.pct === null) return 'text-muted';
              return n.pct >= 0 ? 'text-green-500' : 'text-red-500';
            };

            return (
              <tr key={symbol} className="border-b border-accent hover:bg-surface/50 transition-colors">
                <td className="p-2 font-bold">{symbol}</td>
                <td className="p-2 text-muted max-w-[200px] truncate cursor-pointer hover:text-accent transition-colors" onClick={() => onShowDetail(symbol)}>{data?.name || 'N/A'}</td>
                <td className="p-2 text-right font-bold">{typeof price === 'number' ? price.toFixed(2) : '...'}</td>
                <td className={`p-2 text-right ${pctClass(change)}`}>
                  {isPositive ? '+' : ''}{change.toFixed(2)} ({isPositive ? '+' : ''}{changePct.toFixed(2)}%)
                </td>
                <td className={`p-2 text-right ${pctClass(stats['1d'])}`}>{formatPct(stats['1d'])}</td>
                <td className={`p-2 text-right ${pctClass(stats['1wk'])}`}>{formatPct(stats['1wk'])}</td>
                <td className={`p-2 text-right ${pctClass(stats['1mo'])}`}>{formatPct(stats['1mo'])}</td>
                <td className={`p-2 text-right ${pctClass(stats['6mo'])}`}>{formatPct(stats['6mo'])}</td>
                <td className={`p-2 text-right ${pctClass(stats['1y'])}`}>{formatPct(stats['1y'])}</td>
                <td className={`p-2 text-right ${pctClass(stats['5y'])}`}>{formatPct(stats['5y'])}</td>
                <td className="p-2 text-center">
                  <input
                    type="number"
                    value={qty || ''}
                    onChange={(e) => onUpdateShareQuantity(symbol, e.target.value)}
                    placeholder="0"
                    className="bg-background border border-accent text-xs-mono p-1 w-16 text-center focus:outline-none focus:border-muted transition-colors"
                  />
                </td>
                <td className="p-2 text-center">
                  <input
                    type="number"
                    value={buyPrice || ''}
                    onChange={(e) => onUpdatePurchasePrice(symbol, e.target.value)}
                    placeholder="0.00"
                    className="bg-background border border-accent text-xs-mono p-1 w-20 text-center focus:outline-none focus:border-muted transition-colors"
                  />
                </td>
                <td className="p-2 text-center">
                  <input
                    type="date"
                    value={buyDate || ''}
                    onChange={(e) => onUpdatePurchaseDate(symbol, e.target.value)}
                    className="bg-background border border-accent text-xs-mono p-1 w-32 text-center focus:outline-none focus:border-muted transition-colors"
                  />
                </td>
                <td className={`p-2 text-right ${pl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {currentValue.toFixed(2)}
                </td>
                <td className={`p-2 text-right ${pl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {pl >= 0 ? '+' : ''}{pl.toFixed(2)}
                </td>
                <td className={`p-2 text-right ${plPct >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {plPct >= 0 ? '+' : ''}{plPct.toFixed(2)}%
                </td>
                <td className={`p-2 text-right ${showRendite ? (cagr >= 0 ? 'text-green-500' : 'text-red-500') : 'text-muted'}`}>
                  {showRendite ? `${cagr >= 0 ? '+' : ''}${cagr.toFixed(2)}% p.a.` : '-'}
                </td>
                <td className="p-2 text-center">
                  <button
                    onClick={() => onRemove(symbol)}
                    className="text-muted hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={12} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default TableView;
