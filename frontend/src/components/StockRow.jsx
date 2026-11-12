import React, { useMemo } from 'react';
import { Bell } from 'lucide-react';
import { badgeContent, fmtNum } from '../lib/format';
import { filterHistory } from '../lib/history';

/** Mini-Chart (letzter Monat), Farbe nach Verlauf */
export const Sparkline = ({ rows, width = 64, height = 28 }) => {
  const path = useMemo(() => {
    const pts = (rows || []).map((r) => Number(r.price)).filter(Number.isFinite);
    if (pts.length < 2) return null;
    const min = Math.min(...pts);
    const max = Math.max(...pts);
    const span = max - min || 1;
    const step = width / (pts.length - 1);
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${(i * step).toFixed(1)},${(height - 2 - ((p - min) / span) * (height - 4)).toFixed(1)}`).join('');
    return { d, up: pts[pts.length - 1] >= pts[0] };
  }, [rows, width, height]);
  if (!path) return <span style={{ width, height }} className="inline-block" />;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" className="shrink-0">
      <path d={path.d} fill="none" stroke={path.up ? 'var(--clr-pos)' : 'var(--clr-neg)'} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
};

const BADGE_COLORS = { 1: 'bg-pos', '-1': 'bg-neg', 0: 'bg-control !text-muted' };

/**
 * Eine Aktie in der Liste. Tipp auf die Zeile → Detail-Blatt, Tipp auf das farbige Feld → Anzeige umschalten.
 */
const StockRow = ({ symbol, stock = {}, rows, qty, buyPrice, buyDate, badgeMode, onBadge, onOpen, hasAlerts }) => {
  const spark = useMemo(() => filterHistory(rows, '1mo'), [rows]);
  const badge = badgeContent(badgeMode, stock, { qty, buyPrice, buyDate });
  const pending = stock.status === 'pending' || stock.price === undefined;
  const unknown = stock.status === 'unknown';
  const sub = unknown ? 'Ticker unbekannt' : pending ? 'wird geladen…' : `${symbol}${qty ? ` · ${fmtNum(qty, qty % 1 ? 2 : 0)} Stk.` : ''}`;

  return (
    <li className="list-none">
      <div
        role="button"
        tabIndex={0}
        onClick={() => onOpen(symbol)}
        onKeyDown={(e) => { if (e.key === 'Enter') onOpen(symbol); }}
        className="flex items-center gap-3 px-4 min-h-[64px] py-2 cursor-pointer active:bg-control md:hover:bg-control transition-colors"
      >
        <div className="min-w-0 flex-1">
          <div className="font-semibold truncate leading-tight">{stock.name || symbol}</div>
          <div className={`text-sm truncate ${unknown ? 'text-neg' : 'text-muted'} flex items-center gap-1`}>
            {hasAlerts && <Bell size={11} className="text-accent shrink-0" fill="currentColor" aria-label="Benachrichtigungen aktiv" />}
            <span className="truncate">{sub}</span>
          </div>
        </div>
        <Sparkline rows={spark} />
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className="font-semibold leading-tight">{fmtNum(stock.price)}</span>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onBadge(); }}
            aria-label="Anzeige umschalten"
            className={`min-w-[5.25rem] h-7 px-2 rounded-md text-sm font-semibold text-white text-right ${BADGE_COLORS[badge.sign]}`}
          >
            {badge.text}
          </button>
        </div>
      </div>
    </li>
  );
};

export default StockRow;
