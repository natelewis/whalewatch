import React, { useState, useEffect } from 'react';
import { AlpacaOptionsTrade } from '../types';
import { apiService } from '../services/apiService';
import { useWebSocket } from '../hooks/useWebSocket';
import { WhaleWatchFeed } from '../components/WhaleWatchFeed';

export const WhaleFinderPage: React.FC = () => {
  const [selectedSymbol, setSelectedSymbol] = useState<string>('TSLA');
  const [whaleTrades, setWhaleTrades] = useState<AlpacaOptionsTrade[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hours, setHours] = useState<number>(24);
  const [hasRealTimeData, setHasRealTimeData] = useState<boolean>(false);

  // WebSocket for real-time whale trades
  const { lastMessage, sendMessage, isConnected } = useWebSocket();

  useEffect(() => {
    loadWhaleTrades(selectedSymbol);
  }, [selectedSymbol, hours]);

  useEffect(() => {
    if (lastMessage?.type === 'options_whale') {
      setWhaleTrades((prev) => [lastMessage.data, ...prev.slice(0, 99)]); // Keep last 100 trades
      setHasRealTimeData(true);
    }
  }, [lastMessage]);

  const loadWhaleTrades = async (symbol: string) => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await apiService.getOptionsTrades(symbol, hours);
      setWhaleTrades(response.trades);

      // Subscribe to real-time whale trades for this symbol
      sendMessage({
        type: 'subscribe',
        data: { channel: 'options_whale', symbol },
      });
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load whale trades');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSymbolChange = (symbol: string) => {
    setSelectedSymbol(symbol);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Whale Finder</h1>
          <p className="text-muted-foreground">
            Monitor large options trades and discover whale activity
          </p>
        </div>
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <label htmlFor="time-period" className="text-sm font-medium text-foreground">
              Time Period:
            </label>
            <select
              id="time-period"
              value={hours}
              onChange={(e) => setHours(Number(e.target.value))}
              className="px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value={1}>Last Hour</option>
              <option value={6}>Last 6 Hours</option>
              <option value={24}>Last 24 Hours</option>
              <option value={72}>Last 3 Days</option>
              <option value={168}>Last Week</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="h-[calc(100vh-200px)]">
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-foreground">Options Whale Feed</h2>
          <WhaleWatchFeed
            trades={whaleTrades}
            selectedSymbol={selectedSymbol}
            onSymbolChange={handleSymbolChange}
            isLoading={isLoading}
            error={error}
            hours={hours}
            isConnected={isConnected}
            hasRealTimeData={hasRealTimeData}
          />
        </div>
      </div>
    </div>
  );
};
