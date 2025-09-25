import React, { useState, useEffect } from 'react';
import { AlpacaOptionsContract } from '../types';
import { apiService } from '../services/apiService';
import { useWebSocketContext } from '../hooks/useWebSocketContext';
import { WhaleWatchFeed } from '../components/WhaleWatchFeed';
import { PageHeader } from '../components/PageHeader';
import { safeCallAsync, createUserFriendlyMessage } from '@whalewatch/shared';
import { logger } from '../utils/logger';

export const WhaleFinderPage: React.FC = () => {
  const [selectedSymbol, setSelectedSymbol] = useState<string>('TSLA');
  const [optionsContracts, setOptionsContracts] = useState<AlpacaOptionsContract[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasRealTimeData, setHasRealTimeData] = useState<boolean>(false);

  // WebSocket for real-time options contracts
  const { lastMessage, sendMessage, isConnected } = useWebSocketContext();

  useEffect(() => {
    loadOptionsContracts(selectedSymbol);
  }, [selectedSymbol]);

  // Resubscribe when WebSocket reconnects
  useEffect(() => {
    if (isConnected && selectedSymbol) {
      logger.chart.loading(`WebSocket reconnected, resubscribing to options contracts for ${selectedSymbol}`);
      sendMessage({
        type: 'subscribe',
        data: { channel: 'options_contract', symbol: selectedSymbol },
        timestamp: new Date().toISOString(),
      });
    }
  }, [isConnected, selectedSymbol, sendMessage]);

  useEffect(() => {
    if (lastMessage?.type === 'options_contract') {
      const contractData = lastMessage.data as AlpacaOptionsContract;
      setOptionsContracts(prev => [contractData, ...prev.slice(0, 99)]); // Keep last 100 contracts
      setHasRealTimeData(true);
    }
  }, [lastMessage]);

  const loadOptionsContracts = async (symbol: string) => {
    setIsLoading(true);
    setError(null);

    const result = await safeCallAsync(async () => {
      return apiService.getOptionsContracts(symbol);
    });

    if (result.isOk()) {
      setOptionsContracts(result.value.contracts);

      // Subscribe to real-time options contracts for this symbol
      sendMessage({
        type: 'subscribe',
        data: { channel: 'options_contract', symbol },
        timestamp: new Date().toISOString(),
      });
    } else {
      const userMessage = createUserFriendlyMessage(result.error);
      setError(userMessage);
    }

    setIsLoading(false);
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
