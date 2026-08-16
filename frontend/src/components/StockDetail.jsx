import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { LineChart, Line, ResponsiveContainer, YAxis, XAxis, Tooltip } from 'recharts';
import { X, ExternalLink, GripVertical, Plus, Minus } from 'lucide-react';
import axios from 'axios';

const API_BASE = import.meta.env.DEV ? 'http://localhost:8001' : '';

const DEFAULT_SECTION_ORDER = ['performance', 'chart', 'purchase', 'kennzahlen', 'unternehmen', 'analysten'];

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const MIN_CAGR_DAYS = 30;

const toNumber = (value, fallback = 0) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const toNullableNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const formatNumber = (value, digits = 2) => {
  const num = toNullableNumber(value);
  return num === null ? '—' : num.toFixed(digits);
};

const formatSignedNumber = (value, digits = 2) => {
  const num = toNullableNumber(value);
  if (num === null) return '—';
  return `${num >= 0 ? '+' : ''}${num.toFixed(digits)}`;
};

const formatSignedPct = (value, digits = 2) => {
  const num = toNullableNumber(value);
  if (num === null) return '—';
  return `${num >= 0 ? '+' : ''}${num.toFixed(digits)}%`;
};

const formatLarge = (value) => {
  const num = toNullableNumber(value);
  if (num === null) return value ?? '—';

  const abs = Math.abs(num);
  if (abs >= 1e12) return `${(num / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(num / 1e3).toFixed(2)}K`;

  return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
};

const formatRatio = (value, digits = 2) => {
  const num = toNullableNumber(value);
  return num === null ? '—' : num.toFixed(digits);
};

const formatDecimalPct = (value) => {
  const num = toNullableNumber(value);
  return num === null ? '—' : `${(num * 100).toFixed(2)}%`;
};

const parseInputValue = (value) => (value === '' ? '' : value);

const getDaysHeld = (purchaseDate) => {
  if (!purchaseDate) return null;

  const start = new Date(purchaseDate);
  if (Number.isNaN(start.getTime())) return null;

  const days = Math.floor((Date.now() - start.getTime()) / MS_PER_DAY);
  return Number.isFinite(days) ? days : null;
};

const normalizePerformance = (value) => {
  if (value === null || value === undefined) return { pct: null, abs: null };

  if (typeof value === 'object') {
    return {
      pct: toNullableNumber(value.pct),
      abs: toNullableNumber(value.abs),
    };
  }

  return {
    pct: toNullableNumber(value),
    abs: null,
  };
};

const getPerformanceClass = (value) => {
  const { pct } = normalizePerformance(value);
  if (pct === null) return 'text-muted';
  return pct >= 0 ? 'text-pos' : 'text-neg';
};

const PerformanceBadge = ({ label, value }) => {
  const { pct, abs } = normalizePerformance(value);

  return (
    <div className="flex flex-col items-center justify-center border-r border-accent last:border-r-0 px-2">
      <span className="text-[0.72rem] text-muted uppercase">{label}</span>
      <span className={`text-xs-mono ${getPerformanceClass(value)}`}>
        {pct === null ? '—' : formatSignedPct(pct)}
      </span>
      {abs !== null && (
        <span className={`text-[0.6rem] ${abs >= 0 ? 'text-pos' : 'text-neg'}`}>
          {formatSignedNumber(abs)}
        </span>
      )}
    </div>
  );
};

const InfoRow = ({ label, value, cls }) => (
  <div className="flex justify-between gap-4 text-xs-mono py-1.5 border-b border-accent/30 last:border-b-0">
    <span className="text-muted">{label}</span>
    <span className={`text-right break-words ${cls || 'text-white'}`}>{value ?? '—'}</span>
  </div>
);

const StockDetail = ({
  symbol,
  stockData = {},
  historyData = {},
  statsData = {},
  purchasePrice,
  shareQuantity,
  purchaseDate,
  onUpdatePurchasePrice,
  onUpdateShareQuantity,
  onUpdatePurchaseDate,
  onClose,
}) => {
  const [detail, setDetail] = useState(null);
  const [detailError, setDetailError] = useState(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [period, setPeriod] = useState('1mo');
  const [chartHistory, setChartHistory] = useState([]);
  const [sectionOrder, setSectionOrder] = useState(DEFAULT_SECTION_ORDER);
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [dragId, setDragId] = useState(null);

  useEffect(() => {
    setChartHistory(Array.isArray(historyData?.[symbol]) ? historyData[symbol] : []);
  }, [symbol, historyData]);

  useEffect(() => {
    setPeriod('1mo');
    setDetail(null);
    setDetailError(null);
  }, [symbol]);

  useEffect(() => {
    if (!symbol) return undefined;

    const controller = new AbortController();

    setIsDetailLoading(true);
    setDetailError(null);

    axios
      .get(`${API_BASE}/detail/${encodeURIComponent(symbol)}`, { signal: controller.signal })
      .then((res) => {
        setDetail(res.data ?? null);
      })
      .catch((err) => {
        if (axios.isCancel?.(err) || err.name === 'CanceledError') return;
        console.error(err);
        setDetailError('Details konnten nicht geladen werden.');
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsDetailLoading(false);
        }
      });

    return () => controller.abort();
  }, [symbol]);

  const stock = stockData?.[symbol] ?? {};
  const stats = statsData?.[symbol]?.performance ?? {};

  const stockSymbol = stock.symbol || symbol || '—';
  const currentPrice = toNumber(stock.price);
  const priceDisplay = toNullableNumber(stock.price) === null ? '—' : formatNumber(stock.price);
  const change = toNumber(stock.change);
  const changePct = toNumber(stock.change_percent);
  const isPositive = change >= 0;

  const qty = toNumber(shareQuantity);
  const buyPrice = toNumber(purchasePrice);
  const buyValue = buyPrice * qty;
  const currentValue = currentPrice * qty;
  const profitLoss = currentValue - buyValue;
  const hasProfit = profitLoss >= 0;
  const plPct = buyPrice > 0 ? ((currentPrice - buyPrice) / buyPrice) * 100 : null;
  const currentValueClass = hasProfit ? 'text-pos' : 'text-neg';

  const daysHeld = getDaysHeld(purchaseDate);
  const canCalculatePurchasePerformance = buyPrice > 0 && currentPrice > 0;
  const useCagr = canCalculatePurchasePerformance && daysHeld !== null && daysHeld >= MIN_CAGR_DAYS;

  const profitSincePurchase = useCagr
    ? (Math.pow(currentPrice / buyPrice, 365 / daysHeld) - 1) * 100
    : canCalculatePurchasePerformance
      ? ((currentPrice - buyPrice) / buyPrice) * 100
      : null;

  const isProfitPct = profitSincePurchase !== null && profitSincePurchase >= 0;

  const chartDomain = useMemo(() => {
    if (!Array.isArray(chartHistory) || chartHistory.length === 0) return { min: 0, max: 100 };

    const prices = chartHistory
      .map((item) => toNullableNumber(item?.price))
      .filter((price) => price !== null);

    if (prices.length === 0) return { min: 0, max: 100 };

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
    { label: '1D', value: '1d' },
    { label: '1W', value: '5d' },
    { label: '1M', value: '1mo' },
    { label: '6M', value: '6mo' },
    { label: '1Y', value: '1y' },
    { label: '5Y', value: '5y' },
    ...(purchaseDate ? [{ label: 'Seit Kauf', value: 'since_purchase' }] : []),
  ], [purchaseDate]);

  const handlePeriodChange = useCallback((value) => {
    if (!symbol) return;

    setPeriod(value);

    const params = value === 'since_purchase' && purchaseDate
      ? `?start=${encodeURIComponent(purchaseDate)}`
      : `?period=${encodeURIComponent(value)}`;

    axios
      .get(`${API_BASE}/history/${encodeURIComponent(symbol)}${params}`)
      .then((res) => {
        const prices = Array.isArray(res.data?.prices) ? res.data.prices : [];
        const dates = Array.isArray(res.data?.dates) ? res.data.dates : [];

        setChartHistory(
          prices.map((price, index) => ({
            price,
            date: dates[index] ?? '',
          })),
        );
      })
      .catch((err) => {
        console.error(err);
      });
  }, [symbol, purchaseDate]);

  const toggleSection = useCallback((id) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleDragStart = useCallback((id) => {
    setDragId(id);
  }, []);

  const handleDragOver = useCallback((event, id) => {
    event.preventDefault();

    if (!dragId || dragId === id) return;

    setSectionOrder((prev) => {
      const oldIdx = prev.indexOf(dragId);
      const newIdx = prev.indexOf(id);

      if (oldIdx === -1 || newIdx === -1) return prev;

      const next = [...prev];
      next.splice(oldIdx, 1);
      next.splice(newIdx, 0, dragId);

      return next;
    });
  }, [dragId]);

  const handleDragEnd = useCallback(() => {
    setDragId(null);
  }, []);

  const renderSection = (id) => {
    switch (id) {
      case 'performance':
        return (
          <div className="grid grid-cols-6 gap-0 py-2">
            <PerformanceBadge label="Day" value={stats['1d']} />
            <PerformanceBadge label="Week" value={stats['1wk']} />
            <PerformanceBadge label="1M" value={stats['1mo']} />
            <PerformanceBadge label="6M" value={stats['6mo']} />
            <PerformanceBadge label="Year" value={stats['1y']} />
            <PerformanceBadge label="5Year" value={stats['5y']} />
          </div>
        );

      case 'purchase':
        return (
          <div className="space-y-2">
            <div className="flex gap-2">
              <label className="flex flex-col gap-1 flex-1">
                <span className="text-[0.72rem] text-muted uppercase">Qty</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  value={shareQuantity ?? ''}
                  onChange={(event) => onUpdateShareQuantity?.(symbol, parseInputValue(event.target.value))}
                  placeholder="0"
                  aria-label={`${stockSymbol} Anzahl`}
                  className="bg-background border border-accent text-xs-mono p-1 focus:outline-none focus:border-muted transition-colors w-full"
                  onClick={(event) => event.stopPropagation()}
                />
              </label>
              <label className="flex flex-col gap-1 flex-1">
                <span className="text-[0.72rem] text-muted uppercase">Buy Price</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  value={purchasePrice ?? ''}
                  onChange={(event) => onUpdatePurchasePrice?.(symbol, parseInputValue(event.target.value))}
                  placeholder="0.00"
                  aria-label={`${stockSymbol} Kaufkurs`}
                  className="bg-background border border-accent text-xs-mono p-1 focus:outline-none focus:border-muted transition-colors w-full"
                  onClick={(event) => event.stopPropagation()}
                />
              </label>
              <label className="flex flex-col gap-1 flex-1">
                <span className="text-[0.72rem] text-muted uppercase">Buy Date</span>
                <input
                  type="date"
                  value={purchaseDate ?? ''}
                  onChange={(event) => onUpdatePurchaseDate?.(symbol, event.target.value)}
                  aria-label={`${stockSymbol} Kaufdatum`}
                  className="bg-background border border-accent text-xs-mono p-1 focus:outline-none focus:border-muted transition-colors w-full"
                  onClick={(event) => event.stopPropagation()}
                />
              </label>
            </div>
            <div className="flex justify-between text-xs-mono pt-1">
              <span className="text-muted">Buy: {formatNumber(buyValue)}</span>
              <span className={currentValueClass}>
                Curr: {formatNumber(currentValue)} ({plPct === null ? '—' : formatSignedPct(plPct)})
              </span>
            </div>
            <div className="text-right text-xs-mono">
              {profitSincePurchase !== null && (
                <span className={isProfitPct ? 'text-pos' : 'text-neg'}>
                  {formatSignedPct(profitSincePurchase)}
                  {useCagr ? ' p.a.' : ''} ({formatSignedNumber(profitLoss)})
                </span>
              )}
              {daysHeld !== null && (
                <span className="text-muted block text-[0.72rem]">{daysHeld} Tage</span>
              )}
              {canCalculatePurchasePerformance && daysHeld !== null && daysHeld > 0 && daysHeld < MIN_CAGR_DAYS && (
                <span className="text-muted block text-[0.72rem]">Nicht annualisiert</span>
              )}
            </div>
          </div>
        );

      case 'kennzahlen':
        return (
          <div>
            <InfoRow label="Market Cap" value={formatLarge(detail?.marketCap)} />
            <InfoRow label="KGV (trailing)" value={formatRatio(detail?.peRatio)} />
            <InfoRow label="KGV (forward)" value={formatRatio(detail?.forwardPE)} />
            <InfoRow label="Dividendenrendite" value={formatDecimalPct(detail?.dividendYield)} />
            <InfoRow label="Dividende (absolut)" value={formatRatio(detail?.dividendRate)} />
            <InfoRow label="Beta" value={formatRatio(detail?.beta)} />
            <InfoRow label="52W Hoch" value={formatRatio(detail?.high52w)} />
            <InfoRow label="52W Tief" value={formatRatio(detail?.low52w)} />
            <InfoRow label="Volumen" value={formatLarge(detail?.volume)} />
            <InfoRow label="Ø Volumen" value={formatLarge(detail?.avgVolume)} />
          </div>
        );

      case 'unternehmen':
        return (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
              <div>
                <InfoRow label="Sektor" value={detail?.sector} />
                <InfoRow label="Branche" value={detail?.industry} />
                <InfoRow label="Land" value={detail?.country} />
                <InfoRow label="Mitarbeiter" value={formatLarge(detail?.employees)} />
              </div>
              <div>
                <InfoRow label="Börse" value={detail?.exchange} />
                <InfoRow label="Währung" value={detail?.currency} />
                {detail?.website && (
                  <div className="flex justify-between gap-4 text-xs-mono py-1.5 border-b border-accent/30">
                    <span className="text-muted">Website</span>
                    <a
                      href={detail.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent hover:text-white transition-colors inline-flex items-center gap-1 text-right break-all"
                    >
                      {String(detail.website).replace(/^https?:\/\//, '').split('/')[0]}
                      <ExternalLink size={10} aria-hidden="true" />
                    </a>
                  </div>
                )}
              </div>
            </div>
            {detail?.description && (
              <p className="text-xs-mono text-muted mt-2 leading-relaxed max-h-24 overflow-y-auto">
                {detail.description}
              </p>
            )}
          </>
        );

      case 'analysten':
        if (!detail?.analyst) return null;

        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
            <div>
              {detail.analyst.priceTargets && (
                <div className="mb-2">
                  <span className="text-[0.72rem] text-muted block mb-1">Kursziele</span>
                  <InfoRow label="Mittel" value={formatRatio(detail.analyst.priceTargets.mean)} />
                  <InfoRow label="Median" value={formatRatio(detail.analyst.priceTargets.median)} />
                  <InfoRow label="Hoch" value={formatRatio(detail.analyst.priceTargets.high)} cls="text-green-500" />
                  <InfoRow label="Tief" value={formatRatio(detail.analyst.priceTargets.low)} />
                  <InfoRow label="Aktuell" value={formatRatio(detail.analyst.priceTargets.current)} cls="text-muted" />
                </div>
              )}
              {detail.analyst.recommendations && (
                <div>
                  <span className="text-[0.72rem] text-muted block mb-1">Empfehlungen</span>
                  {toNumber(detail.analyst.recommendations.strongBuy) > 0 && (
                    <InfoRow label="Strong Buy" value={detail.analyst.recommendations.strongBuy} cls="text-green-500" />
                  )}
                  {toNumber(detail.analyst.recommendations.buy) > 0 && (
                    <InfoRow label="Buy" value={detail.analyst.recommendations.buy} cls="text-green-400" />
                  )}
                  {toNumber(detail.analyst.recommendations.hold) > 0 && (
                    <InfoRow label="Hold" value={detail.analyst.recommendations.hold} cls="text-yellow-500" />
                  )}
                  {toNumber(detail.analyst.recommendations.sell) > 0 && (
                    <InfoRow label="Sell" value={detail.analyst.recommendations.sell} cls="text-red-400" />
                  )}
                  {toNumber(detail.analyst.recommendations.strongSell) > 0 && (
                    <InfoRow label="Strong Sell" value={detail.analyst.recommendations.strongSell} cls="text-red-500" />
                  )}
                </div>
              )}
            </div>
            <div>
              {Array.isArray(detail.analyst.earningsEstimate) && detail.analyst.earningsEstimate.length > 0 && (
                <div className="mb-2">
                  <span className="text-[0.72rem] text-muted block mb-1">Gewinnschätzung (EPS)</span>
                  {detail.analyst.earningsEstimate.slice(0, 4).map((estimate, index) => (
                    <InfoRow
                      key={`${estimate.period || 'eps'}-${index}`}
                      label={estimate.period || '—'}
                      value={formatRatio(estimate.avg)}
                    />
                  ))}
                </div>
              )}
              {Array.isArray(detail.analyst.revenueEstimate) && detail.analyst.revenueEstimate.length > 0 && (
                <div className="mb-2">
                  <span className="text-[0.72rem] text-muted block mb-1">Umsatzschätzung</span>
                  {detail.analyst.revenueEstimate.slice(0, 4).map((estimate, index) => (
                    <InfoRow
                      key={`${estimate.period || 'revenue'}-${index}`}
                      label={estimate.period || '—'}
                      value={formatLarge(estimate.avg)}
                    />
                  ))}
                </div>
              )}
              {detail.analyst.growthEstimates && (
                <div>
                  <span className="text-[0.72rem] text-muted block mb-1">Wachstum</span>
                  {Object.entries(detail.analyst.growthEstimates).map(([key, value]) => (
                    <InfoRow key={key} label={key} value={value !== null && value !== undefined ? `${value}%` : '—'} />
                  ))}
                </div>
              )}
            </div>
          </div>
        );

      case 'chart':
        return (
          <>
            <div className="flex gap-1 mb-2">
              {periods.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => handlePeriodChange(item.value)}
                  aria-pressed={period === item.value}
                  className={`text-[0.72rem] px-1 py-0.5 border border-accent transition-colors ${
                    period === item.value ? 'bg-accent text-white' : 'text-muted hover:border-muted'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartHistory} key={`${symbol}-${period}-${purchaseDate}-${chartHistory.length}`}>
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
          </>
        );

      default:
        return null;
    }
  };

  const sectionTitles = {
    performance: 'Performance',
    purchase: 'Kaufdetails',
    kennzahlen: 'Kennzahlen',
    unternehmen: 'Unternehmen',
    analysten: 'Analysten & Schätzungen',
    chart: 'Chart',
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-10 pb-10 bg-black/70 overflow-y-auto"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="bg-surface border border-accent w-full max-w-[720px] mx-4 p-6 relative"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="stock-detail-title"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Detailansicht schließen"
          className="absolute top-3 right-3 text-muted hover:text-white transition-colors"
        >
          <X size={18} aria-hidden="true" />
        </button>

        <div className="flex justify-between items-start mb-4 gap-4">
          <div>
            <h2 id="stock-detail-title" className="text-title-mono font-bold uppercase">
              {stock.name || 'N/A'} <span className="text-muted">({stockSymbol})</span>
            </h2>
            <p className="text-xs-mono text-muted">{stock.currency || '—'} · {detail?.exchange || ''}</p>
            {isDetailLoading && <p className="text-[0.72rem] text-muted mt-1">Details werden geladen…</p>}
            {detailError && <p className="text-[0.72rem] text-neg mt-1">{detailError}</p>}
          </div>
          <div className="text-right">
            <div className="text-lg font-bold">{priceDisplay}</div>
            <div className={`text-xs-mono ${isPositive ? 'text-pos' : 'text-neg'}`}>
              {formatSignedNumber(change)} ({formatSignedPct(changePct)})
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {sectionOrder.map((id) => {
            if (id === 'analysten' && !detail?.analyst) return null;

            const isCollapsed = collapsed.has(id);

            return (
              <section
                key={id}
                className="border border-accent p-3"
                draggable
                onDragStart={() => handleDragStart(id)}
                onDragOver={(event) => handleDragOver(event, id)}
                onDragEnd={handleDragEnd}
                style={{
                  opacity: dragId === id ? 0.4 : 1,
                  cursor: dragId === id ? 'grabbing' : 'grab',
                }}
                aria-labelledby={`section-title-${id}`}
              >
                <div className="flex items-center justify-between mb-2 select-none">
                  <div className="flex items-center gap-2">
                    <GripVertical size={14} className="text-muted cursor-grab active:cursor-grabbing" aria-hidden="true" />
                    <h4 id={`section-title-${id}`} className="text-[0.72rem] text-muted uppercase">
                      {sectionTitles[id]}
                    </h4>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleSection(id)}
                    aria-expanded={!isCollapsed}
                    aria-label={`${sectionTitles[id]} ${isCollapsed ? 'einblenden' : 'ausblenden'}`}
                    className="text-muted hover:text-white transition-colors"
                  >
                    {isCollapsed ? <Plus size={14} aria-hidden="true" /> : <Minus size={14} aria-hidden="true" />}
                  </button>
                </div>
                {!isCollapsed && renderSection(id)}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default StockDetail;
