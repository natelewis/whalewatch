import { AlpacaService } from '../../services/alpacaService';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('AlpacaService', () => {
  let alpacaService: AlpacaService;

  beforeEach(() => {
    alpacaService = new AlpacaService();
    jest.clearAllMocks();
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

      mockedAxios.get.mockResolvedValue({ data: mockAccount });

      const result = await alpacaService.getAccount();

      expect(result).toEqual(mockAccount);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.stringContaining('/account'),
        expect.objectContaining({
          headers: expect.any(Object),
        })
      );
    });

    it('should throw error on API failure', async () => {
      mockedAxios.get.mockRejectedValue(new Error('API Error'));

      await expect(alpacaService.getAccount()).rejects.toThrow('Failed to fetch account');
    });
  });

  describe('getPositions', () => {
    it('should return positions', async () => {
      const mockPositions = [
        {
          asset_id: 'test-asset-id',
          symbol: 'AAPL',
          qty: '100',
          market_value: '15000.00',
        },
      ];

      mockedAxios.get.mockResolvedValue({ data: mockPositions });

      const result = await alpacaService.getPositions();

      expect(result).toEqual(mockPositions);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.stringContaining('/positions'),
        expect.objectContaining({
          headers: expect.any(Object),
        })
      );
    });

    it('should throw error on API failure', async () => {
      mockedAxios.get.mockRejectedValue(new Error('API Error'));

      await expect(alpacaService.getPositions()).rejects.toThrow('Failed to fetch positions');
    });
  });

  describe('getActivities', () => {
    it('should return activities without date filters', async () => {
      const mockActivities = [
        {
          id: 'test-activity-id',
          activity_type: 'FILL',
          symbol: 'AAPL',
          qty: '10',
          price: '150.00',
        },
      ];

      mockedAxios.get.mockResolvedValue({ data: mockActivities });

      const result = await alpacaService.getActivities();

      expect(result).toEqual(mockActivities);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.stringContaining('/account/activities'),
        expect.objectContaining({
          headers: expect.any(Object),
          params: {},
        })
      );
    });

    it('should return activities with date filters', async () => {
      const mockActivities: any[] = [];
      mockedAxios.get.mockResolvedValue({ data: mockActivities });

      const result = await alpacaService.getActivities('2024-01-01', '2024-01-31');

      expect(result).toEqual(mockActivities);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.stringContaining('/account/activities'),
        expect.objectContaining({
          headers: expect.any(Object),
          params: {
            start: '2024-01-01',
            end: '2024-01-31',
          },
        })
      );
    });

    it('should throw error on API failure', async () => {
      mockedAxios.get.mockRejectedValue(new Error('API Error'));

      await expect(alpacaService.getActivities()).rejects.toThrow('Failed to fetch activities');
    });
  });

  describe('getBars', () => {
    it('should return bars for valid symbol and timeframe', async () => {
      const mockBars = [
        {
          t: '2024-01-01T10:00:00Z',
          o: 100.0,
          h: 105.0,
          l: 99.0,
          c: 104.0,
          v: 1000,
        },
      ];

      mockedAxios.get.mockResolvedValue({ data: { AAPL: mockBars } });

      const result = await alpacaService.getBars('AAPL', '1H', 100);

      expect(result).toEqual(mockBars);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.stringContaining('/stocks/bars'),
        expect.objectContaining({
          headers: expect.any(Object),
          params: expect.objectContaining({
            symbols: 'AAPL',
            timeframe: '1Hour',
            limit: 100,
          }),
        })
      );
    });

    it('should return empty array when no data', async () => {
      mockedAxios.get.mockResolvedValue({ data: {} });

      const result = await alpacaService.getBars('AAPL', '1H', 100);

      expect(result).toEqual([]);
    });

    it('should throw error on API failure', async () => {
      mockedAxios.get.mockRejectedValue(new Error('API Error'));

      await expect(alpacaService.getBars('AAPL', '1H', 100)).rejects.toThrow(
        'Failed to fetch chart data'
      );
    });
  });

  describe('getOptionsTrades', () => {
    it('should return empty array and log warning', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const result = await alpacaService.getOptionsTrades('AAPL', 1);

      expect(result).toEqual([]);
      expect(consoleSpy).toHaveBeenCalledWith(
        'getOptionsTrades called on AlpacaService - use QuestDB routes instead'
      );

      consoleSpy.mockRestore();
    });
  });
});
