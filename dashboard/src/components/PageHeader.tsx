import React, { useState, useEffect } from 'react';
import { TickerSelector } from './TickerSelector';
import { getLocalStorageItem, setLocalStorageItem } from '../utils/localStorage';

interface PageHeaderProps {
  title: string;
  subtitle: string;
  selectedSymbol: string;
  onSymbolChange: (symbol: string) => void;
  showTickerSelector?: boolean;
  tickerSelectorPlaceholder?: string;
  className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  selectedSymbol,
  onSymbolChange,
  showTickerSelector = true,
  tickerSelectorPlaceholder = 'Enter ticker symbol',
  className = '',
}) => {
  const [localSymbol, setLocalSymbol] = useState<string>(selectedSymbol);

  // Load saved symbol from localStorage on component mount
  useEffect(() => {
    try {
      const savedSymbol = getLocalStorageItem('globalTickerSymbol', selectedSymbol);
      if (savedSymbol !== selectedSymbol) {
        setLocalSymbol(savedSymbol);
        onSymbolChange(savedSymbol);
      }
    } catch (error) {
      console.warn('Failed to load ticker symbol from localStorage:', error);
    }
  }, []);

  // Save symbol to localStorage whenever it changes
  useEffect(() => {
    try {
      setLocalStorageItem('globalTickerSymbol', selectedSymbol);
      setLocalSymbol(selectedSymbol);
    } catch (error) {
      console.warn('Failed to save ticker symbol to localStorage:', error);
    }
  }, [selectedSymbol]);

  const handleSymbolChange = (symbol: string) => {
    setLocalSymbol(symbol);
    onSymbolChange(symbol);
  };

  return (
    <div className={`flex items-center justify-between ${className}`}>
      <div>
        <h1 className="text-3xl font-bold text-foreground">{title}</h1>
        <p className="text-muted-foreground">{subtitle}</p>
      </div>

      {showTickerSelector && (
        <TickerSelector
          selectedSymbol={localSymbol}
          onSymbolChange={handleSymbolChange}
          placeholder={tickerSelectorPlaceholder}
        />
      )}
    </div>
  );
};
