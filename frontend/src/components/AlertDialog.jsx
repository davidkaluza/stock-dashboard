import React, { useMemo, useState } from 'react';
import { X, Bell, ShieldAlert } from 'lucide-react';
import { RULE_TYPES, REFERENCE_PRIVACY_HINT, defaultParams, validateParams } from '../lib/alerts';

const FIELDS = {
  day_change: [{ key: 'pct', label: 'Ab ± %', placeholder: '5' }],
  threshold: [
    { key: 'above', label: 'Über', placeholder: 'z. B. 200' },
    { key: 'below', label: 'Unter', placeholder: 'z. B. 180' },
  ],
  reference: [
    { key: 'price', label: 'Referenzkurs', placeholder: 'Kaufkurs' },
    { key: 'pct', label: '± %', placeholder: '10' },
  ],
  news: [],
};

const toInput = (v) => (v === null || v === undefined ? '' : String(v));

/**
 * Push-Regeln für eine Aktie bearbeiten.
 * rules: {type: {id, params, enabled}} der Aktie; onSave(list) bekommt [{symbol, type, params, enabled}] und ggf. zu löschende IDs.
 */
const AlertDialog = ({ symbol, name, price, purchasePrice, rules = {}, pushState, onSave, onClose, onOpenSettings }) => {
  const [draft, setDraft] = useState(() => Object.fromEntries(RULE_TYPES.map(({ type }) => {
    const existing = rules[type];
    const params = existing ? existing.params : defaultParams(type, { purchasePrice, price });
    return [type, {
      enabled: Boolean(existing?.enabled),
      values: Object.fromEntries(Object.entries(params || {}).map(([k, v]) => [k, toInput(v)])),
    }];
  })));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const errors = useMemo(() => Object.fromEntries(RULE_TYPES.map(({ type }) => {
    const d = draft[type];
    return [type, d.enabled ? validateParams(type, d.values).error : null];
  })), [draft]);

  const update = (type, patch) => setDraft((prev) => ({ ...prev, [type]: { ...prev[type], ...patch } }));
  const setValue = (type, key, value) => update(type, { values: { ...draft[type].values, [key]: value } });

  const save = async () => {
    if (Object.values(errors).some(Boolean)) {
      setMessage('Bitte die markierten Eingaben prüfen.');
      return;
    }
    const upserts = [];
    for (const { type } of RULE_TYPES) {
      const d = draft[type];
      const existing = rules[type];
      if (!d.enabled && !existing) continue; // nie angelegt und aus → nichts zu tun
      const checked = validateParams(type, d.values);
      // Ausgeschaltete Regeln bleiben mit ihren Werten erhalten (enabled: false); ungültige alte Werte werden übernommen
      const params = checked.params || existing?.params || {};
      upserts.push({ symbol, type, params, enabled: d.enabled });
    }
    setSaving(true);
    setMessage('');
    try {
      await onSave(upserts);
      onClose();
    } catch (e) {
      console.error(e);
      setMessage('Speichern fehlgeschlagen. Bitte später erneut versuchen.');
    } finally {
      setSaving(false);
    }
  };

  const input = 'w-full bg-background border border-accent text-xs-mono p-1.5 focus:outline-none focus:border-muted';

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-10 pb-10 bg-black/70 overflow-y-auto" onClick={onClose}>
      <div className="bg-surface border border-accent w-full max-w-[460px] mx-4 p-5 relative" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="flex justify-between items-start mb-3 gap-3">
          <div>
            <h2 className="text-title-mono font-bold uppercase flex items-center gap-2"><Bell size={16} /> Benachrichtigungen</h2>
            <p className="text-xs-mono text-muted">{name || symbol} ({symbol})</p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-white" aria-label="Schließen"><X size={18} /></button>
        </div>

        {pushState !== 'on' && (
          <button
            onClick={onOpenSettings}
            className="w-full text-left border border-accent p-2 mb-3 text-xs-mono text-accent flex gap-2 items-start hover:border-muted"
          >
            <ShieldAlert size={14} className="shrink-0 mt-0.5" />
            <span>Auf diesem Gerät sind Benachrichtigungen nicht aktiviert. Regeln werden trotzdem gespeichert. Aktivieren unter Einstellungen → Benachrichtigungen.</span>
          </button>
        )}

        <div className="space-y-2">
          {RULE_TYPES.map(({ type, label, hint }) => {
            const d = draft[type];
            return (
              <section key={type} className={`border p-3 ${d.enabled ? 'border-accent' : 'border-accent/40'}`}>
                <label className="flex items-center justify-between gap-3 cursor-pointer select-none">
                  <span>
                    <span className="text-xs-mono uppercase font-bold">{label}</span>
                    <span className="block text-[0.7rem] text-muted">{hint}</span>
                  </span>
                  <input type="checkbox" checked={d.enabled} onChange={(e) => update(type, { enabled: e.target.checked })} className="accent-[var(--clr-accent)] w-4 h-4 shrink-0" />
                </label>
                {d.enabled && FIELDS[type].length > 0 && (
                  <div className="flex gap-2 mt-2">
                    {FIELDS[type].map((f) => (
                      <label key={f.key} className="flex-1">
                        <span className="text-[0.7rem] text-muted uppercase">{f.label}</span>
                        <input
                          inputMode="decimal"
                          value={d.values[f.key] ?? ''}
                          placeholder={f.placeholder}
                          onChange={(e) => setValue(type, f.key, e.target.value)}
                          className={input}
                        />
                      </label>
                    ))}
                  </div>
                )}
                {d.enabled && type === 'reference' && <p className="text-[0.7rem] text-muted mt-2">{REFERENCE_PRIVACY_HINT}</p>}
                {errors[type] && <p className="text-[0.7rem] text-neg mt-1">{errors[type]}</p>}
              </section>
            );
          })}
        </div>

        {message && <p className="text-xs-mono text-neg mt-3">{message}</p>}
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="text-xs-mono text-muted hover:text-white px-3 py-1.5">Abbrechen</button>
          <button onClick={save} disabled={saving} className="text-xs-mono bg-accent text-white px-3 py-1.5 border border-accent disabled:opacity-40">
            {saving ? 'Speichere…' : 'Speichern'}
          </button>
        </div>
        <p className="text-[0.7rem] text-muted mt-3">Geprüft wird alle 30 Minuten zu Handelszeiten (Mo–Fr).</p>
      </div>
    </div>
  );
};

export default AlertDialog;
