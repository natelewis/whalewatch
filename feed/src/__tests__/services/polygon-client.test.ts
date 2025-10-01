// Test file for PolygonClient
import { config } from '../../config';

// Mock p-limit
jest.mock('p-limit', () => {
  return jest.fn(() => jest.fn(fn => fn()));
});

// Mock axios
jest.mock('axios', () => ({
  create: jest.fn(() => ({
    get: jest.fn(),
  })),
  get: jest.fn(),
}));

import axios from 'axios';

// Import the actual PolygonClient class
import { PolygonClient } from '../../services/polygon-client';

describe('PolygonClient', () => {
  let polygonClient: PolygonClient;
  let mockAxiosInstance: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create a mock axios instance
    mockAxiosInstance = {
      get: jest.fn(),
    };

    // Mock axios.create to return our mock instance
    (axios.create as jest.Mock).mockReturnValue(mockAxiosInstance);

    polygonClient = new PolygonClient();
  });

  describe('constructor', () => {
    it('should initialize with correct API key', () => {
      expect((polygonClient as any).apiKey).toBe(config.polygon.apiKey);
      expect(axios.create).toHaveBeenCalledWith({
        baseURL: config.polygon.baseUrl,
        timeout: 30000,
        params: {
          apikey: config.polygon.apiKey,
        },
      });
    });
  });

  describe('getOptionTrades', () => {
    it('should fetch option trades successfully', async () => {
      // Arrange
      const ticker = 'AAPL240315C00150000';
      const from = new Date('2024-01-01T09:00:00Z');
      const to = new Date('2024-01-01T17:00:00Z');
      const mockResponse = {
        data: {
          results: [
            {
              ticker: 'O:AAPL240315C00150000',
              sip_timestamp: 1704110400000000000,
              price: 5.0,
              size: 10,
              conditions: ['regular'],
              exchange: 1,
            },
          ],
        },
      };

      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      // Act
      const result = await polygonClient.getOptionTrades(ticker, from, to);

      // Assert
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/v3/trades/AAPL240315C00150000',
        expect.objectContaining({
          params: expect.objectContaining({
            'timestamp.gte': '2024-01-01T09:00:00.000Z',
            'timestamp.lte': '2024-01-01T17:00:00.000Z',
            limit: 50000,
            order: 'asc',
          }),
        })
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        ticker: 'O:AAPL240315C00150000',
        sip_timestamp: 1704110400000000000,
        price: 5.0,
        size: 10,
        conditions: ['regular'],
        exchange: 1,
      });
    });

    it('should handle pagination correctly', async () => {
      // Arrange
      const ticker = 'AAPL240315C00150000';
      const from = new Date('2024-01-01T09:00:00Z');
      const to = new Date('2024-01-01T17:00:00Z');

      const firstPageResponse = {
        data: {
          results: [
            {
              ticker: 'O:AAPL240315C00150000',
              sip_timestamp: 1704110400000000000,
              price: 5.0,
              size: 10,
              conditions: ['regular'],
              exchange: 1,
            },
          ],
          next_url: 'https://api.polygon.io/v3/trades/AAPL240315C00150000?cursor=next',
        },
      };

      const secondPageResponse = {
        data: {
          results: [
            {
              ticker: 'O:AAPL240315C00150000',
              sip_timestamp: 1704110401000000000,
              price: 5.1,
              size: 20,
              conditions: ['regular'],
              exchange: 1,
            },
          ],
        },
      };

      mockAxiosInstance.get.mockResolvedValueOnce(firstPageResponse).mockResolvedValueOnce(secondPageResponse);

      // Act
      const result = await polygonClient.getOptionTrades(ticker, from, to);

      // Assert
      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(2);
      expect(mockAxiosInstance.get).toHaveBeenNthCalledWith(
        1,
        '/v3/trades/AAPL240315C00150000',
        expect.objectContaining({
          params: expect.objectContaining({
            'timestamp.gte': '2024-01-01T09:00:00.000Z',
            'timestamp.lte': '2024-01-01T17:00:00.000Z',
            limit: 50000,
            order: 'asc',
          }),
        })
      );
      expect(mockAxiosInstance.get).toHaveBeenNthCalledWith(
        2,
        'https://api.polygon.io/v3/trades/AAPL240315C00150000?cursor=next'
      );

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        ticker: 'O:AAPL240315C00150000',
        sip_timestamp: 1704110400000000000,
        price: 5.0,
        size: 10,
      });
      expect(result[1]).toMatchObject({
        ticker: 'O:AAPL240315C00150000',
        sip_timestamp: 1704110401000000000,
        price: 5.1,
        size: 20,
      });
    });
  });

  describe('convertTimestamp', () => {
    it('should convert nanosecond timestamp to Date', () => {
      const timestamp = 1704110400000000000; // 2024-01-01T10:00:00Z in nanoseconds
      const result = PolygonClient.convertTimestamp(timestamp, true);

      expect(result).toBeInstanceOf(Date);
      expect(result.toISOString()).toBe('2024-01-01T12:00:00.000Z');
    });

    it('should convert microsecond timestamp to Date', () => {
      const timestamp = 1704110400000; // 2024-01-01T12:00:00Z in microseconds
      const result = PolygonClient.convertTimestamp(timestamp, false);

      expect(result).toBeInstanceOf(Date);
      expect(result.toISOString()).toBe('2024-01-01T12:00:00.000Z');
    });

    it('should handle zero timestamps', () => {
      const result = PolygonClient.convertTimestamp(0, true);
      expect(result).toBeInstanceOf(Date);
      expect(result.getTime()).toBe(0);
    });
  });
});
