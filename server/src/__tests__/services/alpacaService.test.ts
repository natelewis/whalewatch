import { AlpacaService } from '../../services/alpacaService';
import { AlpacaApi } from '@alpacahq/alpaca-trade-api';

// Mock the Alpaca API
jest.mock('@alpacahq/alpaca-trade-api');

describe('AlpacaService', () => {
  let alpacaService: AlpacaService;
  let mockAlpacaApi: jest.Mocked<AlpacaApi>;

  beforeEach(() => {
    jest.clearAllMocks();
    alpacaService = new AlpacaService();
    mockAlpacaApi = new AlpacaApi({}) as jest.Mocked<AlpacaApi>;
    (alpacaService as any).alpaca = mockAlpacaApi;
  });

  describe('getAccount', () => {
    it('should return account information', async () => {
      const mockAccount = {
        id: 'test-account-id',
        account_number: '123456789',
        status: 'ACTIVE',
        currency: 'USD',
        buying_power: '10000.00',
        portfolio_value: '50000.00',
      };

      mockAlpacaApi.getAccount.mockResolvedValue(mockAccount as any);

      const result = await alpacaService.getAccount();

      expect(result).toEqual(mockAccount);
      expect(mockAlpacaApi.getAccount).toHaveBeenCalledTimes(1);
    });

    it('should throw error on API failure', async () => {
      mockAlpacaApi.getAccount.mockRejectedValue(new Error('API Error'));

      await expect(alpacaService.getAccount()).rejects.toThrow(
        'Failed to fetch account information'
      );
    });
  });

  describe('getPositions', () => {
    it('should return positions', async () => {
      const mockPositions = [
        {
          asset_id: 'asset-1',
          symbol: 'AAPL',
          qty: '10',
          side: 'long',
          market_value: '1500.00',
        },
      ];

      mockAlpacaApi.getPositions.mockResolvedValue(mockPositions as any);

      const result = await alpacaService.getPositions();

      expect(result).toEqual(mockPositions);
      expect(mockAlpacaApi.getPositions).toHaveBeenCalledTimes(1);
    });

    it('should throw error on API failure', async () => {
      mockAlpacaApi.getPositions.mockRejectedValue(new Error('API Error'));

      await expect(alpacaService.getPositions()).rejects.toThrow('Failed to fetch positions');
    });
  });

  describe('getActivities', () => {
    it('should return activities without date filters', async () => {
      const mockActivities = [
        {
          id: 'activity-1',
          activity_type: 'FILL',
          transaction_time: '2024-01-01T10:00:00Z',
        },
      ];

      mockAlpacaApi.getActivities.mockResolvedValue(mockActivities as any);

      const result = await alpacaService.getActivities();

      expect(result).toEqual(mockActivities);
      expect(mockAlpacaApi.getActivities).toHaveBeenCalledWith({});
    });

    it('should return activities with date filters', async () => {
      const mockActivities: any[] = [];
      mockAlpacaApi.getActivities.mockResolvedValue(mockActivities);

      const result = await alpacaService.getActivities('2024-01-01', '2024-01-31');

      expect(result).toEqual(mockActivities);
      expect(mockAlpacaApi.getActivities).toHaveBeenCalledWith({
        start: '2024-01-01',
        end: '2024-01-31',
      });
    });

    it('should throw error on API failure', async () => {
      mockAlpacaApi.getActivities.mockRejectedValue(new Error('API Error'));

      await expect(alpacaService.getActivities()).rejects.toThrow('Failed to fetch activities');
    });
  });

  // Polygon conversion tests removed - now using QuestDB

  describe('getBars', () => {
    it('should return bars for 1D timeframe', async () => {
      const mockBars = [
        {
          Timestamp: '2024-01-01T00:00:00Z',
          OpenPrice: 100,
          HighPrice: 105,
          LowPrice: 95,
          ClosePrice: 102,
          Volume: 1000000,
          TradeCount: 5000,
          VWAP: 101,
        },
      ];

      mockAlpacaApi.getBarsV2.mockResolvedValue({
        AAPL: mockBars,
      } as any);

      const result = await alpacaService.getBars('AAPL', '1D', 100);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        t: '2024-01-01T00:00:00Z',
        o: 100,
        h: 105,
        l: 95,
        c: 102,
        v: 1000000,
        n: 5000,
        vw: 101,
      });
    });

    it('should return empty array when no bars', async () => {
      mockAlpacaApi.getBarsV2.mockResolvedValue({} as any);

      const result = await alpacaService.getBars('AAPL', '1D', 100);

      expect(result).toEqual([]);
    });

    it('should throw error on API failure', async () => {
      mockAlpacaApi.getBarsV2.mockRejectedValue(new Error('API Error'));

      await expect(alpacaService.getBars('AAPL', '1D', 100)).rejects.toThrow(
        'Failed to fetch chart data'
      );
    });
  });

  describe('createOrder', () => {
    it('should create a limit order', async () => {
      const mockOrder = {
        id: 'order-123',
        symbol: 'AAPL',
        qty: '10',
        side: 'buy',
        type: 'limit',
        status: 'new',
      };

      mockAlpacaApi.createOrder.mockResolvedValue(mockOrder as any);

      const orderData = {
        symbol: 'AAPL',
        qty: 10,
        side: 'buy' as const,
        type: 'limit' as const,
        time_in_force: 'day' as const,
        limit_price: 150,
      };

      const result = await alpacaService.createOrder(orderData);

      expect(result).toEqual(mockOrder);
      expect(mockAlpacaApi.createOrder).toHaveBeenCalledWith(orderData);
    });

    it('should throw error on API failure', async () => {
      mockAlpacaApi.createOrder.mockRejectedValue(new Error('API Error'));

      const orderData = {
        symbol: 'AAPL',
        qty: 10,
        side: 'buy' as const,
        type: 'limit' as const,
        time_in_force: 'day' as const,
        limit_price: 150,
      };

      await expect(alpacaService.createOrder(orderData)).rejects.toThrow('Failed to create order');
    });
  });
});
