import { QuestDBWebSocketService } from '../../services/questdbWebSocketService';
import { questdbService } from '../../services/questdbService';
import { QuestDBSubscription } from '../../types/questdb';

// Mock the questdbService
jest.mock('../../services/questdbService');
const mockedQuestdbService = questdbService as jest.Mocked<typeof questdbService>;

describe('QuestDBWebSocketService', () => {
  let service: QuestDBWebSocketService;
  let mockInterval: ReturnType<typeof setInterval>;
  let setIntervalSpy: jest.SpyInstance;

  beforeEach(() => {
    service = new QuestDBWebSocketService();
    jest.clearAllMocks();

    // Mock setInterval and clearInterval
    mockInterval = 12345 as any; // Use a mock timer ID instead of real setInterval
    setIntervalSpy = jest.spyOn(global, 'setInterval').mockReturnValue(mockInterval);
    jest.spyOn(global, 'clearInterval').mockImplementation();
  });

  afterEach(() => {
    // Ensure service is stopped to clean up any intervals
    service.stopStreaming();
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with correct default values', () => {
      expect(service.getStatus()).toEqual({
        isStreaming: false,
        subscriptionCount: 0,
        pollingIntervalMs: 10000,
      });
    });

    it('should extend EventEmitter', () => {
      expect(service.emit).toBeDefined();
      expect(service.on).toBeDefined();
      expect(service.off).toBeDefined();
    });
  });

  describe('startStreaming', () => {
    it('should start streaming successfully', async () => {
      const emitSpy = jest.spyOn(service, 'emit');

      await service.startStreaming();

      expect(service.getStatus().isStreaming).toBe(true);
      expect(global.setInterval).toHaveBeenCalledWith(expect.any(Function), 10000);
      expect(emitSpy).toHaveBeenCalledWith('connected');
    });

    it('should not start streaming if already streaming', async () => {
      await service.startStreaming();
      jest.clearAllMocks();

      await service.startStreaming();

      expect(global.setInterval).not.toHaveBeenCalled();
    });

    it('should handle polling errors and emit error event', async () => {
      const emitSpy = jest.spyOn(service, 'emit');
      const error = new Error('Polling error');

      // Mock pollForNewData to throw an error
      const pollForNewDataSpy = jest.spyOn(service as any, 'pollForNewData').mockRejectedValue(error);

      await service.startStreaming();

      // Manually trigger the interval callback to simulate the error
      const intervalCallback = setIntervalSpy.mock.calls[0][0];

      // Wrap the callback in a try-catch to handle the unhandled promise rejection
      try {
        await intervalCallback();
      } catch (e) {
        // Expected error, ignore
      }

      expect(pollForNewDataSpy).toHaveBeenCalled();
      expect(emitSpy).toHaveBeenCalledWith('error', error);
    });
  });

  describe('stopStreaming', () => {
    it('should stop streaming successfully', async () => {
      const emitSpy = jest.spyOn(service, 'emit');

      await service.startStreaming();
      service.stopStreaming();

      expect(service.getStatus().isStreaming).toBe(false);
      expect(global.clearInterval).toHaveBeenCalledWith(mockInterval);
      expect(emitSpy).toHaveBeenCalledWith('disconnected');
    });

    it('should do nothing if not streaming', () => {
      const emitSpy = jest.spyOn(service, 'emit');

      service.stopStreaming();

      expect(global.clearInterval).not.toHaveBeenCalled();
      expect(emitSpy).not.toHaveBeenCalled();
    });
  });

  describe('subscribe', () => {
    it('should subscribe to stock trades successfully', () => {
      const emitSpy = jest.spyOn(service, 'emit');
      const subscription: QuestDBSubscription = {
        type: 'stock_trades',
        symbol: 'AAPL',
      };

      service.subscribe(subscription);

      expect(emitSpy).toHaveBeenCalledWith('subscription_confirmed', { subscription });
      expect(service.getSubscriptions()).toContain(subscription);
    });

    it('should subscribe to option trades successfully', () => {
      const subscription: QuestDBSubscription = {
        type: 'option_trades',
        ticker: 'AAPL240315C00150000',
        underlying_ticker: 'AAPL',
      };

      service.subscribe(subscription);

      expect(service.getSubscriptions()).toContain(subscription);
    });

    it('should subscribe to option quotes successfully', () => {
      const subscription: QuestDBSubscription = {
        type: 'option_quotes',
        ticker: 'AAPL240315C00150000',
        underlying_ticker: 'AAPL',
      };

      service.subscribe(subscription);

      expect(service.getSubscriptions()).toContain(subscription);
    });

    it('should subscribe to stock aggregates successfully', () => {
      const subscription: QuestDBSubscription = {
        type: 'stock_aggregates',
        symbol: 'AAPL',
      };

      service.subscribe(subscription);

      expect(service.getSubscriptions()).toContain(subscription);
    });
  });

  describe('unsubscribe', () => {
    it('should unsubscribe successfully', () => {
      const emitSpy = jest.spyOn(service, 'emit');
      const subscription: QuestDBSubscription = {
        type: 'stock_trades',
        symbol: 'AAPL',
      };

      service.subscribe(subscription);
      service.unsubscribe(subscription);

      expect(emitSpy).toHaveBeenCalledWith('unsubscription_confirmed', { subscription });
      expect(service.getSubscriptions()).not.toContain(subscription);
    });

    it('should clear last timestamp when unsubscribing', () => {
      const subscription: QuestDBSubscription = {
        type: 'stock_trades',
        symbol: 'AAPL',
      };

      service.subscribe(subscription);
      // Manually set a timestamp
      (service as any).lastTimestamps.set('stock_trades|AAPL||', '2024-01-01T00:00:00Z');

      service.unsubscribe(subscription);

      expect((service as any).lastTimestamps.has('stock_trades|AAPL||')).toBe(false);
    });
  });

  describe('getSubscriptions', () => {
    it('should return empty array when no subscriptions', () => {
      expect(service.getSubscriptions()).toEqual([]);
    });

    it('should return all active subscriptions', () => {
      const subscription1: QuestDBSubscription = {
        type: 'stock_trades',
        symbol: 'AAPL',
      };
      const subscription2: QuestDBSubscription = {
        type: 'option_trades',
        ticker: 'AAPL240315C00150000',
        underlying_ticker: 'AAPL',
      };

      service.subscribe(subscription1);
      service.subscribe(subscription2);

      const subscriptions = service.getSubscriptions();
      expect(subscriptions).toHaveLength(2);
      expect(subscriptions).toContain(subscription1);
      expect(subscriptions).toContain(subscription2);
    });
  });

  describe('pollForNewData', () => {
    it('should skip polling when no subscriptions', async () => {
      await (service as any).pollForNewData();

      expect(mockedQuestdbService.getStockTrades).not.toHaveBeenCalled();
    });

    it('should poll all active subscriptions', async () => {
      const subscription: QuestDBSubscription = {
        type: 'stock_trades',
        symbol: 'AAPL',
      };

      service.subscribe(subscription);
      mockedQuestdbService.getStockTrades.mockResolvedValue([]);

      await (service as any).pollForNewData();

      expect(mockedQuestdbService.getStockTrades).toHaveBeenCalled();
    });

    it('should handle errors in individual subscription polling', async () => {
      const subscription: QuestDBSubscription = {
        type: 'stock_trades',
        symbol: 'AAPL',
      };

      service.subscribe(subscription);
      mockedQuestdbService.getStockTrades.mockRejectedValue(new Error('Database error'));

      await (service as any).pollForNewData();

      // Should not throw, but handle the error gracefully
      expect(mockedQuestdbService.getStockTrades).toHaveBeenCalled();
    });
  });

  describe('pollSubscriptionData', () => {
    it('should handle stock_trades subscription', async () => {
      const subscription: QuestDBSubscription = {
        type: 'stock_trades',
        symbol: 'AAPL',
      };
      const key = 'stock_trades|AAPL||';
      const lastTimestamp = '2024-01-01T00:00:00Z';

      // Set the last timestamp in the service
      (service as any).lastTimestamps.set(key, lastTimestamp);
      mockedQuestdbService.getStockTrades.mockResolvedValue([]);

      await (service as any).pollSubscriptionData(key, subscription);

      expect(mockedQuestdbService.getStockTrades).toHaveBeenCalledWith('AAPL', {
        start_time: lastTimestamp,
        end_time: expect.any(String),
        limit: 1000,
      });
    });

    it('should handle option_trades subscription', async () => {
      const subscription: QuestDBSubscription = {
        type: 'option_trades',
        ticker: 'AAPL240315C00150000',
        underlying_ticker: 'AAPL',
      };
      const key = 'option_trades||AAPL|AAPL240315C00150000';
      const lastTimestamp = '2024-01-01T00:00:00Z';

      // Set the last timestamp in the service
      (service as any).lastTimestamps.set(key, lastTimestamp);
      mockedQuestdbService.getOptionTrades.mockResolvedValue([]);

      await (service as any).pollSubscriptionData(key, subscription);

      expect(mockedQuestdbService.getOptionTrades).toHaveBeenCalledWith('AAPL240315C00150000', 'AAPL', {
        start_time: lastTimestamp,
        end_time: expect.any(String),
        limit: 1000,
      });
    });

    it('should handle option_quotes subscription', async () => {
      const subscription: QuestDBSubscription = {
        type: 'option_quotes',
        ticker: 'AAPL240315C00150000',
        underlying_ticker: 'AAPL',
      };
      const key = 'option_quotes||AAPL|AAPL240315C00150000';
      const lastTimestamp = '2024-01-01T00:00:00Z';

      // Set the last timestamp in the service
      (service as any).lastTimestamps.set(key, lastTimestamp);
      mockedQuestdbService.getOptionQuotes.mockResolvedValue([]);

      await (service as any).pollSubscriptionData(key, subscription);

      expect(mockedQuestdbService.getOptionQuotes).toHaveBeenCalledWith('AAPL240315C00150000', 'AAPL', {
        start_time: lastTimestamp,
        end_time: expect.any(String),
        limit: 1000,
      });
    });

    it('should handle stock_aggregates subscription', async () => {
      const subscription: QuestDBSubscription = {
        type: 'stock_aggregates',
        symbol: 'AAPL',
      };
      const key = 'stock_aggregates|AAPL||';

      mockedQuestdbService.getStockAggregates.mockResolvedValue([]);

      await (service as any).pollSubscriptionData(key, subscription);

      expect(mockedQuestdbService.getStockAggregates).toHaveBeenCalledWith('AAPL', {
        limit: 1,
        order_by: 'timestamp',
        order_direction: 'DESC',
      });
    });

    it('should handle unknown subscription type', async () => {
      const subscription = {
        type: 'unknown_type' as any,
        symbol: 'AAPL',
      };
      const key = 'unknown_type|AAPL||';

      await (service as any).pollSubscriptionData(key, subscription);

      // Should not throw, but handle gracefully
      expect(mockedQuestdbService.getStockTrades).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      const subscription: QuestDBSubscription = {
        type: 'stock_trades',
        symbol: 'AAPL',
      };
      const key = 'stock_trades|AAPL||';
      const error = new Error('Database error');

      mockedQuestdbService.getStockTrades.mockRejectedValue(error);

      // pollSubscriptionData catches errors and doesn't re-throw them
      await (service as any).pollSubscriptionData(key, subscription);

      // Should have attempted to call the service
      expect(mockedQuestdbService.getStockTrades).toHaveBeenCalled();
    });
  });

  describe('pollStockTrades', () => {
    it('should emit stock trade messages', async () => {
      const emitSpy = jest.spyOn(service, 'emit');
      const subscription: QuestDBSubscription = {
        type: 'stock_trades',
        symbol: 'AAPL',
      };
      const lastTimestamp = '2024-01-01T00:00:00Z';
      const currentTimestamp = '2024-01-01T01:00:00Z';

      const mockTrades = [
        {
          symbol: 'AAPL',
          timestamp: '2024-01-01T00:30:00Z',
          price: 150.0,
          size: 100,
          conditions: 'T',
          exchange: 1,
          tape: 1,
          trade_id: '12345',
        },
      ];

      mockedQuestdbService.getStockTrades.mockResolvedValue(mockTrades);

      await (service as any).pollStockTrades(subscription, lastTimestamp, currentTimestamp);

      expect(mockedQuestdbService.getStockTrades).toHaveBeenCalledWith('AAPL', {
        start_time: lastTimestamp,
        end_time: currentTimestamp,
        limit: 1000,
      });

      expect(emitSpy).toHaveBeenCalledWith('stock_trade', {
        type: 'stock_trade',
        data: mockTrades[0],
        timestamp: expect.any(String),
        symbol: 'AAPL',
      });
    });

    it('should skip trades that do not meet filter criteria', async () => {
      const emitSpy = jest.spyOn(service, 'emit');
      const subscription: QuestDBSubscription = {
        type: 'stock_trades',
        symbol: 'AAPL',
        filters: {
          min_price: 200,
          max_price: 300,
          min_size: 50,
          max_size: 200,
        },
      };
      const lastTimestamp = '2024-01-01T00:00:00Z';
      const currentTimestamp = '2024-01-01T01:00:00Z';

      const mockTrades = [
        {
          symbol: 'AAPL',
          timestamp: '2024-01-01T00:30:00Z',
          price: 150.0, // Below min_price
          size: 100,
          conditions: 'T',
          exchange: 1,
          tape: 1,
          trade_id: '12345',
        },
        {
          symbol: 'AAPL',
          timestamp: '2024-01-01T00:31:00Z',
          price: 250.0, // Within price range
          size: 30, // Below min_size
          conditions: 'T',
          exchange: 1,
          tape: 1,
          trade_id: '12346',
        },
        {
          symbol: 'AAPL',
          timestamp: '2024-01-01T00:32:00Z',
          price: 250.0, // Within price range
          size: 100, // Within size range
          conditions: 'T',
          exchange: 1,
          tape: 1,
          trade_id: '12347',
        },
      ];

      mockedQuestdbService.getStockTrades.mockResolvedValue(mockTrades);

      await (service as any).pollStockTrades(subscription, lastTimestamp, currentTimestamp);

      // Only the last trade should be emitted
      expect(emitSpy).toHaveBeenCalledTimes(1);
      expect(emitSpy).toHaveBeenCalledWith('stock_trade', {
        type: 'stock_trade',
        data: mockTrades[2],
        timestamp: expect.any(String),
        symbol: 'AAPL',
      });
    });

    it('should return early if no symbol provided', async () => {
      const subscription: QuestDBSubscription = {
        type: 'stock_trades',
      };

      await (service as any).pollStockTrades(subscription, undefined, '2024-01-01T01:00:00Z');

      expect(mockedQuestdbService.getStockTrades).not.toHaveBeenCalled();
    });

    it('should handle errors and re-throw them', async () => {
      const subscription: QuestDBSubscription = {
        type: 'stock_trades',
        symbol: 'AAPL',
      };
      const error = new Error('Database error');

      mockedQuestdbService.getStockTrades.mockRejectedValue(error);

      await expect((service as any).pollStockTrades(subscription, undefined, '2024-01-01T01:00:00Z')).rejects.toThrow(
        'Database error'
      );
    });
  });

  describe('pollOptionTrades', () => {
    it('should emit option trade messages', async () => {
      const emitSpy = jest.spyOn(service, 'emit');
      const subscription: QuestDBSubscription = {
        type: 'option_trades',
        ticker: 'AAPL240315C00150000',
        underlying_ticker: 'AAPL',
      };
      const lastTimestamp = '2024-01-01T00:00:00Z';
      const currentTimestamp = '2024-01-01T01:00:00Z';

      const mockTrades = [
        {
          ticker: 'AAPL240315C00150000',
          underlying_ticker: 'AAPL',
          timestamp: '2024-01-01T00:30:00Z',
          price: 5.0,
          size: 10,
          conditions: 'T',
          exchange: 1,
          tape: 1,
          sequence_number: 12345,
        },
      ];

      mockedQuestdbService.getOptionTrades.mockResolvedValue(mockTrades);

      await (service as any).pollOptionTrades(subscription, lastTimestamp, currentTimestamp);

      expect(mockedQuestdbService.getOptionTrades).toHaveBeenCalledWith('AAPL240315C00150000', 'AAPL', {
        start_time: lastTimestamp,
        end_time: currentTimestamp,
        limit: 1000,
      });

      expect(emitSpy).toHaveBeenCalledWith('option_trade', {
        type: 'option_trade',
        data: mockTrades[0],
        timestamp: expect.any(String),
        symbol: 'AAPL240315C00150000',
        underlying_ticker: 'AAPL',
      });
    });

    it('should apply filters to option trades', async () => {
      const emitSpy = jest.spyOn(service, 'emit');
      const subscription: QuestDBSubscription = {
        type: 'option_trades',
        ticker: 'AAPL240315C00150000',
        underlying_ticker: 'AAPL',
        filters: {
          min_price: 3,
          max_price: 7,
        },
      };
      const lastTimestamp = '2024-01-01T00:00:00Z';
      const currentTimestamp = '2024-01-01T01:00:00Z';

      const mockTrades = [
        {
          ticker: 'AAPL240315C00150000',
          underlying_ticker: 'AAPL',
          timestamp: '2024-01-01T00:30:00Z',
          price: 2.0, // Below min_price
          size: 10,
          conditions: 'T',
          exchange: 1,
          tape: 1,
          sequence_number: 12345,
        },
        {
          ticker: 'AAPL240315C00150000',
          underlying_ticker: 'AAPL',
          timestamp: '2024-01-01T00:31:00Z',
          price: 5.0, // Within range
          size: 10,
          conditions: 'T',
          exchange: 1,
          tape: 1,
          sequence_number: 12346,
        },
      ];

      mockedQuestdbService.getOptionTrades.mockResolvedValue(mockTrades);

      await (service as any).pollOptionTrades(subscription, lastTimestamp, currentTimestamp);

      expect(emitSpy).toHaveBeenCalledTimes(1);
      expect(emitSpy).toHaveBeenCalledWith('option_trade', {
        type: 'option_trade',
        data: mockTrades[1],
        timestamp: expect.any(String),
        symbol: 'AAPL240315C00150000',
        underlying_ticker: 'AAPL',
      });
    });

    it('should handle errors and re-throw them', async () => {
      const subscription: QuestDBSubscription = {
        type: 'option_trades',
        ticker: 'AAPL240315C00150000',
        underlying_ticker: 'AAPL',
      };
      const error = new Error('Database error');

      mockedQuestdbService.getOptionTrades.mockRejectedValue(error);

      await expect((service as any).pollOptionTrades(subscription, undefined, '2024-01-01T01:00:00Z')).rejects.toThrow(
        'Database error'
      );
    });
  });

  describe('pollOptionQuotes', () => {
    it('should emit option quote messages', async () => {
      const emitSpy = jest.spyOn(service, 'emit');
      const subscription: QuestDBSubscription = {
        type: 'option_quotes',
        ticker: 'AAPL240315C00150000',
        underlying_ticker: 'AAPL',
      };
      const lastTimestamp = '2024-01-01T00:00:00Z';
      const currentTimestamp = '2024-01-01T01:00:00Z';

      const mockQuotes = [
        {
          ticker: 'AAPL240315C00150000',
          underlying_ticker: 'AAPL',
          timestamp: '2024-01-01T00:30:00Z',
          bid_price: 4.5,
          bid_size: 20,
          ask_price: 5.0,
          ask_size: 15,
          bid_exchange: 1,
          ask_exchange: 1,
          sequence_number: 12345,
        },
      ];

      mockedQuestdbService.getOptionQuotes.mockResolvedValue(mockQuotes);

      await (service as any).pollOptionQuotes(subscription, lastTimestamp, currentTimestamp);

      expect(mockedQuestdbService.getOptionQuotes).toHaveBeenCalledWith('AAPL240315C00150000', 'AAPL', {
        start_time: lastTimestamp,
        end_time: currentTimestamp,
        limit: 1000,
      });

      expect(emitSpy).toHaveBeenCalledWith('option_quote', {
        type: 'option_quote',
        data: mockQuotes[0],
        timestamp: expect.any(String),
        symbol: 'AAPL240315C00150000',
        underlying_ticker: 'AAPL',
      });
    });

    it('should handle errors and re-throw them', async () => {
      const subscription: QuestDBSubscription = {
        type: 'option_quotes',
        ticker: 'AAPL240315C00150000',
        underlying_ticker: 'AAPL',
      };
      const error = new Error('Database error');

      mockedQuestdbService.getOptionQuotes.mockRejectedValue(error);

      await expect((service as any).pollOptionQuotes(subscription, undefined, '2024-01-01T01:00:00Z')).rejects.toThrow(
        'Database error'
      );
    });
  });

  describe('pollStockAggregates', () => {
    it('should emit stock aggregate messages for new data', async () => {
      const emitSpy = jest.spyOn(service, 'emit');
      const subscription: QuestDBSubscription = {
        type: 'stock_aggregates',
        symbol: 'AAPL',
      };
      const lastTimestamp = '2024-01-01T00:00:00Z';

      const mockAggregates = [
        {
          symbol: 'AAPL',
          timestamp: '2024-01-01T01:00:00Z', // Newer than lastTimestamp
          open: 150.0,
          high: 155.0,
          low: 148.0,
          close: 152.0,
          volume: 1000,
          vwap: 151.0,
          transaction_count: 50,
        },
      ];

      mockedQuestdbService.getStockAggregates.mockResolvedValue(mockAggregates);

      const result = await (service as any).pollStockAggregates(subscription, lastTimestamp);

      expect(mockedQuestdbService.getStockAggregates).toHaveBeenCalledWith('AAPL', {
        limit: 1,
        order_by: 'timestamp',
        order_direction: 'DESC',
      });

      expect(emitSpy).toHaveBeenCalledWith('stock_aggregate', {
        type: 'stock_aggregate',
        data: mockAggregates[0],
        timestamp: expect.any(String),
        symbol: 'AAPL',
      });

      expect(result).toBe('2024-01-01T01:00:00Z');
    });

    it('should not emit messages for old data', async () => {
      const emitSpy = jest.spyOn(service, 'emit');
      const subscription: QuestDBSubscription = {
        type: 'stock_aggregates',
        symbol: 'AAPL',
      };
      const lastTimestamp = '2024-01-01T01:00:00Z';

      const mockAggregates = [
        {
          symbol: 'AAPL',
          timestamp: '2024-01-01T00:00:00Z', // Older than lastTimestamp
          open: 150.0,
          high: 155.0,
          low: 148.0,
          close: 152.0,
          volume: 1000,
          vwap: 151.0,
          transaction_count: 50,
        },
      ];

      mockedQuestdbService.getStockAggregates.mockResolvedValue(mockAggregates);

      const result = await (service as any).pollStockAggregates(subscription, lastTimestamp);

      expect(emitSpy).not.toHaveBeenCalled();
      expect(result).toBe(lastTimestamp);
    });

    it('should handle empty aggregates response', async () => {
      const emitSpy = jest.spyOn(service, 'emit');
      const subscription: QuestDBSubscription = {
        type: 'stock_aggregates',
        symbol: 'AAPL',
      };

      mockedQuestdbService.getStockAggregates.mockResolvedValue([]);

      const result = await (service as any).pollStockAggregates(subscription, undefined);

      expect(emitSpy).not.toHaveBeenCalled();
      expect(result).toBeUndefined();
    });

    it('should return early if no symbol provided', async () => {
      const subscription: QuestDBSubscription = {
        type: 'stock_aggregates',
      };

      const result = await (service as any).pollStockAggregates(subscription, undefined);

      expect(mockedQuestdbService.getStockAggregates).not.toHaveBeenCalled();
      expect(result).toBeUndefined();
    });

    it('should handle errors and re-throw them', async () => {
      const subscription: QuestDBSubscription = {
        type: 'stock_aggregates',
        symbol: 'AAPL',
      };
      const error = new Error('Database error');

      mockedQuestdbService.getStockAggregates.mockRejectedValue(error);

      await expect((service as any).pollStockAggregates(subscription, undefined)).rejects.toThrow('Database error');
    });
  });

  describe('getSubscriptionKey', () => {
    it('should generate correct key for stock trades subscription', () => {
      const subscription: QuestDBSubscription = {
        type: 'stock_trades',
        symbol: 'AAPL',
      };

      const key = (service as any).getSubscriptionKey(subscription);

      expect(key).toBe('stock_trades|AAPL||');
    });

    it('should generate correct key for option trades subscription', () => {
      const subscription: QuestDBSubscription = {
        type: 'option_trades',
        ticker: 'AAPL240315C00150000',
        underlying_ticker: 'AAPL',
      };

      const key = (service as any).getSubscriptionKey(subscription);

      expect(key).toBe('option_trades||AAPL|AAPL240315C00150000');
    });

    it('should handle undefined values in subscription', () => {
      const subscription: QuestDBSubscription = {
        type: 'stock_trades',
      };

      const key = (service as any).getSubscriptionKey(subscription);

      expect(key).toBe('stock_trades|||');
    });
  });

  describe('setPollingInterval', () => {
    it('should set polling interval to specified value', () => {
      service.setPollingInterval(5000);

      expect(service.getStatus().pollingIntervalMs).toBe(5000);
    });

    it('should enforce minimum interval of 100ms', () => {
      service.setPollingInterval(50);

      expect(service.getStatus().pollingIntervalMs).toBe(100);
    });

    it('should handle zero interval', () => {
      service.setPollingInterval(0);

      expect(service.getStatus().pollingIntervalMs).toBe(100);
    });

    it('should handle negative interval', () => {
      service.setPollingInterval(-100);

      expect(service.getStatus().pollingIntervalMs).toBe(100);
    });
  });

  describe('getStatus', () => {
    it('should return correct status when not streaming', () => {
      const status = service.getStatus();

      expect(status).toEqual({
        isStreaming: false,
        subscriptionCount: 0,
        pollingIntervalMs: 10000,
      });
    });

    it('should return correct status when streaming with subscriptions', async () => {
      const subscription: QuestDBSubscription = {
        type: 'stock_trades',
        symbol: 'AAPL',
      };

      service.subscribe(subscription);
      await service.startStreaming();

      const status = service.getStatus();

      expect(status).toEqual({
        isStreaming: true,
        subscriptionCount: 1,
        pollingIntervalMs: 10000,
      });
    });

    it('should return correct status after changing polling interval', () => {
      service.setPollingInterval(5000);

      const status = service.getStatus();

      expect(status.pollingIntervalMs).toBe(5000);
    });
  });

  describe('error handling and edge cases', () => {
    it('should handle multiple subscriptions with same key', () => {
      const subscription1: QuestDBSubscription = {
        type: 'stock_trades',
        symbol: 'AAPL',
      };
      const subscription2: QuestDBSubscription = {
        type: 'stock_trades',
        symbol: 'AAPL',
      };

      service.subscribe(subscription1);
      service.subscribe(subscription2);

      // Should only have one subscription due to same key
      expect(service.getSubscriptions()).toHaveLength(1);
    });

    it('should handle subscription with all optional fields', () => {
      const subscription: QuestDBSubscription = {
        type: 'option_trades',
        symbol: 'AAPL',
        ticker: 'AAPL240315C00150000',
        underlying_ticker: 'AAPL',
        filters: {
          min_price: 1,
          max_price: 10,
          min_size: 5,
          max_size: 100,
        },
      };

      service.subscribe(subscription);

      expect(service.getSubscriptions()).toContain(subscription);
    });

    it('should handle rapid start/stop streaming', async () => {
      await service.startStreaming();
      service.stopStreaming();
      await service.startStreaming();
      service.stopStreaming();

      expect(service.getStatus().isStreaming).toBe(false);
    });

    it('should maintain subscription state across streaming cycles', async () => {
      const subscription: QuestDBSubscription = {
        type: 'stock_trades',
        symbol: 'AAPL',
      };

      service.subscribe(subscription);
      await service.startStreaming();
      service.stopStreaming();
      await service.startStreaming();

      expect(service.getSubscriptions()).toContain(subscription);
      expect(service.getStatus().subscriptionCount).toBe(1);
    });
  });
});
