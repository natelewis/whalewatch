// Comprehensive test file for the new option contract schema structure
import { OptionIngestionService } from '../../services/option-ingestion';
import { UpsertService } from '../../utils/upsert';
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

import { db } from '../../db/connection';
import { PolygonClient } from '../../services/polygon-client';
import { getMaxDate, getMinDate } from '@whalewatch/shared';

const mockedDb = db as jest.Mocked<typeof db>;

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
    it('should upsert option contract without as_of field', async () => {
      // Arrange
      const contract: OptionContract = {
        ticker: 'O:AAPL240315C00150000',
        contract_type: 'call',
        exercise_style: 'american',
        expiration_date: new Date('2024-03-15'),
        shares_per_contract: 100,
        strike_price: 150.0,
        underlying_ticker: 'AAPL',
      };

      // Mock database responses
      mockedDb.query
        .mockResolvedValueOnce({
          columns: [{ name: 'ticker', type: 'STRING' }],
          dataset: [],
        })
        .mockResolvedValueOnce({
          columns: [{ name: 'result', type: 'STRING' }],
          dataset: [['OK']],
        });

      // Act
      await UpsertService.upsertOptionContract(contract);

      // Assert
      expect(mockedDb.query).toHaveBeenCalledWith('SELECT ticker FROM test_option_contracts WHERE ticker = $1', [
        'O:AAPL240315C00150000',
      ]);
      expect(mockedDb.query).toHaveBeenCalledWith(
        'INSERT INTO test_option_contracts (ticker, contract_type, exercise_style, expiration_date, shares_per_contract, strike_price, underlying_ticker) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        ['O:AAPL240315C00150000', 'call', 'american', new Date('2024-03-15'), 100, 150.0, 'AAPL']
      );
    });

    it('should update existing option contract without as_of field', async () => {
      // Arrange
      const contract: OptionContract = {
        ticker: 'O:AAPL240315C00150000',
        contract_type: 'put',
        exercise_style: 'american',
        expiration_date: new Date('2024-03-15'),
        shares_per_contract: 100,
        strike_price: 160.0,
        underlying_ticker: 'AAPL',
      };

      // Mock database responses - contract exists
      mockedDb.query
        .mockResolvedValueOnce({
          columns: [{ name: 'ticker', type: 'STRING' }],
          dataset: [['O:AAPL240315C00150000']],
        })
        .mockResolvedValueOnce({
          columns: [{ name: 'result', type: 'STRING' }],
          dataset: [['OK']],
        });

      // Act
      await UpsertService.upsertOptionContract(contract);

      // Assert
      expect(mockedDb.query).toHaveBeenCalledWith('SELECT ticker FROM test_option_contracts WHERE ticker = $1', [
        'O:AAPL240315C00150000',
      ]);
      expect(mockedDb.query).toHaveBeenCalledWith(
        'UPDATE test_option_contracts SET contract_type = $1, exercise_style = $2, expiration_date = $3, shares_per_contract = $4, strike_price = $5, underlying_ticker = $6 WHERE ticker = $7',
        ['put', 'american', new Date('2024-03-15'), 100, 160.0, 'AAPL', 'O:AAPL240315C00150000']
      );
    });
  });

  describe('Option Contract Index Management', () => {
    it('should upsert option contract index record', async () => {
      // Arrange
      const index: OptionContractIndex = {
        underlying_ticker: 'AAPL',
        as_of: new Date('2024-01-01'),
      };

      // Mock database responses
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
        });

      // Act
      await UpsertService.upsertOptionContractIndex(index);

      // Assert
      expect(mockedDb.query).toHaveBeenCalledWith(
        'SELECT underlying_ticker, as_of FROM test_option_contract_index WHERE underlying_ticker = $1 AND as_of = $2',
        ['AAPL', new Date('2024-01-01')]
      );
      expect(mockedDb.query).toHaveBeenCalledWith(
        'INSERT INTO test_option_contract_index (underlying_ticker, as_of) VALUES ($1, $2)',
        ['AAPL', new Date('2024-01-01')]
      );
    });

    it('should update existing option contract index record', async () => {
      // Arrange
      const index: OptionContractIndex = {
        underlying_ticker: 'AAPL',
        as_of: new Date('2024-01-01'),
      };

      // Mock database responses - index exists
      mockedDb.query
        .mockResolvedValueOnce({
          columns: [
            { name: 'underlying_ticker', type: 'SYMBOL' },
            { name: 'as_of', type: 'TIMESTAMP' },
          ],
          dataset: [['AAPL', '2024-01-01T00:00:00.000Z']],
        })
        .mockResolvedValueOnce({
          columns: [{ name: 'result', type: 'STRING' }],
          dataset: [['OK']],
        });

      // Act
      await UpsertService.upsertOptionContractIndex(index);

      // Assert
      expect(mockedDb.query).toHaveBeenCalledWith(
        'SELECT underlying_ticker, as_of FROM test_option_contract_index WHERE underlying_ticker = $1 AND as_of = $2',
        ['AAPL', new Date('2024-01-01')]
      );
      // Since we removed sync_date, the record already exists and no update is needed
      expect(mockedDb.query).toHaveBeenCalledWith(
        'SELECT underlying_ticker, as_of FROM test_option_contract_index WHERE underlying_ticker = $1 AND as_of = $2',
        ['AAPL', new Date('2024-01-01')]
      );
    });
  });

  describe('Option Contract Ingestion with New Schema', () => {
    it('should ingest option contracts and track sync in index', async () => {
      // Arrange
      const underlyingTicker = 'AAPL';
      const asOf = new Date('2024-01-01');
      const mockContracts: PolygonOptionContract[] = [
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

      // Mock database responses for contract upserts
      mockedDb.query.mockResolvedValue({
        columns: [{ name: 'ticker', type: 'STRING' }],
        dataset: [],
      });

      // Mock database responses for index upsert
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
        });

      // Act
      await optionIngestionService.ingestOptionContracts(underlyingTicker, asOf);

      // Assert
      expect(mockPolygonClient.getOptionContracts).toHaveBeenCalledWith(underlyingTicker, asOf);

      // Verify that contracts were upserted (2 contracts)
      expect(mockedDb.query).toHaveBeenCalledTimes(5); // 2 contract checks + 2 contract inserts + 1 index insert

      // Verify index record was created
      expect(mockedDb.query).toHaveBeenCalledWith(
        'INSERT INTO test_option_contract_index (underlying_ticker, as_of) VALUES ($1, $2)',
        [underlyingTicker, asOf]
      );
    });
  });

  describe('Date Tracking with New Schema', () => {
    it('should get oldest as_of date from index table', async () => {
      // Arrange
      const underlyingTicker = 'AAPL';
      const expectedDate = new Date('2024-01-01T00:00:00.000Z');
      (getMinDate as jest.Mock).mockResolvedValue(expectedDate);

      // Act
      const result = await optionIngestionService.getOldestAsOfDate(underlyingTicker);

      // Assert
      expect(getMinDate).toHaveBeenCalledWith(
        expect.objectContaining({
          ticker: underlyingTicker,
          tickerField: 'underlying_ticker',
          dateField: 'as_of',
          table: 'option_contract_index',
        })
      );
      expect(result).toEqual(expectedDate);
    });

    it('should get newest as_of date from index table', async () => {
      // Arrange
      const underlyingTicker = 'AAPL';
      const expectedDate = new Date('2024-01-15T00:00:00.000Z');
      (getMaxDate as jest.Mock).mockResolvedValue(expectedDate);

      // Act
      const result = await optionIngestionService.getNewestAsOfDate(underlyingTicker);

      // Assert
      expect(getMaxDate).toHaveBeenCalledWith(
        expect.objectContaining({
          ticker: underlyingTicker,
          tickerField: 'underlying_ticker',
          dateField: 'as_of',
          table: 'option_contract_index',
        })
      );
      expect(result).toEqual(expectedDate);
    });

    it('should return null when no index data exists', async () => {
      // Arrange
      const underlyingTicker = 'AAPL';
      (getMinDate as jest.Mock).mockResolvedValue(null);

      // Act
      const result = await optionIngestionService.getOldestAsOfDate(underlyingTicker);

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('Batch Upsert Option Contracts', () => {
    it('should batch upsert multiple option contracts', async () => {
      // Arrange
      const contracts: OptionContract[] = [
        {
          ticker: 'O:AAPL240315C00150000',
          contract_type: 'call',
          exercise_style: 'american',
          expiration_date: new Date('2024-03-15'),
          shares_per_contract: 100,
          strike_price: 150.0,
          underlying_ticker: 'AAPL',
        },
        {
          ticker: 'O:AAPL240315P00150000',
          contract_type: 'put',
          exercise_style: 'american',
          expiration_date: new Date('2024-03-15'),
          shares_per_contract: 100,
          strike_price: 150.0,
          underlying_ticker: 'AAPL',
        },
      ];

      // Mock database responses for each contract
      mockedDb.query.mockResolvedValue({
        columns: [{ name: 'ticker', type: 'STRING' }],
        dataset: [],
      });

      // Act
      await UpsertService.batchUpsertOptionContracts(contracts);

      // Assert
      // Should be called 4 times: 2 contract checks + 2 contract inserts
      expect(mockedDb.query).toHaveBeenCalledTimes(4);
    });
  });

  describe('Real Database Integration Tests', () => {
    it('should create and query option_contract_index table with real QuestDB', async () => {
      // This test uses real QuestDB connection
      const underlyingTicker = 'TEST';
      const asOf = new Date('2024-01-01');
      const syncDate = new Date();

      // Create index record
      const index: OptionContractIndex = {
        underlying_ticker: underlyingTicker,
        as_of: asOf,
        sync_date: syncDate,
      };

      await UpsertService.upsertOptionContractIndex(index);

      // Query the record back
      const result = await db.query('SELECT * FROM test_option_contract_index WHERE underlying_ticker = $1', [
        underlyingTicker,
      ]);

      const questResult = result as {
        columns: { name: string; type: string }[];
        dataset: unknown[][];
      };

      expect(questResult.dataset).toHaveLength(1);
      expect(questResult.dataset[0][0]).toBe(underlyingTicker); // underlying_ticker
      expect(new Date(questResult.dataset[0][1] as string)).toEqual(asOf); // as_of
      expect(new Date(questResult.dataset[0][2] as string)).toEqual(syncDate); // sync_date
    });

    it('should create and query option_contracts table without as_of field', async () => {
      // This test uses real QuestDB connection
      const contract: OptionContract = {
        ticker: 'O:TEST240315C00150000',
        contract_type: 'call',
        exercise_style: 'american',
        expiration_date: new Date('2024-03-15'),
        shares_per_contract: 100,
        strike_price: 150.0,
        underlying_ticker: 'TEST',
      };

      await UpsertService.upsertOptionContract(contract);

      // Query the record back
      const result = await db.query('SELECT * FROM test_option_contracts WHERE ticker = $1', [contract.ticker]);

      const questResult = result as {
        columns: { name: string; type: string }[];
        dataset: unknown[][];
      };

      expect(questResult.dataset).toHaveLength(1);
      expect(questResult.dataset[0][0]).toBe(contract.ticker); // ticker
      expect(questResult.dataset[0][1]).toBe(contract.contract_type); // contract_type
      expect(questResult.dataset[0][2]).toBe(contract.exercise_style); // exercise_style
      expect(new Date(questResult.dataset[0][3] as string)).toEqual(contract.expiration_date); // expiration_date
      expect(questResult.dataset[0][4]).toBe(contract.shares_per_contract); // shares_per_contract
      expect(questResult.dataset[0][5]).toBe(contract.strike_price); // strike_price
      expect(questResult.dataset[0][6]).toBe(contract.underlying_ticker); // underlying_ticker
      // No as_of field should exist
      expect(questResult.columns).toHaveLength(7); // Only 7 columns, no as_of
    });

    it('should handle upserting same contract multiple times', async () => {
      // This test uses real QuestDB connection
      const contract: OptionContract = {
        ticker: 'O:TEST240315C00160000',
        contract_type: 'call',
        exercise_style: 'american',
        expiration_date: new Date('2024-03-15'),
        shares_per_contract: 100,
        strike_price: 160.0,
        underlying_ticker: 'TEST',
      };

      // First upsert
      await UpsertService.upsertOptionContract(contract);

      // Update the contract
      const updatedContract: OptionContract = {
        ...contract,
        strike_price: 170.0,
      };

      // Second upsert (should update)
      await UpsertService.upsertOptionContract(updatedContract);

      // Query the record back
      const result = await db.query('SELECT * FROM test_option_contracts WHERE ticker = $1', [contract.ticker]);

      const questResult = result as {
        columns: { name: string; type: string }[];
        dataset: unknown[][];
      };

      expect(questResult.dataset).toHaveLength(1);
      expect(questResult.dataset[0][5]).toBe(170.0); // Updated strike_price
    });
  });
});
