import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { IncomingMessage } from 'http';
import jwt from 'jsonwebtoken';
import { setupWebSocketServer } from '../../websocket/server';
import { questdbWebSocketService } from '../../services/questdbWebSocketService';
import { JWTPayload, WebSocketMessage } from '../../types';

// Mock dependencies
jest.mock('ws');
jest.mock('jsonwebtoken');
jest.mock('../../services/questdbWebSocketService', () => ({
  questdbWebSocketService: {
    startStreaming: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
    subscribe: jest.fn(),
    unsubscribe: jest.fn(),
  },
}));

const MockedWebSocketServer = WebSocketServer as jest.MockedClass<typeof WebSocketServer>;
const mockedJwt = jwt as jest.Mocked<typeof jwt>;
const mockedQuestdbWebSocketService = questdbWebSocketService as jest.Mocked<typeof questdbWebSocketService>;

// Mock WebSocket class
class MockWebSocket extends EventTarget {
  public readyState = WebSocket.OPEN;
  public subscriptions = new Set<string>();
  public user?: JWTPayload;
  public send = jest.fn();
  public close = jest.fn();
  public on = jest.fn();
  public addEventListener = jest.fn();
  public removeEventListener = jest.fn();
}

// Mock IncomingMessage
const createMockRequest = (url?: string): IncomingMessage =>
  ({
    url,
  } as IncomingMessage);

describe('WebSocket Server', () => {
  let mockServer: Server;
  let mockWss: jest.Mocked<WebSocketServer>;
  let mockWs: MockWebSocket;
  let mockReq: IncomingMessage;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mocks
    mockServer = {} as Server;
    mockWs = new MockWebSocket();
    mockReq = createMockRequest();

    // Mock WebSocketServer constructor and methods
    mockWss = {
      on: jest.fn(),
      clients: new Set([mockWs as unknown as WebSocket]),
    } as unknown as jest.Mocked<WebSocketServer>;

    MockedWebSocketServer.mockImplementation(() => mockWss);

    // Mock environment variable
    process.env.JWT_SECRET = 'test-secret';

    // Mock console methods to avoid noise in tests
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('setupWebSocketServer', () => {
    it('should create WebSocketServer with correct configuration', () => {
      setupWebSocketServer(mockServer);

      expect(MockedWebSocketServer).toHaveBeenCalledWith({
        server: mockServer,
        path: '/ws',
      });
    });

    it('should set up connection event handler', () => {
      setupWebSocketServer(mockServer);

      expect(mockWss.on).toHaveBeenCalledWith('connection', expect.any(Function));
    });

    it('should initialize QuestDB connection', () => {
      setupWebSocketServer(mockServer);

      expect(mockedQuestdbWebSocketService.startStreaming).toHaveBeenCalled();
    });
  });

  describe('WebSocket Connection Handling', () => {
    let connectionHandler: (ws: WebSocket, req: IncomingMessage) => void;

    beforeEach(() => {
      setupWebSocketServer(mockServer);
      connectionHandler = mockWss.on.mock.calls.find(call => call[0] === 'connection')?.[1] as (
        ws: WebSocket,
        req: IncomingMessage
      ) => void;
    });

    it('should initialize subscriptions on connection', () => {
      connectionHandler(mockWs as unknown as WebSocket, mockReq);

      expect(mockWs.subscriptions).toBeDefined();
      expect(mockWs.subscriptions.size).toBe(0);
    });

    it('should authenticate user with valid token', () => {
      const mockUser: JWTPayload = {
        userId: 'user123',
        email: 'test@example.com',
        iat: 1234567890,
        exp: 1234567890,
      };

      mockReq.url = '/ws?token=valid-token';
      mockedJwt.verify.mockReturnValue(mockUser as any);

      connectionHandler(mockWs as unknown as WebSocket, mockReq);

      expect(mockedJwt.verify).toHaveBeenCalledWith('valid-token', 'test-secret');
      expect(mockWs.user).toEqual(mockUser);
    });

    it('should close connection on authentication failure', () => {
      mockReq.url = '/ws?token=invalid-token';
      mockedJwt.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      connectionHandler(mockWs as unknown as WebSocket, mockReq);

      expect(mockWs.close).toHaveBeenCalledWith(1008, 'Authentication failed');
    });

    it('should close connection when JWT_SECRET is not configured', () => {
      delete process.env.JWT_SECRET;
      mockReq.url = '/ws?token=some-token';

      connectionHandler(mockWs as unknown as WebSocket, mockReq);

      expect(mockWs.close).toHaveBeenCalledWith(1008, 'Authentication failed');
    });

    it('should allow connection without token', () => {
      mockReq.url = '/ws';

      connectionHandler(mockWs as unknown as WebSocket, mockReq);

      expect(mockWs.close).not.toHaveBeenCalled();
      expect(mockWs.user).toBeUndefined();
    });

    it('should set up message handler', () => {
      connectionHandler(mockWs as unknown as WebSocket, mockReq);

      expect(mockWs.on).toHaveBeenCalledWith('message', expect.any(Function));
    });

    it('should set up close handler', () => {
      connectionHandler(mockWs as unknown as WebSocket, mockReq);

      expect(mockWs.on).toHaveBeenCalledWith('close', expect.any(Function));
    });

    it('should set up error handler', () => {
      connectionHandler(mockWs as unknown as WebSocket, mockReq);

      expect(mockWs.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('should send welcome message on connection', () => {
      connectionHandler(mockWs as unknown as WebSocket, mockReq);

      expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('"type":"connection"'));
    });
  });

  describe('Message Handling', () => {
    let messageHandler: (data: Buffer) => void;
    let connectionHandler: (ws: WebSocket, req: IncomingMessage) => void;

    beforeEach(() => {
      setupWebSocketServer(mockServer);
      connectionHandler = mockWss.on.mock.calls.find(call => call[0] === 'connection')?.[1] as (
        ws: WebSocket,
        req: IncomingMessage
      ) => void;

      connectionHandler(mockWs as unknown as WebSocket, mockReq);

      messageHandler = mockWs.on.mock.calls.find(call => call[0] === 'message')?.[1] as (data: Buffer) => void;
    });

    it('should handle subscribe message with single symbol', () => {
      const message: WebSocketMessage = {
        type: 'subscribe',
        data: { channel: 'options_whale', symbol: 'AAPL' },
        timestamp: new Date().toISOString(),
      };

      messageHandler(Buffer.from(JSON.stringify(message)));

      expect(mockWs.subscriptions.has('options_whale:AAPL')).toBe(true);
      expect(mockedQuestdbWebSocketService.subscribe).toHaveBeenCalledWith({
        type: 'option_trades',
        underlying_ticker: 'AAPL',
      });
    });

    it('should handle subscribe message with multiple symbols', () => {
      const message: WebSocketMessage = {
        type: 'subscribe',
        data: { channel: 'chart_quote', symbols: ['AAPL', 'GOOGL'] },
        timestamp: new Date().toISOString(),
      };

      messageHandler(Buffer.from(JSON.stringify(message)));

      expect(mockWs.subscriptions.has('chart_quote:AAPL')).toBe(true);
      expect(mockWs.subscriptions.has('chart_quote:GOOGL')).toBe(true);
      expect(mockedQuestdbWebSocketService.subscribe).toHaveBeenCalledTimes(2);
    });

    it('should handle subscribe message without symbols', () => {
      const message: WebSocketMessage = {
        type: 'subscribe',
        data: { channel: 'general' },
        timestamp: new Date().toISOString(),
      };

      messageHandler(Buffer.from(JSON.stringify(message)));

      expect(mockWs.subscriptions.has('general')).toBe(true);
      expect(mockedQuestdbWebSocketService.subscribe).not.toHaveBeenCalled();
    });

    it('should handle unsubscribe message', () => {
      // First subscribe
      const subscribeMessage: WebSocketMessage = {
        type: 'subscribe',
        data: { channel: 'options_whale', symbol: 'AAPL' },
        timestamp: new Date().toISOString(),
      };
      messageHandler(Buffer.from(JSON.stringify(subscribeMessage)));

      // Then unsubscribe
      const unsubscribeMessage: WebSocketMessage = {
        type: 'unsubscribe',
        data: { channel: 'options_whale', symbol: 'AAPL' },
        timestamp: new Date().toISOString(),
      };
      messageHandler(Buffer.from(JSON.stringify(unsubscribeMessage)));

      expect(mockWs.subscriptions.has('options_whale:AAPL')).toBe(false);
      expect(mockedQuestdbWebSocketService.unsubscribe).toHaveBeenCalledWith({
        type: 'option_trades',
        underlying_ticker: 'AAPL',
      });
    });

    it('should handle ping message with pong response', () => {
      const message: WebSocketMessage = {
        type: 'ping',
        data: {},
        timestamp: new Date().toISOString(),
      };

      messageHandler(Buffer.from(JSON.stringify(message)));

      expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('"type":"pong"'));
    });

    it('should send error for unknown message type', () => {
      const message = {
        type: 'unknown_type',
        data: {},
        timestamp: new Date().toISOString(),
      };

      messageHandler(Buffer.from(JSON.stringify(message)));

      expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('"type":"error"'));
    });

    it('should send error for invalid subscription data', () => {
      const message = {
        type: 'subscribe',
        data: 'invalid_data',
        timestamp: new Date().toISOString(),
      };

      messageHandler(Buffer.from(JSON.stringify(message)));

      expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('"type":"error"'));
    });

    it('should send error for invalid unsubscription data', () => {
      const message = {
        type: 'unsubscribe',
        data: 'invalid_data',
        timestamp: new Date().toISOString(),
      };

      messageHandler(Buffer.from(JSON.stringify(message)));

      expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('"type":"error"'));
    });

    it('should handle malformed JSON message', () => {
      messageHandler(Buffer.from('invalid json'));

      expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('"type":"error"'));
    });
  });

  describe('Subscription Logic', () => {
    let messageHandler: (data: Buffer) => void;
    let connectionHandler: (ws: WebSocket, req: IncomingMessage) => void;

    beforeEach(() => {
      setupWebSocketServer(mockServer);
      connectionHandler = mockWss.on.mock.calls.find(call => call[0] === 'connection')?.[1] as (
        ws: WebSocket,
        req: IncomingMessage
      ) => void;

      connectionHandler(mockWs as unknown as WebSocket, mockReq);

      messageHandler = mockWs.on.mock.calls.find(call => call[0] === 'message')?.[1] as (data: Buffer) => void;
    });

    it('should subscribe to options_whale channel', () => {
      const message: WebSocketMessage = {
        type: 'subscribe',
        data: { channel: 'options_whale', symbol: 'AAPL' },
        timestamp: new Date().toISOString(),
      };

      messageHandler(Buffer.from(JSON.stringify(message)));

      expect(mockedQuestdbWebSocketService.subscribe).toHaveBeenCalledWith({
        type: 'option_trades',
        underlying_ticker: 'AAPL',
      });
    });

    it('should subscribe to account_quote channel', () => {
      const message: WebSocketMessage = {
        type: 'subscribe',
        data: { channel: 'account_quote', symbol: 'AAPL' },
        timestamp: new Date().toISOString(),
      };

      messageHandler(Buffer.from(JSON.stringify(message)));

      expect(mockedQuestdbWebSocketService.subscribe).toHaveBeenCalledWith({
        type: 'stock_trades',
        symbol: 'AAPL',
      });
    });

    it('should subscribe to chart_quote channel', () => {
      const message: WebSocketMessage = {
        type: 'subscribe',
        data: { channel: 'chart_quote', symbol: 'AAPL' },
        timestamp: new Date().toISOString(),
      };

      messageHandler(Buffer.from(JSON.stringify(message)));

      expect(mockedQuestdbWebSocketService.subscribe).toHaveBeenCalledWith({
        type: 'stock_aggregates',
        symbol: 'AAPL',
      });
    });

    it('should send error when channel is missing', () => {
      const message = {
        type: 'subscribe',
        data: { symbol: 'AAPL' },
        timestamp: new Date().toISOString(),
      };

      messageHandler(Buffer.from(JSON.stringify(message)));

      expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('"type":"error"'));
    });

    it('should send subscription confirmation', () => {
      const message: WebSocketMessage = {
        type: 'subscribe',
        data: { channel: 'options_whale', symbol: 'AAPL' },
        timestamp: new Date().toISOString(),
      };

      messageHandler(Buffer.from(JSON.stringify(message)));

      expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('"type":"subscription_confirmed"'));
    });

    it('should send unsubscription confirmation', () => {
      const message: WebSocketMessage = {
        type: 'unsubscribe',
        data: { channel: 'options_whale', symbol: 'AAPL' },
        timestamp: new Date().toISOString(),
      };

      messageHandler(Buffer.from(JSON.stringify(message)));

      expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('"type":"unsubscription_confirmed"'));
    });
  });

  describe('QuestDB Integration', () => {
    beforeEach(() => {
      setupWebSocketServer(mockServer);
    });

    it('should set up option_trade event handler', () => {
      expect(mockedQuestdbWebSocketService.on).toHaveBeenCalledWith('option_trade', expect.any(Function));
    });

    it('should set up stock_trade event handler', () => {
      expect(mockedQuestdbWebSocketService.on).toHaveBeenCalledWith('stock_trade', expect.any(Function));
    });

    it('should set up stock_aggregate event handler', () => {
      expect(mockedQuestdbWebSocketService.on).toHaveBeenCalledWith('stock_aggregate', expect.any(Function));
    });

    it('should set up error event handler', () => {
      expect(mockedQuestdbWebSocketService.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('should set up connected event handler', () => {
      expect(mockedQuestdbWebSocketService.on).toHaveBeenCalledWith('connected', expect.any(Function));
    });

    it('should set up disconnected event handler', () => {
      expect(mockedQuestdbWebSocketService.on).toHaveBeenCalledWith('disconnected', expect.any(Function));
    });
  });

  describe('Broadcasting', () => {
    let mockWs1: MockWebSocket;
    let mockWs2: MockWebSocket;
    let mockWs3: MockWebSocket;

    beforeEach(() => {
      mockWs1 = new MockWebSocket();
      mockWs2 = new MockWebSocket();
      mockWs3 = new MockWebSocket();

      // Setup different subscription states
      mockWs1.subscriptions.add('options_whale:AAPL');
      mockWs2.subscriptions.add('options_whale');
      mockWs3.subscriptions.add('chart_quote:AAPL');

      mockWss.clients = new Set([mockWs1, mockWs2, mockWs3] as unknown as Set<WebSocket>);

      setupWebSocketServer(mockServer);
    });

    it('should broadcast to subscribers with specific symbol subscription', () => {
      const optionTradeHandler = mockedQuestdbWebSocketService.on.mock.calls.find(
        call => call[0] === 'option_trade'
      )?.[1] as (message: any) => void;

      const message = {
        symbol: 'AAPL_OPTION',
        underlying_ticker: 'AAPL',
        data: { price: 150, size: 100 },
      };

      optionTradeHandler(message);

      expect(mockWs1.send).toHaveBeenCalled();
      expect(mockWs2.send).toHaveBeenCalled();
      expect(mockWs3.send).not.toHaveBeenCalled();
    });

    it('should broadcast to subscribers with channel subscription', () => {
      const stockTradeHandler = mockedQuestdbWebSocketService.on.mock.calls.find(
        call => call[0] === 'stock_trade'
      )?.[1] as (message: any) => void;

      const message = {
        symbol: 'AAPL',
        data: { price: 150, size: 100, timestamp: '2024-01-01T10:00:00Z' },
      };

      stockTradeHandler(message);

      // Only mockWs3 has chart_quote subscription, but this is stock_trade
      // So no clients should receive this message
      expect(mockWs1.send).not.toHaveBeenCalled();
      expect(mockWs2.send).not.toHaveBeenCalled();
      expect(mockWs3.send).not.toHaveBeenCalled();
    });

    it('should broadcast stock aggregates to chart subscribers', () => {
      const stockAggregateHandler = mockedQuestdbWebSocketService.on.mock.calls.find(
        call => call[0] === 'stock_aggregate'
      )?.[1] as (message: any) => void;

      const message = {
        symbol: 'AAPL',
        data: {
          timestamp: '2024-01-01T10:00:00Z',
          open: 100,
          high: 105,
          low: 99,
          close: 104,
          volume: 1000,
          transaction_count: 50,
          vwap: 102,
        },
      };

      stockAggregateHandler(message);

      expect(mockWs3.send).toHaveBeenCalled();
      expect(mockWs1.send).not.toHaveBeenCalled();
      expect(mockWs2.send).not.toHaveBeenCalled();
    });

    it('should not send to closed WebSocket connections', () => {
      mockWs1.readyState = WebSocket.CLOSED as any;

      const optionTradeHandler = mockedQuestdbWebSocketService.on.mock.calls.find(
        call => call[0] === 'option_trade'
      )?.[1] as (message: any) => void;

      const message = {
        symbol: 'AAPL_OPTION',
        underlying_ticker: 'AAPL',
        data: { price: 150, size: 100 },
      };

      optionTradeHandler(message);

      expect(mockWs1.send).not.toHaveBeenCalled();
      expect(mockWs2.send).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      setupWebSocketServer(mockServer);
    });

    it('should handle WebSocket errors gracefully', () => {
      // Setup connection first to get the error handler
      setupWebSocketServer(mockServer);
      const connectionHandler = mockWss.on.mock.calls.find(call => call[0] === 'connection')?.[1] as (
        ws: WebSocket,
        req: IncomingMessage
      ) => void;

      connectionHandler(mockWs as unknown as WebSocket, mockReq);

      const errorHandler = mockWs.on.mock.calls.find(call => call[0] === 'error')?.[1] as (error: Error) => void;

      const error = new Error('WebSocket error');
      errorHandler(error);

      // Should not throw, just log the error
      expect(console.error).toHaveBeenCalledWith('WebSocket error:', error);
    });

    it('should handle QuestDB streaming errors', () => {
      const errorHandler = mockedQuestdbWebSocketService.on.mock.calls.find(call => call[0] === 'error')?.[1] as (
        error: Error
      ) => void;

      const error = new Error('QuestDB connection failed');
      errorHandler(error);

      expect(console.error).toHaveBeenCalledWith('❌ QuestDB WebSocket error:', error.message);
    });

    it('should handle QuestDB streaming start failure', async () => {
      const startStreamingError = new Error('Failed to start streaming');
      mockedQuestdbWebSocketService.startStreaming.mockRejectedValue(startStreamingError);

      // Clear previous calls
      jest.clearAllMocks();

      setupWebSocketServer(mockServer);

      // Wait for the promise to resolve/reject
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(console.error).toHaveBeenCalledWith('Failed to start QuestDB streaming:', startStreamingError);
    });
  });

  describe('Connection Lifecycle', () => {
    beforeEach(() => {
      setupWebSocketServer(mockServer);
    });

    it('should log connection close with subscription count', () => {
      // Setup connection first to get the close handler
      const connectionHandler = mockWss.on.mock.calls.find(call => call[0] === 'connection')?.[1] as (
        ws: WebSocket,
        req: IncomingMessage
      ) => void;

      connectionHandler(mockWs as unknown as WebSocket, mockReq);

      mockWs.subscriptions.add('test:subscription');
      mockWs.user = { userId: 'user123', email: 'test@example.com' };

      const closeHandler = mockWs.on.mock.calls.find(call => call[0] === 'close')?.[1] as () => void;

      closeHandler();

      expect(console.log).toHaveBeenCalledWith(
        '🔌 WebSocket connection closed for test@example.com (had 1 subscriptions)'
      );
    });

    it('should log connection close for unauthenticated user', () => {
      // Setup connection first to get the close handler
      const connectionHandler = mockWss.on.mock.calls.find(call => call[0] === 'connection')?.[1] as (
        ws: WebSocket,
        req: IncomingMessage
      ) => void;

      connectionHandler(mockWs as unknown as WebSocket, mockReq);

      const closeHandler = mockWs.on.mock.calls.find(call => call[0] === 'close')?.[1] as () => void;

      closeHandler();

      expect(console.log).toHaveBeenCalledWith('🔌 WebSocket connection closed for unknown (had 0 subscriptions)');
    });

    it('should log QuestDB connection events', () => {
      const connectedHandler = mockedQuestdbWebSocketService.on.mock.calls.find(
        call => call[0] === 'connected'
      )?.[1] as () => void;

      const disconnectedHandler = mockedQuestdbWebSocketService.on.mock.calls.find(
        call => call[0] === 'disconnected'
      )?.[1] as () => void;

      connectedHandler();
      expect(console.log).toHaveBeenCalledWith('✅ QuestDB streaming started - real-time data available');

      disconnectedHandler();
      expect(console.log).toHaveBeenCalledWith('❌ QuestDB streaming stopped');
    });
  });

  describe('Message Format Validation', () => {
    let messageHandler: (data: Buffer) => void;
    let connectionHandler: (ws: WebSocket, req: IncomingMessage) => void;

    beforeEach(() => {
      setupWebSocketServer(mockServer);
      connectionHandler = mockWss.on.mock.calls.find(call => call[0] === 'connection')?.[1] as (
        ws: WebSocket,
        req: IncomingMessage
      ) => void;

      connectionHandler(mockWs as unknown as WebSocket, mockReq);

      messageHandler = mockWs.on.mock.calls.find(call => call[0] === 'message')?.[1] as (data: Buffer) => void;
    });

    it('should handle null data in subscription message', () => {
      const message = {
        type: 'subscribe',
        data: null,
        timestamp: new Date().toISOString(),
      };

      messageHandler(Buffer.from(JSON.stringify(message)));

      expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('"type":"error"'));
    });

    it('should handle undefined data in subscription message', () => {
      const message = {
        type: 'subscribe',
        timestamp: new Date().toISOString(),
      };

      messageHandler(Buffer.from(JSON.stringify(message)));

      expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('"type":"error"'));
    });

    it('should handle empty string data in subscription message', () => {
      const message = {
        type: 'subscribe',
        data: '',
        timestamp: new Date().toISOString(),
      };

      messageHandler(Buffer.from(JSON.stringify(message)));

      expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('"type":"error"'));
    });
  });
});
