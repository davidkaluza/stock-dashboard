import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Search } from 'lucide-react';

const MIN_QUERY_LENGTH = 2;
const MAX_CANDIDATES = 8;

const sanitizeSymbol = (value) =>
  value
    .trim()
    .replace(/\s+/g, '')
    .replace(/[^A-Z0-9.-]/gi, '')
    .toUpperCase();

// `search(query, signal)` liefert [{symbol, name, exchange, type}]; ohne `search` nur direkte Ticker-Eingabe.
const AddStock = ({ onAdd, search, className = '', autoFocus = false }) => {
  const [query, setQuery] = useState('');
  const [candidates, setCandidates] = useState([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [searchError, setSearchError] = useState('');

  const wrapperRef = useRef(null);

  const cleanedSymbol = useMemo(() => sanitizeSymbol(query), [query]);
  const canSubmit = cleanedSymbol.length > 0;

  useEffect(() => {
    const value = query.trim();

    if (value.length < MIN_QUERY_LENGTH || typeof search !== 'function') {
      setCandidates([]);
      setIsOpen(false);
      setActiveIndex(-1);
      setSearchError('');
      setIsLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      setIsLoading(true);
      setSearchError('');

      Promise.resolve(search(value, controller.signal))
        .then((data) => {
          if (controller.signal.aborted) return;
          const results = Array.isArray(data) ? data : [];
          setCandidates(results.slice(0, MAX_CANDIDATES));
          setIsOpen(true);
          setActiveIndex(-1);
        })
        .catch((error) => {
          if (controller.signal.aborted || error.name === 'AbortError') return;

          console.error(error);
          setCandidates([]);
          setIsOpen(true);
          setSearchError('Suche nicht verfügbar – Ticker direkt eingeben und mit + hinzufügen.');
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setIsLoading(false);
          }
        });
    }, 300);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [query, search]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!wrapperRef.current?.contains(event.target)) {
        setIsOpen(false);
        setActiveIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const resetSearch = () => {
    setQuery('');
    setCandidates([]);
    setActiveIndex(-1);
    setIsOpen(false);
    setSearchError('');
  };

  const addSymbol = (symbol) => {
    const cleaned = sanitizeSymbol(symbol);

    if (!cleaned || typeof onAdd !== 'function') return;

    onAdd(cleaned);
    resetSearch();
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    if (activeIndex >= 0 && candidates[activeIndex]?.symbol) {
      addSymbol(candidates[activeIndex].symbol);
      return;
    }

    if (canSubmit) {
      addSymbol(cleanedSymbol);
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      setIsOpen(false);
      setActiveIndex(-1);
      return;
    }

    if (!isOpen || candidates.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((prev) => (prev + 1) % candidates.length);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((prev) => (prev <= 0 ? candidates.length - 1 : prev - 1));
      return;
    }

    if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault();
      addSymbol(candidates[activeIndex].symbol);
    }
  };

  return (
    <form
      ref={wrapperRef}
      onSubmit={handleSubmit}
      className={`relative flex gap-2 ${className}`}
    >
      <div className="relative flex-grow">
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => {
            if (query.trim().length >= MIN_QUERY_LENGTH) {
              setIsOpen(true);
            }
          }}
          onKeyDown={handleKeyDown}
          placeholder={search ? 'Name, WKN, ISIN oder Ticker' : 'Ticker, z. B. SAP.DE'}
          aria-label="Firma, WKN, ISIN oder Ticker eingeben"
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-controls="stock-search-results"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoFocus={autoFocus}
          enterKeyHint="search"
          className="w-full h-11 rounded-xl bg-group px-3 pr-9 focus:outline-none focus:ring-2 focus:ring-accent"
        />

        <Search
          size={14}
          aria-hidden="true"
          className="absolute right-3 top-[22px] -translate-y-1/2 text-muted pointer-events-none"
        />

        {isOpen && (
          <div
            id="stock-search-results"
            role="listbox"
            className="mt-3 w-full bg-group rounded-xl overflow-hidden divide-y divide-line"
          >
            {isLoading && (
              <div className="px-4 py-3 text-sm text-muted">
                Suche läuft…
              </div>
            )}

            {!isLoading && searchError && (
              <div className="px-4 py-3 text-sm text-neg">
                {searchError}
              </div>
            )}

            {!isLoading && !searchError && candidates.length === 0 && query.trim().length >= MIN_QUERY_LENGTH && (
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => addSymbol(cleanedSymbol)}
                className="w-full text-left px-4 py-2.5 active:bg-control"
              >
                <div className="font-bold">{cleanedSymbol}</div>
                <div className="text-muted truncate">Direkt als Ticker hinzufügen</div>
              </button>
            )}

            {!isLoading && !searchError && candidates.map((item, index) => {
              const isActive = index === activeIndex;
              const symbol = item.symbol || '';
              const name = item.name || 'Unbekannt';
              const exchange = item.exchange || '';
              const type = item.type || '';

              return (
                <button
                  key={`${symbol}-${exchange || index}`}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => addSymbol(symbol)}
                  className={`w-full text-left px-4 py-2.5 transition-colors ${
                    isActive ? 'bg-accent text-accent-fg' : 'active:bg-control md:hover:bg-control'
                  }`}
                >
                  <div className="font-bold">
                    {symbol}
                    {exchange && (
                      <span className="text-muted font-normal"> · {exchange}</span>
                    )}
                    {type && (
                      <span className="text-muted font-normal"> · {type}</span>
                    )}
                  </div>
                  <div className="text-muted truncate">
                    {name}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <button
        type="submit"
        aria-label="Aktie hinzufügen"
        disabled={!canSubmit}
        className="h-11 w-11 shrink-0 rounded-xl bg-accent text-accent-fg flex items-center justify-center disabled:opacity-40"
      >
        <Plus size={16} aria-hidden="true" />
      </button>
    </form>
  );
};

export default AddStock;
