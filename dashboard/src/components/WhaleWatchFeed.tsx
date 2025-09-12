import React, { useState } from 'react';
import { AlpacaOptionsTrade } from '../types';
import { TrendingUp, TrendingDown, Search } from 'lucide-react';
import { LoadingSpinner } from './LoadingSpinner';

interface WhaleWatchFeedProps {
  trades: AlpacaOptionsTrade[];
  selectedSymbol: string;
  onSymbolChange: (symbol: string) => void;
  isLoading: boolean;
  error: string | null;
  hours: number;
  isConnected: boolean;
  hasRealTimeData: boolean;
}

export const WhaleWatchFeed: React.FC<WhaleWatchFeedProps> = ({
  trades,
  selectedSymbol,
  onSymbolChange,
  isLoading,
  error,
  hours,
  isConnected,
  hasRealTimeData,
}) => {
  const [searchSymbol, setSearchSymbol] = useState(selectedSymbol);
  const [filter, setFilter] = useState<'all' | 'calls' | 'puts' | 'whales'>('whales');

  const handleSymbolSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchSymbol.trim()) {
      onSymbolChange(searchSymbol.trim().toUpperCase());
    }
  };

  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(value);
  };

  const formatTime = (timestamp: string): string => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const getTotalPremium = (trade: AlpacaOptionsTrade): number => {
    return trade.price * trade.size * 100; // Options are per 100 shares
  };

  const getTradeIcon = (side: string) => {
    if (side === 'buy') {
      return <TrendingUp className="h-4 w-4 text-green-500" />;
    } else if (side === 'sell') {
      return <TrendingDown className="h-4 w-4 text-red-500" />;
    } else {
      return <div className="h-4 w-4 rounded-full bg-gray-400" />;
    }
  };

  const getTradeColor = (side: string): string => {
    if (side === 'buy') return 'text-green-500';
    if (side === 'sell') return 'text-red-500';
    return 'text-gray-500';
  };

  const filteredTrades = trades
    .filter((trade) => {
      const totalPremium = getTotalPremium(trade);
      const isWhaleTrade = totalPremium >= 100000; // $100k+ is considered a whale trade

      if (filter === 'all') return true;
      if (filter === 'calls') return trade.contract.option_type === 'call';
      if (filter === 'puts') return trade.contract.option_type === 'put';
      if (filter === 'whales') return isWhaleTrade;
      return true;
    })
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()); // Sort by timestamp, newest first

  return (
    <div className="bg-card rounded-lg border border-border h-full flex flex-col">
      {/* Header with Search and Filters */}
      <div className="p-4 border-b border-border">
        <form onSubmit={handleSymbolSubmit} className="flex space-x-2 mb-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={searchSymbol}
              onChange={(e) => setSearchSymbol(e.target.value)}
              placeholder="Enter symbol (e.g., TSLA, AAPL)"
              className="w-full pl-10 pr-4 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          >
            Watch
          </button>
        </form>

        {/* Status and Filters */}
        <div className="flex items-center justify-between">
          {/* Status Indicator */}
          <div className="flex items-center space-x-2 text-xs">
            <div
              className={`w-2 h-2 rounded-full ${
                isConnected ? (hasRealTimeData ? 'bg-green-500' : 'bg-yellow-500') : 'bg-red-500'
              }`}
            />
            <span className="text-muted-foreground">
              {isConnected
                ? hasRealTimeData
                  ? 'Real-time data active'
                  : 'Connected, waiting for data'
                : 'Disconnected'}
            </span>
          </div>

          {/* Filters */}
          <div className="flex space-x-2">
            {[
              { value: 'whales', label: 'Whales Only' },
              { value: 'all', label: 'All' },
              { value: 'calls', label: 'Calls' },
              { value: 'puts', label: 'Puts' },
            ].map((option) => (
              <button
                key={option.value}
                onClick={() => setFilter(option.value as any)}
                className={`px-3 py-1 text-xs rounded-full transition-colors ${
                  filter === option.value
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Trades List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <LoadingSpinner />
          </div>
        ) : error ? (
          <div className="p-8 text-center">
            <p className="text-destructive">{error}</p>
          </div>
        ) : filteredTrades.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-muted-foreground">
              {isConnected
                ? hasRealTimeData
                  ? 'No whale trades found in the selected time period'
                  : 'Connected to real-time feed but no data received yet. This may indicate no recent options trading activity.'
                : 'Not connected to real-time data feed. Please check your connection.'}
            </p>
            {!isConnected && (
              <p className="text-sm text-destructive mt-2">
                ⚠️ Real-time data connection required for accurate whale tracking
              </p>
            )}
          </div>
        ) : (
          <div className="p-4">
            {/* Summary */}
            <div className="mb-4 p-3 bg-muted/30 rounded-lg">
              <div className="flex items-center justify-between text-sm">
                <div>
                  <span className="font-medium text-foreground">
                    {filteredTrades.length} {filter === 'whales' ? 'whale' : 'total'} trades
                  </span>
                  <span className="text-muted-foreground ml-2">
                    in the last{' '}
                    {hours === 1
                      ? 'hour'
                      : hours < 24
                      ? `${hours} hours`
                      : hours === 24
                      ? 'day'
                      : `${Math.floor(hours / 24)} days`}
                  </span>
                </div>
                <div className="text-muted-foreground">
                  {selectedSymbol} •{' '}
                  {filter === 'whales'
                    ? 'Whales Only'
                    : filter.charAt(0).toUpperCase() + filter.slice(1)}
                </div>
              </div>
            </div>

            {/* Table Header */}
            <div className="grid grid-cols-9 gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b border-border pb-2 mb-2">
              <div>Symbol</div>
              <div>Type</div>
              <div className="text-right">Time</div>
              <div className="text-right">Exp</div>
              <div className="text-right">Strike</div>
              <div className="text-right">Value</div>
              <div className="text-right">Price</div>
              <div className="text-right">Size</div>
              <div className="text-right">%Gain</div>
            </div>

            {/* Table Rows */}
            <div className="space-y-1">
              {filteredTrades.map((trade) => {
                const totalPremium = getTotalPremium(trade);
                const isLargeTrade = totalPremium >= 100000; // $100k+ is considered a whale trade
                const isVeryLargeTrade = totalPremium >= 1000000; // $1M+ is very large

                return (
                  <div
                    key={trade.id}
                    className={`grid grid-cols-9 gap-2 text-sm py-2 px-2 rounded hover:bg-muted/30 transition-colors ${
                      isVeryLargeTrade
                        ? 'bg-red-50 dark:bg-red-950/20 border-l-2 border-red-500'
                        : isLargeTrade
                        ? 'bg-yellow-50 dark:bg-yellow-950/20 border-l-2 border-yellow-500'
                        : ''
                    }`}
                  >
                    {/* Symbol */}
                    <div className="flex items-center space-x-1">
                      {getTradeIcon(trade.side)}
                      <span className="font-medium text-foreground truncate">{trade.symbol}</span>
                    </div>

                    {/* Call/Put */}
                    <div className="flex items-center">
                      <span
                        className={`text-xs px-2 py-1 rounded-full ${
                          trade.contract.option_type === 'call'
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                            : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                        }`}
                      >
                        {trade.contract.option_type.toUpperCase()}
                      </span>
                    </div>

                    {/* Time */}
                    <div className="text-muted-foreground text-right">
                      {formatTime(trade.timestamp)}
                    </div>

                    {/* Expiry */}
                    <div className="text-muted-foreground text-right">
                      {new Date(trade.contract.expiration_date).toLocaleDateString('en-US', {
                        month: '2-digit',
                        day: '2-digit',
                        year: 'numeric',
                      })}
                    </div>

                    {/* Strike */}
                    <div className="font-medium text-foreground text-right">
                      ${trade.contract.strike_price.toFixed(2)}
                    </div>

                    {/* Value (Total Premium) */}
                    <div
                      className={`font-bold text-right ${
                        isVeryLargeTrade
                          ? 'text-red-600 dark:text-red-400'
                          : isLargeTrade
                          ? 'text-yellow-600 dark:text-yellow-400'
                          : 'text-foreground'
                      }`}
                      title={`$${totalPremium.toLocaleString()}`}
                    >
                      {totalPremium >= 1000000
                        ? `$${(totalPremium / 1000000).toFixed(1)}M`
                        : totalPremium >= 1000
                        ? `$${(totalPremium / 1000).toFixed(0)}K`
                        : `$${totalPremium.toFixed(0)}`}
                    </div>

                    {/* Price (Per Contract) */}
                    <div className="font-medium text-foreground text-right">
                      ${trade.price.toFixed(2)}
                    </div>

                    {/* Size (Contracts) */}
                    <div className="text-muted-foreground text-right">
                      {trade.size.toLocaleString()}
                    </div>

                    {/* %Gain */}
                    <div
                      className={`font-medium text-right ${
                        trade.gain_percentage && trade.gain_percentage > 0
                          ? 'text-green-500'
                          : trade.gain_percentage && trade.gain_percentage < 0
                          ? 'text-red-500'
                          : 'text-muted-foreground'
                      }`}
                    >
                      {trade.gain_percentage !== undefined
                        ? `${trade.gain_percentage > 0 ? '+' : ''}${trade.gain_percentage.toFixed(
                            2
                          )}%`
                        : 'N/A'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
