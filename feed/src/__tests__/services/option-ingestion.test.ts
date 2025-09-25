// Test file for OptionIngestionService
import { OptionIngestionService } from '../../services/option-ingestion';
import { setupTestEnvironment, cleanupTestEnvironment } from '../test-utils/database';

// Mock p-limit
jest.mock('p-limit', () => {
  return jest.fn(() => jest.fn(fn => fn()));
});

// Mock PolygonClient
jest.mock('../../services/polygon-client', () => ({
  PolygonClient: jest.fn().mockImplementation(() => ({
    getOptionContracts: jest.fn(),
    getOptionTrades: jest.fn(),
    getOptionQuotes: jest.fn(),
  })),
}));

// Mock database connection
jest.mock('../../db/connection', () => ({
  db: {
    query: jest.fn(),
    bulkInsert: jest.fn(),
  },
}));

import { db } from '../../db/connection';
import { PolygonClient } from '../../services/polygon-client';

const mockedDb = db as jest.Mocked<typeof db>;

// Mock the static method
(PolygonClient as any).convertTimestamp = jest.fn((timestamp: number, isNanoseconds: boolean) => {
  return new Date(timestamp / (isNanoseconds ? 1000000 : 1));
});

describe('OptionIngestionService', () => {
  let optionIngestionService: OptionIngestionService;
  let mockPolygonClient: any;

  beforeAll(async () => {
    await setupTestEnvironment();
  });

  afterAll(async () => {
    await cleanupTestEnvironment();
  });

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Create fresh instance
    optionIngestionService = new OptionIngestionService();

    // Get the mocked polygon client instance
    mockPolygonClient = (optionIngestionService as any).polygonClient;
  });

  describe('ingestOptionContracts', () => {
    it('should ingest option contracts successfully', async () => {
      // Arrange
      const underlyingTicker = 'AAPL';
      const asOf = new Date('2024-01-01');
      const mockContracts = [
        {
          ticker: 'O:AAPL240315C00150000',
          contract_type: 'call',
          exercise_style: 'american',
          expiration_date: '2024-03-15',
          shares_per_contract: 100,
          strike_price: 150.0,
          underlying_ticker: 'AAPL',
        },
        {
          ticker: 'O:AAPL240315P00150000',
          contract_type: 'put',
          exercise_style: 'american',
          expiration_date: '2024-03-15',
          shares_per_contract: 100,
          strike_price: 150.0,
          underlying_ticker: 'AAPL',
        },
      ];

      mockPolygonClient.getOptionContracts.mockResolvedValue(mockContracts);
      mockedDb.query.mockResolvedValue({});

      // Act
      await optionIngestionService.ingestOptionContracts(underlyingTicker, asOf);

      // Assert
      expect(mockPolygonClient.getOptionContracts).toHaveBeenCalledWith(underlyingTicker, asOf);
      expect(mockedDb.query).toHaveBeenCalledTimes(2); // One call per contract
    });

    it('should handle errors during contract ingestion', async () => {
      // Arrange
      const underlyingTicker = 'INVALID';
      const asOf = new Date('2024-01-01');
      const error = new Error('Polygon API error');

      mockPolygonClient.getOptionContracts.mockRejectedValue(error);

      // Act & Assert
      await expect(optionIngestionService.ingestOptionContracts(underlyingTicker, asOf)).rejects.toThrow(
        'Polygon API error'
      );
    });

    it('should handle empty contract list', async () => {
      // Arrange
      const underlyingTicker = 'AAPL';
      const asOf = new Date('2024-01-01');

      mockPolygonClient.getOptionContracts.mockResolvedValue([]);

      // Act
      await optionIngestionService.ingestOptionContracts(underlyingTicker, asOf);

      // Assert
      expect(mockPolygonClient.getOptionContracts).toHaveBeenCalledWith(underlyingTicker, asOf);
      expect(mockedDb.query).not.toHaveBeenCalled();
    });
  });

  describe('ingestOptionTrades', () => {
    it('should ingest option trades successfully', async () => {
      // Arrange
      const ticker = 'AAPL240315C00150000';
      const from = new Date('2024-01-01T09:00:00Z');
      const to = new Date('2024-01-01T17:00:00Z');
      const mockTrades = [
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
        {
          ticker: 'O:AAPL240315C00150000',
          sip_timestamp: 1704110400000000000,
          price: 5.5,
          size: 5,
          conditions: ['regular'],
          exchange: 1,
          tape: 1,
          sequence_number: 12346,
        },
      ];

      mockPolygonClient.getOptionTrades.mockResolvedValue(mockTrades);
      mockedDb.bulkInsert.mockResolvedValue({});

      // Act
      await optionIngestionService.ingestOptionTrades(ticker, from, to);

      // Assert
      expect(mockPolygonClient.getOptionTrades).toHaveBeenCalledWith(ticker, from, to);
      expect(mockedDb.bulkInsert).toHaveBeenCalledTimes(1);
    });

    it('should skip trades when underlying ticker cannot be extracted', async () => {
      // Arrange
      const ticker = '123456789'; // This should return null
      const from = new Date('2024-01-01T09:00:00Z');
      const to = new Date('2024-01-01T17:00:00Z');

      // Act
      await optionIngestionService.ingestOptionTrades(ticker, from, to);

      // Assert
      expect(mockPolygonClient.getOptionTrades).not.toHaveBeenCalled();
      expect(mockedDb.bulkInsert).not.toHaveBeenCalled();
    });

    it('should handle errors during trade ingestion', async () => {
      // Arrange
      const ticker = 'O:AAPL240315C00150000';
      const from = new Date('2024-01-01T09:00:00Z');
      const to = new Date('2024-01-01T17:00:00Z');
      const error = new Error('Database error');

      mockPolygonClient.getOptionTrades.mockResolvedValue([
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
      ]);
      mockedDb.bulkInsert.mockRejectedValue(error);

      // Act & Assert
      await expect(optionIngestionService.ingestOptionTrades(ticker, from, to)).rejects.toThrow('Database error');
    });
  });

  describe('ingestOptionQuotes', () => {
    it('should ingest option quotes successfully', async () => {
      // Arrange
      const ticker = 'AAPL240315C00150000';
      const from = new Date('2024-01-01T09:00:00Z');
      const to = new Date('2024-01-01T17:00:00Z');
      const mockQuotes = [
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
      ];

      mockPolygonClient.getOptionQuotes.mockResolvedValue(mockQuotes);
      mockedDb.bulkInsert.mockResolvedValue({});

      // Act
      await optionIngestionService.ingestOptionQuotes(ticker, from, to);

      // Assert
      expect(mockPolygonClient.getOptionQuotes).toHaveBeenCalledWith(ticker, from, to);
      expect(mockedDb.bulkInsert).toHaveBeenCalledTimes(1);
    });
  });

  describe('extractUnderlyingTicker', () => {
    it('should extract underlying ticker from option symbol', () => {
      const service = optionIngestionService as any;

      expect(service.extractUnderlyingTicker('O:AAPL240315C00150000')).toBe('AAPL');
      expect(service.extractUnderlyingTicker('O:GOOGL240315C00150000')).toBe('GOOGL');
      expect(service.extractUnderlyingTicker('O:TSLA240315P00150000')).toBe('TSLA');
    });

    it('should return null for invalid option symbols', () => {
      const service = optionIngestionService as any;

      expect(service.extractUnderlyingTicker('')).toBeNull();
      expect(service.extractUnderlyingTicker('123456789')).toBeNull();
      expect(service.extractUnderlyingTicker('!@#$%')).toBeNull();
    });
  });
});
