import { createContext } from 'react';
import { WebSocketMessage } from '../types';

export interface WebSocketContextType {
  socket: WebSocket | null;
  lastMessage: WebSocketMessage | null;
  isConnected: boolean;
  sendMessage: (message: WebSocketMessage) => void;
  connect: () => void;
  disconnect: () => void;
}

export const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);
