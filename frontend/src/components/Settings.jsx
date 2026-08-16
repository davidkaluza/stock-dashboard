import React, { useState } from 'react';
import { X, RotateCcw, Database, Plug, CheckCircle, Power } from 'lucide-react';

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

const Settings = ({ colors, onChange, onClose, dbConfig, onDbConfig, API_BASE, fontScale = 100, onFontScaleChange }) => {
  const [dbUri, setDbUri] = useState(dbConfig?.uri || '');
  const [dbTtl, setDbTtl] = useState(dbConfig?.ttl || 3600);
  const [dbEnabled, setDbEnabled] = useState(dbConfig?.enabled || false);
  const [dbOffline, setDbOffline] = useState(dbConfig?.offline || false);
  const [connecting, setConnecting] = useState(false);

  const handleChange = (key, val) => {
    onChange({ ...colors, [key]: val });
  };

  const handleDbConnect = async () => {
    setConnecting(true);
    try {
      const res = await fetch(`${API_BASE}/db/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uri: dbUri, ttl: dbTtl, enabled: dbEnabled, offline: dbOffline }),
      });
      const data = await res.json();
      onDbConfig({ uri: dbUri, ttl: dbTtl, enabled: data.enabled, offline: data.offline, connected: data.connected });
    } catch (e) {
      onDbConfig({ uri: dbUri, ttl: dbTtl, enabled: dbEnabled, offline: dbOffline, connected: false });
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/70" onClick={onClose}>
      <div className="bg-surface border border-accent w-full max-w-[400px] mx-4 p-6 relative" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-title-mono font-bold uppercase">Einstellungen</h2>
          <button onClick={onClose} className="text-muted hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* ── Farben ── */}
        <div className="space-y-3 mb-6">
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
          className="flex items-center gap-2 text-xs-mono text-muted hover:text-white border border-accent px-3 py-1.5 transition-colors mb-6"
        >
          <RotateCcw size={14} /> Standard
        </button>

        {/* ── Schriftgröße ── */}
        <div className="border-t border-accent pt-4 mb-6">
          <div className="border border-accent p-3 flex items-center justify-between">
            <div>
              <div className="text-xs-mono uppercase">Schriftgröße</div>
              <div className="text-[0.7rem] text-muted">Aktuell {fontScale}%</div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onFontScaleChange?.(Math.max(80, fontScale - 5))}
                className="w-8 h-8 border border-accent text-muted hover:text-white transition-colors"
                title="Schrift kleiner"
              >
                -
              </button>
              <button
                onClick={() => onFontScaleChange?.(100)}
                className="h-8 border border-accent px-2 text-[0.7rem] text-muted hover:text-white transition-colors"
                title="Schriftgröße zurücksetzen"
              >
                100%
              </button>
              <button
                onClick={() => onFontScaleChange?.(Math.min(140, fontScale + 5))}
                className="w-8 h-8 border border-accent text-muted hover:text-white transition-colors"
                title="Schrift größer"
              >
                +
              </button>
            </div>
          </div>
        </div>

        {/* ── Datenbank ── */}
        <div className="border-t border-accent pt-4">
          <div className="flex items-center gap-2 mb-3">
            <Database size={14} className="text-accent" />
            <h3 className="text-xs-mono font-bold uppercase">Datenbank (optional)</h3>
          </div>

          <div className="space-y-3">
            {/* Toggle Ein/Aus */}
            <div className="border border-accent p-3 flex items-center justify-between">
              <div>
                <div className="text-xs-mono uppercase">Cache</div>
                <div className="text-[0.7rem] text-muted">Datenbank-Caching ein-/ausschalten</div>
              </div>
              <button
                onClick={() => setDbEnabled(!dbEnabled)}
                className={`w-10 h-5 rounded-full transition-colors relative ${dbEnabled ? 'bg-accent' : 'bg-muted'}`}
              >
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${dbEnabled ? 'left-5' : 'left-0.5'}`} />
              </button>
            </div>

            <div className="border border-accent p-3 flex items-center justify-between">
              <div>
                <div className="text-xs-mono uppercase">Offline-Modus</div>
                <div className="text-[0.7rem] text-muted">Nur MongoDB lesen, keine yfinance-Zugriffe</div>
              </div>
              <button
                onClick={() => setDbOffline(!dbOffline)}
                className={`w-10 h-5 rounded-full transition-colors relative ${dbOffline ? 'bg-accent' : 'bg-muted'}`}
              >
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${dbOffline ? 'left-5' : 'left-0.5'}`} />
              </button>
            </div>

            <div className="border border-accent p-3">
              <div className="text-xs-mono uppercase mb-1">MongoDB URI</div>
              <div className="text-[0.7rem] text-muted mb-2">z. B. mongodb://10.0.0.176:27017/stock_dashboard_2</div>
              <input
                type="text"
                value={dbUri}
                onChange={(e) => setDbUri(e.target.value)}
                className="w-full bg-background border border-accent text-xs-mono p-1.5 focus:outline-none focus:border-muted transition-colors font-mono"
                placeholder="mongodb://host:27017/dbname"
              />
            </div>

            <div className="border border-accent p-3">
              <div className="text-xs-mono uppercase mb-1">Cache-TTL (Sekunden)</div>
              <input
                type="number"
                min={60}
                max={86400}
                value={dbTtl}
                onChange={(e) => setDbTtl(parseInt(e.target.value) || 3600)}
                className="w-full bg-background border border-accent text-xs-mono p-1.5 focus:outline-none focus:border-muted transition-colors font-mono"
              />
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleDbConnect}
                disabled={connecting || !dbUri}
                className="flex items-center gap-2 text-xs-mono text-muted hover:text-white border border-accent px-3 py-1.5 transition-colors disabled:opacity-40"
              >
                {connecting ? 'Verbinde...' : <><Plug size={14} /> Verbinden</>}
              </button>

              {dbConfig?.connected && dbConfig?.enabled && (
                <span className="flex items-center gap-1 text-xs-mono text-pos">
                  <CheckCircle size={12} /> {dbConfig?.offline ? 'Offline' : 'Aktiv'}
                </span>
              )}
              {dbConfig?.connected && !dbConfig?.enabled && (
                <span className="flex items-center gap-1 text-xs-mono text-muted">
                  <Power size={12} /> Aus
                </span>
              )}
              {dbConfig?.connected === false && dbUri && (
                <span className="text-xs-mono text-neg">Fehler</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
