// Test file for AlpacaClient
import {
  AlpacaBarsResponse,
  AlpacaTradesResponse,
  AlpacaQuotesResponse,
  AlpacaBar,
  AlpacaTrade,
  AlpacaQuote,
} from '../../types/alpaca';

// Mock axios
jest.mock('axios', () => ({
  create: jest.fn(() => ({
    get: jest.fn(),
  })),
  get: jest.fn(),
}));

// Mock config
jest.mock('../../config', () => ({
  config: {
    alpaca: {
      apiKey: 'test-api-key',
      secretKey: 'test-secret-key',
      dataUrl: 'https://data.alpaca.markets',
      logRequests: false,
    },
  },
}));

// Mock rate limiter
jest.mock('../../utils/alpaca-rate-limiter', () => ({
  getAlpacaRateLimiter: jest.fn(() => ({
    execute: jest.fn(fn => fn()), // Just execute the function directly without any wrapping
  })),
}));

import axios from 'axios';
import { AlpacaClient } from '../../services/alpaca-client';
import { getAlpacaRateLimiter } from '../../utils/alpaca-rate-limiter';

describe('AlpacaClient', () => {
  let alpacaClient: AlpacaClient;
  let mockAxiosInstance: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create a mock axios instance
    mockAxiosInstance = {
      get: jest.fn(),
    };

    // Mock axios.create to return our mock instance
    (axios.create as jest.Mock).mockReturnValue(mockAxiosInstance);

    alpacaClient = new AlpacaClient();
  });

  describe('constructor', () => {
    it('should initialize with correct API credentials', () => {
      expect((alpacaClient as any).apiKey).toBe('test-api-key');
      expect((alpacaClient as any).secretKey).toBe('test-secret-key');
      expect(axios.create).toHaveBeenCalledWith({
        baseURL: 'https://data.alpaca.markets',
        timeout: 30000,
        headers: {
          'APCA-API-KEY-ID': 'test-api-key',
          'APCA-API-SECRET-KEY': 'test-secret-key',
        },
      });
    });

    it('should throw error when API key is missing', () => {
      // Create a new instance with mocked config that has empty API key
      const originalConfig = require('../../config').config;
      const mockConfig = {
        ...originalConfig,
        alpaca: {
          ...originalConfig.alpaca,
          apiKey: '',
        },
      };

      jest.doMock('../../config', () => ({ config: mockConfig }));

      // Clear module cache and re-import
      jest.resetModules();
      const { AlpacaClient: AlpacaClientWithEmptyKey } = require('../../services/alpaca-client');

      expect(() => new AlpacaClientWithEmptyKey()).toThrow(
        'Alpaca API credentials not configured. Please set ALPACA_API_KEY and ALPACA_SECRET_KEY environment variables.'
      );
    });

    it('should throw error when secret key is missing', () => {
      // Create a new instance with mocked config that has empty secret key
      const originalConfig = require('../../config').config;
      const mockConfig = {
        ...originalConfig,
        alpaca: {
          ...originalConfig.alpaca,
          secretKey: '',
        },
      };

      jest.doMock('../../config', () => ({ config: mockConfig }));

      // Clear module cache and re-import
      jest.resetModules();
      const { AlpacaClient: AlpacaClientWithEmptySecret } = require('../../services/alpaca-client');

      expect(() => new AlpacaClientWithEmptySecret()).toThrow(
        'Alpaca API credentials not configured. Please set ALPACA_API_KEY and ALPACA_SECRET_KEY environment variables.'
      );
    });
  });

  describe('getHistoricalStockBars', () => {
    const mockBar: AlpacaBar = {
      t: '2023-01-01T09:30:00Z',
      o: 100,
      h: 105,
      l: 95,
      c: 102,
      v: 1000,
      n: 50,
      vw: 101.5,
    };

    const mockBarsResponse: AlpacaBarsResponse = {
      bars: [mockBar],
    };

    it('should fetch historical bars successfully', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: mockBarsResponse,
      });

      const result = await alpacaClient.getHistoricalStockBars(
        'AAPL',
        new Date('2023-01-01'),
        new Date('2023-01-02'),
        '1Min'
      );

      expect(result).toEqual([mockBar]);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/v2/stocks/AAPL/bars', {
        params: {
          start: '2023-01-01',
          end: '2023-01-02',
          timeframe: '1Min',
          adjustment: 'raw',
          feed: 'iex',
          page_token: undefined,
        },
      });
      expect(getAlpacaRateLimiter).toHaveBeenCalled();
    });

    it('should handle pagination correctly', async () => {
      const firstPageResponse: AlpacaBarsResponse = {
        bars: [mockBar],
        next_page_token: 'next-token',
      };

      const secondPageResponse: AlpacaBarsResponse = {
        bars: [{ ...mockBar, t: '2023-01-01T09:31:00Z' }],
      };

      mockAxiosInstance.get
        .mockResolvedValueOnce({ data: firstPageResponse })
        .mockResolvedValueOnce({ data: secondPageResponse });

      const result = await alpacaClient.getHistoricalStockBars('AAPL', new Date('2023-01-01'), new Date('2023-01-02'));

      expect(result).toHaveLength(2);
      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(2);
      expect(mockAxiosInstance.get).toHaveBeenNthCalledWith(2, '/v2/stocks/AAPL/bars', {
        params: {
          start: '2023-01-01',
          end: '2023-01-02',
          timeframe: '1Min',
          adjustment: 'raw',
          feed: 'iex',
          page_token: 'next-token',
        },
      });
    });

    it('should handle old format response with bars[symbol]', async () => {
      const oldFormatResponse: AlpacaBarsResponse = {
        bars: { AAPL: [mockBar] },
      };

      mockAxiosInstance.get.mockResolvedValue({
        data: oldFormatResponse,
      });

      const result = await alpacaClient.getHistoricalStockBars('AAPL', new Date('2023-01-01'), new Date('2023-01-02'));

      expect(result).toEqual([mockBar]);
    });

    it('should handle empty response data', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: null,
      });

      const result = await alpacaClient.getHistoricalStockBars('AAPL', new Date('2023-01-01'), new Date('2023-01-02'));

      expect(result).toEqual([]);
    });

    it('should handle response with no bars', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: { bars: null },
      });

      const result = await alpacaClient.getHistoricalStockBars('AAPL', new Date('2023-01-01'), new Date('2023-01-02'));

      expect(result).toEqual([]);
    });

    it('should handle API errors', async () => {
      const error = {
        response: {
          status: 400,
          statusText: 'Bad Request',
          data: { message: 'Invalid symbol' },
        },
      };

      mockAxiosInstance.get.mockRejectedValue(error);
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      try {
        await alpacaClient.getHistoricalStockBars('INVALID', new Date('2023-01-01'), new Date('2023-01-02'));
        fail('Expected function to throw');
      } catch (thrownError) {
        expect(thrownError).toBe(error);
        expect(consoleErrorSpy).toHaveBeenCalledWith('Error fetching historical bars for INVALID:', error);
      }

      consoleErrorSpy.mockRestore();
    });

    it('should use default timeframe when not provided', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: mockBarsResponse,
      });

      await alpacaClient.getHistoricalStockBars('AAPL', new Date('2023-01-01'), new Date('2023-01-02'));

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/v2/stocks/AAPL/bars', {
        params: expect.objectContaining({
          timeframe: '1Min',
        }),
      });
    });
  });

  describe('getHistoricalStockTrades', () => {
    const mockTrade: AlpacaTrade = {
      t: '2023-01-01T09:30:00Z',
      x: 'IEX',
      p: 100.5,
      s: 100,
      c: ['@'],
      i: 12345,
      z: 'A',
    };

    const mockTradesResponse: AlpacaTradesResponse = {
      trades: [mockTrade],
    };

    it('should fetch historical trades successfully', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: mockTradesResponse,
      });

      const result = await alpacaClient.getHistoricalStockTrades(
        'AAPL',
        new Date('2023-01-01'),
        new Date('2023-01-02')
      );

      expect(result).toEqual([mockTrade]);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/v2/stocks/AAPL/trades', {
        params: {
          start: '2023-01-01T00:00:00.000Z',
          end: '2023-01-02T00:00:00.000Z',
          feed: 'iex',
          page_token: undefined,
        },
      });
    });

    it('should handle pagination correctly', async () => {
      const firstPageResponse: AlpacaTradesResponse = {
        trades: [mockTrade],
        next_page_token: 'next-token',
      };

      const secondPageResponse: AlpacaTradesResponse = {
        trades: [{ ...mockTrade, i: 12346 }],
      };

      mockAxiosInstance.get
        .mockResolvedValueOnce({ data: firstPageResponse })
        .mockResolvedValueOnce({ data: secondPageResponse });

      const result = await alpacaClient.getHistoricalStockTrades(
        'AAPL',
        new Date('2023-01-01'),
        new Date('2023-01-02')
      );

      expect(result).toHaveLength(2);
      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(2);
    });

    it('should handle old format response with trades[symbol]', async () => {
      const oldFormatResponse: AlpacaTradesResponse = {
        trades: { AAPL: [mockTrade] },
      };

      mockAxiosInstance.get.mockResolvedValue({
        data: oldFormatResponse,
      });

      const result = await alpacaClient.getHistoricalStockTrades(
        'AAPL',
        new Date('2023-01-01'),
        new Date('2023-01-02')
      );

      expect(result).toEqual([mockTrade]);
    });

    it('should handle empty response data', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: null,
      });

      const result = await alpacaClient.getHistoricalStockTrades(
        'AAPL',
        new Date('2023-01-01'),
        new Date('2023-01-02')
      );

      expect(result).toEqual([]);
    });

    it('should handle API errors', async () => {
      const error = {
        response: {
          status: 404,
          statusText: 'Not Found',
          data: { message: 'Symbol not found' },
        },
      };

      mockAxiosInstance.get.mockRejectedValue(error);
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      try {
        await alpacaClient.getHistoricalStockTrades('INVALID', new Date('2023-01-01'), new Date('2023-01-02'));
        fail('Expected function to throw');
      } catch (thrownError) {
        expect(thrownError).toBe(error);
        expect(consoleErrorSpy).toHaveBeenCalledWith('Error fetching historical trades for INVALID:', error);
      }

      consoleErrorSpy.mockRestore();
    });
  });

  describe('getHistoricalStockQuotes', () => {
    const mockQuote: AlpacaQuote = {
      t: '2023-01-01T09:30:00Z',
      ax: 'IEX',
      ap: 100.5,
      as: 100,
      bx: 'IEX',
      bp: 100.0,
      bs: 200,
      c: ['@'],
      z: 'A',
    };

    const mockQuotesResponse: AlpacaQuotesResponse = {
      quotes: [mockQuote],
    };

    it('should fetch historical quotes successfully', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: mockQuotesResponse,
      });

      const result = await alpacaClient.getHistoricalStockQuotes(
        'AAPL',
        new Date('2023-01-01'),
        new Date('2023-01-02')
      );

      expect(result).toEqual([mockQuote]);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/v2/stocks/AAPL/quotes', {
        params: {
          start: '2023-01-01T00:00:00.000Z',
          end: '2023-01-02T00:00:00.000Z',
          feed: 'iex',
          page_token: undefined,
        },
      });
    });

    it('should handle pagination correctly', async () => {
      const firstPageResponse: AlpacaQuotesResponse = {
        quotes: [mockQuote],
        next_page_token: 'next-token',
      };

      const secondPageResponse: AlpacaQuotesResponse = {
        quotes: [{ ...mockQuote, ap: 101.0 }],
      };

      mockAxiosInstance.get
        .mockResolvedValueOnce({ data: firstPageResponse })
        .mockResolvedValueOnce({ data: secondPageResponse });

      const result = await alpacaClient.getHistoricalStockQuotes(
        'AAPL',
        new Date('2023-01-01'),
        new Date('2023-01-02')
      );

      expect(result).toHaveLength(2);
      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(2);
    });

    it('should handle old format response with quotes[symbol]', async () => {
      const oldFormatResponse: AlpacaQuotesResponse = {
        quotes: { AAPL: [mockQuote] },
      };

      mockAxiosInstance.get.mockResolvedValue({
        data: oldFormatResponse,
      });

      const result = await alpacaClient.getHistoricalStockQuotes(
        'AAPL',
        new Date('2023-01-01'),
        new Date('2023-01-02')
      );

      expect(result).toEqual([mockQuote]);
    });

    it('should handle empty response data', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: null,
      });

      const result = await alpacaClient.getHistoricalStockQuotes(
        'AAPL',
        new Date('2023-01-01'),
        new Date('2023-01-02')
      );

      expect(result).toEqual([]);
    });

    it('should handle API errors', async () => {
      const error = {
        response: {
          status: 500,
          statusText: 'Internal Server Error',
          data: { message: 'Server error' },
        },
      };

      mockAxiosInstance.get.mockRejectedValue(error);
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      try {
        await alpacaClient.getHistoricalStockQuotes('INVALID', new Date('2023-01-01'), new Date('2023-01-02'));
        fail('Expected function to throw');
      } catch (thrownError) {
        expect(thrownError).toBe(error);
        expect(consoleErrorSpy).toHaveBeenCalledWith('Error fetching historical quotes for INVALID:', error);
      }

      consoleErrorSpy.mockRestore();
    });
  });

  describe('getLatestStockTrade', () => {
    const mockTrade: AlpacaTrade = {
      t: '2023-01-01T09:30:00Z',
      x: 'IEX',
      p: 100.5,
      s: 100,
      c: ['@'],
      i: 12345,
      z: 'A',
    };

    it('should fetch latest trade successfully', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: { trade: mockTrade },
      });

      const result = await alpacaClient.getLatestStockTrade('AAPL');

      expect(result).toEqual(mockTrade);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/v2/stocks/AAPL/trades/latest', {
        params: {
          feed: 'iex',
        },
      });
    });

    it('should return null when no trade data', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: { trade: null },
      });

      const result = await alpacaClient.getLatestStockTrade('AAPL');

      expect(result).toBeNull();
    });

    it('should return null on error', async () => {
      mockAxiosInstance.get.mockRejectedValue(new Error('API Error'));

      const result = await alpacaClient.getLatestStockTrade('AAPL');

      expect(result).toBeNull();
    });
  });

  describe('getLatestStockBar', () => {
    const mockBar: AlpacaBar = {
      t: '2023-01-01T09:30:00Z',
      o: 100,
      h: 105,
      l: 95,
      c: 102,
      v: 1000,
      n: 50,
      vw: 101.5,
    };

    it('should fetch latest bar successfully', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: { bar: mockBar },
      });

      const result = await alpacaClient.getLatestStockBar('AAPL');

      expect(result).toEqual(mockBar);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/v2/stocks/AAPL/bars/latest', {
        params: {
          feed: 'iex',
        },
      });
    });

    it('should return null when no bar data', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: { bar: null },
      });

      const result = await alpacaClient.getLatestStockBar('AAPL');

      expect(result).toBeNull();
    });

    it('should return null on error', async () => {
      mockAxiosInstance.get.mockRejectedValue(new Error('API Error'));

      const result = await alpacaClient.getLatestStockBar('AAPL');

      expect(result).toBeNull();
    });
  });

  describe('logRequest', () => {
    it('should not log request when logRequests is disabled', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      (alpacaClient as any).logRequest('GET', '/test', { param: 'value' });

      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should handle request without params', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      (alpacaClient as any).logRequest('GET', '/test');

      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('rate limiting', () => {
    it('should use rate limiter for all API calls', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: { bars: [] },
      });

      await alpacaClient.getHistoricalStockBars('AAPL', new Date('2023-01-01'), new Date('2023-01-02'));

      expect(getAlpacaRateLimiter).toHaveBeenCalled();
    });

    it('should pass function to rate limiter execute method', async () => {
      const executeSpy = jest.spyOn((getAlpacaRateLimiter as jest.Mock).mock.results[0].value, 'execute');
      mockAxiosInstance.get.mockResolvedValue({
        data: { bars: [] },
      });

      await alpacaClient.getHistoricalStockBars('AAPL', new Date('2023-01-01'), new Date('2023-01-02'));

      expect(executeSpy).toHaveBeenCalledWith(expect.any(Function));
    });
  });

  describe('error handling', () => {
    it('should handle axios errors with response data', async () => {
      const error = {
        response: {
          status: 429,
          statusText: 'Too Many Requests',
          data: { message: 'Rate limit exceeded' },
        },
      };

      mockAxiosInstance.get.mockRejectedValue(error);
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      try {
        await alpacaClient.getHistoricalStockBars('AAPL', new Date('2023-01-01'), new Date('2023-01-02'));
        fail('Expected function to throw');
      } catch (thrownError) {
        expect(thrownError).toBe(error);
        expect(consoleErrorSpy).toHaveBeenCalledWith('Error fetching historical bars for AAPL:', error);
        expect(consoleErrorSpy).toHaveBeenCalledWith('API Response Status: 429 Too Many Requests');
        expect(consoleErrorSpy).toHaveBeenCalledWith('API Response Data:', { message: 'Rate limit exceeded' });
      }

      consoleErrorSpy.mockRestore();
    });

    it('should handle errors without response data', async () => {
      const error = new Error('Network error');
      mockAxiosInstance.get.mockRejectedValue(error);
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      await expect(
        alpacaClient.getHistoricalStockBars('AAPL', new Date('2023-01-01'), new Date('2023-01-02'))
      ).rejects.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error fetching historical bars for AAPL:', error);

      consoleErrorSpy.mockRestore();
    });
  });
});
