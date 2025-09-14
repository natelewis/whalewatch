import React, { useState, useEffect } from 'react';
import { StockChart } from '../components/StockChart';
import { Search, X } from 'lucide-react';

export const AnalysisPage: React.FC = () => {
  const [selectedSymbol, setSelectedSymbol] = useState<string>('TSLA');
  const [symbolInput, setSymbolInput] = useState<string>('TSLA');
  const [isInputFocused, setIsInputFocused] = useState<boolean>(false);
  const [inputError, setInputError] = useState<string | null>(null);

  // Load saved symbol from localStorage on component mount
  useEffect(() => {
    const savedSymbol = localStorage.getItem('analysisPageSymbol');
    if (savedSymbol) {
      setSelectedSymbol(savedSymbol);
      setSymbolInput(savedSymbol);
    }
  }, []);

  // Save symbol to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('analysisPageSymbol', selectedSymbol);
  }, [selectedSymbol]);

  const handleSymbolChange = (symbol: string) => {
    setSelectedSymbol(symbol);
    setSymbolInput(symbol);
  };

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
      setSelectedSymbol(trimmedSymbol);
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Analysis</h1>
          <p className="text-muted-foreground">Analyze stock charts and market movements</p>
        </div>

        {/* Symbol Input */}
        <div className="flex flex-col items-end space-y-1">
          <form onSubmit={handleSymbolSubmit} className="flex items-center space-x-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                value={symbolInput}
                onChange={handleInputChange}
                onFocus={() => setIsInputFocused(true)}
                onBlur={() => setIsInputFocused(false)}
                placeholder="Enter ticker symbol"
                className={`pl-10 pr-8 py-2 border rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-colors ${
                  inputError
                    ? 'border-red-500 focus:ring-red-500'
                    : isInputFocused
                    ? 'border-primary'
                    : 'border-border'
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
      </div>

      {/* Main Content */}
      <div className="h-[calc(100vh-200px)]">
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-foreground">Chart Analysis</h2>
          <StockChart symbol={selectedSymbol} onSymbolChange={handleSymbolChange} />
        </div>
      </div>
    </div>
  );
};
