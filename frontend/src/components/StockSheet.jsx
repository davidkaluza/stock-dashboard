import React, { useEffect, useMemo, useState } from 'react';
import { LineChart, Line, ResponsiveContainer, YAxis, XAxis, Tooltip } from 'recharts';
import { Bell, ChevronRight, ExternalLink, ArrowLeftRight, Trash2 } from 'lucide-react';
import Sheet, { Group, Row } from './Sheet';
import { CHART_PERIODS, DEFAULT_PERIOD, SINCE_PURCHASE, filterHistory } from '../lib/history';
import { fetchDetails, fetchNews, formatFetchedAt } from '../lib/market';
import { fmtLarge, fmtMoney, fmtNum, fmtPct, fmtSigned, positionMetrics, signOf } from '../lib/format';

const PERF = [
  ['1d', '1 Tag'], ['1wk', '1 Woche'], ['1mo', '1 Monat'], ['3mo', '3 Monate'],
  ['6mo', '6 Monate'], ['1y', '1 Jahr'], ['5y', '5 Jahre'], ['2mo', '2 Monate'],
];

const signClass = (v) => (signOf(v) > 0 ? 'text-pos' : signOf(v) < 0 ? 'text-neg' : 'text-muted');
// yfinance liefert Dividendenrendite und Wachstum bereits in Prozent (z. B. 0.31 = 0,31 %)
const fmtPlainPct = (v) => (v !== null && v !== undefined && Number.isFinite(Number(v)) ? `${fmtNum(v)} %` : '—');

const NumberField = ({ label, value, onChange, type = 'number', step = 'any' }) => (
  <label className="flex items-center justify-between gap-3 px-4 min-h-[44px]">
    <span className="text-[0.95rem] shrink-0">{label}</span>
    <input
      type={type}
      inputMode={type === 'number' ? 'decimal' : undefined}
      step={step}
      min={type === 'number' ? '0' : undefined}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      className={`w-40 text-right bg-transparent text-accent focus:outline-none py-2 ${type === 'date' ? 'date-right' : ''}`}
    />
  </label>
);

const Collapsible = ({ title, children, defaultOpen = false }) => (
  <details className="mb-5 group" open={defaultOpen}>
    <summary className="list-none flex items-center justify-between px-1 mb-1.5 cursor-pointer select-none">
      <span className="text-[0.8rem] uppercase tracking-wide text-muted">{title}</span>
      <ChevronRight size={16} className="text-muted transition-transform group-open:rotate-90" />
    </summary>
    <div className="bg-group rounded-xl overflow-hidden divide-y divide-line">{children}</div>
  </details>
);

const StockSheet = ({
  symbol, client, stock = {}, stats = {}, dailyRows = [], onEnsureHistory,
  qty, buyPrice, buyDate, onUpdateQty, onUpdateBuyPrice, onUpdateBuyDate,
  alertCount = 0, onAlerts, canMove, onMoveCopy, onRemove, onClose,
}) => {
  const [period, setPeriod] = useState(DEFAULT_PERIOD);
  const [detail, setDetail] = useState(null);
  const [news, setNews] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(false);

  useEffect(() => {
    if (!symbol || !client) return undefined;
    let cancelled = false;
    setDetail(null);
    setNews([]);
    setLoadError('');
    Promise.all([fetchDetails(client, symbol), fetchNews(client, symbol)])
      .then(([d, n]) => {
        if (cancelled) return;
        setDetail(d);
        setNews(n);
      })
      .catch((e) => {
        if (!cancelled) {
          console.error(e);
          setLoadError('Details konnten nicht geladen werden.');
        }
      });
    return () => { cancelled = true; };
  }, [symbol, client]);

  const chartRows = useMemo(() => filterHistory(dailyRows, period, new Date(), buyDate), [dailyRows, period, buyDate]);
  const chartUp = chartRows.length > 1 ? chartRows[chartRows.length - 1].price >= chartRows[0].price : true;
  const domain = useMemo(() => {
    const prices = chartRows.map((r) => Number(r.price)).filter(Number.isFinite);
    if (!prices.length) return ['auto', 'auto'];
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const pad = Math.max((max - min) * 0.08, Math.abs(min) * 0.004, 0.01);
    return [min - pad, max + pad];
  }, [chartRows]);

  const periods = [...CHART_PERIODS, ...(buyDate ? [{ label: 'Kauf', value: SINCE_PURCHASE }] : [])];
  const choosePeriod = (value) => {
    setPeriod(value);
    onEnsureHistory?.(symbol, value);
  };

  const m = positionMetrics({ price: stock.price, qty, buyPrice, buyDate });
  const cur = stock.currency;
  const analyst = detail?.analyst || {};
  const pt = analyst.priceTargets || {};
  const rec = analyst.recommendations || {};

  const footer = (
    <div className="flex gap-2">
      {canMove && (
        <button onClick={() => onMoveCopy(symbol)} className="flex-1 h-11 rounded-xl bg-group text-accent font-medium flex items-center justify-center gap-2">
          <ArrowLeftRight size={16} /> Verschieben
        </button>
      )}
      <button
        onClick={() => (confirmRemove ? onRemove(symbol) : setConfirmRemove(true))}
        className={`flex-1 h-11 rounded-xl font-medium flex items-center justify-center gap-2 ${confirmRemove ? 'bg-neg text-white' : 'bg-group text-neg'}`}
      >
        <Trash2 size={16} /> {confirmRemove ? 'Wirklich entfernen?' : 'Entfernen'}
      </button>
    </div>
  );

  return (
    <Sheet title={stock.name || symbol} subtitle={[symbol, detail?.exchange || '', formatFetchedAt(stock.fetched_at)].filter(Boolean).join(' · ')} onClose={onClose} footer={footer} wide>
      {/* Kurs */}
      <div className="px-1 mb-3">
        <div className="text-3xl font-semibold">{fmtMoney(stock.price, cur)}</div>
        <div className={`text-[0.95rem] font-medium ${signClass(stock.change_percent)}`}>
          {fmtSigned(stock.change)} ({fmtPct(stock.change_percent)}) heute
        </div>
      </div>

      {/* Chart */}
      <div className="mb-5">
        <div className="flex gap-1 pb-2">
          {periods.map((p) => (
            <button
              key={p.value}
              onClick={() => choosePeriod(p.value)}
              className={`h-8 flex-1 min-w-0 px-0.5 rounded-lg text-[0.8rem] font-medium ${period === p.value ? 'bg-accent text-accent-fg' : 'bg-group text-muted'}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="h-52 w-full">
          {chartRows.length > 1 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartRows} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <XAxis dataKey="date" tick={{ fill: 'var(--clr-muted)', fontSize: 11 }} tickFormatter={(v) => (v ? `${v.slice(8, 10)}.${v.slice(5, 7)}.` : '')} minTickGap={40} axisLine={false} tickLine={false} />
                <YAxis domain={domain} orientation="right" tick={{ fill: 'var(--clr-muted)', fontSize: 11 }} tickFormatter={(v) => fmtNum(v, v >= 1000 ? 0 : 2)} width={52} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--clr-line)', borderRadius: 8, fontSize: 12, color: 'var(--clr-fg)' }}
                  labelStyle={{ color: 'var(--clr-muted)' }}
                  formatter={(v) => [fmtMoney(v, cur), 'Kurs']}
                  labelFormatter={(v) => (v ? new Date(v).toLocaleDateString('de-DE') : '')}
                />
                <Line type="monotone" dataKey="price" stroke={chartUp ? 'var(--clr-pos)' : 'var(--clr-neg)'} strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-muted">Noch keine Kursdaten</div>
          )}
        </div>
      </div>

      {/* Performance 4×2 */}
      <section className="mb-5">
        <h3 className="text-[0.8rem] uppercase tracking-wide text-muted px-1 mb-1.5">Performance</h3>
        <div className="grid grid-cols-4 gap-px bg-line rounded-xl overflow-hidden">
          {PERF.map(([key, label]) => {
            const v = stats[key];
            return (
              <div key={key} className="bg-group px-1 py-2 text-center">
                <div className="text-[0.7rem] text-muted">{label}</div>
                <div className={`text-sm font-semibold ${signClass(v?.pct)}`}>{v ? fmtPct(v.pct, 1) : '—'}</div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Position */}
      <Group title="Position">
        <NumberField label="Stück" value={qty} onChange={(v) => onUpdateQty(symbol, v)} />
        <NumberField label="Kaufkurs" value={buyPrice ?? ''} onChange={(v) => onUpdateBuyPrice(symbol, v)} />
        <NumberField label="Kaufdatum" type="date" value={buyDate || ''} onChange={(v) => onUpdateBuyDate(symbol, v)} />
        <Row label="Wert" value={fmtMoney(m.value, cur)} />
        <Row label="Einstand" value={fmtMoney(m.cost, cur)} />
        <Row label="Gewinn/Verlust" value={m.pl === null ? '—' : `${fmtSigned(m.pl)} (${fmtPct(m.plPct)})`} valueClass={signClass(m.pl)} />
        {m.cagr !== null && <Row label="Rendite p. a." value={fmtPct(m.cagr)} valueClass={signClass(m.cagr)} />}
        {m.days !== null && <Row label="Gehalten" value={`${fmtNum(m.days, 0)} Tage`} />}
      </Group>

      {/* Benachrichtigungen */}
      <Group>
        <button onClick={() => onAlerts(symbol)} className="w-full flex items-center justify-between gap-3 px-4 min-h-[44px] text-left">
          <span className="flex items-center gap-2"><Bell size={16} className="text-accent" /> Benachrichtigungen</span>
          <span className="flex items-center gap-1 text-muted">{alertCount ? `${alertCount} aktiv` : 'aus'} <ChevronRight size={16} /></span>
        </button>
      </Group>

      {loadError && <p className="text-sm text-neg mb-4 px-1">{loadError}</p>}

      {/* News */}
      <Collapsible title={`News${news.length ? ` (${news.length})` : ''}`} defaultOpen={news.length > 0}>
        {news.length === 0 ? (
          <div className="px-4 py-3 text-sm text-muted">Keine Meldungen.</div>
        ) : news.map((n) => (
          <a key={n.id} href={n.link || '#'} target="_blank" rel="noopener noreferrer" className="block px-4 py-2.5 active:bg-control">
            <div className="text-[0.95rem] leading-snug">{n.title} <ExternalLink size={11} className="inline text-muted" /></div>
            <div className="text-xs text-muted mt-0.5">
              {n.publisher || ''}{n.published_at ? ` · ${new Date(n.published_at).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}` : ''}
            </div>
          </a>
        ))}
      </Collapsible>

      {detail && (
        <>
          <Collapsible title="Kennzahlen">
            <Row label="Marktkapitalisierung" value={fmtLarge(detail.marketCap)} />
            <Row label="KGV" value={fmtNum(detail.peRatio)} />
            <Row label="KGV erwartet" value={fmtNum(detail.forwardPE)} />
            <Row label="Dividendenrendite" value={fmtPlainPct(detail.dividendYield)} />
            <Row label="Dividende" value={fmtMoney(detail.dividendRate, cur)} />
            <Row label="Beta" value={fmtNum(detail.beta)} />
            <Row label="52W Hoch / Tief" value={`${fmtNum(detail.high52w)} / ${fmtNum(detail.low52w)}`} />
            <Row label="Volumen / Ø" value={`${fmtLarge(detail.volume)} / ${fmtLarge(detail.avgVolume)}`} />
          </Collapsible>

          <Collapsible title="Unternehmen">
            <Row label="Sektor" value={detail.sector} />
            <Row label="Branche" value={detail.industry} />
            <Row label="Land" value={detail.country} />
            <Row label="Mitarbeiter" value={detail.employees ? fmtNum(detail.employees, 0) : '—'} />
            {detail.website && (
              <Row label="Website">
                <a href={detail.website} target="_blank" rel="noopener noreferrer" className="text-accent text-[0.95rem] truncate max-w-[60%]">
                  {String(detail.website).replace(/^https?:\/\//, '').split('/')[0]}
                </a>
              </Row>
            )}
            {detail.description && <p className="px-4 py-3 text-sm text-muted leading-relaxed">{detail.description}</p>}
          </Collapsible>

          {(pt.mean || rec.buy || analyst.earningsEstimate) && (
            <Collapsible title="Analysten">
              {pt.mean && <Row label="Kursziel Ø" value={fmtMoney(pt.mean, cur)} />}
              {pt.high && <Row label="Kursziel Hoch / Tief" value={`${fmtNum(pt.high)} / ${fmtNum(pt.low)}`} />}
              {['strongBuy', 'buy', 'hold', 'sell', 'strongSell'].some((k) => Number(rec[k]) > 0) && (
                <Row label="Empfehlungen" value={`Kauf ${(Number(rec.strongBuy) || 0) + (Number(rec.buy) || 0)} · Halten ${Number(rec.hold) || 0} · Verkauf ${(Number(rec.sell) || 0) + (Number(rec.strongSell) || 0)}`} />
              )}
              {(analyst.earningsEstimate || []).slice(0, 4).map((e) => (
                <Row key={`e-${e.period}`} label={`Gewinn/Aktie ${e.period}`} value={`Ø ${fmtNum(e.avg)}`} />
              ))}
              {(analyst.revenueEstimate || []).slice(0, 2).map((e) => (
                <Row key={`r-${e.period}`} label={`Umsatz ${e.period}`} value={`Ø ${fmtLarge(e.avg)}`} />
              ))}
              {Object.entries(analyst.growthEstimates || {}).slice(0, 4).map(([k, v]) => (
                <Row key={`g-${k}`} label={`Wachstum ${k}`} value={fmtPlainPct(v)} />
              ))}
            </Collapsible>
          )}
        </>
      )}
      {!detail && !loadError && <p className="text-sm text-muted px-1 mb-4">Fundamentaldaten werden nachts geladen.</p>}
    </Sheet>
  );
};

export default StockSheet;
