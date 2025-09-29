import React, { useState, useEffect } from 'react';
import { FrontendOptionTrade } from '../types';
import { apiService } from '../services/apiService';
import { PageHeader } from '../components/PageHeader';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { safeCallAsync, createUserFriendlyMessage } from '@whalewatch/shared';
import { Target } from 'lucide-react';

export const WhaleFinderPage: React.FC = () => {
  const [selectedSymbol, setSelectedSymbol] = useState<string>('TSLA');
  const [optionsTrades, setOptionsTrades] = useState<FrontendOptionTrade[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    // Default to today's date
    return new Date().toISOString().split('T')[0];
  });

  useEffect(() => {
    loadOptionsTrades(selectedSymbol, selectedDate);
  }, [selectedSymbol, selectedDate]);

  const loadOptionsTrades = async (symbol: string, date: string) => {
    setIsLoading(true);
    setError(null);

    // Calculate start and end time for the selected date
    const startTime = new Date(`${date}T00:00:00.000Z`);
    const endTime = new Date(`${date}T23:59:59.999Z`);

    const result = await safeCallAsync(async () => {
      return apiService.getOptionsTrades(symbol, startTime, endTime);
    });

    if (result.isOk()) {
      setOptionsTrades(result.value.trades);
    } else {
      const userMessage = createUserFriendlyMessage(result.error);
      setError(userMessage);
    }

    setIsLoading(false);
  };

  const handleSymbolChange = (symbol: string) => {
    setSelectedSymbol(symbol);
  };

  const generateDateOptions = () => {
    const options = [];
    const today = new Date();

    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      const dateString = date.toISOString().split('T')[0];
      const displayString = date.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });

      options.push({
        value: dateString,
        label: displayString,
        isToday: i === 0,
      });
    }

    return options;
  };

  const formatDateDisplay = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
    });
  };

  const formatTime = (dateString: string): string => {
    return new Date(dateString).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  };

  const getContractIcon = (contractType: string) => {
    if (contractType === 'call') {
      return <Target className="h-4 w-4 text-green-500" />;
    } else if (contractType === 'put') {
      return <Target className="h-4 w-4 text-red-500" />;
    } else {
      return <div className="h-4 w-4 rounded-full bg-gray-400" />;
    }
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const formatNotional = (price: number, size: number): string => {
    return formatCurrency(price * size * 100); // Options are typically 100 shares per contract
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Option Trades"
        subtitle="View recent option trading activity for any symbol"
        selectedSymbol={selectedSymbol}
        onSymbolChange={handleSymbolChange}
      />

      {/* Main Content */}
      <div className="h-[calc(100vh-200px)]">
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-foreground">Recent Option Trades</h2>

          {/* Option Trades Display */}
          <div className="bg-card rounded-lg border border-border h-full flex flex-col">
            {isLoading ? (
              <div className="flex items-center justify-center h-32">
                <LoadingSpinner />
              </div>
            ) : error ? (
              <div className="p-8 text-center">
                <p className="text-destructive">{error}</p>
              </div>
            ) : !optionsTrades || optionsTrades.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-muted-foreground">
                  No option trades found for {selectedSymbol} on {formatDateDisplay(selectedDate)}
                </p>
              </div>
            ) : (
              <div className="p-4">
                {/* Summary */}
                <div className="mb-4 p-3 bg-muted/30 rounded-lg">
                  <div className="flex items-center justify-between text-sm">
                    <div>
                      <span className="font-medium text-foreground">{optionsTrades?.length || 0} trades</span>
                      <span className="text-muted-foreground ml-2">for {selectedSymbol}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-muted-foreground">Date:</span>
                      <select
                        value={selectedDate}
                        onChange={e => setSelectedDate(e.target.value)}
                        className="px-2 py-1 text-sm border border-border rounded bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        {generateDateOptions().map(option => (
                          <option key={option.value} value={option.value}>
                            {option.label} {option.isToday ? '(Today)' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Table Header */}
                <div className="grid grid-cols-8 gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b border-border pb-2 mb-2">
                  <div>Time</div>
                  <div>Contract</div>
                  <div className="text-right">Price</div>
                  <div className="text-right">Size</div>
                  <div className="text-right">Notional</div>
                  <div className="text-right">Strike</div>
                  <div className="text-right">Expiry</div>
                </div>

                {/* Table Rows */}
                <div className="space-y-1 max-h-[calc(100vh-400px)] overflow-y-auto">
                  {(optionsTrades || []).map((trade, index) => {
                    return (
                      <div
                        key={`${trade.sequence_number}-${index}`}
                        className="grid grid-cols-8 gap-2 text-sm py-2 px-2 rounded hover:bg-muted/30 transition-colors"
                      >
                        {/* Time */}
                        <div className="text-muted-foreground text-xs">
                          <div>{formatTime(trade.timestamp)}</div>
                        </div>

                        {/* Contract */}
                        <div className="flex items-center space-x-1">
                          {getContractIcon(trade.option_type)}
                          <span className="font-medium text-foreground truncate text-xs">{trade.ticker}</span>
                        </div>

                        {/* Price */}
                        <div className="font-medium text-foreground text-right">{formatCurrency(trade.price)}</div>

                        {/* Size */}
                        <div className="text-muted-foreground text-right">{trade.size.toLocaleString()}</div>

                        {/* Notional */}
                        <div className="font-medium text-foreground text-right">
                          {formatNotional(trade.price, trade.size)}
                        </div>

                        {/* Strike */}
                        <div className="text-muted-foreground text-right">${trade.strike_price.toFixed(2)}</div>

                        {/* Expiry */}
                        <div className="text-muted-foreground text-right text-xs">
                          {formatDate(trade.expiration_date)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
