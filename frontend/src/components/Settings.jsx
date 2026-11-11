import React, { useState } from 'react';
import { X, RotateCcw, Minus, Plus, Palette, Type, RefreshCw, User, LogOut, Download, Upload } from 'lucide-react';

const DEFAULTS = {
  background: '#33312B',
  surface: '#33312B',
  accent: '#C09537',
  muted: '#888888',
  pos: '#22c55e',
  neg: '#ef4444',
  posLight: '#86efac',
  negLight: '#fca5a5',
};

const FIELDS = [
  { key: 'background', label: 'Hintergrund', desc: 'Seitenhintergrund' },
  { key: 'surface', label: 'Karten', desc: 'Karten & Oberflächen' },
  { key: 'accent', label: 'Akzent', desc: 'Rahmen, Buttons, Hervorhebungen' },
  { key: 'muted', label: 'Muted', desc: 'deaktivierte Texte & Linien' },
  { key: 'pos', label: 'Positiv', desc: 'Gewinne & positive Werte' },
  { key: 'neg', label: 'Negativ', desc: 'Verluste & negative Werte' },
  { key: 'posLight', label: 'Positiv hell', desc: 'Zeitraum vor Kaufdatum (positiv)' },
  { key: 'negLight', label: 'Negativ hell', desc: 'Zeitraum vor Kaufdatum (negativ)' },
];

const NAV = [
  { id: 'account', label: 'Konto', icon: User },
  { id: 'colors', label: 'Farben', icon: Palette },
  { id: 'font', label: 'Schrift', icon: Type },
  { id: 'refresh', label: 'Aktualisierung', icon: RefreshCw },
];

const FONTS = [
  { label: 'JetBrains Mono', value: "'JetBrains Mono', monospace" },
  { label: 'IBM Plex Mono', value: "'IBM Plex Mono', monospace" },
  { label: 'Space Mono', value: "'Space Mono', monospace" },
  { label: 'Inter', value: "'Inter', sans-serif" },
  { label: 'Roboto', value: "'Roboto', sans-serif" },
  { label: 'Lato', value: "'Lato', sans-serif" },
  { label: 'Space Grotesk', value: "'Space Grotesk', sans-serif" },
  { label: 'Georgia (Serif)', value: "Georgia, serif" },
];

const FONT_SIZES = [12, 14, 16, 18, 20, 22];

const PX_TO_SCALE = (px) => Math.max(80, Math.min(140, Math.round((px * 100) / 16)));
const SCALE_TO_PX = (scale) => Math.round((scale * 16) / 100);

const Settings = ({ colors, onChange, onClose, email, onSignOut, onExportBackup, onImportFile, lastBackupAt, fontScale = 100, onFontScaleChange, fontFamily = "'JetBrains Mono', monospace", onFontFamilyChange, refreshInterval = 300, onRefreshIntervalChange }) => {
  const [collapsed, setCollapsed] = useState(() => new Set(['colors', 'font', 'refresh']));

  const fontSizePx = SCALE_TO_PX(fontScale);

  const handleChange = (key, val) => {
    onChange({ ...colors, [key]: val });
  };

  const toggleSection = (id) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const focusSection = (id) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    requestAnimationFrame(() => {
      document.getElementById(`settings-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const Section = ({ id, title, icon: Icon, children }) => {
    const isCollapsed = collapsed.has(id);
    return (
      <section id={`settings-${id}`} className="scroll-mt-20">
        <div
          className="flex items-center justify-between border border-accent p-3 cursor-pointer select-none"
          onClick={() => toggleSection(id)}
        >
          <div className="flex items-center gap-2">
            <Icon size={14} className="text-accent" />
            <h3 className="text-xs-mono font-bold uppercase">{title}</h3>
          </div>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); toggleSection(id); }}
            aria-expanded={!isCollapsed}
            aria-label={`${title} ${isCollapsed ? 'einblenden' : 'ausblenden'}`}
            className="text-muted hover:text-white transition-colors"
          >
            {isCollapsed ? <Plus size={14} aria-hidden="true" /> : <Minus size={14} aria-hidden="true" />}
          </button>
        </div>
        {!isCollapsed && <div className="mt-3">{children}</div>}
      </section>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/70" onClick={onClose}>
      <div className="bg-surface border border-accent w-full max-w-[480px] mx-4 relative max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* ── Fixierter Kopf: Titel + Leiste ── */}
        <div className="sticky top-0 z-20 bg-surface border-b border-accent px-6 pt-6 pb-3">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-title-mono font-bold uppercase">Einstellungen</h2>
            <button onClick={onClose} className="text-muted hover:text-white transition-colors">
              <X size={18} />
            </button>
          </div>

          <div className="flex border border-accent">
            {NAV.map(n => (
              <button
                key={n.id}
                onClick={() => focusSection(n.id)}
                className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2 text-[0.7rem] uppercase text-muted hover:text-white transition-colors border-r border-accent last:border-r-0"
                title={n.label}
              >
                <n.icon size={12} /> {n.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-6">
          {/* ── Konto & Sicherung ── */}
          <div className="mb-4">
            <Section id="account" title="Konto & Sicherung" icon={User}>
              <div className="space-y-3">
                <div className="border border-accent p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs-mono uppercase">Angemeldet</div>
                    <div className="text-[0.7rem] text-muted truncate">{email || '—'}</div>
                  </div>
                  <button
                    onClick={onSignOut}
                    className="flex items-center gap-2 text-xs-mono text-muted hover:text-white border border-accent px-3 py-1.5 transition-colors"
                  >
                    <LogOut size={14} /> Abmelden
                  </button>
                </div>

                <div className="border border-accent p-3">
                  <div className="text-xs-mono uppercase mb-1">Sicherung (JSON)</div>
                  <div className="text-[0.7rem] text-muted mb-2">
                    Depots, Kaufdaten und Einstellungen liegen nur auf diesem Gerät. Mit der Sicherung überträgst du sie auf ein
                    anderes Gerät oder stellst sie wieder her.
                    {lastBackupAt ? ` Letzte Sicherung: ${new Date(lastBackupAt).toLocaleDateString('de-DE')}.` : ' Noch keine Sicherung erstellt.'}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={onExportBackup}
                      className="flex-1 flex items-center justify-center gap-2 text-xs-mono text-muted hover:text-white border border-accent px-3 py-1.5 transition-colors"
                    >
                      <Download size={14} /> Sichern
                    </button>
                    <label className="flex-1 flex items-center justify-center gap-2 text-xs-mono text-muted hover:text-white border border-accent px-3 py-1.5 transition-colors cursor-pointer">
                      <Upload size={14} /> Wiederherstellen
                      <input type="file" accept=".json,application/json" onChange={onImportFile} className="hidden" />
                    </label>
                  </div>
                </div>
              </div>
            </Section>
          </div>

          {/* ── Farben ── */}
          <div className="border-t border-accent pt-4 mb-4">
            <Section id="colors" title="Farben" icon={Palette}>
              <div className="space-y-3">
                {FIELDS.map(f => (
                  <div key={f.key} className="flex items-center justify-between border border-accent p-3">
                    <div>
                      <div className="text-xs-mono uppercase">{f.label}</div>
                      <div className="text-[0.7rem] text-muted">{f.desc}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={colors[f.key] || DEFAULTS[f.key]}
                        onChange={(e) => handleChange(f.key, e.target.value)}
                        className="w-20 bg-background border border-accent text-xs-mono p-1 focus:outline-none focus:border-muted transition-colors uppercase font-mono"
                        placeholder="#000000"
                        maxLength={7}
                      />
                      <input
                        type="color"
                        value={colors[f.key] || DEFAULTS[f.key]}
                        onChange={(e) => handleChange(f.key, e.target.value)}
                        className="w-10 h-8 p-0 border-0 cursor-pointer bg-transparent"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={() => onChange({ ...DEFAULTS })}
                className="flex items-center gap-2 text-xs-mono text-muted hover:text-white border border-accent px-3 py-1.5 transition-colors mt-3"
              >
                <RotateCcw size={14} /> Standard
              </button>
            </Section>
          </div>

          {/* ── Schriftgröße + Schriftart ── */}
          <div className="border-t border-accent pt-4 mb-4">
            <Section id="font" title="Schrift" icon={Type}>
              <div className="border border-accent p-3 mb-3">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <div className="text-xs-mono uppercase">Größe</div>
                    <div className="text-[0.7rem] text-muted">Aktuell {fontSizePx}px</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onFontScaleChange?.(PX_TO_SCALE(fontSizePx - 1))}
                      className="w-8 h-8 border border-accent text-muted hover:text-white transition-colors"
                      title="Schrift kleiner"
                    >
                      -
                    </button>
                    <button
                      onClick={() => onFontScaleChange?.(100)}
                      className="h-8 border border-accent px-2 text-[0.7rem] text-muted hover:text-white transition-colors"
                      title="Auf Standardgröße setzen"
                    >
                      {SCALE_TO_PX(100)}px
                    </button>
                    <button
                      onClick={() => onFontScaleChange?.(PX_TO_SCALE(fontSizePx + 1))}
                      className="w-8 h-8 border border-accent text-muted hover:text-white transition-colors"
                      title="Schrift größer"
                    >
                      +
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {FONT_SIZES.map(px => (
                    <button
                      key={px}
                      onClick={() => onFontScaleChange?.(PX_TO_SCALE(px))}
                      className={`h-7 px-2 text-[0.7rem] border border-accent transition-colors ${fontSizePx === px ? 'text-white' : 'text-muted hover:text-white'}`}
                    >
                      {px}px
                    </button>
                  ))}
                </div>
              </div>

              <div className="border border-accent p-3">
                <div className="text-xs-mono uppercase mb-1">Schriftart</div>
                <div className="text-[0.7rem] text-muted mb-2">Wird auf die gesamte Oberfläche angewendet</div>
                <select
                  value={fontFamily}
                  onChange={(e) => onFontFamilyChange?.(e.target.value)}
                  className="w-full bg-background border border-accent text-xs-mono p-1.5 focus:outline-none focus:border-muted transition-colors"
                >
                  {FONTS.map(f => (
                    <option key={f.label} value={f.value} className="bg-background">{f.label}</option>
                  ))}
                </select>
              </div>
            </Section>
          </div>

          {/* ── Aktualisierung ── */}
          <div className="border-t border-accent pt-4">
            <Section id="refresh" title="Aktualisierung" icon={RefreshCw}>
              <div className="border border-accent p-3">
                <div className="text-xs-mono uppercase mb-1">Auto-Aktualisierung</div>
                <div className="text-[0.7rem] text-muted mb-2">Die App lädt alle {refreshInterval}s die neuesten Kurse aus der Datenbank. Die Datenbank selbst wird alle 30 min aktualisiert.</div>
                <input
                  type="number"
                  min={60}
                  max={3600}
                  step={30}
                  value={refreshInterval}
                  onChange={(e) => onRefreshIntervalChange?.(parseInt(e.target.value, 10) || 300)}
                  className="w-full bg-background border border-accent text-xs-mono p-1.5 focus:outline-none focus:border-muted transition-colors font-mono"
                />
                <div className="flex gap-2 mt-2">
                  {[60, 300, 900, 1800].map(v => (
                    <button
                      key={v}
                      onClick={() => onRefreshIntervalChange?.(v)}
                      className={`h-7 px-2 text-[0.7rem] border border-accent transition-colors ${refreshInterval === v ? 'text-white' : 'text-muted hover:text-white'}`}
                      title={`Alle ${v / 60}m`}
                    >
                      {v < 60 ? `${v}s` : `${v / 60}m`}
                    </button>
                  ))}
                </div>
              </div>
            </Section>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;