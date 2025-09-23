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
      console.log(`📊 Subscribing to chart data for ${symbol}`);
      sendMessage({
        type: 'subscribe',
        data: { channel: 'chart_quote', symbol },
        timestamp: new Date().toISOString(),
      });
    } else {
      console.log(`⚠️ Cannot subscribe to chart data: enabled=${isEnabled}, connected=${isConnected}`);
    }
  }, [sendMessage, symbol, isConnected, isEnabled]);

  // Unsubscribe from chart data
  const unsubscribeFromChartData = useCallback(() => {
    if (isEnabled && isConnected) {
      console.log(`📊 Unsubscribing from chart data for ${symbol}`);
      sendMessage({
        type: 'unsubscribe',
        data: { channel: 'chart_quote', symbol },
        timestamp: new Date().toISOString(),
      });
    } else {
      console.log(`⚠️ Cannot unsubscribe from chart data: enabled=${isEnabled}, connected=${isConnected}`);
    }
  }, [sendMessage, symbol, isConnected, isEnabled]);

  // Process incoming messages
  useEffect(() => {
    if (isEnabled && lastMessage) {
      console.log('📥 WebSocket message received:', lastMessage);

      // Check if this is a chart_quote message
      if (lastMessage.type === 'chart_quote') {
        const chartData = lastMessage.data as { symbol: string; bar: AlpacaBar };
        console.log('📊 Chart data received:', chartData);

        if (chartData.symbol === symbol) {
          handleChartData(chartData.bar);
        } else {
          console.log(`⚠️ Chart data symbol mismatch: expected ${symbol}, got ${chartData.symbol}`);
        }
      } else if (lastMessage.type === 'subscription_confirmed') {
        console.log('✅ Subscription confirmed:', lastMessage.data);
      } else if (lastMessage.type === 'unsubscription_confirmed') {
        console.log('✅ Unsubscription confirmed:', lastMessage.data);
      } else if (lastMessage.type === 'error') {
        console.error('❌ WebSocket error:', lastMessage.data);
      } else {
        console.log('📥 Other WebSocket message:', lastMessage.type, lastMessage.data);
      }
    }
  }, [lastMessage, symbol, handleChartData, isEnabled]);

  return {
    subscribeToChartData,
    unsubscribeFromChartData,
    isConnected,
  };
};
