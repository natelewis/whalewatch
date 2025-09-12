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
}

export const WhaleWatchFeed: React.FC<WhaleWatchFeedProps> = ({
  trades,
  selectedSymbol,
  onSymbolChange,
  isLoading,
  error,
  hours,
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
    return side === 'buy' ? (
      <TrendingUp className="h-4 w-4 text-green-500" />
    ) : (
      <TrendingDown className="h-4 w-4 text-red-500" />
    );
  };

  const getTradeColor = (side: string): string => {
    return side === 'buy' ? 'text-green-500' : 'text-red-500';
  };

  const filteredTrades = trades.filter((trade) => {
    const totalPremium = getTotalPremium(trade);
    const isWhaleTrade = totalPremium >= 100000; // $100k+ is considered a whale trade

    if (filter === 'all') return true;
    if (filter === 'calls') return trade.contract.option_type === 'call';
    if (filter === 'puts') return trade.contract.option_type === 'put';
    if (filter === 'whales') return isWhaleTrade;
    return true;
  });

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
            <p className="text-muted-foreground">No whale trades found</p>
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
            <div className="grid grid-cols-8 gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b border-border pb-2 mb-2">
              <div>Symbol</div>
              <div>Type</div>
              <div>Time</div>
              <div>Exp</div>
              <div>Strike</div>
              <div>Alert</div>
              <div>High</div>
              <div>Size</div>
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
                    className={`grid grid-cols-8 gap-2 text-sm py-2 px-2 rounded hover:bg-muted/30 transition-colors ${
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
                    <div className="text-muted-foreground">{formatTime(trade.timestamp)}</div>

                    {/* Expiry */}
                    <div className="text-muted-foreground">
                      {new Date(trade.contract.expiration_date).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </div>

                    {/* Strike */}
                    <div className="font-medium text-foreground">
                      ${trade.contract.strike_price}
                    </div>

                    {/* Alert (Total Premium) */}
                    <div
                      className={`font-bold ${
                        isVeryLargeTrade
                          ? 'text-red-600 dark:text-red-400'
                          : isLargeTrade
                          ? 'text-yellow-600 dark:text-yellow-400'
                          : 'text-foreground'
                      }`}
                    >
                      {totalPremium >= 1000000
                        ? `${(totalPremium / 1000000).toFixed(1)}M`
                        : totalPremium >= 1000
                        ? `${(totalPremium / 1000).toFixed(0)}K`
                        : totalPremium.toFixed(0)}
                    </div>

                    {/* High (Price) */}
                    <div className="font-medium text-foreground">${trade.price.toFixed(2)}</div>

                    {/* Size (Contracts) */}
                    <div className="text-muted-foreground">{trade.size.toLocaleString()}</div>
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
