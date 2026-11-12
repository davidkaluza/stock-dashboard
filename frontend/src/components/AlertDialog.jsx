import React, { useMemo, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import Sheet from './Sheet';
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

/** iOS-Schalter */
export const Toggle = ({ checked, onChange, label }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    onClick={() => onChange(!checked)}
    className={`relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors ${checked ? 'bg-pos' : 'bg-control'}`}
  >
    <span className={`absolute top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow transition-all ${checked ? 'left-[22px]' : 'left-[2px]'}`} />
  </button>
);

/**
 * Push-Regeln für eine Aktie bearbeiten.
 * rules: {type: {id, params, enabled}} der Aktie; onSave bekommt [{symbol, type, params, enabled}].
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
      // Ausgeschaltete Regeln bleiben mit ihren Werten erhalten (enabled: false)
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

  const footer = (
    <div>
      {message && <p className="text-sm text-neg mb-2">{message}</p>}
      <button onClick={save} disabled={saving} className="w-full h-11 rounded-xl bg-accent text-accent-fg font-semibold disabled:opacity-40">
        {saving ? 'Speichere…' : 'Speichern'}
      </button>
    </div>
  );

  return (
    <Sheet title="Benachrichtigungen" subtitle={`${name || symbol} (${symbol})`} onClose={onClose} footer={footer}>
      {pushState !== 'on' && (
        <button onClick={onOpenSettings} className="w-full text-left bg-group rounded-xl p-3 mb-4 text-sm flex gap-2 items-start">
          <ShieldAlert size={18} className="shrink-0 text-accent" />
          <span>Auf diesem Gerät sind Benachrichtigungen nicht aktiviert. Regeln werden trotzdem gespeichert. <span className="text-accent">Jetzt aktivieren</span></span>
        </button>
      )}

      {RULE_TYPES.map(({ type, label, hint }) => {
        const d = draft[type];
        return (
          <section key={type} className="mb-4">
            <div className="bg-group rounded-xl overflow-hidden divide-y divide-line">
              <div className="flex items-center justify-between gap-3 px-4 min-h-[52px] py-2">
                <div className="min-w-0">
                  <div className="font-medium">{label}</div>
                </div>
                <Toggle checked={d.enabled} onChange={(v) => update(type, { enabled: v })} label={label} />
              </div>
              {d.enabled && FIELDS[type].map((f) => (
                <label key={f.key} className="flex items-center justify-between gap-3 px-4 min-h-[44px]">
                  <span className="text-[0.95rem]">{f.label}</span>
                  <input
                    inputMode="decimal"
                    value={d.values[f.key] ?? ''}
                    placeholder={f.placeholder}
                    onChange={(e) => setValue(type, f.key, e.target.value)}
                    className="w-32 text-right bg-transparent text-accent placeholder:text-muted focus:outline-none py-2"
                  />
                </label>
              ))}
            </div>
            <p className={`text-xs px-1 mt-1.5 ${errors[type] ? 'text-neg' : 'text-muted'}`}>
              {errors[type] || (d.enabled && type === 'reference' ? REFERENCE_PRIVACY_HINT : hint)}
            </p>
          </section>
        );
      })}
      <p className="text-xs text-muted px-1">Geprüft wird alle 30 Minuten zu Handelszeiten (Mo–Fr).</p>
    </Sheet>
  );
};

export default AlertDialog;
