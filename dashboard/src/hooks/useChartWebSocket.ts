import { useCallback, useEffect } from 'react';
import { useWebSocket } from './useWebSocket';
import { AlpacaBar } from '../types';

interface UseChartWebSocketProps {
  symbol: string;
  onChartData?: (bar: AlpacaBar) => void;
}

interface UseChartWebSocketReturn {
  subscribeToChartData: () => void;
  unsubscribeFromChartData: () => void;
  isConnected: boolean;
}

export const useChartWebSocket = ({
  symbol,
  onChartData,
}: UseChartWebSocketProps): UseChartWebSocketReturn => {
  const { lastMessage, sendMessage, isConnected } = useWebSocket();

  // Handle incoming chart data messages
  const handleChartData = useCallback((bar: AlpacaBar) => {
    if (onChartData) {
      onChartData(bar);
    }
  }, [onChartData]);

  // Subscribe to chart data for the current symbol
  const subscribeToChartData = useCallback(() => {
    if (isConnected) {
      sendMessage({
        type: 'subscribe',
        data: { channel: 'chart_quote', symbol },
      });
    }
  }, [sendMessage, symbol, isConnected]);

  // Unsubscribe from chart data
  const unsubscribeFromChartData = useCallback(() => {
    if (isConnected) {
      sendMessage({
        type: 'unsubscribe',
        data: { channel: 'chart_quote', symbol },
      });
    }
  }, [sendMessage, symbol, isConnected]);

  // Process incoming messages
  useEffect(() => {
    if (lastMessage?.type === 'chart_quote' && lastMessage.data.symbol === symbol) {
      handleChartData(lastMessage.data.bar);
    }
  }, [lastMessage, symbol, handleChartData]);

  return {
    subscribeToChartData,
    unsubscribeFromChartData,
    isConnected,
  };
};
