import React, { useState } from 'react';
import { Plus } from 'lucide-react';

const AddStock = ({ onAdd, className = '' }) => {
  const [symbol, setSymbol] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (symbol.trim()) {
      onAdd(symbol.trim().toUpperCase());
      setSymbol('');
    }
  };

  return (
    <form onSubmit={handleSubmit} className={`flex gap-2 ${className}`}>
      <input 
        type="text" 
        value={symbol}
        onChange={(e) => setSymbol(e.target.value)}
        placeholder="ENTER WKN OR TICKER..."
        className="bg-surface border border-accent text-xs-mono p-2 flex-grow focus:outline-none focus:border-muted transition-colors uppercase"
      />
      <button 
        type="submit" 
        className="bg-accent hover:bg-muted text-white p-2 transition-colors"
      >
        <Plus size={16} />
      </button>
    </form>
  );
};

export default AddStock;
