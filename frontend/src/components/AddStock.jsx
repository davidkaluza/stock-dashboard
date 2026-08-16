import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import axios from 'axios';

const API_BASE = import.meta.env.DEV ? 'http://localhost:8001' : '';

const MIN_QUERY_LENGTH = 2;
const MAX_CANDIDATES = 8;

const sanitizeSymbol = (value) =>
  value
    .trim()
    .replace(/\s+/g, '')
    .replace(/[^A-Z0-9.-]/gi, '')
    .toUpperCase();

const AddStock = ({ onAdd, className = '' }) => {
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

    if (value.length < MIN_QUERY_LENGTH) {
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

      axios
        .get(`${API_BASE}/search`, {
          params: {
            q: value,
            limit: MAX_CANDIDATES,
          },
          signal: controller.signal,
        })
        .then((response) => {
          const results = Array.isArray(response.data) ? response.data : [];
          setCandidates(results.slice(0, MAX_CANDIDATES));
          setIsOpen(true);
          setActiveIndex(-1);
        })
        .catch((error) => {
          if (error.name === 'CanceledError' || error.code === 'ERR_CANCELED') return;

          console.error(error);
          setCandidates([]);
          setIsOpen(true);
          setSearchError('Suche nicht verfügbar.');
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setIsLoading(false);
          }
        });
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [query]);

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
          placeholder="ENTER COMPANY, WKN OR TICKER..."
          aria-label="Firma, WKN, ISIN oder Ticker eingeben"
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-controls="stock-search-results"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          className="bg-surface border border-accent text-xs-mono p-2 pr-8 flex-grow w-full focus:outline-none focus:border-muted transition-colors uppercase"
        />

        <Search
          size={14}
          aria-hidden="true"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted"
        />

        {isOpen && (
          <div
            id="stock-search-results"
            role="listbox"
            className="absolute z-50 mt-1 w-full bg-surface border border-accent shadow-lg max-h-72 overflow-y-auto"
          >
            {isLoading && (
              <div className="p-2 text-xs-mono text-muted">
                Suche läuft…
              </div>
            )}

            {!isLoading && searchError && (
              <div className="p-2 text-xs-mono text-neg">
                {searchError}
              </div>
            )}

            {!isLoading && !searchError && candidates.length === 0 && query.trim().length >= MIN_QUERY_LENGTH && (
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => addSymbol(cleanedSymbol)}
                className="w-full text-left p-2 text-xs-mono bg-background hover:bg-background transition-colors"
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
                  className={`w-full text-left p-2 text-xs-mono bg-background transition-colors ${
                    isActive ? 'bg-accent text-white' : 'hover:bg-accent/80 text-white'
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
        className="bg-accent hover:bg-muted text-white p-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Plus size={16} aria-hidden="true" />
      </button>
    </form>
  );
};

export default AddStock;
