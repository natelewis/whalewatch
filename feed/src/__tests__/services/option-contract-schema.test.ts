// Comprehensive test file for the new option contract schema structure
import { OptionIngestionService } from '../../services/option-ingestion';
import { UpsertService } from '../../utils/upsert';
import { setupTestEnvironment, cleanupTestEnvironment } from '../test-utils/database';
import { waitForSingleRecordWithCondition, waitForRecordsWithCondition } from '../test-utils/data-verification';
import { OptionContract, OptionContractIndex } from '../../types/database';
import { PolygonOptionContract } from '../../types/polygon';

// Mock p-limit
jest.mock('p-limit', () => {
  return jest.fn(() => jest.fn(fn => fn()));
});

// Don't mock the database connection - we'll mock it manually in tests that need it

// Mock PolygonClient
jest.mock('../../services/polygon-client', () => ({
  PolygonClient: jest.fn().mockImplementation(() => ({
    getOptionContracts: jest.fn(),
    getOptionTrades: jest.fn(),
    getOptionQuotes: jest.fn(),
  })),
}));

// Mock config
jest.mock('../../config', () => ({
  config: {
    tickers: ['AAPL', 'GOOGL', 'TSLA'],
    polygon: {
      skipOptionContracts: false,
      skipOptionTrades: false,
      skipOptionQuotes: false,
    },
  },
}));

// Mock shared functions
jest.mock('@whalewatch/shared', () => ({
  getMaxDate: jest.fn(),
  getMinDate: jest.fn(),
  QuestDBServiceInterface: jest.fn(),
}));

import { PolygonClient } from '../../services/polygon-client';

// Mock the static method
(PolygonClient as any).convertTimestamp = jest.fn((timestamp: number, isNanoseconds: boolean) => {
  return new Date(timestamp / (isNanoseconds ? 1000000 : 1));
});

describe('Option Contract Schema Migration', () => {
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

  describe('Option Contract Upsert (No as_of field)', () => {
    beforeEach(() => {
      // Don't mock the database - use real QuestDB for integration tests
    });

    it('should upsert option contract without as_of field', async () => {
      // Arrange - Use unique ticker to avoid conflicts
      const uniqueId = Date.now();
      const contract: OptionContract = {
        ticker: `O:AAPL${uniqueId}240315C00150000`,
        contract_type: 'call',
        exercise_style: 'american',
        expiration_date: new Date('2024-03-15'),
        shares_per_contract: 100,
        strike_price: 150.0,
        underlying_ticker: `AAPL_${uniqueId}`,
      };

      // Act - Use real database
      await UpsertService.upsertOptionContract(contract);

      // Assert - Verify the record was created in real database
      const questResult = await waitForSingleRecordWithCondition(
        'test_option_contracts',
        `ticker = '${contract.ticker}'`
      );

      expect(questResult.ticker).toBe(contract.ticker);
      expect(questResult.contract_type).toBe(contract.contract_type);
      expect(questResult.exercise_style).toBe(contract.exercise_style);
      expect(new Date(questResult.expiration_date as string)).toEqual(contract.expiration_date);
      expect(questResult.shares_per_contract).toBe(contract.shares_per_contract);
      expect(questResult.strike_price).toBe(contract.strike_price);
      expect(questResult.underlying_ticker).toBe(contract.underlying_ticker);
    });

    it('should update existing option contract without as_of field', async () => {
      // Arrange - Use unique ticker to avoid conflicts
      const uniqueId = Date.now();
      const contract: OptionContract = {
        ticker: `O:AAPL${uniqueId}240315C00150000`,
        contract_type: 'call',
        exercise_style: 'american',
        expiration_date: new Date('2024-03-15'),
        shares_per_contract: 100,
        strike_price: 150.0,
        underlying_ticker: `AAPL_${uniqueId}`,
      };

      // First insert
      await UpsertService.upsertOptionContract(contract);

      // Update the contract
      const updatedContract: OptionContract = {
        ...contract,
        contract_type: 'put',
        strike_price: 160.0,
      };

      // Act - Update with real database
      await UpsertService.upsertOptionContract(updatedContract);

      // Assert - Verify the record was updated in real database
      const questResult = await waitForSingleRecordWithCondition(
        'test_option_contracts',
        `ticker = '${contract.ticker}'`
      );

      expect(questResult.ticker).toBe(contract.ticker);
      expect(questResult.contract_type).toBe('put'); // Updated
      expect(questResult.strike_price).toBe(160.0); // Updated
      expect(questResult.underlying_ticker).toBe(contract.underlying_ticker);
    });
  });

  describe('Option Contract Index Management', () => {
    beforeEach(() => {
      // Don't mock the database - use real QuestDB for integration tests
    });

    it('should upsert option contract index record', async () => {
      // Arrange - Use unique ticker to avoid conflicts
      const uniqueId = Date.now();
      const index: OptionContractIndex = {
        underlying_ticker: `AAPL_${uniqueId}`,
        as_of: new Date('2024-01-01'),
      };

      // Act - Use real database
      await UpsertService.upsertOptionContractIndex(index);

      // Assert - Verify the record was created in real database
      const questResult = await waitForSingleRecordWithCondition(
        'test_option_contract_index',
        `underlying_ticker = '${index.underlying_ticker}'`
      );

      expect(questResult.underlying_ticker).toBe(index.underlying_ticker);
      expect(new Date(questResult.as_of as string)).toEqual(index.as_of);
    });

    it('should handle existing option contract index record', async () => {
      // Arrange - Use unique ticker to avoid conflicts
      const uniqueId = Date.now();
      const index: OptionContractIndex = {
        underlying_ticker: `AAPL_${uniqueId}`,
        as_of: new Date('2024-01-01'),
      };

      // First insert
      await UpsertService.upsertOptionContractIndex(index);

      // Act - Try to insert the same record again (should not create duplicate)
      await UpsertService.upsertOptionContractIndex(index);

      // Assert - Verify only one record exists
      const questResult = await waitForSingleRecordWithCondition(
        'test_option_contract_index',
        `underlying_ticker = '${index.underlying_ticker}'`
      );

      expect(questResult.underlying_ticker).toBe(index.underlying_ticker);
      expect(new Date(questResult.as_of as string)).toEqual(index.as_of);
    });
  });

  describe('Option Contract Ingestion with New Schema', () => {
    beforeEach(() => {
      // Don't mock the database - use real QuestDB for integration tests
      // External API calls are already mocked via PolygonClient mock
    });

    it('should ingest option contracts and track sync in index', async () => {
      // Arrange - Use unique ticker to avoid conflicts
      const uniqueId = Date.now();
      const underlyingTicker = `AAPL_${uniqueId}`;
      const asOf = new Date('2024-01-01');
      const mockContracts: PolygonOptionContract[] = [
        {
          ticker: `O:${underlyingTicker}240315C00150000`,
          contract_type: 'call',
          exercise_style: 'american',
          expiration_date: '2024-03-15',
          shares_per_contract: 100,
          strike_price: 150.0,
          underlying_ticker: underlyingTicker,
        },
        {
          ticker: `O:${underlyingTicker}240315P00150000`,
          contract_type: 'put',
          exercise_style: 'american',
          expiration_date: '2024-03-15',
          shares_per_contract: 100,
          strike_price: 150.0,
          underlying_ticker: underlyingTicker,
        },
      ];

      // Mock external API call with realistic data
      mockPolygonClient.getOptionContracts.mockResolvedValue(mockContracts);

      // Act - Use real database with mocked external API
      await optionIngestionService.ingestOptionContracts(underlyingTicker, asOf);

      // Assert - Verify external API was called
      expect(mockPolygonClient.getOptionContracts).toHaveBeenCalledWith(underlyingTicker, asOf);

      // Verify contracts were created in real database
      await waitForRecordsWithCondition('test_option_contracts', `underlying_ticker = '${underlyingTicker}'`, 2);

      // Verify index record was created in real database
      const questResult = await waitForSingleRecordWithCondition(
        'test_option_contract_index',
        `underlying_ticker = '${underlyingTicker}'`
      );

      expect(questResult.underlying_ticker).toBe(underlyingTicker);
      expect(new Date(questResult.as_of as string)).toEqual(asOf);
    });
  });

  describe('Date Tracking with New Schema', () => {
    beforeEach(() => {
      // Don't mock the database - use real QuestDB for integration tests
    });

    it('should get oldest as_of date from index table', async () => {
      // Arrange - Use unique ticker to avoid conflicts
      const uniqueId = Date.now();
      const underlyingTicker = `AAPL_${uniqueId}`;
      const expectedDate = new Date('2024-01-01T00:00:00.000Z');

      // Create test data in real database
      await UpsertService.upsertOptionContractIndex({
        underlying_ticker: underlyingTicker,
        as_of: expectedDate,
      });

      // Act - Use real database
      const result = await optionIngestionService.getOldestAsOfDate(underlyingTicker);

      // Assert
      expect(result).toEqual(expectedDate);
    });

    it('should get newest as_of date from index table', async () => {
      // Arrange - Use unique ticker to avoid conflicts
      const uniqueId = Date.now();
      const underlyingTicker = `AAPL_${uniqueId}`;
      const expectedDate = new Date('2024-01-15T00:00:00.000Z');

      // Create test data in real database
      await UpsertService.upsertOptionContractIndex({
        underlying_ticker: underlyingTicker,
        as_of: expectedDate,
      });

      // Act - Use real database
      const result = await optionIngestionService.getNewestAsOfDate(underlyingTicker);

      // Assert
      expect(result).toEqual(expectedDate);
    });

    it('should return null when no index data exists', async () => {
      // Arrange - Use unique ticker that doesn't exist
      const uniqueId = Date.now();
      const underlyingTicker = `NONEXISTENT_${uniqueId}`;

      // Act - Use real database
      const result = await optionIngestionService.getOldestAsOfDate(underlyingTicker);

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('Batch Upsert Option Contracts', () => {
    beforeEach(() => {
      // Don't mock the database - use real QuestDB for integration tests
    });

    it('should batch upsert multiple option contracts', async () => {
      // Arrange - Use unique ticker to avoid conflicts
      const uniqueId = Date.now();
      const contracts: OptionContract[] = [
        {
          ticker: `O:AAPL${uniqueId}240315C00150000`,
          contract_type: 'call',
          exercise_style: 'american',
          expiration_date: new Date('2024-03-15'),
          shares_per_contract: 100,
          strike_price: 150.0,
          underlying_ticker: `AAPL_${uniqueId}`,
        },
        {
          ticker: `O:AAPL${uniqueId}240315P00150000`,
          contract_type: 'put',
          exercise_style: 'american',
          expiration_date: new Date('2024-03-15'),
          shares_per_contract: 100,
          strike_price: 150.0,
          underlying_ticker: `AAPL_${uniqueId}`,
        },
      ];

      // Act - Use real database
      await UpsertService.batchUpsertOptionContracts(contracts);

      // Assert - Verify contracts were created in real database
      await waitForRecordsWithCondition('test_option_contracts', `underlying_ticker = 'AAPL_${uniqueId}'`, 2);

      // Verify the specific contracts exist
      const questResult1 = await waitForSingleRecordWithCondition(
        'test_option_contracts',
        `ticker = 'O:AAPL${uniqueId}240315C00150000'`
      );
      expect(questResult1.contract_type).toBe('call');

      const questResult2 = await waitForSingleRecordWithCondition(
        'test_option_contracts',
        `ticker = 'O:AAPL${uniqueId}240315P00150000'`
      );
      expect(questResult2.contract_type).toBe('put');
    });
  });
});
