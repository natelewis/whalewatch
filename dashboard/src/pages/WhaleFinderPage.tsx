import React, { useState, useEffect } from 'react';
import { AlpacaOptionsContract } from '../types';
import { apiService } from '../services/apiService';
import { useWebSocket } from '../hooks/useWebSocket';
import { WhaleWatchFeed } from '../components/WhaleWatchFeed';
import { PageHeader } from '../components/PageHeader';

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
      const contractData = lastMessage.data as AlpacaOptionsContract;
      setOptionsContracts((prev) => [contractData, ...prev.slice(0, 99)]); // Keep last 100 contracts
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
        timestamp: new Date().toISOString(),
      });
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error &&
        'response' in err &&
        typeof err.response === 'object' &&
        err.response !== null &&
        'data' in err.response &&
        typeof err.response.data === 'object' &&
        err.response.data !== null &&
        'error' in err.response.data &&
        typeof err.response.data.error === 'string'
          ? err.response.data.error
          : 'Failed to load options contracts';
      setError(errorMessage);
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
      <PageHeader
        title="Options Contracts"
        subtitle="Browse available options contracts for any symbol"
        selectedSymbol={selectedSymbol}
        onSymbolChange={handleSymbolChange}
      />

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
            showTickerSelector={false}
          />
        </div>
      </div>
    </div>
  );
};
