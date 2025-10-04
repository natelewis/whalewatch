import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3 } from 'lucide-react';
import { FrontendOptionTrade } from '../types';
import { apiService } from '../services/apiService';
import { PageHeader } from '../components/PageHeader';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { safeCallAsync, createUserFriendlyMessage, parseOptionTicker } from '@whalewatch/shared';
import { CANDLE_UP_COLOR, CANDLE_DOWN_COLOR } from '../constants';
import { getSessionStorageItem, setSessionStorageItem } from '../utils/localStorage';

export const TradeFinderPage: React.FC = () => {
  const [selectedSymbol, setSelectedSymbol] = useState<string>('');
  const [optionsTrades, setOptionsTrades] = useState<FrontendOptionTrade[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    // Default to today's date, but check session storage first
    const today = new Date();
    const todayString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
      today.getDate()
    ).padStart(2, '0')}`;
    return getSessionStorageItem('tradeFinderSelectedDate', todayString);
  });
  const [maxPrice, setMaxPrice] = useState<string>(() => {
    return getSessionStorageItem('tradeFinderMaxPrice', 1000).toString();
  });
  const [repeatMin, setRepeatMin] = useState<string>(() => {
    return getSessionStorageItem('tradeFinderRepeatMin', 10).toString();
  });
  const [volumeMin, setVolumeMin] = useState<string>(() => {
    return getSessionStorageItem('tradeFinderVolumeMin', 1000).toString();
  });
  const [scrollPosition, setScrollPosition] = useState<number>(0);
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [isAutoRefresh, setIsAutoRefresh] = useState<boolean>(false);

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
    // Only load trades if we have a symbol
    if (!selectedSymbol.trim()) {
      setOptionsTrades([]);
      return;
    }

    const maxPriceNum = debouncedMaxPrice === '' ? 0 : Number(debouncedMaxPrice);
    const repeatMinNum = debouncedRepeatMin === '' ? 0 : Number(debouncedRepeatMin);
    const volumeMinNum = debouncedVolumeMin === '' ? 0 : Number(debouncedVolumeMin);
    loadOptionsTrades(selectedSymbol, selectedDate, maxPriceNum, repeatMinNum, volumeMinNum);
  }, [selectedSymbol, selectedDate, debouncedMaxPrice, debouncedRepeatMin, debouncedVolumeMin]);

  // Auto-refresh data every 10 seconds
  useEffect(() => {
    // Only auto-refresh if we have a symbol
    if (!selectedSymbol.trim()) {
      return;
    }

    const interval = setInterval(() => {
      const maxPriceNum = debouncedMaxPrice === '' ? 0 : Number(debouncedMaxPrice);
      const repeatMinNum = debouncedRepeatMin === '' ? 0 : Number(debouncedRepeatMin);
      const volumeMinNum = debouncedVolumeMin === '' ? 0 : Number(debouncedVolumeMin);
      loadOptionsTrades(selectedSymbol, selectedDate, maxPriceNum, repeatMinNum, volumeMinNum, true);
    }, 10000); // 10 seconds

    return () => clearInterval(interval);
  }, [selectedSymbol, selectedDate, debouncedMaxPrice, debouncedRepeatMin, debouncedVolumeMin]);

  // Save filters to sessionStorage whenever they change
  useEffect(() => {
    const maxPriceNum = maxPrice === '' ? 0 : Number(maxPrice);
    setSessionStorageItem('tradeFinderMaxPrice', maxPriceNum);
  }, [maxPrice]);

  useEffect(() => {
    const repeatMinNum = repeatMin === '' ? 0 : Number(repeatMin);
    setSessionStorageItem('tradeFinderRepeatMin', repeatMinNum);
  }, [repeatMin]);

  useEffect(() => {
    const volumeMinNum = volumeMin === '' ? 0 : Number(volumeMin);
    setSessionStorageItem('tradeFinderVolumeMin', volumeMinNum);
  }, [volumeMin]);

  useEffect(() => {
    setSessionStorageItem('tradeFinderSelectedDate', selectedDate);
  }, [selectedDate]);

  // Restore scroll position after data loads
  useEffect(() => {
    if (scrollPosition > 0 && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollPosition;
    }
  }, [optionsTrades, scrollPosition]);

  const loadOptionsTrades = async (
    symbol: string,
    date: string,
    maxPriceFilter: number,
    repeatMinFilter: number,
    volumeMinFilter: number,
    preserveScroll: boolean = false
  ) => {
    // Save scroll position before loading if preserving scroll
    if (preserveScroll && scrollContainerRef.current) {
      setScrollPosition(scrollContainerRef.current.scrollTop);
    }

    // Set auto-refresh flag and only show loading spinner for manual refreshes
    setIsAutoRefresh(preserveScroll);
    if (!preserveScroll) {
      setIsLoading(true);
    }
    setError(null);

    // Calculate start and end time for the selected date in local timezone
    // This ensures we get trades for the actual selected date, not UTC date
    const startTime = new Date(`${date}T00:00:00`);
    const endTime = new Date(`${date}T23:59:59.999`);

    const result = await safeCallAsync(async () => {
      return apiService.getOptionsTrades(symbol, startTime, endTime, maxPriceFilter, repeatMinFilter, volumeMinFilter);
    });

    if (result.isOk()) {
      setOptionsTrades(result.value.trades);
      setLastSyncTime(new Date());
    } else {
      const userMessage = createUserFriendlyMessage(result.error);
      setError(userMessage);
    }

    setIsLoading(false);
    setIsAutoRefresh(false);
  };

  const handleSymbolChange = (symbol: string) => {
    // If it's an option ticker, extract the underlying ticker for searching
    const parsedOption = parseOptionTicker(symbol);
    const searchSymbol = parsedOption ? parsedOption.underlyingTicker : symbol;

    setSelectedSymbol(searchSymbol);
  };

  const generateDateOptions = () => {
    const options = [];
    const today = new Date();

    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      // Use local timezone to avoid date shifting issues
      const dateString = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
        date.getDate()
      ).padStart(2, '0')}`;
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
    // Parse dates as UTC to avoid timezone issues
    const expiryDate = new Date(`${expirationDate}T00:00:00.000Z`);
    const viewDate = new Date(`${viewingDate}T00:00:00.000Z`);

    // Calculate the difference in days
    const timeDiff = expiryDate.getTime() - viewDate.getTime();
    const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));

    // Format the date as "Nov 07, 2025" using UTC methods to avoid timezone conversion
    const formattedDate = expiryDate.toLocaleDateString('en-US', {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
      timeZone: 'UTC',
    });

    // Return the formatted string with days
    return `${formattedDate} (${daysDiff} days)`;
  };

  const formatTime = (dateString: string): string => {
    return new Date(dateString).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
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

  const formatHighLowPrice = (highPrice: number, lowPrice: number) => {
    if (highPrice === lowPrice) {
      return {
        isRange: false,
        singlePrice: formatCurrency(highPrice),
      };
    }
    return {
      isRange: true,
      lowPrice: formatCurrency(lowPrice),
      highPrice: formatCurrency(highPrice),
    };
  };

  const formatLastSyncTime = (date: Date): string => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  };

  // Process trades to group by contract and calculate compressed data
  const processedTrades = React.useMemo(() => {
    if (!optionsTrades || optionsTrades.length === 0) {
      return [];
    }

    // Group trades by ticker (contract)
    const contractGroups = new Map<
      string,
      {
        trades: FrontendOptionTrade[];
        firstBought: string;
        lastBought: string;
        totalQuantity: number;
        totalValue: number;
        averagePrice: number;
        highPrice: number;
        lowPrice: number;
        averageValue: number;
        totalVolume: number;
      }
    >();

    // Group trades by contract
    optionsTrades.forEach(trade => {
      if (!contractGroups.has(trade.ticker)) {
        contractGroups.set(trade.ticker, {
          trades: [],
          firstBought: trade.timestamp,
          lastBought: trade.timestamp,
          totalQuantity: 0,
          totalValue: 0,
          averagePrice: 0,
          highPrice: trade.price,
          lowPrice: trade.price,
          averageValue: 0,
          totalVolume: 0,
        });
      }

      const group = contractGroups.get(trade.ticker)!;
      group.trades.push(trade);

      // Update time range
      if (new Date(trade.timestamp) < new Date(group.firstBought)) {
        group.firstBought = trade.timestamp;
      }
      if (new Date(trade.timestamp) > new Date(group.lastBought)) {
        group.lastBought = trade.timestamp;
      }

      // Update high/low prices
      group.highPrice = Math.max(group.highPrice, trade.price);
      group.lowPrice = Math.min(group.lowPrice, trade.price);

      // Calculate totals
      group.totalQuantity += trade.size;
      group.totalValue += trade.price * trade.size * 100; // Options are 100 shares per contract
      group.totalVolume += trade.volume;
    });

    // Calculate averages and convert to compressed format
    const compressedTrades = Array.from(contractGroups.values()).map(group => {
      const firstTrade = group.trades[0];
      return {
        ...firstTrade,
        firstBought: group.firstBought,
        lastBought: group.lastBought,
        totalQuantity: group.totalQuantity,
        totalValue: group.totalValue,
        averagePrice: group.totalValue / (group.totalQuantity * 100),
        highPrice: group.highPrice,
        lowPrice: group.lowPrice,
        averageValue: group.totalValue / group.trades.length,
        totalVolume: group.totalVolume,
        repeatCount: group.trades.length,
      };
    });

    return compressedTrades;
  }, [optionsTrades]);

  // Use processed trades directly since each row is already one contract
  const filteredTrades = processedTrades;

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
                    <span className="font-medium text-foreground">{filteredTrades.length} contracts</span>
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
                    {lastSyncTime && (
                      <div className="flex items-center space-x-2">
                        <div className="flex items-center space-x-2 px-3 py-1 rounded-md bg-muted/50">
                          <div className="flex items-center space-x-1">
                            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                          </div>
                          <span className="text-xs text-muted-foreground">{formatLastSyncTime(lastSyncTime)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Error Display */}
              {error && (
                <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                  <p className="text-destructive text-sm">{error}</p>
                </div>
              )}

              {/* Loading State - only show spinner for manual refreshes, not auto-refresh */}
              {isLoading && !isAutoRefresh ? (
                <div className="flex items-center justify-center h-32">
                  <LoadingSpinner />
                </div>
              ) : (
                <>
                  {/* Table or No Data Message */}
                  {!optionsTrades || optionsTrades.length === 0 ? (
                    <div className="p-8 text-center">
                      <p className="text-muted-foreground">
                        No option contracts found for {selectedSymbol} on {formatDateDisplay(selectedDate)}
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* Table Header */}
                      <div className="grid grid-cols-8 gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b border-border pb-2 mb-2">
                        <div className="text-left"></div>
                        <div className="text-center">Price</div>
                        <div className="text-right">Avg</div>
                        <div className="text-right">Total</div>
                        <div className="text-right"></div>
                        <div className="text-right"></div>
                        <div className="text-right">Trades</div>
                        <div className="text-right pr-2">Volume</div>
                      </div>

                      {/* Table Rows */}
                      <div ref={scrollContainerRef} className="space-y-1 max-h-[calc(100vh-400px)] overflow-y-auto">
                        {filteredTrades.map((trade, index) => {
                          return (
                            <div
                              key={`${trade.ticker}-${index}`}
                              className="grid grid-cols-8 gap-2 text-sm py-2 px-2 rounded transition-colors hover:bg-muted/30"
                            >
                              {/* Time Range with Chart Icon */}
                              <div className="font-semibold text-muted-foreground text-xs flex items-center gap-2">
                                <Link
                                  to={`/analysis?symbol=${encodeURIComponent(trade.ticker)}`}
                                  className="text-muted-foreground hover:text-primary transition-colors"
                                  title="View chart analysis"
                                >
                                  <BarChart3 className="h-4 w-4" />
                                </Link>
                                <div className="whitespace-nowrap">
                                  <div className="flex items-center text-xs">
                                    <span className="inline-flex items-center w-12 justify-center bg-muted/20 rounded px-1">
                                      {formatTime(trade.firstBought)}
                                    </span>
                                    <span>-</span>
                                    <span className="inline-flex items-center w-12 justify-center bg-muted/20 rounded px-1">
                                      {formatTime(trade.lastBought)}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {/* High/Low Price */}
                              <div className="font-semibold text-muted-foreground text-right">
                                {(() => {
                                  const priceData = formatHighLowPrice(trade.highPrice, trade.lowPrice);
                                  if (!priceData.isRange) {
                                    return (
                                      <div className="flex items-center justify-center text-xs">
                                        <span className="inline-flex items-center justify-center bg-muted/20 rounded px-1">
                                          {priceData.singlePrice}
                                        </span>
                                        <span>-</span>
                                        <span className="inline-flex items-center justify-center bg-muted/20 rounded px-1">
                                          {priceData.singlePrice}
                                        </span>
                                      </div>
                                    );
                                  }
                                  return (
                                    <div className="flex items-center justify-center text-xs">
                                      <span className="inline-flex items-center justify-center bg-muted/20 rounded px-1">
                                        {priceData.lowPrice}
                                      </span>
                                      <span>-</span>
                                      <span className="inline-flex items-center justify-center bg-muted/20 rounded px-1">
                                        {priceData.highPrice}
                                      </span>
                                    </div>
                                  );
                                })()}
                              </div>

                              {/* Average Value */}
                              <div className="font-semibold text-muted-foreground text-right">
                                {(() => {
                                  const avgValue = trade.averageValue;
                                  if (avgValue >= 1000000) {
                                    // Format as millions (e.g., 1.8M, 2M)
                                    const millions = avgValue / 1000000;
                                    return millions % 1 === 0 ? `${millions}M` : `${millions.toFixed(1)}M`;
                                  } else {
                                    // Format as thousands (e.g., 16k, 55k, 114k, 209k)
                                    const thousands = avgValue / 1000;
                                    return `${Math.round(thousands)}k`;
                                  }
                                })()}
                              </div>

                              {/* Total Value */}
                              <div className="font-semibold text-muted-foreground text-right">
                                {formatCurrency(trade.totalValue / 1000000)}M
                              </div>

                              {/* Strike with P/C indicator */}
                              <div className="font-semibold text-muted-foreground text-right flex items-center justify-end gap-1 pr-1">
                                <span>${trade.strike_price.toFixed(2)}</span>
                                <span
                                  className="inline-flex items-center justify-center w-5 h-5 text-xs font-bold rounded"
                                  style={{
                                    backgroundColor:
                                      trade.option_type === 'call' ? `${CANDLE_UP_COLOR}20` : `${CANDLE_DOWN_COLOR}20`,
                                    color: trade.option_type === 'call' ? CANDLE_UP_COLOR : CANDLE_DOWN_COLOR,
                                  }}
                                >
                                  {trade.option_type === 'call' ? 'C' : 'P'}
                                </span>
                              </div>

                              {/* Expiry */}
                              <div className="font-semibold text-muted-foreground text-right whitespace-nowrap">
                                {formatExpiryWithDays(trade.expiration_date, selectedDate)}
                              </div>

                              {/* Number of Trades */}
                              <div className="font-semibold text-muted-foreground text-right">{trade.repeatCount}</div>

                              {/* Total Volume */}
                              <div className="font-semibold text-muted-foreground text-right">
                                {trade.totalVolume.toLocaleString()}
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
