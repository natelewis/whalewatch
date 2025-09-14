import React, { useState } from 'react';
import { AlpacaOptionsContract } from '../types';
import { Search, Calendar, DollarSign, Target } from 'lucide-react';
import { LoadingSpinner } from './LoadingSpinner';

interface WhaleWatchFeedProps {
  contracts: AlpacaOptionsContract[];
  selectedSymbol: string;
  onSymbolChange: (symbol: string) => void;
  isLoading: boolean;
  error: string | null;
  isConnected: boolean;
  hasRealTimeData: boolean;
}

export const WhaleWatchFeed: React.FC<WhaleWatchFeedProps> = ({
  contracts,
  selectedSymbol,
  onSymbolChange,
  isLoading,
  error,
  isConnected,
  hasRealTimeData,
}) => {
  const [searchSymbol, setSearchSymbol] = useState(selectedSymbol);
  const [filter, setFilter] = useState<'all' | 'calls' | 'puts' | 'near_money'>('near_money');

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

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
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

  const getContractColor = (contractType: string): string => {
    if (contractType === 'call') return 'text-green-500';
    if (contractType === 'put') return 'text-red-500';
    return 'text-gray-500';
  };

  const isNearMoney = (contract: AlpacaOptionsContract, currentPrice?: number): boolean => {
    if (!currentPrice || !contract.strike_price) return false;
    const strike = contract.strike_price;
    const diff = Math.abs(strike - currentPrice) / currentPrice;
    return diff <= 0.05; // Within 5% of current price
  };

  const filteredContracts = contracts
    .filter((contract) => {
      if (filter === 'all') return true;
      if (filter === 'calls') return (contract.contract_type || '') === 'call';
      if (filter === 'puts') return (contract.contract_type || '') === 'put';
      if (filter === 'near_money') return isNearMoney(contract);
      return true;
    })
    .sort((a, b) => {
      // Sort by expiration date, then by strike price
      const dateA = a.expiration_date ? new Date(a.expiration_date).getTime() : 0;
      const dateB = b.expiration_date ? new Date(b.expiration_date).getTime() : 0;
      if (dateA !== dateB) return dateA - dateB;
      return (a.strike_price || 0) - (b.strike_price || 0);
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
              { value: 'near_money', label: 'Near Money' },
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

      {/* Contracts List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <LoadingSpinner />
          </div>
        ) : error ? (
          <div className="p-8 text-center">
            <p className="text-destructive">{error}</p>
          </div>
        ) : filteredContracts.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-muted-foreground">
              {isConnected
                ? hasRealTimeData
                  ? 'No options contracts found for this symbol'
                  : 'Connected to real-time feed but no data received yet. This may indicate no options contracts available.'
                : 'Not connected to real-time data feed. Please check your connection.'}
            </p>
            {!isConnected && (
              <p className="text-sm text-destructive mt-2">
                ⚠️ Real-time data connection required for accurate options data
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
                    {filteredContracts.length} {filter === 'near_money' ? 'near money' : 'total'}{' '}
                    contracts
                  </span>
                  <span className="text-muted-foreground ml-2">for {selectedSymbol}</span>
                </div>
                <div className="text-muted-foreground">
                  {selectedSymbol} •{' '}
                  {filter === 'near_money'
                    ? 'Near Money'
                    : filter.charAt(0).toUpperCase() + filter.slice(1)}
                </div>
              </div>
            </div>

            {/* Table Header */}
            <div className="grid grid-cols-7 gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b border-border pb-2 mb-2">
              <div>Contract</div>
              <div>Type</div>
              <div className="text-right">Expiration</div>
              <div className="text-right">Strike</div>
              <div className="text-right">Exercise</div>
              <div className="text-right">Exchange</div>
              <div className="text-right">Shares</div>
            </div>

            {/* Table Rows */}
            <div className="space-y-1">
              {filteredContracts.map((contract, index) => {
                const isNearMoneyContract = isNearMoney(contract);
                const isCall = contract.contract_type === 'call';
                const isPut = contract.contract_type === 'put';

                return (
                  <div
                    key={`${contract.ticker}-${contract.strike_price}-${contract.expiration_date}-${index}`}
                    className={`grid grid-cols-7 gap-2 text-sm py-2 px-2 rounded hover:bg-muted/30 transition-colors ${
                      isNearMoneyContract
                        ? 'bg-blue-50 dark:bg-blue-950/20 border-l-2 border-blue-500'
                        : ''
                    }`}
                  >
                    {/* Contract Ticker */}
                    <div className="flex items-center space-x-1">
                      {getContractIcon(contract.contract_type || 'unknown')}
                      <span className="font-medium text-foreground truncate text-xs">
                        {contract.ticker || 'N/A'}
                      </span>
                    </div>

                    {/* Call/Put */}
                    <div className="flex items-center">
                      <span
                        className={`text-xs px-2 py-1 rounded-full ${
                          isCall
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                            : isPut
                            ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                            : 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400'
                        }`}
                      >
                        {(contract.contract_type || 'unknown').toUpperCase()}
                      </span>
                    </div>

                    {/* Expiration */}
                    <div className="text-muted-foreground text-right">
                      {contract.expiration_date ? formatDate(contract.expiration_date) : 'N/A'}
                    </div>

                    {/* Strike */}
                    <div className="font-medium text-foreground text-right">
                      ${(contract.strike_price || 0).toFixed(2)}
                    </div>

                    {/* Exercise Style */}
                    <div className="text-muted-foreground text-right text-xs">
                      {contract.exercise_style || 'N/A'}
                    </div>

                    {/* Exchange */}
                    <div className="text-muted-foreground text-right text-xs">
                      {contract.primary_exchange || 'N/A'}
                    </div>

                    {/* Shares per Contract */}
                    <div className="text-muted-foreground text-right">
                      {contract.shares_per_contract || 'N/A'}
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
