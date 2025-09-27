// Comprehensive integration test for option contract backfill with new schema
import { OptionIngestionService } from '../../services/option-ingestion';
import { BackfillService } from '../../services/backfill';
import { setupTestEnvironment, cleanupTestEnvironment } from '../test-utils/database';
import { OptionContract, OptionContractIndex } from '../../types/database';
import { PolygonOptionContract } from '../../types/polygon';

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

// Mock StockIngestionService
jest.mock('../../services/stock-ingestion', () => ({
  StockIngestionService: jest.fn().mockImplementation(() => ({
    getHistoricalBars: jest.fn(),
  })),
}));

// Mock config
jest.mock('../../config', () => ({
  config: {
    tickers: ['TEST'],
    polygon: {
      skipOptionContracts: false,
      skipOptionTrades: true,
      skipOptionQuotes: true,
    },
    app: {
      backfillMaxDays: 7,
    },
  },
}));

import { db } from '../../db/connection';
import { PolygonClient } from '../../services/polygon-client';
import { config } from '../../config';

const mockedDb = db as jest.Mocked<typeof db>;

// Mock the static method
(PolygonClient as any).convertTimestamp = jest.fn((timestamp: number, isNanoseconds: boolean) => {
  return new Date(timestamp / (isNanoseconds ? 1000000 : 1));
});

describe('Option Contract Backfill Integration with New Schema', () => {
  let optionIngestionService: OptionIngestionService;
  let backfillService: BackfillService;
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

    // Create fresh instances
    optionIngestionService = new OptionIngestionService();
    backfillService = new BackfillService();

    // Get the mocked polygon client instance
    mockPolygonClient = (optionIngestionService as any).polygonClient;
  });

  describe('Full Backfill Process with New Schema', () => {
    it('should complete full backfill process with option contract index tracking', async () => {
      // Arrange
      const underlyingTicker = 'TEST';
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-03');

      // Mock option contracts for different dates
      const mockContractsDay1: PolygonOptionContract[] = [
        {
          ticker: 'O:TEST240315C00150000',
          contract_type: 'call',
          exercise_style: 'american',
          expiration_date: '2024-03-15',
          shares_per_contract: 100,
          strike_price: 150.0,
          underlying_ticker: 'TEST',
        },
        {
          ticker: 'O:TEST240315P00150000',
          contract_type: 'put',
          exercise_style: 'american',
          expiration_date: '2024-03-15',
          shares_per_contract: 100,
          strike_price: 150.0,
          underlying_ticker: 'TEST',
        },
      ];

      const mockContractsDay2: PolygonOptionContract[] = [
        {
          ticker: 'O:TEST240315C00150000',
          contract_type: 'call',
          exercise_style: 'american',
          expiration_date: '2024-03-15',
          shares_per_contract: 100,
          strike_price: 155.0, // Updated price
          underlying_ticker: 'TEST',
        },
        {
          ticker: 'O:TEST240315P00150000',
          contract_type: 'put',
          exercise_style: 'american',
          expiration_date: '2024-03-15',
          shares_per_contract: 100,
          strike_price: 155.0, // Updated price
          underlying_ticker: 'TEST',
        },
        {
          ticker: 'O:TEST240315C00160000', // New contract
          contract_type: 'call',
          exercise_style: 'american',
          expiration_date: '2024-03-15',
          shares_per_contract: 100,
          strike_price: 160.0,
          underlying_ticker: 'TEST',
        },
      ];

      const mockContractsDay3: PolygonOptionContract[] = [
        {
          ticker: 'O:TEST240315C00150000',
          contract_type: 'call',
          exercise_style: 'american',
          expiration_date: '2024-03-15',
          shares_per_contract: 100,
          strike_price: 160.0, // Updated price
          underlying_ticker: 'TEST',
        },
        {
          ticker: 'O:TEST240315P00150000',
          contract_type: 'put',
          exercise_style: 'american',
          expiration_date: '2024-03-15',
          shares_per_contract: 100,
          strike_price: 160.0, // Updated price
          underlying_ticker: 'TEST',
        },
        {
          ticker: 'O:TEST240315C00160000',
          contract_type: 'call',
          exercise_style: 'american',
          expiration_date: '2024-03-15',
          shares_per_contract: 100,
          strike_price: 165.0, // Updated price
          underlying_ticker: 'TEST',
        },
        {
          ticker: 'O:TEST240315P00160000', // New contract
          contract_type: 'put',
          exercise_style: 'american',
          expiration_date: '2024-03-15',
          shares_per_contract: 100,
          strike_price: 160.0,
          underlying_ticker: 'TEST',
        },
      ];

      // Mock polygon client responses for different dates
      mockPolygonClient.getOptionContracts
        .mockResolvedValueOnce(mockContractsDay1) // Day 1
        .mockResolvedValueOnce(mockContractsDay2) // Day 2
        .mockResolvedValueOnce(mockContractsDay3); // Day 3

      // Mock database responses for contract upserts
      mockedDb.query.mockResolvedValue({
        columns: [{ name: 'ticker', type: 'STRING' }],
        dataset: [],
      });

      // Mock database responses for index upserts
      mockedDb.query
        .mockResolvedValueOnce({
          columns: [
            { name: 'underlying_ticker', type: 'SYMBOL' },
            { name: 'as_of', type: 'TIMESTAMP' },
          ],
          dataset: [],
        })
        .mockResolvedValueOnce({
          columns: [{ name: 'result', type: 'STRING' }],
          dataset: [['OK']],
        })
        .mockResolvedValueOnce({
          columns: [
            { name: 'underlying_ticker', type: 'SYMBOL' },
            { name: 'as_of', type: 'TIMESTAMP' },
          ],
          dataset: [],
        })
        .mockResolvedValueOnce({
          columns: [{ name: 'result', type: 'STRING' }],
          dataset: [['OK']],
        })
        .mockResolvedValueOnce({
          columns: [
            { name: 'underlying_ticker', type: 'SYMBOL' },
            { name: 'as_of', type: 'TIMESTAMP' },
          ],
          dataset: [],
        })
        .mockResolvedValueOnce({
          columns: [{ name: 'result', type: 'STRING' }],
          dataset: [['OK']],
        });

      // Act - Run the backfill process
      await optionIngestionService.processOptionContractsBackfill(underlyingTicker, startDate, endDate);

      // Assert
      // Verify that contracts were fetched for each day
      expect(mockPolygonClient.getOptionContracts).toHaveBeenCalledTimes(3);
      expect(mockPolygonClient.getOptionContracts).toHaveBeenCalledWith(underlyingTicker, startDate);
      expect(mockPolygonClient.getOptionContracts).toHaveBeenCalledWith(underlyingTicker, new Date('2024-01-02'));
      expect(mockPolygonClient.getOptionContracts).toHaveBeenCalledWith(underlyingTicker, endDate);

      // Verify that index records were created for each day
      expect(mockedDb.query).toHaveBeenCalledWith(
        'INSERT INTO test_option_contract_index (underlying_ticker, as_of, sync_date) VALUES ($1, $2, $3)',
        [underlyingTicker, startDate, expect.any(Date)]
      );
      expect(mockedDb.query).toHaveBeenCalledWith(
        'INSERT INTO test_option_contract_index (underlying_ticker, as_of, sync_date) VALUES ($1, $2, $3)',
        [underlyingTicker, new Date('2024-01-02'), expect.any(Date)]
      );
      expect(mockedDb.query).toHaveBeenCalledWith(
        'INSERT INTO test_option_contract_index (underlying_ticker, as_of, sync_date) VALUES ($1, $2, $3)',
        [underlyingTicker, endDate, expect.any(Date)]
      );
    });
  });

  describe('Backfill Service Integration with New Schema', () => {
    it('should use option_contract_index for tracking sync dates', async () => {
      // Arrange
      const underlyingTicker = 'TEST';
      const endDate = new Date('2024-01-05');

      // Mock that we have existing index data
      mockedDb.query
        .mockResolvedValueOnce({
          columns: [{ name: 'min_date', type: 'TIMESTAMP' }],
          dataset: [['2024-01-01T00:00:00.000Z']],
        })
        .mockResolvedValueOnce({
          columns: [{ name: 'result', type: 'STRING' }],
          dataset: [['OK']],
        });

      // Mock polygon client
      mockPolygonClient.getOptionContracts.mockResolvedValue([]);

      // Act
      await backfillService.backfillTickerToDate(underlyingTicker, endDate);

      // Assert
      // Verify that getOldestAsOfDate was called (which queries option_contract_index)
      expect(mockedDb.query).toHaveBeenCalledWith(
        "SELECT MIN(as_of) as min_date FROM test_option_contract_index WHERE underlying_ticker = 'TEST'"
      );
    });

    it('should handle case when no existing option contracts exist', async () => {
      // Arrange
      const underlyingTicker = 'TEST';
      const endDate = new Date('2024-01-05');

      // Mock that no existing index data exists
      mockedDb.query
        .mockResolvedValueOnce({
          columns: [{ name: 'min_date', type: 'TIMESTAMP' }],
          dataset: [[null]],
        })
        .mockResolvedValueOnce({
          columns: [{ name: 'result', type: 'STRING' }],
          dataset: [['OK']],
        });

      // Mock polygon client
      mockPolygonClient.getOptionContracts.mockResolvedValue([]);

      // Act
      await backfillService.backfillTickerToDate(underlyingTicker, endDate);

      // Assert
      // Verify that getOldestAsOfDate was called and returned null
      expect(mockedDb.query).toHaveBeenCalledWith(
        "SELECT MIN(as_of) as min_date FROM test_option_contract_index WHERE underlying_ticker = 'TEST'"
      );
    });
  });

  describe('Real Database Integration with New Schema', () => {
    it('should complete full backfill process with real QuestDB', async () => {
      // This test uses real QuestDB connection
      const underlyingTicker = 'REALTEST';
      const asOf = new Date('2024-01-01');

      // Create some test contracts
      const contracts: OptionContract[] = [
        {
          ticker: 'O:REALTEST240315C00150000',
          contract_type: 'call',
          exercise_style: 'american',
          expiration_date: new Date('2024-03-15'),
          shares_per_contract: 100,
          strike_price: 150.0,
          underlying_ticker: underlyingTicker,
        },
        {
          ticker: 'O:REALTEST240315P00150000',
          contract_type: 'put',
          exercise_style: 'american',
          expiration_date: new Date('2024-03-15'),
          shares_per_contract: 100,
          strike_price: 150.0,
          underlying_ticker: underlyingTicker,
        },
      ];

      // Upsert contracts
      await UpsertService.batchUpsertOptionContracts(contracts);

      // Create index record
      const index: OptionContractIndex = {
        underlying_ticker: underlyingTicker,
        as_of: asOf,
      };
      await UpsertService.upsertOptionContractIndex(index);

      // Verify contracts were stored without as_of field
      const contractResult = await db.query('SELECT * FROM test_option_contracts WHERE underlying_ticker = $1', [
        underlyingTicker,
      ]);

      const contractQuestResult = contractResult as {
        columns: { name: string; type: string }[];
        dataset: unknown[][];
      };

      expect(contractQuestResult.dataset).toHaveLength(2);
      expect(contractQuestResult.columns).toHaveLength(7); // No as_of field
      expect(contractQuestResult.columns.map(c => c.name)).toEqual([
        'ticker',
        'contract_type',
        'exercise_style',
        'expiration_date',
        'shares_per_contract',
        'strike_price',
        'underlying_ticker',
      ]);

      // Verify index record was stored
      const indexResult = await db.query('SELECT * FROM test_option_contract_index WHERE underlying_ticker = $1', [
        underlyingTicker,
      ]);

      const indexQuestResult = indexResult as {
        columns: { name: string; type: string }[];
        dataset: unknown[][];
      };

      expect(indexQuestResult.dataset).toHaveLength(1);
      expect(indexQuestResult.columns).toHaveLength(2);
      expect(indexQuestResult.columns.map(c => c.name)).toEqual(['underlying_ticker', 'as_of']);
    });

    it('should handle upserting same contracts multiple times with different as_of dates', async () => {
      // This test uses real QuestDB connection
      const underlyingTicker = 'UPDATETEST';
      const asOf1 = new Date('2024-01-01');
      const asOf2 = new Date('2024-01-02');

      // Create initial contracts
      const contracts1: OptionContract[] = [
        {
          ticker: 'O:UPDATETEST240315C00150000',
          contract_type: 'call',
          exercise_style: 'american',
          expiration_date: new Date('2024-03-15'),
          shares_per_contract: 100,
          strike_price: 150.0,
          underlying_ticker: underlyingTicker,
        },
      ];

      // Upsert contracts for first date
      await UpsertService.batchUpsertOptionContracts(contracts1);
      await UpsertService.upsertOptionContractIndex({
        underlying_ticker: underlyingTicker,
        as_of: asOf1,
      });

      // Update contracts for second date
      const contracts2: OptionContract[] = [
        {
          ticker: 'O:UPDATETEST240315C00150000',
          contract_type: 'call',
          exercise_style: 'american',
          expiration_date: new Date('2024-03-15'),
          shares_per_contract: 100,
          strike_price: 155.0, // Updated price
          underlying_ticker: underlyingTicker,
        },
      ];

      // Upsert updated contracts for second date
      await UpsertService.batchUpsertOptionContracts(contracts2);
      await UpsertService.upsertOptionContractIndex({
        underlying_ticker: underlyingTicker,
        as_of: asOf2,
      });

      // Verify only one contract record exists (upserted)
      const contractResult = await db.query('SELECT * FROM test_option_contracts WHERE underlying_ticker = $1', [
        underlyingTicker,
      ]);

      const contractQuestResult = contractResult as {
        columns: { name: string; type: string }[];
        dataset: unknown[][];
      };

      expect(contractQuestResult.dataset).toHaveLength(1);
      expect(contractQuestResult.dataset[0][5]).toBe(155.0); // Updated strike price

      // Verify two index records exist
      const indexResult = await db.query(
        'SELECT * FROM test_option_contract_index WHERE underlying_ticker = $1 ORDER BY as_of',
        [underlyingTicker]
      );

      const indexQuestResult = indexResult as {
        columns: { name: string; type: string }[];
        dataset: unknown[][];
      };

      expect(indexQuestResult.dataset).toHaveLength(2);
      expect(new Date(indexQuestResult.dataset[0][1] as string)).toEqual(asOf1);
      expect(new Date(indexQuestResult.dataset[1][1] as string)).toEqual(asOf2);
    });
  });
});
