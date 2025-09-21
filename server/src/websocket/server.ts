import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { IncomingMessage } from 'http';
import jwt from 'jsonwebtoken';
import { JWTPayload, WebSocketMessage, WebSocketMessageData } from '../types';
import { questdbWebSocketService } from '../services/questdbWebSocketService';

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
      sendMessage(ws, { type: 'pong', data: {}, timestamp: new Date().toISOString() });
      break;
    default:
      sendError(ws, 'Unknown message type');
  }
};

const handleSubscription = (
  ws: AuthenticatedWebSocket,
  data: { channel: string; symbol?: string }
): void => {
  const { channel, symbol } = data;

  if (!channel) {
    sendError(ws, 'Channel is required for subscription');
    return;
  }

  const subscriptionKey = symbol ? `${channel}:${symbol}` : channel;
  ws.subscriptions.add(subscriptionKey);

  console.log(`User subscribed to: ${subscriptionKey}`);

  // Subscribe to QuestDB WebSocket for real-time data
  if (symbol) {
    switch (channel) {
      case 'options_whale':
        questdbWebSocketService.subscribe({
          type: 'option_trades',
          underlying_ticker: symbol,
        });
        break;
      case 'account_quote':
        questdbWebSocketService.subscribe({
          type: 'stock_trades',
          symbol: symbol,
        });
        break;
      case 'chart_quote':
        console.log(`📊 Client subscribing to chart data for ${symbol}`);
        questdbWebSocketService.subscribe({
          type: 'stock_aggregates',
          symbol: symbol,
        });
        break;
    }
  }

  sendMessage(ws, {
    type: 'subscription_confirmed',
    data: { channel, symbol },
    timestamp: new Date().toISOString(),
  });
};

const handleUnsubscription = (
  ws: AuthenticatedWebSocket,
  data: { channel: string; symbol?: string }
): void => {
  const { channel, symbol } = data;

  if (!channel) {
    sendError(ws, 'Channel is required for unsubscription');
    return;
  }

  const subscriptionKey = symbol ? `${channel}:${symbol}` : channel;
  ws.subscriptions.delete(subscriptionKey);

  console.log(`User unsubscribed from: ${subscriptionKey}`);

  // Unsubscribe from QuestDB WebSocket
  if (symbol) {
    switch (channel) {
      case 'options_whale':
        questdbWebSocketService.unsubscribe({
          type: 'option_trades',
          underlying_ticker: symbol,
        });
        break;
      case 'account_quote':
        questdbWebSocketService.unsubscribe({
          type: 'stock_trades',
          symbol: symbol,
        });
        break;
      case 'chart_quote':
        questdbWebSocketService.unsubscribe({
          type: 'stock_aggregates',
          symbol: symbol,
        });
        break;
    }
  }

  sendMessage(ws, {
    type: 'unsubscription_confirmed',
    data: { channel, symbol },
    timestamp: new Date().toISOString(),
  });
};

const initializeQuestDBConnection = (wss: WebSocketServer): void => {
  // Start QuestDB streaming
  questdbWebSocketService.startStreaming().catch((error) => {
    console.error('Failed to start QuestDB streaming:', error);
  });

  // Handle real-time option trades from QuestDB
  questdbWebSocketService.on('option_trade', (message) => {
    console.log('✅ Broadcasting option trade from QuestDB:', {
      symbol: message.symbol,
      underlying_ticker: message.underlying_ticker,
      price: message.data.price,
      size: message.data.size,
    });
    broadcastToSubscribers(wss, 'options_whale', message.data, message.underlying_ticker);
  });

  // Handle real-time stock trades from QuestDB
  questdbWebSocketService.on('stock_trade', (message) => {
    console.log('✅ Broadcasting stock trade from QuestDB:', {
      symbol: message.symbol,
      price: message.data.price,
      size: message.data.size,
    });
    broadcastToSubscribers(
      wss,
      'account_quote',
      {
        symbol: message.symbol,
        price: message.data.price,
        timestamp: message.data.timestamp,
      },
      message.symbol
    );
  });

  // Handle real-time stock aggregates from QuestDB
  questdbWebSocketService.on('stock_aggregate', (message) => {
    console.log('✅ Broadcasting stock aggregate from QuestDB:', {
      symbol: message.symbol,
      close: message.data.close,
      volume: message.data.volume,
      timestamp: message.data.timestamp,
    });

    const barData = {
      symbol: message.symbol,
      bar: {
        t: message.data.timestamp,
        o: message.data.open,
        h: message.data.high,
        l: message.data.low,
        c: message.data.close,
        v: message.data.volume,
        n: message.data.transaction_count,
        vw: message.data.vwap,
      },
    };

    console.log('📡 Broadcasting to chart_quote subscribers:', barData);
    broadcastToSubscribers(wss, 'chart_quote', barData, message.symbol);
  });

  // Handle errors from QuestDB WebSocket
  questdbWebSocketService.on('error', (error) => {
    console.error('❌ QuestDB WebSocket error:', error.message);
    // Don't broadcast errors to clients, just log them
  });

  // Handle QuestDB connection events
  questdbWebSocketService.on('connected', () => {
    console.log('✅ QuestDB streaming started - real-time data available');
  });

  questdbWebSocketService.on('disconnected', () => {
    console.log('❌ QuestDB streaming stopped');
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

  wss.clients.forEach((client) => {
    const authenticatedClient = client as AuthenticatedWebSocket;
    if (client.readyState === WebSocket.OPEN) {
      const subscriptionKey = symbol ? `${channel}:${symbol}` : channel;

      if (
        authenticatedClient.subscriptions.has(subscriptionKey) ||
        authenticatedClient.subscriptions.has(channel)
      ) {
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
