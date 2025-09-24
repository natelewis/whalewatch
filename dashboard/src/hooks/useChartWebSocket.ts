import { useCallback, useEffect, useRef } from 'react';
import { useWebSocketContext } from '../contexts/WebSocketContext';
import { AlpacaBar } from '../types';
import { logger } from '../utils/logger';

interface UseChartWebSocketProps {
  symbol: string;
  onChartData?: (bar: AlpacaBar) => void;
}

interface UseChartWebSocketReturn {
  subscribeToChartData: () => void;
  unsubscribeFromChartData: () => void;
  isConnected: boolean;
}

export const useChartWebSocket = ({ symbol, onChartData }: UseChartWebSocketProps): UseChartWebSocketReturn => {
  const { lastMessage, sendMessage, isConnected } = useWebSocketContext();
  const processedMessageRef = useRef<string | null>(null);

  // Subscribe to chart data for the current symbol
  const subscribeToChartData = useCallback(() => {
    if (isConnected) {
      logger.chart.data(`Subscribing to chart data for ${symbol}`);
      sendMessage({
        type: 'subscribe',
        data: { channel: 'chart_quote', symbol },
        timestamp: new Date().toISOString(),
      });
    } else {
      logger.warn(`Cannot subscribe to chart data: connected=${isConnected}`);
    }
  }, [sendMessage, symbol, isConnected]);

  // Unsubscribe from chart data
  const unsubscribeFromChartData = useCallback(() => {
    if (isConnected) {
      logger.chart.data(`Unsubscribing from chart data for ${symbol}`);
      sendMessage({
        type: 'unsubscribe',
        data: { channel: 'chart_quote', symbol },
        timestamp: new Date().toISOString(),
      });
    } else {
      logger.warn(`Cannot unsubscribe from chart data: connected=${isConnected}`);
    }
  }, [sendMessage, symbol, isConnected]);

  // Process incoming messages
  useEffect(() => {
    if (lastMessage) {
      // Create a unique key for this message to prevent duplicate processing
      const messageKey = `${lastMessage.type}-${lastMessage.timestamp}-${JSON.stringify(lastMessage.data)}`;

      // Skip if we've already processed this exact message
      if (processedMessageRef.current === messageKey) {
        return;
      }

      processedMessageRef.current = messageKey;
      logger.chart.websocket('WebSocket message received:', lastMessage);

      // Check if this is a chart_quote message
      if (lastMessage.type === 'chart_quote') {
        const chartData = lastMessage.data as { symbol: string; bar: AlpacaBar };
        logger.chart.data('Chart data received:', chartData);

        if (chartData.symbol === symbol) {
          // Call onChartData directly to avoid dependency issues
          if (onChartData) {
            onChartData(chartData.bar);
          }
        } else {
          logger.warn(`Chart data symbol mismatch: expected ${symbol}, got ${chartData.symbol}`);
        }
      } else if (lastMessage.type === 'subscription_confirmed') {
        logger.chart.success('Subscription confirmed:', lastMessage.data);
      } else if (lastMessage.type === 'unsubscription_confirmed') {
        logger.chart.success('Unsubscription confirmed:', lastMessage.data);
      } else if (lastMessage.type === 'error') {
        console.error('❌ WebSocket error:', lastMessage.data);
      } else {
        logger.chart.websocket('Other WebSocket message:', lastMessage.type, lastMessage.data);
      }
    }
  }, [lastMessage, symbol, onChartData]);

  return {
    subscribeToChartData,
    unsubscribeFromChartData,
    isConnected,
  };
};
