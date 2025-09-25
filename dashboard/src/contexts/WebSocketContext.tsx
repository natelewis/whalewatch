import React, { ReactNode } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';
import { WebSocketContext } from './WebSocketContextDefinition';

interface WebSocketProviderProps {
  children: ReactNode;
}

export const WebSocketProvider: React.FC<WebSocketProviderProps> = ({ children }) => {
  const websocket = useWebSocket();

  return <WebSocketContext.Provider value={websocket}>{children}</WebSocketContext.Provider>;
};
