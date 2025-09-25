import { useContext } from 'react';
import { WebSocketContext, WebSocketContextType } from '../contexts/WebSocketContextDefinition';

export const useWebSocketContext = (): WebSocketContextType => {
  const context = useContext(WebSocketContext);
  if (context === undefined) {
    throw new Error('useWebSocketContext must be used within a WebSocketProvider');
  }
  return context;
};
