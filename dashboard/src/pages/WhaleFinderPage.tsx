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

  // WebSocket for real-time whale trades
  const { lastMessage, sendMessage } = useWebSocket();

  useEffect(() => {
    loadWhaleTrades(selectedSymbol);
  }, [selectedSymbol]);

  useEffect(() => {
    if (lastMessage?.type === 'options_whale') {
      setWhaleTrades(prev => [lastMessage.data, ...prev.slice(0, 99)]); // Keep last 100 trades
    }
  }, [lastMessage]);

  const loadWhaleTrades = async (symbol: string) => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await apiService.getOptionsTrades(symbol, 1);
      setWhaleTrades(response.trades);

      // Subscribe to real-time whale trades for this symbol
      sendMessage({
        type: 'subscribe',
        data: { channel: 'options_whale', symbol }
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
          />
        </div>
      </div>
    </div>
  );
};
