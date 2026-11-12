import React, { useState } from 'react';
import { Check, Plus, Pencil, Trash2, ArrowUp, ArrowDown, List, Table, RefreshCw, Download, Upload, Printer, Settings as SettingsIcon, ArrowLeftRight, Copy } from 'lucide-react';
import Sheet, { Group } from './Sheet';
import AddStock from './AddStock';

const itemClass = 'w-full flex items-center gap-3 px-4 min-h-[48px] text-left active:bg-control md:hover:bg-control';
const inputClass = 'flex-1 min-w-0 bg-control rounded-lg px-3 h-11 focus:outline-none focus:ring-2 focus:ring-accent';

// ── Depot-Auswahl ──────────────────────────────────────────────

export const DepotSheet = ({ accounts, activeId, onSelect, onAdd, onRename, onDelete, onClose }) => {
  const active = accounts.find((a) => a.id === activeId);
  const [newName, setNewName] = useState('');
  const [rename, setRename] = useState(active?.name || '');
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <Sheet title="Depots" onClose={onClose}>
      <Group>
        {accounts.map((a) => (
          <button key={a.id} onClick={() => { onSelect(a.id); onClose(); }} className={itemClass}>
            <span className="flex-1 truncate">{a.name}</span>
            <span className="text-sm text-muted">{a.watchlist.length} Aktien</span>
            <span className="w-5">{a.id === activeId && <Check size={18} className="text-accent" />}</span>
          </button>
        ))}
      </Group>

      <Group title="Neues Depot">
        <form className="flex gap-2 p-2" onSubmit={(e) => { e.preventDefault(); if (newName.trim()) { onAdd(newName.trim()); onClose(); } }}>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Name" className={inputClass} />
          <button type="submit" disabled={!newName.trim()} className="h-11 px-4 rounded-lg bg-accent text-accent-fg font-medium disabled:opacity-40 flex items-center gap-1"><Plus size={16} /> Anlegen</button>
        </form>
      </Group>

      {active && (
        <Group title={`„${active.name}“`}>
          <form className="flex gap-2 p-2" onSubmit={(e) => { e.preventDefault(); if (rename.trim()) { onRename(rename.trim()); onClose(); } }}>
            <input value={rename} onChange={(e) => setRename(e.target.value)} className={inputClass} aria-label="Neuer Name" />
            <button type="submit" disabled={!rename.trim() || rename.trim() === active.name} className="h-11 px-4 rounded-lg bg-control text-accent font-medium disabled:opacity-40 flex items-center gap-1"><Pencil size={14} /> Umbenennen</button>
          </form>
          {accounts.length > 1 && (
            <button onClick={() => (confirmDelete ? (onDelete(), onClose()) : setConfirmDelete(true))} className={`${itemClass} ${confirmDelete ? 'text-white bg-neg' : 'text-neg'}`}>
              <Trash2 size={16} /> {confirmDelete ? `„${active.name}“ wirklich löschen?` : 'Depot löschen'}
            </button>
          )}
        </Group>
      )}
    </Sheet>
  );
};

// ── ⋯-Menü ─────────────────────────────────────────────────────

const SORTS = [
  { key: 'name', label: 'Name' },
  { key: 'price', label: 'Kurs' },
  { key: 'day', label: 'Tagesänderung' },
  { key: 'value', label: 'Wert' },
  { key: 'rendite', label: 'Rendite p. a.' },
  { key: 'days', label: 'Haltedauer' },
];

export const MenuSheet = ({ sortKey, sortDir, onSort, viewMode, onViewMode, onReload, loading, onExportCsv, onImportCsv, onPrint, onSettings, onClose }) => (
  <Sheet title="Menü" onClose={onClose}>
    <Group title="Sortieren">
      {SORTS.map((s) => (
        <button key={s.key} onClick={() => onSort(s.key)} className={itemClass}>
          <span className="flex-1">{s.label}</span>
          {sortKey === s.key && (sortDir === 'asc' ? <ArrowUp size={16} className="text-accent" /> : <ArrowDown size={16} className="text-accent" />)}
        </button>
      ))}
    </Group>
    <Group title="Ansicht">
      <button onClick={() => { onViewMode('list'); onClose(); }} className={itemClass}>
        <List size={18} className="text-accent" /><span className="flex-1">Liste</span>{viewMode === 'list' && <Check size={18} className="text-accent" />}
      </button>
      <button onClick={() => { onViewMode('table'); onClose(); }} className={itemClass}>
        <Table size={18} className="text-accent" /><span className="flex-1">Tabelle</span>{viewMode === 'table' && <Check size={18} className="text-accent" />}
      </button>
    </Group>
    <Group>
      <button onClick={() => { onReload(); onClose(); }} disabled={loading} className={`${itemClass} disabled:opacity-40`}>
        <RefreshCw size={18} className="text-accent" /> Kurse neu laden
      </button>
      <button onClick={() => { onExportCsv(); onClose(); }} className={itemClass}>
        <Download size={18} className="text-accent" /> CSV exportieren
      </button>
      <label className={`${itemClass} cursor-pointer`}>
        <Upload size={18} className="text-accent" /> CSV importieren
        <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { onImportCsv(e); onClose(); }} />
      </label>
      <button onClick={() => { onClose(); onPrint(); }} className={itemClass}>
        <Printer size={18} className="text-accent" /> Drucken (Tabelle, A4)
      </button>
    </Group>
    <Group>
      <button onClick={() => { onClose(); onSettings(); }} className={itemClass}>
        <SettingsIcon size={18} className="text-accent" /> Einstellungen
      </button>
    </Group>
  </Sheet>
);

// ── Suche ──────────────────────────────────────────────────────

export const SearchSheet = ({ onAdd, search, onClose }) => (
  <Sheet title="Aktie hinzufügen" subtitle="Name, WKN, ISIN oder Ticker" onClose={onClose}>
    <div className="min-h-[220px]">
      <AddStock onAdd={(s) => { onAdd(s); onClose(); }} search={search} autoFocus />
    </div>
  </Sheet>
);

// ── Verschieben / Kopieren ─────────────────────────────────────

export const MoveSheet = ({ symbol, accounts, activeId, onMove, onCopy, onClose }) => (
  <Sheet title={`${symbol} verschieben`} subtitle="In welches Depot?" onClose={onClose}>
    <Group>
      {accounts.filter((a) => a.id !== activeId).map((a) => (
        <div key={a.id} className="flex items-center gap-2 px-4 min-h-[56px]">
          <span className="flex-1 truncate">{a.name}</span>
          <button onClick={() => onMove(symbol, a.id)} className="h-9 px-3 rounded-lg bg-accent text-accent-fg text-sm font-medium flex items-center gap-1"><ArrowLeftRight size={14} /> Verschieben</button>
          <button onClick={() => onCopy(symbol, a.id)} className="h-9 px-3 rounded-lg bg-control text-accent text-sm font-medium flex items-center gap-1"><Copy size={14} /> Kopieren</button>
        </div>
      ))}
    </Group>
  </Sheet>
);
