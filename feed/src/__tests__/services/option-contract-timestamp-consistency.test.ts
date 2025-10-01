import { OptionIngestionService } from '../../services/option-ingestion';
import { InsertIfNotExistsService } from '../../utils/insert-if-not-exists';
import { normalizeToMidnight } from '@whalewatch/shared';
import { setupTestEnvironment, cleanupTestEnvironment } from '../test-utils/database';
import { waitForSingleRecordWithCondition } from '../test-utils/data-verification';

// Mock PolygonClient
jest.mock('../../services/polygon-client', () => ({
  PolygonClient: jest.fn().mockImplementation(() => ({
    getOptionContracts: jest.fn().mockResolvedValue([]),
  })),
}));

// Mock config
jest.mock('../../config', () => ({
  config: {
    polygon: {
      skipOptionContracts: false,
      skipOptionTrades: true,
      skipOptionQuotes: true,
    },
  },
}));

describe('Option Contract Index Timestamp Consistency', () => {
  let optionIngestionService: OptionIngestionService;

  beforeAll(async () => {
    await setupTestEnvironment();
  });

  afterAll(async () => {
    await cleanupTestEnvironment();
  });

  beforeEach(() => {
    optionIngestionService = new OptionIngestionService();
  });

  describe('Timestamp Normalization', () => {
    it('should store consistent midnight timestamps for the same date', async () => {
      // Arrange
      const uniqueId = Date.now();
      const underlyingTicker = `TIMESTAMPTEST_${uniqueId}`;

      // Create different times for the same date
      const morningTime = new Date('2024-01-15T08:30:45.123Z');
      const afternoonTime = new Date('2024-01-15T16:45:30.456Z');
      const eveningTime = new Date('2024-01-15T23:59:59.999Z');

      // Act - Insert index records with different times for the same date
      const index1: any = {
        underlying_ticker: underlyingTicker,
        as_of: normalizeToMidnight(morningTime),
      };
      await InsertIfNotExistsService.insertOptionContractIndexIfNotExists(index1);

      const index2: any = {
        underlying_ticker: underlyingTicker,
        as_of: normalizeToMidnight(afternoonTime),
      };
      await InsertIfNotExistsService.insertOptionContractIndexIfNotExists(index2);

      const index3: any = {
        underlying_ticker: underlyingTicker,
        as_of: normalizeToMidnight(eveningTime),
      };
      await InsertIfNotExistsService.insertOptionContractIndexIfNotExists(index3);

      // Assert - All timestamps should be identical (midnight)
      const result = await waitForSingleRecordWithCondition(
        'test_option_contracts_index',
        `underlying_ticker = '${underlyingTicker}'`
      );

      const storedTimestamp = new Date(result.as_of as string);
      expect(storedTimestamp.getHours()).toBe(0);
      expect(storedTimestamp.getMinutes()).toBe(0);
      expect(storedTimestamp.getSeconds()).toBe(0);
      expect(storedTimestamp.getMilliseconds()).toBe(0);
    });

    it('should prevent duplicate entries for the same date with different times', async () => {
      // Arrange
      const uniqueId = Date.now();
      const underlyingTicker = `DUPLICATETEST_${uniqueId}`;

      const morningTime = new Date('2024-01-20T09:15:30.123Z');
      const eveningTime = new Date('2024-01-20T21:45:15.789Z');

      // Act - Insert two records for the same date with different times
      const index1: any = {
        underlying_ticker: underlyingTicker,
        as_of: normalizeToMidnight(morningTime),
      };
      await InsertIfNotExistsService.insertOptionContractIndexIfNotExists(index1);

      const index2: any = {
        underlying_ticker: underlyingTicker,
        as_of: normalizeToMidnight(eveningTime),
      };
      await InsertIfNotExistsService.insertOptionContractIndexIfNotExists(index2);

      // Assert - Should only have one record (upserted)
      const result = await waitForSingleRecordWithCondition(
        'test_option_contracts_index',
        `underlying_ticker = '${underlyingTicker}'`
      );

      expect(result).toBeDefined();
      expect(result.underlying_ticker).toBe(underlyingTicker);

      // The timestamp should be normalized to midnight
      const storedTimestamp = new Date(result.as_of as string);
      expect(storedTimestamp.getHours()).toBe(0);
      expect(storedTimestamp.getMinutes()).toBe(0);
      expect(storedTimestamp.getSeconds()).toBe(0);
      expect(storedTimestamp.getMilliseconds()).toBe(0);
    });

    it('should handle option contract ingestion with normalized timestamps', async () => {
      // Arrange
      const uniqueId = Date.now();
      const underlyingTicker = `INGESTIONTEST_${uniqueId}`;
      const asOfTime = new Date('2024-01-25T14:30:45.123Z');

      // Act - Ingest option contracts (this should normalize the timestamp)
      await optionIngestionService.ingestOptionContracts(underlyingTicker, asOfTime);

      // Assert - Check that the index record has a normalized timestamp
      const result = await waitForSingleRecordWithCondition(
        'test_option_contracts_index',
        `underlying_ticker = '${underlyingTicker}'`
      );

      expect(result).toBeDefined();
      expect(result.underlying_ticker).toBe(underlyingTicker);

      // The timestamp should be normalized to midnight
      const storedTimestamp = new Date(result.as_of as string);
      expect(storedTimestamp.getHours()).toBe(0);
      expect(storedTimestamp.getMinutes()).toBe(0);
      expect(storedTimestamp.getSeconds()).toBe(0);
      expect(storedTimestamp.getMilliseconds()).toBe(0);

      // But the date should be preserved
      expect(storedTimestamp.getFullYear()).toBe(2024);
      expect(storedTimestamp.getMonth()).toBe(0); // January
      expect(storedTimestamp.getDate()).toBe(25);
    });

    it('should maintain consistency across multiple days', async () => {
      // Arrange
      const uniqueId = Date.now();
      const underlyingTicker = `MULTIDAYTEST_${uniqueId}`;

      const day1Morning = new Date('2024-01-10T08:30:45.123Z');
      const day1Evening = new Date('2024-01-10T20:15:30.456Z');
      const day2Morning = new Date('2024-01-11T09:45:15.789Z');
      const day2Evening = new Date('2024-01-11T19:30:45.012Z');

      // Act - Insert records for different days with varying times
      const records = [
        { underlying_ticker: underlyingTicker, as_of: normalizeToMidnight(day1Morning) },
        { underlying_ticker: underlyingTicker, as_of: normalizeToMidnight(day1Evening) },
        { underlying_ticker: underlyingTicker, as_of: normalizeToMidnight(day2Morning) },
        { underlying_ticker: underlyingTicker, as_of: normalizeToMidnight(day2Evening) },
      ];

      for (const record of records) {
        await InsertIfNotExistsService.insertOptionContractIndexIfNotExists(record);
      }

      // Assert - Should have records for both days, each normalized to midnight
      const results = await optionIngestionService.getOldestAsOfDate(underlyingTicker);

      // The oldest date should be normalized to midnight
      expect(results).toBeDefined();
      expect(results!.getHours()).toBe(0);
      expect(results!.getMinutes()).toBe(0);
      expect(results!.getSeconds()).toBe(0);
      expect(results!.getMilliseconds()).toBe(0);
    });
  });
});
