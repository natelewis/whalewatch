import React, { useState, useEffect } from 'react';
import { AlpacaOptionsContract } from '../types';
import { apiService } from '../services/apiService';
import { useWebSocket } from '../hooks/useWebSocket';
import { WhaleWatchFeed } from '../components/WhaleWatchFeed';
import StockChart from '../components/StockChart';
import { PageHeader } from '../components/PageHeader';
import { safeCallAsync, createUserFriendlyMessage } from '@whalewatch/shared';

export const WhaleWatchPage: React.FC = () => {
  const [selectedSymbol, setSelectedSymbol] = useState<string>('LLY');
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
        subtitle="Browse options contracts and analyze market movements"
        selectedSymbol={selectedSymbol}
        onSymbolChange={handleSymbolChange}
      />

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 h-[calc(100vh-200px)]">
        {/* Options Contracts Feed */}
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

        {/* Stock Chart */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-foreground">D3 Stock Chart</h2>
            <div className="text-sm text-muted-foreground">
              <span className="mr-4">🖱️ Drag to pan</span>
              <span className="mr-4">⌨️ Arrow keys to pan</span>
              <span className="mr-4">🏠 Home/End for edges</span>
              <span>🔄 Scroll to zoom</span>
            </div>
          </div>
          <StockChart symbol={selectedSymbol} onSymbolChange={handleSymbolChange} />
        </div>
      </div>
    </div>
  );
};
