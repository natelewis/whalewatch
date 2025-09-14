import React, { useState, useEffect } from 'react';
import { AlpacaOptionsContract } from '../types';
import { apiService } from '../services/apiService';
import { useWebSocket } from '../hooks/useWebSocket';
import { WhaleWatchFeed } from '../components/WhaleWatchFeed';

export const WhaleFinderPage: React.FC = () => {
  const [selectedSymbol, setSelectedSymbol] = useState<string>('TSLA');
  const [optionsContracts, setOptionsContracts] = useState<AlpacaOptionsContract[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasRealTimeData, setHasRealTimeData] = useState<boolean>(false);

  // WebSocket for real-time options contracts
  const { lastMessage, sendMessage, isConnected } = useWebSocket();

  useEffect(() => {
    loadOptionsContracts(selectedSymbol);
  }, [selectedSymbol]);

  useEffect(() => {
    if (lastMessage?.type === 'options_contract') {
      setOptionsContracts((prev) => [lastMessage.data, ...prev.slice(0, 99)]); // Keep last 100 contracts
      setHasRealTimeData(true);
    }
  }, [lastMessage]);

  const loadOptionsContracts = async (symbol: string) => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await apiService.getOptionsContracts(symbol);
      setOptionsContracts(response.contracts);

      // Subscribe to real-time options contracts for this symbol
      sendMessage({
        type: 'subscribe',
        data: { channel: 'options_contract', symbol },
      });
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load options contracts');
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
          <h1 className="text-3xl font-bold text-foreground">Options Contracts</h1>
          <p className="text-muted-foreground">Browse available options contracts for any symbol</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="h-[calc(100vh-200px)]">
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-foreground">Options Contracts Feed</h2>
          <WhaleWatchFeed
            contracts={optionsContracts}
            selectedSymbol={selectedSymbol}
            onSymbolChange={handleSymbolChange}
            isLoading={isLoading}
            error={error}
            isConnected={isConnected}
            hasRealTimeData={hasRealTimeData}
          />
        </div>
      </div>
    </div>
  );
};
