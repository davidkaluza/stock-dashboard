import React, { useMemo, useState } from 'react';
import { LineChart, Line, ResponsiveContainer, YAxis, XAxis, Tooltip } from 'recharts';
import { Trash2, ArrowLeftRight } from 'lucide-react';
import { CHART_PERIODS, DEFAULT_PERIOD, SINCE_PURCHASE } from '../lib/history';
import { formatFetchedAt } from '../lib/market';

const DEFAULT_CHART_DOMAIN = { min: 0, max: 100 };
const CAGR_MIN_DAYS = 30;

const toNumber = (value, fallback = 0) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const formatNumber = (value, digits = 2) => {
  const num = Number(value);
  return Number.isFinite(num) ? num.toFixed(digits) : '—';
};

const formatPercent = (value, digits = 2) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return '—';
  return `${num > 0 ? '+' : ''}${num.toFixed(digits)}%`;
};

const parseNumericInput = (value) => (value === '' ? '' : Number(value));

const PerformanceBadge = ({ label, value }) => {
  const pct = value !== null && typeof value === 'object' ? value.pct : value;
  const abs = value !== null && typeof value === 'object' ? value.abs : null;
  const pctNumber = Number(pct);
  const hasPct = Number.isFinite(pctNumber);
  const isPctPositive = !hasPct || pctNumber >= 0;
  const absNumber = Number(abs);
  const hasAbs = Number.isFinite(absNumber);

  return (
    <div className="flex flex-col items-center justify-center border-r border-accent last:border-r-0 px-2">
      <span className="text-[0.72rem] text-muted uppercase">{label}</span>
      <span className={`text-xs-mono ${isPctPositive ? 'text-pos' : 'text-neg'}`}>
        {hasPct ? formatPercent(pctNumber) : '—'}
      </span>
      {hasAbs && (
        <span className={`text-[0.6rem] ${absNumber >= 0 ? 'text-pos' : 'text-neg'}`}>
          {absNumber >= 0 ? '+' : ''}{formatNumber(absNumber)}
        </span>
      )}
    </div>
  );
};

const StockCard = ({
  stock = {},
  history = [],
  stats = {},
  purchasePrice,
  shareQuantity,
  purchaseDate,
  onUpdatePurchasePrice,
  onUpdateShareQuantity,
  onUpdatePurchaseDate,
  onRemove,
  onPeriodChange,
  onShowDetail,
  onMoveCopy,
  accounts,
  activeAccountId,
}) => {
  const [period, setPeriod] = useState(DEFAULT_PERIOD);
  const statusText = stock.status === 'unknown'
    ? 'Ticker bei Yahoo unbekannt'
    : stock.status === 'pending' || stock.price === undefined
      ? 'wird geladen…'
      : formatFetchedAt(stock.fetched_at);

  const symbol = stock.symbol || '';
  const chartHistory = Array.isArray(history) ? history : [];
  const hasPrice = Number.isFinite(Number(stock.price)) && stock.price !== null && stock.price !== '';
  const currentPrice = toNumber(stock.price);
  const change = toNumber(stock.change);
  const changePercent = toNumber(stock.change_percent);
  const qty = toNumber(shareQuantity);
  const buyPrice = toNumber(purchasePrice);
  const performance = stats?.performance ?? {};

  const isPositive = change >= 0;
  const buyValue = buyPrice * qty;
  const currentValue = currentPrice * qty;
  const profitLoss = currentValue - buyValue;
  const hasProfit = profitLoss >= 0;
  const currentValueClass = hasProfit ? 'text-pos' : 'text-neg';

  const chartDomain = useMemo(() => {
    if (chartHistory.length === 0) return DEFAULT_CHART_DOMAIN;

    const prices = chartHistory
      .map((item) => Number(item?.price))
      .filter(Number.isFinite);

    if (prices.length === 0) return DEFAULT_CHART_DOMAIN;

    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const range = max - min || Math.abs(min) * 0.02 || 1;
    const padding = Math.max(range * 0.1, Math.abs(min) * 0.005, 0.01);

    return {
      min: min - padding,
      max: max + padding,
    };
  }, [chartHistory]);

  const periods = useMemo(() => [
    ...CHART_PERIODS,
    ...(purchaseDate ? [{ label: 'Seit Kauf', value: SINCE_PURCHASE }] : []),
  ], [purchaseDate]);

  const daysHeld = useMemo(() => {
    if (!purchaseDate) return null;

    const parsedPurchaseDate = new Date(purchaseDate);
    if (Number.isNaN(parsedPurchaseDate.getTime())) return null;

    return Math.max(
      0,
      Math.floor((Date.now() - parsedPurchaseDate.getTime()) / (1000 * 60 * 60 * 24)),
    );
  }, [purchaseDate]);

  const useCagr = buyPrice > 0 && daysHeld !== null && daysHeld >= CAGR_MIN_DAYS;
  const profitSincePurchase = hasPrice && buyPrice > 0
    ? useCagr
      ? (Math.pow(currentPrice / buyPrice, 365 / daysHeld) - 1) * 100
      : ((currentPrice - buyPrice) / buyPrice) * 100
    : null;
  const isProfitPct = profitSincePurchase !== null && profitSincePurchase >= 0;
  const plPct = hasPrice && buyPrice > 0 ? ((currentPrice - buyPrice) / buyPrice) * 100 : null;

  const handlePeriodChange = (value) => {
    setPeriod(value);
    onPeriodChange?.(symbol, value);
  };

  return (
    <div className="bg-surface border border-accent p-4 flex flex-col gap-4 hover:border-muted transition-colors">
      <div className="flex justify-between items-start">
        <div>
          <h3
            className="text-title-mono font-bold uppercase cursor-pointer hover:text-accent transition-colors"
            onClick={() => onShowDetail?.(symbol)}
          >
            {stock.name || 'N/A'} <span className="text-muted">({symbol || 'N/A'})</span>
          </h3>
          <p className="text-xs-mono text-muted">
            {stock.currency || '—'}
            {statusText && (
              <span className={stock.status === 'unknown' ? 'text-neg' : ''}> · {statusText}</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {accounts && accounts.length > 1 && (
            <button
              type="button"
              aria-label={`${symbol || 'Aktie'} verschieben`}
              onClick={(event) => {
                event.stopPropagation();
                onMoveCopy?.(symbol);
              }}
              className="text-muted hover:text-accent transition-colors"
            >
              <ArrowLeftRight size={12} />
            </button>
          )}
          <button
            type="button"
            aria-label={`${symbol || 'Aktie'} entfernen`}
            onClick={(event) => {
              event.stopPropagation();
              onRemove?.(symbol);
            }}
            className="text-muted hover:text-neg transition-colors"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      <div className="flex items-baseline gap-2">
        <span className="text-lg font-bold">{hasPrice ? formatNumber(currentPrice) : '—'}</span>
        {hasPrice && (
          <span className={`text-xs-mono ${isPositive ? 'text-pos' : 'text-neg'}`}>
            {formatNumber(change)} ({formatPercent(changePercent)})
          </span>
        )}
      </div>

      <div className="grid grid-cols-6 gap-0 border-y border-accent py-2">
        <PerformanceBadge label="Day" value={performance['1d']} />
        <PerformanceBadge label="Week" value={performance['1wk']} />
        <PerformanceBadge label="1M" value={performance['1mo']} />
        <PerformanceBadge label="6M" value={performance['6mo']} />
        <PerformanceBadge label="Year" value={performance['1y']} />
        <PerformanceBadge label="5Year" value={performance['5y']} />
      </div>

      <div className="flex gap-2">
        <div className="flex flex-col gap-1 flex-1">
          <span className="text-[0.72rem] text-muted uppercase">Qty</span>
          <input
            type="number"
            value={shareQuantity ?? ''}
            onChange={(event) => {
              event.stopPropagation();
              onUpdateShareQuantity?.(symbol, parseNumericInput(event.target.value));
            }}
            placeholder="0"
            className="bg-background border border-accent text-xs-mono p-1 focus:outline-none focus:border-muted transition-colors w-full"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
        <div className="flex flex-col gap-1 flex-1">
          <span className="text-[0.72rem] text-muted uppercase">Buy Price</span>
          <input
            type="number"
            value={purchasePrice ?? ''}
            onChange={(event) => {
              event.stopPropagation();
              onUpdatePurchasePrice?.(symbol, parseNumericInput(event.target.value));
            }}
            placeholder="0.00"
            className="bg-background border border-accent text-xs-mono p-1 focus:outline-none focus:border-muted transition-colors w-full"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
        <div className="flex flex-col gap-1 flex-1">
          <span className="text-[0.72rem] text-muted uppercase">Buy Date</span>
          <input
            type="date"
            value={purchaseDate || ''}
            onChange={(event) => {
              event.stopPropagation();
              onUpdatePurchaseDate?.(symbol, event.target.value);
            }}
            className="bg-background border border-accent text-xs-mono p-1 focus:outline-none focus:border-muted transition-colors w-full"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      </div>

      <div className="flex justify-between items-center text-xs-mono">
        <span className="text-muted">
          Buy: {formatNumber(buyValue)} /{' '}
          <span className={hasPrice ? currentValueClass : ''}>Curr: {hasPrice ? formatNumber(currentValue) : '—'}</span>{' '}
          <span className={currentValueClass}>({plPct !== null ? formatPercent(plPct) : '—'})</span>
        </span>
        <div className="text-right">
          {profitSincePurchase !== null && (
            <span className={`${isProfitPct ? 'text-pos' : 'text-neg'}`}>
              {formatPercent(profitSincePurchase)}{useCagr ? ' p.a.' : ''} ({hasProfit ? '+' : ''}{formatNumber(profitLoss)})
            </span>
          )}
          {daysHeld !== null && (
            <span className="text-muted block text-[0.72rem]">{daysHeld} Tage</span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex gap-1">
          {periods.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                handlePeriodChange(item.value);
              }}
              className={`text-[0.72rem] px-1 py-0.5 border border-accent transition-colors ${period === item.value ? 'bg-accent text-white' : 'text-muted hover:border-muted'}`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="h-32 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartHistory} key={`${symbol}-${period}-${purchaseDate || ''}-${chartHistory.length}`}>
              <XAxis
                dataKey="date"
                tick={{ fill: 'var(--clr-muted)', fontSize: '0.6rem' }}
                tickFormatter={(value) => (value ? String(value).slice(5) : '')}
                interval="preserveStartEnd"
                minTickGap={30}
              />
              <YAxis
                domain={[chartDomain.min, chartDomain.max]}
                orientation="left"
                tick={{ fill: 'var(--clr-muted)', fontSize: '0.6rem' }}
                tickFormatter={(value) => formatNumber(value)}
                width={45}
              />
              <Tooltip
                contentStyle={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--clr-accent)', fontSize: '0.72rem' }}
                labelStyle={{ color: 'var(--clr-muted)' }}
                formatter={(value) => [formatNumber(value), 'Price']}
                labelFormatter={(label) => label || ''}
              />
              <Line
                type="monotone"
                dataKey="price"
                stroke={isPositive ? 'var(--clr-pos)' : 'var(--clr-neg)'}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default StockCard;
