import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { IncomingMessage } from 'http';
import jwt from 'jsonwebtoken';
import { JWTPayload, WebSocketMessage, OptionsWhaleMessage, AccountQuoteMessage, ChartQuoteMessage } from '../types';

interface AuthenticatedWebSocket extends WebSocket {
  user?: JWTPayload;
  subscriptions: Set<string>;
}

export const setupWebSocketServer = (server: Server): void => {
  const wss = new WebSocketServer({ 
    server,
    path: '/ws'
  });

  wss.on('connection', (ws: AuthenticatedWebSocket, req: IncomingMessage) => {
    console.log('New WebSocket connection');

    // Initialize subscriptions
    ws.subscriptions = new Set();

    // Handle authentication
    const token = req.url?.split('token=')[1];
    if (token) {
      try {
        const secret = process.env.JWT_SECRET;
        if (!secret) {
          throw new Error('JWT_SECRET not configured');
        }

        const decoded = jwt.verify(token, secret) as JWTPayload;
        ws.user = decoded;
        console.log(`Authenticated user: ${decoded.email}`);
      } catch (error) {
        console.error('WebSocket authentication failed:', error);
        ws.close(1008, 'Authentication failed');
        return;
      }
    }

    // Handle messages from client
    ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        handleClientMessage(ws, message);
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
        sendError(ws, 'Invalid message format');
      }
    });

    // Handle connection close
    ws.on('close', () => {
      console.log('WebSocket connection closed');
    });

    // Handle errors
    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });

    // Send welcome message
    sendMessage(ws, {
      type: 'connection',
      data: { message: 'Connected to WhaleWatch WebSocket' },
      timestamp: new Date().toISOString()
    });
  });

  // Start broadcasting mock data (in production, this would connect to real data feeds)
  startDataBroadcasting(wss);
};

const handleClientMessage = (ws: AuthenticatedWebSocket, message: any): void => {
  const { type, data } = message;

  switch (type) {
    case 'subscribe':
      handleSubscription(ws, data);
      break;
    case 'unsubscribe':
      handleUnsubscription(ws, data);
      break;
    case 'ping':
      sendMessage(ws, { type: 'pong', data: {}, timestamp: new Date().toISOString() });
      break;
    default:
      sendError(ws, 'Unknown message type');
  }
};

const handleSubscription = (ws: AuthenticatedWebSocket, data: any): void => {
  const { channel, symbol } = data;
  
  if (!channel) {
    sendError(ws, 'Channel is required for subscription');
    return;
  }

  const subscriptionKey = symbol ? `${channel}:${symbol}` : channel;
  ws.subscriptions.add(subscriptionKey);
  
  console.log(`User subscribed to: ${subscriptionKey}`);
  
  sendMessage(ws, {
    type: 'subscription_confirmed',
    data: { channel, symbol },
    timestamp: new Date().toISOString()
  });
};

const handleUnsubscription = (ws: AuthenticatedWebSocket, data: any): void => {
  const { channel, symbol } = data;
  
  if (!channel) {
    sendError(ws, 'Channel is required for unsubscription');
    return;
  }

  const subscriptionKey = symbol ? `${channel}:${symbol}` : channel;
  ws.subscriptions.delete(subscriptionKey);
  
  console.log(`User unsubscribed from: ${subscriptionKey}`);
  
  sendMessage(ws, {
    type: 'unsubscription_confirmed',
    data: { channel, symbol },
    timestamp: new Date().toISOString()
  });
};

const startDataBroadcasting = (wss: WebSocketServer): void => {
  // Mock options whale data
  setInterval(() => {
    const mockWhaleTrade = {
      id: `trade_${Date.now()}`,
      symbol: 'TSLA',
      timestamp: new Date().toISOString(),
      price: Math.random() * 100 + 50,
      size: Math.floor(Math.random() * 1000) + 100,
      side: Math.random() > 0.5 ? 'buy' : 'sell',
      conditions: ['regular'],
      exchange: 'OPRA',
      tape: 'C',
      contract: {
        symbol: 'TSLA240315C00150000',
        underlying_symbol: 'TSLA',
        exercise_style: 'american',
        expiration_date: '2024-03-15',
        strike_price: 150,
        option_type: 'call'
      }
    };

    broadcastToSubscribers(wss, 'options_whale', mockWhaleTrade);
  }, 5000); // Every 5 seconds

  // Mock account quote data
  setInterval(() => {
    const symbols = ['AAPL', 'TSLA', 'MSFT', 'GOOGL', 'AMZN'];
    const symbol = symbols[Math.floor(Math.random() * symbols.length)];
    
    const quote = {
      symbol,
      price: Math.random() * 200 + 50,
      timestamp: new Date().toISOString()
    };

    broadcastToSubscribers(wss, 'account_quote', quote, symbol);
  }, 2000); // Every 2 seconds

  // Mock chart quote data
  setInterval(() => {
    const symbols = ['AAPL', 'TSLA', 'MSFT', 'GOOGL', 'AMZN'];
    const symbol = symbols[Math.floor(Math.random() * symbols.length)];
    
    const bar = {
      t: new Date().toISOString(),
      o: Math.random() * 200 + 50,
      h: Math.random() * 200 + 50,
      l: Math.random() * 200 + 50,
      c: Math.random() * 200 + 50,
      v: Math.floor(Math.random() * 1000000) + 100000
    };

    broadcastToSubscribers(wss, 'chart_quote', { symbol, bar }, symbol);
  }, 1000); // Every second
};

const broadcastToSubscribers = (
  wss: WebSocketServer, 
  channel: string, 
  data: any, 
  symbol?: string
): void => {
  const message: WebSocketMessage = {
    type: channel as any,
    data,
    timestamp: new Date().toISOString()
  };

  wss.clients.forEach((client: AuthenticatedWebSocket) => {
    if (client.readyState === WebSocket.OPEN) {
      const subscriptionKey = symbol ? `${channel}:${symbol}` : channel;
      
      if (client.subscriptions.has(subscriptionKey) || client.subscriptions.has(channel)) {
        client.send(JSON.stringify(message));
      }
    }
  });
};

const sendMessage = (ws: AuthenticatedWebSocket, message: WebSocketMessage): void => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
};

const sendError = (ws: AuthenticatedWebSocket, message: string): void => {
  sendMessage(ws, {
    type: 'error',
    data: { message },
    timestamp: new Date().toISOString()
  });
};
