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
}

export const WhaleWatchFeed: React.FC<WhaleWatchFeedProps> = ({
  trades,
  selectedSymbol,
  onSymbolChange,
  isLoading,
  error
}) => {
  const [searchSymbol, setSearchSymbol] = useState(selectedSymbol);
  const [filter, setFilter] = useState<'all' | 'calls' | 'puts'>('all');

  const handleSymbolSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchSymbol.trim()) {
      onSymbolChange(searchSymbol.trim().toUpperCase());
    }
  };

  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(value);
  };

  const formatTime = (timestamp: string): string => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
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

  const filteredTrades = trades.filter(trade => {
    if (filter === 'all') return true;
    if (filter === 'calls') return trade.contract.option_type === 'call';
    if (filter === 'puts') return trade.contract.option_type === 'put';
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
            { value: 'all', label: 'All' },
            { value: 'calls', label: 'Calls' },
            { value: 'puts', label: 'Puts' }
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
          <div className="space-y-2 p-4">
            {filteredTrades.map((trade) => (
              <div
                key={trade.id}
                className="p-4 bg-muted/30 rounded-lg border border-border hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    {getTradeIcon(trade.side)}
                    <span className="font-semibold text-foreground">
                      {trade.symbol}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {trade.contract.option_type.toUpperCase()}
                    </span>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {formatTime(trade.timestamp)}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Strike</p>
                    <p className="font-medium text-foreground">
                      ${trade.contract.strike_price}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Expiry</p>
                    <p className="font-medium text-foreground">
                      {new Date(trade.contract.expiration_date).toLocaleDateString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Price</p>
                    <p className="font-medium text-foreground">
                      {formatCurrency(trade.price)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Size</p>
                    <p className="font-medium text-foreground">
                      {trade.size.toLocaleString()}
                    </p>
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-border">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Total Premium</span>
                    <span className={`font-bold text-lg ${getTradeColor(trade.side)}`}>
                      {formatCurrency(getTotalPremium(trade))}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
