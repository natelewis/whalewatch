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

  describe('getOptionContracts', () => {
    it('should fetch option contracts successfully', async () => {
      // Arrange
      const underlyingTicker = 'AAPL';
      const asOf = new Date('2024-01-01');
      const mockResponse = {
        data: {
          results: [
            {
              ticker: 'O:AAPL240315C00150000',
              contract_type: 'call',
              exercise_style: 'american',
              expiration_date: '2024-03-15',
              shares_per_contract: 100,
              strike_price: 150.0,
              underlying_ticker: 'AAPL',
            },
          ],
        },
      };

      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      // Act
      const result = await polygonClient.getOptionContracts(underlyingTicker, asOf);

      // Assert
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/v3/reference/options/contracts',
        expect.objectContaining({
          params: expect.objectContaining({
            underlying_ticker: underlyingTicker,
            as_of: '2024-01-01',
            expired: 'false',
            limit: '1000',
          }),
        })
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        ticker: 'O:AAPL240315C00150000',
        contract_type: 'call',
        exercise_style: 'american',
        expiration_date: '2024-03-15',
        shares_per_contract: 100,
        strike_price: 150.0,
        underlying_ticker: 'AAPL',
      });
    });

    it('should handle API errors', async () => {
      // Arrange
      const underlyingTicker = 'INVALID';
      const asOf = new Date('2024-01-01');
      const error = new Error('API Error');

      mockAxiosInstance.get.mockRejectedValue(error);

      // Act & Assert
      await expect(polygonClient.getOptionContracts(underlyingTicker, asOf)).rejects.toThrow('API Error');
    });

    it('should handle empty results', async () => {
      // Arrange
      const underlyingTicker = 'AAPL';
      const asOf = new Date('2024-01-01');
      const mockResponse = {
        data: {
          results: [],
        },
      };

      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      // Act
      const result = await polygonClient.getOptionContracts(underlyingTicker, asOf);

      // Assert
      expect(result).toHaveLength(0);
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
              tape: 1,
              sequence_number: 12345,
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
        tape: 1,
        sequence_number: 12345,
      });
    });
  });

  describe('getOptionQuotes', () => {
    it('should fetch option quotes successfully', async () => {
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
              bid: 4.8,
              bid_size: 5,
              ask: 5.2,
              ask_size: 5,
              bid_exchange: 1,
              ask_exchange: 1,
              sequence_number: 12345,
            },
          ],
        },
      };

      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      // Act
      const result = await polygonClient.getOptionQuotes(ticker, from, to);

      // Assert
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/v3/quotes/AAPL240315C00150000',
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
        bid: 4.8,
        bid_size: 5,
        ask: 5.2,
        ask_size: 5,
        bid_exchange: 1,
        ask_exchange: 1,
        sequence_number: 12345,
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
