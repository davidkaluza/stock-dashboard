import React, { useEffect, useRef } from 'react';
import { Check, Download, Upload, LogOut, Bell, BellOff, Share, Minus, Plus, RotateCcw } from 'lucide-react';
import Sheet, { Group, Row } from './Sheet';
import { DEFAULT_CUSTOM_COLORS, SCHEMES, SYSTEM_FONT } from '../lib/theme';

const COLOR_FIELDS = [
  { key: 'background', label: 'Hintergrund' },
  { key: 'surface', label: 'Flächen' },
  { key: 'accent', label: 'Akzent' },
  { key: 'muted', label: 'Gedämpft / Linien' },
  { key: 'pos', label: 'Positiv' },
  { key: 'neg', label: 'Negativ' },
  { key: 'posLight', label: 'Positiv hell (vor Kauf)' },
  { key: 'negLight', label: 'Negativ hell (vor Kauf)' },
];

const FONTS = [
  { label: 'System (iPhone)', value: SYSTEM_FONT },
  { label: 'Inter', value: "'Inter', sans-serif" },
  { label: 'Roboto', value: "'Roboto', sans-serif" },
  { label: 'JetBrains Mono', value: "'JetBrains Mono', monospace" },
  { label: 'IBM Plex Mono', value: "'IBM Plex Mono', monospace" },
  { label: 'Space Grotesk', value: "'Space Grotesk', sans-serif" },
];

const REFRESH = [60, 300, 900, 1800];
const SCALE_TO_PX = (scale) => Math.round((scale * 16) / 100);
const PX_TO_SCALE = (px) => Math.max(80, Math.min(140, Math.round((px * 100) / 16)));

const item = 'w-full flex items-center gap-3 px-4 min-h-[44px] py-2 text-left active:bg-control md:hover:bg-control';

const PUSH_TEXT = {
  on: ['Aktiv – Meldungen kommen auf diesem Gerät an.', 'text-pos'],
  off: ['Aus. Die Regeln legst du pro Aktie über die Glocke im Detail fest.', 'text-muted'],
  denied: ['Im Browser bzw. in den iOS-Einstellungen für diese App blockiert.', 'text-neg'],
  unsupported: ['Dieser Browser unterstützt keine Web-Push-Nachrichten.', 'text-neg'],
  'not-configured': ['Push ist noch nicht eingerichtet (VITE_VAPID_PUBLIC_KEY fehlt).', 'text-neg'],
};

const Settings = ({
  colorScheme = 'system', onColorScheme, colors, onChange, onClose, initialSection,
  email, onSignOut, onExportBackup, onImportFile, lastBackupAt,
  pushState, pushBusy, pushError, onEnablePush, onDisablePush, onTestNotification, alertLog = [],
  fontScale = 100, onFontScaleChange, fontFamily = SYSTEM_FONT, onFontFamilyChange,
  refreshInterval = 300, onRefreshIntervalChange,
}) => {
  const pushRef = useRef(null);
  useEffect(() => {
    if (initialSection === 'push') requestAnimationFrame(() => pushRef.current?.scrollIntoView({ block: 'start' }));
  }, [initialSection]);

  const fontPx = SCALE_TO_PX(fontScale);
  const [pushText, pushClass] = PUSH_TEXT[pushState] || ['', ''];

  return (
    <Sheet title="Einstellungen" onClose={onClose}>
      {/* Konto & Sicherung */}
      <Group title="Konto">
        <Row label="Angemeldet" value={email || '—'} />
        <button onClick={onSignOut} className={`${item} text-neg`}><LogOut size={18} /> Abmelden</button>
      </Group>

      <Group title="Sicherung">
        <p className="px-4 py-3 text-sm text-muted">
          Depots, Kaufdaten, Einstellungen und Benachrichtigungsregeln. Damit überträgst du alles auf ein anderes Gerät.
          {lastBackupAt ? ` Letzte Sicherung: ${new Date(lastBackupAt).toLocaleDateString('de-DE')}.` : ' Noch keine Sicherung.'}
        </p>
        <button onClick={onExportBackup} className={`${item} text-accent`}><Download size={18} /> Sichern (JSON)</button>
        <label className={`${item} text-accent cursor-pointer`}>
          <Upload size={18} /> Wiederherstellen
          <input type="file" accept=".json,application/json" onChange={onImportFile} className="hidden" />
        </label>
      </Group>

      {/* Benachrichtigungen */}
      <div ref={pushRef} className="scroll-mt-4">
        <Group title="Benachrichtigungen">
          {pushState === 'needs-install' ? (
            <div className="px-4 py-3 text-sm space-y-1">
              <p className="text-accent">Auf dem iPhone/iPad funktionieren Benachrichtigungen nur in der installierten App (ab iOS 16.4):</p>
              <p className="text-muted">1. In Safari auf <Share size={13} className="inline -mt-0.5" /> <strong>Teilen</strong> tippen</p>
              <p className="text-muted">2. <strong>Zum Home-Bildschirm</strong> wählen</p>
              <p className="text-muted">3. Die App über das neue Symbol öffnen, anmelden und hier aktivieren</p>
            </div>
          ) : (
            <p className={`px-4 py-3 text-sm ${pushClass}`}>{pushText}</p>
          )}
          {pushState === 'off' && (
            <button onClick={onEnablePush} disabled={pushBusy} className={`${item} text-accent disabled:opacity-40`}>
              <Bell size={18} /> {pushBusy ? 'Aktiviere…' : 'Auf diesem Gerät aktivieren'}
            </button>
          )}
          {pushState === 'on' && (
            <>
              <button onClick={onTestNotification} className={`${item} text-accent`}><Bell size={18} /> Test-Anzeige</button>
              <button onClick={onDisablePush} disabled={pushBusy} className={`${item} text-neg disabled:opacity-40`}><BellOff size={18} /> Deaktivieren</button>
            </>
          )}
          {pushError && <p className="px-4 py-2 text-sm text-neg">{pushError}</p>}
        </Group>
        {pushState === 'on' && (
          <p className="text-xs text-muted px-1 -mt-3 mb-5">
            „Test-Anzeige“ prüft nur die Darstellung. Den echten Versand testest du auf GitHub: Actions → Kurse abrufen → Run workflow → test-push.
          </p>
        )}

        <Group title="Zuletzt gesendet">
          {alertLog.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted">Noch keine Meldungen.</p>
          ) : alertLog.map((entry) => (
            <div key={entry.id} className="px-4 py-2">
              <div className="flex justify-between gap-2 text-[0.95rem]">
                <span className="truncate">{entry.title}</span>
                <span className="text-muted text-sm whitespace-nowrap">
                  {new Date(entry.sent_at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              {entry.body && <div className="text-sm text-muted truncate">{entry.body}</div>}
            </div>
          ))}
        </Group>
      </div>

      {/* Darstellung */}
      <Group title="Farbschema">
        {SCHEMES.map((s) => (
          <button key={s.id} onClick={() => onColorScheme(s.id)} className={item}>
            <span className="flex-1">
              <span className="block">{s.label}</span>
              <span className="block text-sm text-muted">{s.hint}</span>
            </span>
            {colorScheme === s.id && <Check size={18} className="text-accent" />}
          </button>
        ))}
      </Group>

      {colorScheme === 'custom' && (
        <Group title="Eigene Farben">
          {COLOR_FIELDS.map((f) => (
            <label key={f.key} className="flex items-center justify-between gap-3 px-4 min-h-[44px]">
              <span className="text-[0.95rem]">{f.label}</span>
              <input
                type="color"
                value={colors[f.key] || DEFAULT_CUSTOM_COLORS[f.key]}
                onChange={(e) => onChange({ ...colors, [f.key]: e.target.value })}
                className="h-8 w-12 rounded-md bg-transparent border-0 cursor-pointer"
              />
            </label>
          ))}
          <button onClick={() => onChange({ ...DEFAULT_CUSTOM_COLORS })} className={`${item} text-accent`}><RotateCcw size={16} /> Zurücksetzen</button>
        </Group>
      )}

      <Group title="Schrift">
        <div className="flex items-center justify-between gap-3 px-4 min-h-[44px]">
          <span className="text-[0.95rem]">Größe</span>
          <div className="flex items-center gap-1">
            <button onClick={() => onFontScaleChange?.(PX_TO_SCALE(fontPx - 1))} className="h-9 w-9 rounded-lg bg-control flex items-center justify-center" aria-label="Kleiner"><Minus size={16} /></button>
            <span className="w-12 text-center">{fontPx} px</span>
            <button onClick={() => onFontScaleChange?.(PX_TO_SCALE(fontPx + 1))} className="h-9 w-9 rounded-lg bg-control flex items-center justify-center" aria-label="Größer"><Plus size={16} /></button>
          </div>
        </div>
        {FONTS.map((f) => (
          <button key={f.value} onClick={() => onFontFamilyChange?.(f.value)} className={item} style={{ fontFamily: f.value }}>
            <span className="flex-1">{f.label}</span>
            {fontFamily === f.value && <Check size={18} className="text-accent" />}
          </button>
        ))}
      </Group>

      <Group title="Aktualisierung">
        <p className="px-4 py-3 text-sm text-muted">
          Wie oft die App die neuesten Kurse aus der Datenbank lädt. Die Datenbank selbst wird Mo–Fr alle 30 Minuten aktualisiert.
        </p>
        <div className="flex gap-2 p-2">
          {REFRESH.map((v) => (
            <button
              key={v}
              onClick={() => onRefreshIntervalChange?.(v)}
              className={`flex-1 h-9 rounded-lg text-sm font-medium ${refreshInterval === v ? 'bg-accent text-accent-fg' : 'bg-control text-muted'}`}
            >
              {v < 3600 ? `${v / 60} min` : '1 h'}
            </button>
          ))}
        </div>
      </Group>
    </Sheet>
  );
};

export default Settings;
