import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { IncomingMessage } from 'http';
import jwt from 'jsonwebtoken';
import { JWTPayload, WebSocketMessage, WebSocketMessageData } from '../types';
import { alpacaWebSocketService } from '../services/alpacaWebSocketService';

interface AuthenticatedWebSocket extends WebSocket {
  user?: JWTPayload;
  subscriptions: Set<string>;
}

export const setupWebSocketServer = (server: Server): void => {
  const wss = new WebSocketServer({
    server,
    path: '/ws',
  });

  wss.on('connection', (ws: AuthenticatedWebSocket, req: IncomingMessage) => {
    console.log('🔌 New WebSocket connection');

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
        console.log(`✅ Authenticated user: ${decoded.email}`);
      } catch (error) {
        console.error('❌ WebSocket authentication failed:', error);
        ws.close(1008, 'Authentication failed');
        return;
      }
    }

    // Handle messages from client
    ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        console.log(`📨 Received message from ${ws.user?.email || 'unknown'}:`, message.type, message.data);
        handleClientMessage(ws, message);
      } catch (error) {
        console.error('❌ Error parsing WebSocket message:', error);
        sendError(ws, 'Invalid message format');
      }
    });

    // Handle connection close
    ws.on('close', () => {
      console.log(
        `🔌 WebSocket connection closed for ${ws.user?.email || 'unknown'} (had ${ws.subscriptions.size} subscriptions)`
      );
    });

    // Handle errors
    ws.on('error', error => {
      console.error('WebSocket error:', error);
    });

    // Send welcome message
    sendMessage(ws, {
      type: 'connection',
      data: { message: 'Connected to WhaleWatch WebSocket' },
      timestamp: new Date().toISOString(),
    });
  });

  // Connect to QuestDB WebSocket for real-time data
  initializeQuestDBConnection(wss);
};

const handleClientMessage = (ws: AuthenticatedWebSocket, message: WebSocketMessage): void => {
  const { type, data } = message;

  switch (type) {
    case 'subscribe':
      if (typeof data === 'object' && data !== null && 'channel' in data) {
        handleSubscription(ws, data as { channel: string; symbol?: string });
      } else {
        sendError(ws, 'Invalid subscription data');
      }
      break;
    case 'unsubscribe':
      if (typeof data === 'object' && data !== null && 'channel' in data) {
        handleUnsubscription(ws, data as { channel: string; symbol?: string });
      } else {
        sendError(ws, 'Invalid unsubscription data');
      }
      break;
    case 'ping':
      sendMessage(ws, {
        type: 'pong',
        data: {},
        timestamp: new Date().toISOString(),
      });
      break;
    default:
      sendError(ws, 'Unknown message type');
  }
};

const handleSubscription = (
  ws: AuthenticatedWebSocket,
  data: { channel: string; symbol?: string; symbols?: string[] }
): void => {
  const { channel, symbol, symbols } = data;

  if (!channel) {
    sendError(ws, 'Channel is required for subscription');
    return;
  }

  // Handle both single symbol and array of symbols
  const symbolsToSubscribe = symbols || (symbol ? [symbol] : []);

  if (symbolsToSubscribe.length === 0) {
    // Subscribe to channel without specific symbols
    const subscriptionKey = channel;
    ws.subscriptions.add(subscriptionKey);
    console.log(`✅ User subscribed to: ${subscriptionKey} (Total subscriptions: ${ws.subscriptions.size})`);
  } else {
    // Subscribe to each symbol individually
    symbolsToSubscribe.forEach(sym => {
      const subscriptionKey = `${channel}:${sym}`;
      ws.subscriptions.add(subscriptionKey);

      // Subscribe to QuestDB WebSocket for real-time data
      switch (channel) {
        case 'chart_quote':
          console.log(`🔌 [WEBSOCKET] Subscribing to chart data for ${sym}`);
          alpacaWebSocketService.subscribe({
            type: 'chart_quote',
            symbol: sym,
          });
          break;
      }
    });

    console.log(
      `✅ User subscribed to: ${channel} for ${symbolsToSubscribe.length} symbols (Total subscriptions: ${ws.subscriptions.size})`
    );
  }

  sendMessage(ws, {
    type: 'subscription_confirmed',
    data: { channel, symbols: symbolsToSubscribe },
    timestamp: new Date().toISOString(),
  });
};

const handleUnsubscription = (
  ws: AuthenticatedWebSocket,
  data: { channel: string; symbol?: string; symbols?: string[] }
): void => {
  const { channel, symbol, symbols } = data;

  if (!channel) {
    sendError(ws, 'Channel is required for unsubscription');
    return;
  }

  // Handle both single symbol and array of symbols
  const symbolsToUnsubscribe = symbols || (symbol ? [symbol] : []);

  if (symbolsToUnsubscribe.length === 0) {
    // Unsubscribe from channel without specific symbols
    const subscriptionKey = channel;
    ws.subscriptions.delete(subscriptionKey);
    console.log(`User unsubscribed from: ${subscriptionKey}`);
  } else {
    // Unsubscribe from each symbol individually
    symbolsToUnsubscribe.forEach(sym => {
      const subscriptionKey = `${channel}:${sym}`;
      ws.subscriptions.delete(subscriptionKey);

      // Unsubscribe from QuestDB WebSocket
      switch (channel) {
        case 'chart_quote':
          alpacaWebSocketService.unsubscribe({
            type: 'chart_quote',
            symbol: sym,
          });
          break;
      }
    });

    console.log(`User unsubscribed from: ${channel} for ${symbolsToUnsubscribe.length} symbols`);
  }

  sendMessage(ws, {
    type: 'unsubscription_confirmed',
    data: { channel, symbols: symbolsToUnsubscribe },
    timestamp: new Date().toISOString(),
  });
};

const initializeQuestDBConnection = (wss: WebSocketServer): void => {
  // Start Alpaca streaming for chart data
  alpacaWebSocketService.startStreaming().catch(error => {
    console.error('Failed to start Alpaca streaming:', error);
  });

  // Handle real-time chart data from both Alpaca and Polygon
  alpacaWebSocketService.on('chart_quote', message => {
    const isOptionContract = message.symbol.startsWith('O:');
    const dataSource = isOptionContract ? 'Polygon' : 'Alpaca';

    console.log(`✅ [WEBSOCKET] Broadcasting chart data from ${dataSource}:`, {
      symbol: message.symbol,
      timestamp: message.data.t,
      open: message.data.o,
      high: message.data.h,
      low: message.data.l,
      close: message.data.c,
      volume: message.data.v,
      dataSource,
    });
    broadcastToSubscribers(
      wss,
      'chart_quote',
      {
        symbol: message.symbol,
        bar: message.data,
      },
      message.symbol
    );
  });

  // Handle errors from Alpaca WebSocket
  alpacaWebSocketService.on('error', error => {
    console.error('❌ Alpaca WebSocket error:', error.message);
    // Don't broadcast errors to clients, just log them
  });

  // Handle Alpaca connection events
  alpacaWebSocketService.on('connected', () => {
    console.log('✅ Alpaca streaming started - chart data available');
  });

  alpacaWebSocketService.on('disconnected', () => {
    console.log('❌ Alpaca streaming stopped');
  });
};

const broadcastToSubscribers = (
  wss: WebSocketServer,
  channel: string,
  data: WebSocketMessageData,
  symbol?: string
): void => {
  const message: WebSocketMessage = {
    type: channel as WebSocketMessage['type'],
    data,
    timestamp: new Date().toISOString(),
  };

  wss.clients.forEach(client => {
    const authenticatedClient = client as AuthenticatedWebSocket;
    if (client.readyState === WebSocket.OPEN) {
      const subscriptionKey = symbol ? `${channel}:${symbol}` : channel;

      if (authenticatedClient.subscriptions.has(subscriptionKey) || authenticatedClient.subscriptions.has(channel)) {
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
    timestamp: new Date().toISOString(),
  });
};
