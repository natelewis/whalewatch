import { useEffect, useRef, useState } from 'react';
import { WebSocketMessage } from '../types';
import { WS_BASE_URL } from '../constants';
import { safeCall } from '@whalewatch/shared';

interface UseWebSocketOptions {
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (error: Event) => void;
  onMessage?: (message: WebSocketMessage) => void;
}

export const useWebSocket = (options: UseWebSocketOptions = {}) => {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  // eslint-disable-next-line no-undef
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | undefined>();
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;

  const connect = () => {
    const token = localStorage.getItem('token');
    if (!token) {
      console.warn('WebSocket connection skipped: No authentication token found');
      return;
    }

    const wsUrl = `${WS_BASE_URL}/ws?token=${token}`;
    console.log('🔌 Attempting WebSocket connection to:', wsUrl);

    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('✅ WebSocket connected successfully');
      setIsConnected(true);
      reconnectAttempts.current = 0;
      options.onOpen?.();
    };

    ws.onclose = event => {
      console.log('❌ WebSocket disconnected:', event.code, event.reason);
      setIsConnected(false);
      options.onClose?.();

      // Attempt to reconnect
      if (reconnectAttempts.current < maxReconnectAttempts) {
        reconnectAttempts.current++;
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);

        reconnectTimeoutRef.current = setTimeout(() => {
          console.log(`🔄 Attempting to reconnect (${reconnectAttempts.current}/${maxReconnectAttempts})`);
          connect();
        }, delay);
      } else {
        console.error('❌ Max reconnection attempts reached');
      }
    };

    ws.onerror = error => {
      console.error('❌ WebSocket error:', error);
      options.onError?.(error);
    };

    ws.onmessage = event => {
      const result = safeCall(() => {
        return JSON.parse(event.data) as WebSocketMessage;
      });

      if (result.isOk()) {
        console.log('📥 WebSocket message received:', result.value);
        setLastMessage(result.value);
        options.onMessage?.(result.value);
      } else {
        console.error('❌ Error parsing WebSocket message:', result.error);
      }
    };

    setSocket(ws);
  };

  const disconnect = () => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    if (socket) {
      socket.close();
      setSocket(null);
    }
  };

  const sendMessage = (message: WebSocketMessage) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket is not connected');
    }
  };

  useEffect(() => {
    connect();

    return () => {
      disconnect();
    };
  }, []);

  return {
    socket,
    lastMessage,
    isConnected,
    sendMessage,
    connect,
    disconnect,
  };
};
