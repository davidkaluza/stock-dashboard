import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Trash2, ArrowLeftRight } from 'lucide-react';

const COLUMNS = [
  { key: 'ticker', label: 'Ticker', align: 'text-left' },
  { key: 'name', label: 'Name', align: 'text-left' },
  { key: 'price', label: 'Preis', align: 'text-right' },
  { key: 'change', label: 'Änd.', align: 'text-right' },
  { key: '1d', label: '1D', align: 'text-right' },
  { key: '1wk', label: '1W', align: 'text-right' },
  { key: '1mo', label: '1M', align: 'text-right' },
  { key: '2mo', label: '2M', align: 'text-right' },
  { key: '3mo', label: '3M', align: 'text-right' },
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

const EMPTY_OBJECT = Object.freeze({});
const MILLISECONDS_PER_DAY = 1000 * 60 * 60 * 24;
const MIN_DAYS_FOR_CAGR = 30;
const PERIOD_DAYS = {
  '1d': 1, '1wk': 7, '1mo': 30, '2mo': 61, '3mo': 91, '6mo': 183, '1y': 365, '5y': 1826,
};

const isPeriodPastPurchase = (periodKey, buyDate) => {
  const days = PERIOD_DAYS[periodKey];
  if (!days || !buyDate) return false;

  const purchaseTime = new Date(buyDate).getTime();
  if (!Number.isFinite(purchaseTime)) return false;

  const periodStart = Date.now() - days * MILLISECONDS_PER_DAY;
  return periodStart < purchaseTime;
};

const toFiniteNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const toOptionalFiniteNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const normalizePerformance = (value) => {
  if (value === null || value === undefined) return { pct: null, abs: null };

  if (typeof value === 'number' || typeof value === 'string') {
    return { pct: toOptionalFiniteNumber(value), abs: null };
  }

  return {
    pct: toOptionalFiniteNumber(value.pct),
    abs: toOptionalFiniteNumber(value.abs),
  };
};

const formatNumber = (value, digits = 2, fallback = '-') => {
  const number = toOptionalFiniteNumber(value);
  return number === null ? fallback : number.toFixed(digits);
};

const formatSignedNumber = (value, digits = 2, suffix = '') => {
  const number = toOptionalFiniteNumber(value);
  if (number === null) return '-';
  return `${number >= 0 ? '+' : ''}${number.toFixed(digits)}${suffix}`;
};

const formatPerformance = (value) => {
  const normalized = normalizePerformance(value);
  if (normalized.pct === null) return '-';

  const pct = formatSignedNumber(normalized.pct, 2, '%');
  if (normalized.abs === null) return pct;

  return `${pct} (${formatSignedNumber(normalized.abs)})`;
};

const performanceCellClass = (periodKey, value, buyDate) => {
  const normalized = normalizePerformance(value);
  if (normalized.pct === null) return 'text-muted';
  if (!isPeriodPastPurchase(periodKey, buyDate)) {
    return normalized.pct >= 0 ? 'text-pos' : 'text-neg';
  }
  return normalized.pct >= 0 ? 'text-pos-light' : 'text-neg-light';
};

const performanceCellTitle = (periodKey, buyDate) => {
  if (!isPeriodPastPurchase(periodKey, buyDate)) return undefined;
  return 'Zeitraum beginnt vor dem Kaufdatum — Wert nicht vollständig seit Kauf';
};

const valueClass = (value, fallback = 'text-muted') => {
  const number = toOptionalFiniteNumber(value);
  if (number === null) return fallback;
  return number >= 0 ? 'text-pos' : 'text-neg';
};

const getDaysHeld = (dateValue) => {
  if (!dateValue) return null;

  const purchaseTime = new Date(dateValue).getTime();
  if (!Number.isFinite(purchaseTime)) return null;

  const diff = Date.now() - purchaseTime;
  return diff >= 0 ? Math.floor(diff / MILLISECONDS_PER_DAY) : null;
};

const calculateCagr = ({ currentPrice, buyPrice, daysHeld }) => {
  if (buyPrice <= 0 || currentPrice <= 0 || daysHeld === null || daysHeld < MIN_DAYS_FOR_CAGR) {
    return null;
  }

  return (Math.pow(currentPrice / buyPrice, 365 / daysHeld) - 1) * 100;
};

const getSortMetric = ({ symbol, sortKey, stockData, statsData, purchasePrices, shareQuantities, purchaseDates, sortDir }) => {
  const data = stockData?.[symbol] ?? EMPTY_OBJECT;
  const stats = statsData?.[symbol]?.performance ?? EMPTY_OBJECT;
  const price = toFiniteNumber(data.price);
  const qty = toFiniteNumber(shareQuantities?.[symbol]);
  const buyPrice = toFiniteNumber(purchasePrices?.[symbol]);
  const buyDate = purchaseDates?.[symbol] || '';

  switch (sortKey) {
    case 'ticker':
      return symbol;
    case 'name':
      return data.name || '';
    case 'price':
      return price;
    case 'change':
      return toFiniteNumber(data.change);
    case '1d':
    case '1wk':
    case '1mo':
    case '2mo':
    case '3mo':
    case '6mo':
    case '1y':
    case '5y':
      return normalizePerformance(stats[sortKey]).pct ?? 0;
    case 'qty':
      return qty;
    case 'buyPrice':
      return buyPrice;
    case 'buyDate':
      return buyDate;
    case 'value':
      return price * qty;
    case 'pl':
      return price * qty - buyPrice * qty;
    case 'plPct':
      return buyPrice > 0 ? ((price - buyPrice) / buyPrice) * 100 : 0;
    case 'rendite': {
      const daysHeld = getDaysHeld(buyDate);
      const cagr = calculateCagr({ currentPrice: price, buyPrice, daysHeld });
      return cagr ?? (sortDir === 'asc' ? Infinity : -Infinity);
    }
    default:
      return symbol;
  }
};

const compareValues = (a, b, sortDir) => {
  if (typeof a === 'string' || typeof b === 'string') {
    const result = String(a).localeCompare(String(b), undefined, { sensitivity: 'base' });
    return sortDir === 'asc' ? result : -result;
  }

  const numericA = Number.isFinite(a) ? a : 0;
  const numericB = Number.isFinite(b) ? b : 0;
  return sortDir === 'asc' ? numericA - numericB : numericB - numericA;
};

const SortIcon = ({ active, direction }) => {
  if (!active) return null;
  return direction === 'asc' ? <ArrowUp size={10} aria-hidden="true" /> : <ArrowDown size={10} aria-hidden="true" />;
};

const TableView = ({
  stocks = [],
  stockData = EMPTY_OBJECT,
  statsData = EMPTY_OBJECT,
  purchasePrices = EMPTY_OBJECT,
  shareQuantities = EMPTY_OBJECT,
  purchaseDates = EMPTY_OBJECT,
  onUpdatePurchasePrice,
  onUpdateShareQuantity,
  onUpdatePurchaseDate,
  onRemove,
  onShowDetail,
  onMoveCopy,
  accounts,
  activeAccountId,
}) => {
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc');

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sortedStocks = useMemo(() => {
    if (!Array.isArray(stocks)) return [];
    if (!sortKey) return stocks;

    return [...stocks].sort((symbolA, symbolB) => {
      const valueA = getSortMetric({
        symbol: symbolA,
        sortKey,
        stockData,
        statsData,
        purchasePrices,
        shareQuantities,
        purchaseDates,
        sortDir,
      });
      const valueB = getSortMetric({
        symbol: symbolB,
        sortKey,
        stockData,
        statsData,
        purchasePrices,
        shareQuantities,
        purchaseDates,
        sortDir,
      });

      return compareValues(valueA, valueB, sortDir);
    });
  }, [stocks, sortKey, sortDir, stockData, statsData, purchasePrices, shareQuantities, purchaseDates]);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-table-mono border-collapse">
        <thead>
          <tr className="border-b border-accent text-muted uppercase">
            {COLUMNS.map((column) => {
              const isActive = sortKey === column.key;
              const ariaSort = isActive ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none';

              return (
                <th key={column.key} className={`${column.align} p-2 font-normal`} aria-sort={ariaSort}>
                  <button
                    type="button"
                    onClick={() => handleSort(column.key)}
                    className="inline-flex items-center gap-1 hover:text-white transition-colors select-none uppercase"
                  >
                    {column.label}
                    <SortIcon active={isActive} direction={sortDir} />
                  </button>
                </th>
              );
            })}
            <th className="w-8 p-2" aria-label="Aktionen" />
          </tr>
        </thead>
        <tbody>
          {sortedStocks.length === 0 && (
            <tr>
              <td colSpan={COLUMNS.length + 1} className="text-center p-10 text-muted border-b border-accent">
                WATCHLIST EMPTY. ADD SYMBOLS ABOVE.
              </td>
            </tr>
          )}

          {sortedStocks.map((symbol) => {
            const data = stockData?.[symbol] ?? EMPTY_OBJECT;
            const stats = statsData?.[symbol]?.performance ?? EMPTY_OBJECT;
            const price = toFiniteNumber(data.price);
            const change = toFiniteNumber(data.change);
            const changePct = toFiniteNumber(data.change_percent);
            const qty = toFiniteNumber(shareQuantities?.[symbol]);
            const buyPrice = toFiniteNumber(purchasePrices?.[symbol]);
            const buyDate = purchaseDates?.[symbol] || '';
            const buyValue = buyPrice * qty;
            const currentValue = price * qty;
            const pl = currentValue - buyValue;
            const plPct = buyPrice > 0 ? ((price - buyPrice) / buyPrice) * 100 : null;
            const daysHeld = getDaysHeld(buyDate);
            const cagr = calculateCagr({ currentPrice: price, buyPrice, daysHeld });
            const hasPurchase = buyDate && buyPrice > 0;
            const displayRendite = cagr !== null ? formatSignedNumber(cagr, 2, '% p.a.') : hasPurchase ? '< 30 Tage' : '-';

            return (
              <tr key={symbol} className="border-b border-accent hover:bg-surface/50 transition-colors">
                <td className="p-2 font-bold">{symbol}</td>
                <td className="p-2 text-muted max-w-[200px] truncate">
                  <button
                    type="button"
                    onClick={() => onShowDetail?.(symbol)}
                    className="hover:text-accent transition-colors text-left truncate max-w-full"
                    title={data.name || symbol}
                  >
                    {data.name || 'N/A'}
                  </button>
                </td>
                <td className="p-2 text-right font-bold">{formatNumber(price)}</td>
                <td className={`p-2 text-right ${valueClass(change)}`}>
                  {formatSignedNumber(change)} ({formatSignedNumber(changePct, 2, '%')})
                </td>
                <td className={`p-2 text-right ${performanceCellClass('1d', stats['1d'], buyDate)}`} title={performanceCellTitle('1d', buyDate)}>{formatPerformance(stats['1d'])}</td>
                <td className={`p-2 text-right ${performanceCellClass('1wk', stats['1wk'], buyDate)}`} title={performanceCellTitle('1wk', buyDate)}>{formatPerformance(stats['1wk'])}</td>
                <td className={`p-2 text-right ${performanceCellClass('1mo', stats['1mo'], buyDate)}`} title={performanceCellTitle('1mo', buyDate)}>{formatPerformance(stats['1mo'])}</td>
                <td className={`p-2 text-right ${performanceCellClass('2mo', stats['2mo'], buyDate)}`} title={performanceCellTitle('2mo', buyDate)}>{formatPerformance(stats['2mo'])}</td>
                <td className={`p-2 text-right ${performanceCellClass('3mo', stats['3mo'], buyDate)}`} title={performanceCellTitle('3mo', buyDate)}>{formatPerformance(stats['3mo'])}</td>
                <td className={`p-2 text-right ${performanceCellClass('6mo', stats['6mo'], buyDate)}`} title={performanceCellTitle('6mo', buyDate)}>{formatPerformance(stats['6mo'])}</td>
                <td className={`p-2 text-right ${performanceCellClass('1y', stats['1y'], buyDate)}`} title={performanceCellTitle('1y', buyDate)}>{formatPerformance(stats['1y'])}</td>
                <td className={`p-2 text-right ${performanceCellClass('5y', stats['5y'], buyDate)}`} title={performanceCellTitle('5y', buyDate)}>{formatPerformance(stats['5y'])}</td>
                <td className="p-2 text-center">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={shareQuantities?.[symbol] ?? ''}
                    onChange={(event) => onUpdateShareQuantity?.(symbol, event.target.value)}
                    placeholder="0"
                    aria-label={`Anzahl für ${symbol}`}
                    className="bg-background border border-accent text-xs-mono p-1 w-16 text-center focus:outline-none focus:border-muted transition-colors"
                  />
                </td>
                <td className="p-2 text-center">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={purchasePrices?.[symbol] ?? ''}
                    onChange={(event) => onUpdatePurchasePrice?.(symbol, event.target.value)}
                    placeholder="0.00"
                    aria-label={`Kaufkurs für ${symbol}`}
                    className="bg-background border border-accent text-xs-mono p-1 w-20 text-center focus:outline-none focus:border-muted transition-colors"
                  />
                </td>
                <td className="p-2 text-center">
                  <input
                    type="date"
                    value={buyDate}
                    onChange={(event) => onUpdatePurchaseDate?.(symbol, event.target.value)}
                    aria-label={`Kaufdatum für ${symbol}`}
                    className="bg-background border border-accent text-xs-mono p-1 w-32 text-center focus:outline-none focus:border-muted transition-colors"
                  />
                </td>
                <td className={`p-2 text-right ${valueClass(currentValue)}`}>{formatNumber(currentValue)}</td>
                <td className={`p-2 text-right ${valueClass(pl)}`}>{formatSignedNumber(pl)}</td>
                <td className={`p-2 text-right ${plPct === null ? 'text-muted' : valueClass(plPct)}`}>
                  {plPct === null ? '-' : formatSignedNumber(plPct, 2, '%')}
                </td>
                <td className={`p-2 text-right ${cagr === null ? 'text-muted' : valueClass(cagr)}`}>{displayRendite}</td>
                <td className="p-2 text-center whitespace-nowrap">
                  {accounts && accounts.length > 1 && (
                    <button
                      type="button"
                      onClick={() => onMoveCopy?.(symbol)}
                      aria-label={`${symbol} verschieben`}
                      className="text-muted hover:text-accent transition-colors mr-1"
                    >
                      <ArrowLeftRight size={12} aria-hidden="true" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onRemove?.(symbol)}
                    aria-label={`${symbol} entfernen`}
                    className="text-muted hover:text-neg transition-colors"
                  >
                    <Trash2 size={12} aria-hidden="true" />
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
