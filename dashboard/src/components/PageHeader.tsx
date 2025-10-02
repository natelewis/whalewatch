import React, { useState, useEffect } from 'react';
import { TickerSelector } from './TickerSelector';
import { getLocalStorageItem, setLocalStorageItem } from '../utils/localStorage';
import { safeCall, createUserFriendlyMessage } from '@whalewatch/shared';

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
    const result = safeCall(() => {
      return getLocalStorageItem('globalTickerSymbol', '');
    });

    if (result.isOk()) {
      const savedSymbol = result.value;
      // Only use saved symbol if it's not empty and different from current
      if (savedSymbol && savedSymbol !== selectedSymbol) {
        setLocalSymbol(savedSymbol);
        onSymbolChange(savedSymbol);
      }
    } else {
      console.warn('Failed to load ticker symbol from localStorage:', createUserFriendlyMessage(result.error));
    }
  }, []);

  // Save symbol to localStorage whenever it changes
  useEffect(() => {
    // Only save non-empty symbols to localStorage
    if (selectedSymbol.trim()) {
      const result = safeCall(() => {
        setLocalStorageItem('globalTickerSymbol', selectedSymbol);
        setLocalSymbol(selectedSymbol);
      });

      if (result.isErr()) {
        console.warn('Failed to save ticker symbol to localStorage:', createUserFriendlyMessage(result.error));
      }
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
