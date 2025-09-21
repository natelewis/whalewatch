import { useCallback, useEffect } from 'react';
import { useWebSocket } from './useWebSocket';
import { AlpacaBar } from '../types';

interface UseChartWebSocketProps {
  symbol: string;
  onChartData?: (bar: AlpacaBar) => void;
  isEnabled?: boolean;
}

interface UseChartWebSocketReturn {
  subscribeToChartData: () => void;
  unsubscribeFromChartData: () => void;
  isConnected: boolean;
}

export const useChartWebSocket = ({
  symbol,
  onChartData,
  isEnabled = true,
}: UseChartWebSocketProps): UseChartWebSocketReturn => {
  const { lastMessage, sendMessage, isConnected } = useWebSocket();

  // Handle incoming chart data messages
  const handleChartData = useCallback(
    (bar: AlpacaBar) => {
      if (onChartData) {
        onChartData(bar);
      }
    },
    [onChartData]
  );

  // Subscribe to chart data for the current symbol
  const subscribeToChartData = useCallback(() => {
    if (isEnabled && isConnected) {
      sendMessage({
        type: 'subscribe',
        data: { channel: 'chart_quote', symbol },
      });
    }
  }, [sendMessage, symbol, isConnected, isEnabled]);

  // Unsubscribe from chart data
  const unsubscribeFromChartData = useCallback(() => {
    if (isEnabled && isConnected) {
      sendMessage({
        type: 'unsubscribe',
        data: { channel: 'chart_quote', symbol },
      });
    }
  }, [sendMessage, symbol, isConnected, isEnabled]);

  // Process incoming messages
  useEffect(() => {
    if (isEnabled && lastMessage?.type === 'chart_quote') {
      const chartData = lastMessage.data as { symbol: string; bar: AlpacaBar };
      if (chartData.symbol === symbol) {
        handleChartData(chartData.bar);
      }
    }
  }, [lastMessage, symbol, handleChartData, isEnabled]);

  return {
    subscribeToChartData,
    unsubscribeFromChartData,
    isConnected,
  };
};
