import { PolygonService } from '../../services/polygonService';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('PolygonService', () => {
  let polygonService: PolygonService;

  beforeEach(() => {
    jest.clearAllMocks();
    // Set up environment variables
    process.env.POLYGON_API_KEY = 'test-api-key';
    process.env.POLYGON_BASE_URL = 'https://api.polygon.io';
    
    // Create a new instance for each test
    polygonService = new PolygonService();
  });

  afterEach(() => {
    delete process.env.POLYGON_API_KEY;
    delete process.env.POLYGON_BASE_URL;
  });

  describe('getOptionsTrades', () => {
    it('should fetch options trades successfully', async () => {
      const mockResponse = {
        data: {
          status: 'OK',
          results: [
            {
              id: 'test-trade-1',
              conditions: [1, 2],
              exchange: 1,
              price: 2.50,
              size: 100,
              timestamp: 1640995200000000000, // 2022-01-01T00:00:00Z in nanoseconds
              participant_timestamp: 1640995200000000000,
              sip_timestamp: 1640995200000000000,
              tape: 1,
            },
          ],
          request_id: 'test-request-id',
        },
      };

      mockedAxios.get.mockResolvedValueOnce(mockResponse);

      const result = await polygonService.getOptionsTrades('AAPL', 1, 100);

      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://api.polygon.io/v3/trades',
        {
          params: {
            underlying_ticker: 'AAPL',
            timestamp: {
              gte: expect.any(String),
              lte: expect.any(String),
            },
            limit: 100,
            order: 'desc',
            sort: 'timestamp',
            apikey: 'test-api-key',
          },
        }
      );

      expect(result).toEqual(mockResponse.data.results);
    });

    it('should handle API errors gracefully', async () => {
      mockedAxios.get.mockRejectedValueOnce({
        response: {
          status: 401,
          data: { message: 'Invalid API key' },
        },
      });

      await expect(polygonService.getOptionsTrades('AAPL', 1)).rejects.toThrow(
        'Invalid Polygon API key'
      );
    });

    it('should handle rate limit errors', async () => {
      mockedAxios.get.mockRejectedValueOnce({
        response: {
          status: 429,
          data: { message: 'Rate limit exceeded' },
        },
      });

      await expect(polygonService.getOptionsTrades('AAPL', 1)).rejects.toThrow(
        'Polygon API rate limit exceeded'
      );
    });

    it('should handle subscription errors', async () => {
      mockedAxios.get.mockRejectedValueOnce({
        response: {
          status: 403,
          data: { message: 'Insufficient subscription level' },
        },
      });

      await expect(polygonService.getOptionsTrades('AAPL', 1)).rejects.toThrow(
        'Polygon API access forbidden - check subscription level'
      );
    });

    it('should throw error when API key is not configured', async () => {
      delete process.env.POLYGON_API_KEY;
      
      // Create a new instance without API key
      const serviceWithoutKey = new PolygonService();

      await expect(serviceWithoutKey.getOptionsTrades('AAPL', 1)).rejects.toThrow(
        'Polygon API key not configured'
      );
    });
  });

  describe('getOptionsContracts', () => {
    it('should fetch options contracts successfully', async () => {
      const mockResponse = {
        data: {
          status: 'OK',
          results: [
            {
              cfi: 'OC',
              contract_type: 'call',
              exercise_style: 'american',
              expiration_date: '2025-01-17',
              primary_exchange: 'CBOE',
              shares_per_contract: 100,
              strike_price: 250.0,
              ticker: 'O:AAPL250117C00250000',
              underlying_ticker: 'AAPL',
            },
          ],
          request_id: 'test-request-id',
        },
      };

      mockedAxios.get.mockResolvedValueOnce(mockResponse);

      const result = await polygonService.getOptionsContracts('AAPL', 100);

      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://api.polygon.io/v3/reference/options/contracts',
        {
          params: {
            underlying_ticker: 'AAPL',
            limit: 100,
            apikey: 'test-api-key',
          },
        }
      );

      expect(result).toEqual(mockResponse.data.results);
    });

    it('should handle API errors for contracts', async () => {
      mockedAxios.get.mockRejectedValueOnce({
        response: {
          status: 401,
          data: { message: 'Invalid API key' },
        },
      });

      await expect(polygonService.getOptionsContracts('AAPL', 100)).rejects.toThrow(
        'Invalid Polygon API key'
      );
    });
  });

  describe('getContractTrades', () => {
    it('should fetch contract trades successfully', async () => {
      const mockResponse = {
        data: {
          status: 'OK',
          results: [
            {
              id: 'contract-trade-1',
              conditions: [1],
              exchange: 1,
              price: 1.25,
              size: 50,
              timestamp: 1640995200000000000,
              participant_timestamp: 1640995200000000000,
              sip_timestamp: 1640995200000000000,
              tape: 1,
            },
          ],
          request_id: 'test-request-id',
        },
      };

      mockedAxios.get.mockResolvedValueOnce(mockResponse);

      const result = await polygonService.getContractTrades(
        'O:AAPL250117C00250000',
        '2025-01-15',
        100
      );

      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://api.polygon.io/v3/trades/O:AAPL250117C00250000',
        {
          params: {
            date: '2025-01-15',
            limit: 100,
            order: 'desc',
            sort: 'timestamp',
            apikey: 'test-api-key',
          },
        }
      );

      expect(result).toEqual(mockResponse.data.results);
    });

    it('should use current date when no date provided', async () => {
      const mockResponse = {
        data: {
          status: 'OK',
          results: [],
          request_id: 'test-request-id',
        },
      };

      mockedAxios.get.mockResolvedValueOnce(mockResponse);

      await polygonService.getContractTrades('O:AAPL250117C00250000');

      const expectedDate = new Date().toISOString().split('T')[0];
      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://api.polygon.io/v3/trades/O:AAPL250117C00250000',
        {
          params: {
            date: expectedDate,
            limit: 1000,
            order: 'desc',
            sort: 'timestamp',
            apikey: 'test-api-key',
          },
        }
      );
    });
  });

  describe('validateApiKey', () => {
    it('should return true for valid API key', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          status: 'OK',
          results: [],
        },
      });

      const result = await polygonService.validateApiKey();

      expect(result).toBe(true);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://api.polygon.io/v3/reference/tickers',
        {
          params: {
            market: 'stocks',
            limit: 1,
            apikey: 'test-api-key',
          },
        }
      );
    });

    it('should return false for invalid API key', async () => {
      mockedAxios.get.mockRejectedValueOnce({
        response: {
          status: 401,
          data: { message: 'Invalid API key' },
        },
      });

      const result = await polygonService.validateApiKey();

      expect(result).toBe(false);
    });

    it('should return false when no API key is configured', async () => {
      delete process.env.POLYGON_API_KEY;
      
      // Create a new instance without API key
      const serviceWithoutKey = new PolygonService();

      const result = await serviceWithoutKey.validateApiKey();

      expect(result).toBe(false);
    });
  });
});
