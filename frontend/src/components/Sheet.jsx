import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

const CLOSE_DISTANCE = 90; // px nach unten ziehen zum Schließen

/**
 * Blatt von unten (iPhone) bzw. mittiger Dialog (ab 768 px).
 * Schließen: ✕, Tipp auf den Hintergrund, Escape oder am Griff/Kopf nach unten ziehen.
 */
const Sheet = ({ title, subtitle, onClose, children, footer, wide = false, headerRight }) => {
  const [dragY, setDragY] = useState(0);
  const startY = useRef(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const dragHandlers = {
    onTouchStart: (e) => { startY.current = e.touches[0].clientY; },
    onTouchMove: (e) => {
      if (startY.current === null) return;
      setDragY(Math.max(0, e.touches[0].clientY - startY.current));
    },
    onTouchEnd: () => {
      if (dragY > CLOSE_DISTANCE) onClose?.();
      startY.current = null;
      setDragY(0);
    },
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" role="presentation">
      <div className="absolute inset-0 bg-black/40 backdrop-enter" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`sheet-enter relative w-full ${wide ? 'md:max-w-[720px]' : 'md:max-w-[520px]'} sheet-max bg-sheet rounded-t-2xl md:rounded-2xl shadow-2xl flex flex-col`}
        style={dragY ? { transform: `translateY(${dragY}px)`, transition: 'none' } : undefined}
      >
        <div {...dragHandlers} className="shrink-0 touch-none select-none">
          <div className="md:hidden flex justify-center pt-2">
            <span className="h-1.5 w-10 rounded-full bg-line" />
          </div>
          <div className="flex items-start gap-3 px-4 pt-2 pb-2">
            <div className="min-w-0 flex-1 pt-1.5">
              {title && <h2 className="text-lg font-semibold leading-tight truncate">{title}</h2>}
              {subtitle && <p className="text-sm text-muted truncate">{subtitle}</p>}
            </div>
            {headerRight}
            <button
              type="button"
              onClick={onClose}
              aria-label="Schließen"
              className="shrink-0 h-11 w-11 -mr-2 flex items-center justify-center rounded-full text-muted hover:text-fg"
            >
              <span className="h-8 w-8 rounded-full bg-control flex items-center justify-center"><X size={16} /></span>
            </button>
          </div>
        </div>
        <div className="overflow-y-auto overscroll-contain px-4 pb-4 flex-1">{children}</div>
        {footer && <div className="shrink-0 border-t border-line px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div>}
        {!footer && <div className="shrink-0 pb-[env(safe-area-inset-bottom)]" />}
      </div>
    </div>
  );
};

/** Gruppierte Fläche im iOS-Stil (abgerundet, Zeilen mit Trennlinien) */
export const Group = ({ title, children, className = '' }) => (
  <section className={`mb-5 ${className}`}>
    {title && <h3 className="text-[0.8rem] uppercase tracking-wide text-muted px-1 mb-1.5">{title}</h3>}
    <div className="bg-group rounded-xl overflow-hidden divide-y divide-line">{children}</div>
  </section>
);

/** Zeile in einer Gruppe: Beschriftung links, Wert rechts */
export const Row = ({ label, value, valueClass = '', children }) => (
  <div className="flex items-center justify-between gap-3 px-4 min-h-[44px] py-2">
    <span className="text-[0.95rem]">{label}</span>
    {children ?? <span className={`text-[0.95rem] text-right ${valueClass || 'text-muted'}`}>{value ?? '—'}</span>}
  </div>
);

export default Sheet;
