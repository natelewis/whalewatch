import React, { useState, useEffect } from 'react';
import { Search, X } from 'lucide-react';

interface TickerSelectorProps {
  selectedSymbol: string;
  onSymbolChange: (symbol: string) => void;
  placeholder?: string;
  className?: string;
  showLabel?: boolean;
  label?: string;
}

export const TickerSelector: React.FC<TickerSelectorProps> = ({
  selectedSymbol,
  onSymbolChange,
  placeholder = 'Enter ticker symbol',
  className = '',
  showLabel = false,
  label = 'Ticker Symbol',
}) => {
  const [symbolInput, setSymbolInput] = useState<string>(selectedSymbol);
  const [isInputFocused, setIsInputFocused] = useState<boolean>(false);
  const [inputError, setInputError] = useState<string | null>(null);

  // Sync input with selectedSymbol prop
  useEffect(() => {
    setSymbolInput(selectedSymbol);
  }, [selectedSymbol]);

  const validateSymbol = (symbol: string): boolean => {
    // Basic validation: 1-5 characters, letters only
    const symbolRegex = /^[A-Z]{1,5}$/;
    return symbolRegex.test(symbol);
  };

  const handleSymbolSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedSymbol = symbolInput.trim().toUpperCase();

    if (!trimmedSymbol) {
      setInputError('Please enter a ticker symbol');
      return;
    }

    if (!validateSymbol(trimmedSymbol)) {
      setInputError('Invalid ticker symbol (1-5 letters only)');
      return;
    }

    setInputError(null);
    if (trimmedSymbol !== selectedSymbol) {
      onSymbolChange(trimmedSymbol);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toUpperCase();
    setSymbolInput(value);

    // Clear error when user starts typing
    if (inputError) {
      setInputError(null);
    }

    // Real-time validation feedback
    if (value && !validateSymbol(value)) {
      setInputError('Invalid format (1-5 letters only)');
    }
  };

  const clearInput = () => {
    setSymbolInput('');
    setIsInputFocused(true);
  };

  return (
    <div className={`flex flex-col space-y-1 ${className}`}>
      {showLabel && <label className="text-sm font-medium text-foreground">{label}</label>}
      <form onSubmit={handleSymbolSubmit} className="flex items-center space-x-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={symbolInput}
            onChange={handleInputChange}
            onFocus={() => setIsInputFocused(true)}
            onBlur={() => setIsInputFocused(false)}
            placeholder={placeholder}
            className={`pl-10 pr-8 py-2 border rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-colors ${
              inputError ? 'border-red-500 focus:ring-red-500' : isInputFocused ? 'border-primary' : 'border-border'
            }`}
            maxLength={5}
          />
          {symbolInput && (
            <button
              type="button"
              onClick={clearInput}
              className="absolute right-2 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <button
          type="submit"
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={!!inputError}
        >
          Analyze
        </button>
      </form>
      {inputError && <p className="text-sm text-red-500">{inputError}</p>}
    </div>
  );
};
