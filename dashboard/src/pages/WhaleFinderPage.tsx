import React, { useState, useEffect } from 'react';
import { FrontendOptionTrade } from '../types';
import { apiService } from '../services/apiService';
import { PageHeader } from '../components/PageHeader';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { safeCallAsync, createUserFriendlyMessage } from '@whalewatch/shared';
import { getSessionStorageItem, setSessionStorageItem } from '../utils/localStorage';

export const WhaleFinderPage: React.FC = () => {
  const [selectedSymbol, setSelectedSymbol] = useState<string>('TSLA');
  const [optionsTrades, setOptionsTrades] = useState<FrontendOptionTrade[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    // Default to today's date, but check session storage first
    const today = new Date().toISOString().split('T')[0];
    return getSessionStorageItem('whaleFinderSelectedDate', today);
  });
  const [maxPrice, setMaxPrice] = useState<string>(() => {
    return getSessionStorageItem('whaleFinderMaxPrice', 1000).toString();
  });
  const [repeatMin, setRepeatMin] = useState<string>(() => {
    return getSessionStorageItem('whaleFinderRepeatMin', 10).toString();
  });
  const [volumeMin, setVolumeMin] = useState<string>(() => {
    return getSessionStorageItem('whaleFinderVolumeMin', 1000).toString();
  });
  const [selectedContract, setSelectedContract] = useState<string | null>(null);

  // Debounced filter values to prevent API calls on every keystroke
  const [debouncedMaxPrice, setDebouncedMaxPrice] = useState(maxPrice);
  const [debouncedRepeatMin, setDebouncedRepeatMin] = useState(repeatMin);
  const [debouncedVolumeMin, setDebouncedVolumeMin] = useState(volumeMin);

  // Update debounced values with delay
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedMaxPrice(maxPrice);
    }, 500);
    return () => clearTimeout(timer);
  }, [maxPrice]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedRepeatMin(repeatMin);
    }, 500);
    return () => clearTimeout(timer);
  }, [repeatMin]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedVolumeMin(volumeMin);
    }, 500);
    return () => clearTimeout(timer);
  }, [volumeMin]);

  useEffect(() => {
    const maxPriceNum = debouncedMaxPrice === '' ? 0 : Number(debouncedMaxPrice);
    const repeatMinNum = debouncedRepeatMin === '' ? 0 : Number(debouncedRepeatMin);
    const volumeMinNum = debouncedVolumeMin === '' ? 0 : Number(debouncedVolumeMin);
    loadOptionsTrades(selectedSymbol, selectedDate, maxPriceNum, repeatMinNum, volumeMinNum);
  }, [selectedSymbol, selectedDate, debouncedMaxPrice, debouncedRepeatMin, debouncedVolumeMin]);

  // Save filters to sessionStorage whenever they change
  useEffect(() => {
    const maxPriceNum = maxPrice === '' ? 0 : Number(maxPrice);
    setSessionStorageItem('whaleFinderMaxPrice', maxPriceNum);
  }, [maxPrice]);

  useEffect(() => {
    const repeatMinNum = repeatMin === '' ? 0 : Number(repeatMin);
    setSessionStorageItem('whaleFinderRepeatMin', repeatMinNum);
  }, [repeatMin]);

  useEffect(() => {
    const volumeMinNum = volumeMin === '' ? 0 : Number(volumeMin);
    setSessionStorageItem('whaleFinderVolumeMin', volumeMinNum);
  }, [volumeMin]);

  useEffect(() => {
    setSessionStorageItem('whaleFinderSelectedDate', selectedDate);
  }, [selectedDate]);

  const loadOptionsTrades = async (
    symbol: string,
    date: string,
    maxPriceFilter: number,
    repeatMinFilter: number,
    volumeMinFilter: number
  ) => {
    setIsLoading(true);
    setError(null);

    // Calculate start and end time for the selected date
    const startTime = new Date(`${date}T00:00:00.000Z`);
    const endTime = new Date(`${date}T23:59:59.999Z`);

    const result = await safeCallAsync(async () => {
      return apiService.getOptionsTrades(symbol, startTime, endTime, maxPriceFilter, repeatMinFilter, volumeMinFilter);
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

  const formatExpiryWithDays = (expirationDate: string, viewingDate: string): string => {
    const expiryDate = new Date(expirationDate);
    const viewDate = new Date(viewingDate);

    // Calculate the difference in days
    const timeDiff = expiryDate.getTime() - viewDate.getTime();
    const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));

    // Format the date as "Nov 07, 2025"
    const formattedDate = expiryDate.toLocaleDateString('en-US', {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
    });

    // Return the formatted string with days
    return `${formattedDate} (${daysDiff} days)`;
  };

  const formatTime = (dateString: string): string => {
    return new Date(dateString).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
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
    const notional = price * size * 100; // Options are typically 100 shares per contract

    if (notional >= 1000000) {
      // Format as millions (e.g., 1.8M, 2M)
      const millions = notional / 1000000;
      return millions % 1 === 0 ? `${millions}M` : `${millions.toFixed(1)}M`;
    } else {
      // Format as thousands (e.g., 16k, 55k, 114k, 209k)
      const thousands = notional / 1000;
      return thousands % 1 === 0 ? `${thousands}k` : `${thousands.toFixed(0)}k`;
    }
  };

  // Filter trades by selected contract
  const filteredTrades = selectedContract
    ? (optionsTrades || []).filter(trade => trade.ticker === selectedContract)
    : optionsTrades || [];

  // Handle contract selection
  const handleContractClick = (ticker: string) => {
    if (selectedContract === ticker) {
      // If clicking the same contract, deselect it
      setSelectedContract(null);
    } else {
      // Select the new contract
      setSelectedContract(ticker);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Trade Finder"
        subtitle="View recent option trading activity for any symbol"
        selectedSymbol={selectedSymbol}
        onSymbolChange={handleSymbolChange}
      />

      {/* Main Content */}
      <div className="h-[calc(100vh-200px)]">
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-foreground">Option Trade Explorer</h2>

          {/* Option Trades Display */}
          <div className="bg-card rounded-lg border border-border h-full flex flex-col">
            <div className="p-4">
              {/* Summary */}
              <div className="mb-4 p-3 bg-muted/30 rounded-lg">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center space-x-2">
                    <span className="font-medium text-foreground">
                      {filteredTrades.length} trades
                      {selectedContract && <span className="text-muted-foreground ml-1">(filtered by contract)</span>}
                    </span>
                    {selectedContract && (
                      <button
                        onClick={() => setSelectedContract(null)}
                        className="px-2 py-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
                      >
                        Clear Filter
                      </button>
                    )}
                  </div>
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-2">
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
                    <div className="flex items-center space-x-2">
                      <span className="text-muted-foreground">Max: $</span>
                      <input
                        type="number"
                        value={maxPrice}
                        onChange={e => setMaxPrice(e.target.value)}
                        min="0"
                        step="0.01"
                        className="px-2 py-1 text-sm border border-border rounded bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring w-20"
                        placeholder="1000"
                      />
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-muted-foreground">Repeat:</span>
                      <input
                        type="number"
                        value={repeatMin}
                        onChange={e => setRepeatMin(e.target.value)}
                        min="1"
                        step="1"
                        className="px-2 py-1 text-sm border border-border rounded bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring w-16"
                        placeholder="10"
                      />
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-muted-foreground">Volume:</span>
                      <input
                        type="number"
                        value={volumeMin}
                        onChange={e => setVolumeMin(e.target.value)}
                        min="0"
                        step="1"
                        className="px-2 py-1 text-sm border border-border rounded bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring w-20"
                        placeholder="1000"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Error Display */}
              {error && (
                <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                  <p className="text-destructive text-sm">{error}</p>
                </div>
              )}

              {/* Loading State */}
              {isLoading ? (
                <div className="flex items-center justify-center h-32">
                  <LoadingSpinner />
                </div>
              ) : (
                <>
                  {/* Table or No Data Message */}
                  {!optionsTrades || optionsTrades.length === 0 ? (
                    <div className="p-8 text-center">
                      <p className="text-muted-foreground">
                        No option trades found for {selectedSymbol} on {formatDateDisplay(selectedDate)}
                      </p>
                    </div>
                  ) : filteredTrades.length === 0 ? (
                    <div className="p-8 text-center">
                      <p className="text-muted-foreground">No trades found for the selected contract</p>
                    </div>
                  ) : (
                    <>
                      {/* Table Header */}
                      <div className="grid grid-cols-8 gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b border-border pb-2 mb-2">
                        <div></div>
                        <div className="text-right">Price</div>
                        <div className="text-left"></div>
                        <div className="text-right">Value</div>
                        <div className="text-right"></div>
                        <div className="text-right"></div>
                        <div className="text-right">Repeat</div>
                        <div className="text-right">Volume</div>
                      </div>

                      {/* Table Rows */}
                      <div className="space-y-1 max-h-[calc(100vh-400px)] overflow-y-auto">
                        {filteredTrades.map((trade, index) => {
                          const isSelected = selectedContract === trade.ticker;
                          return (
                            <div
                              key={`${trade.sequence_number}-${index}`}
                              onClick={() => handleContractClick(trade.ticker)}
                              className={`grid grid-cols-8 gap-2 text-sm py-2 px-2 rounded transition-colors cursor-pointer ${
                                isSelected ? 'bg-primary/20 border border-primary/30' : 'hover:bg-muted/30'
                              }`}
                            >
                              {/* Time */}
                              <div className="font-semibold text-muted-foreground text-xs">
                                {formatTime(trade.timestamp)}
                              </div>

                              {/* Price with P/C indicator */}
                              <div className="font-semibold text-muted-foreground text-right">
                                {formatCurrency(trade.price)} {trade.option_type === 'call' ? 'C' : 'P'}
                              </div>

                              {/* Size */}
                              <div className="font-semibold text-muted-foreground text-left">
                                x {trade.size.toLocaleString()}
                              </div>

                              {/* Notional */}
                              <div className="font-semibold text-muted-foreground text-right">
                                {formatNotional(trade.price, trade.size)}
                              </div>

                              {/* Strike */}
                              <div className="font-semibold text-muted-foreground text-right pr-1">
                                ${trade.strike_price.toFixed(2)}
                              </div>

                              {/* Expiry */}
                              <div className="font-semibold text-muted-foreground text-right whitespace-nowrap">
                                {formatExpiryWithDays(trade.expiration_date, selectedDate)}
                              </div>

                              {/* Repeat */}
                              <div className="font-semibold text-muted-foreground text-right">{trade.repeat_count}</div>

                              {/* Volume */}
                              <div className="font-semibold text-muted-foreground text-right">
                                {trade.volume.toLocaleString()}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
