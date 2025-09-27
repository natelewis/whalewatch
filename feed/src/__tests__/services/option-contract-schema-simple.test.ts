// Simple test file for the new option contract schema structure
import { UpsertService } from '../../utils/upsert';
import { setupTestEnvironment, cleanupTestEnvironment } from '../test-utils/database';
import { OptionContract, OptionContractIndex } from '../../types/database';

// Mock p-limit
jest.mock('p-limit', () => {
  return jest.fn(() => jest.fn(fn => fn()));
});

// Mock config
jest.mock('../../config', () => ({
  config: {
    tickers: ['TEST'],
    polygon: {
      skipOptionContracts: false,
      skipOptionTrades: false,
      skipOptionQuotes: false,
    },
  },
}));

import { db } from '../../db/connection';

describe('Option Contract Schema Migration - Simple Tests', () => {
  beforeAll(async () => {
    await setupTestEnvironment();
  });

  afterAll(async () => {
    await cleanupTestEnvironment();
  });

  describe.skip('Real Database Integration with New Schema', () => {
    it('should create and query option_contract_index table with real QuestDB', async () => {
      // This test uses real QuestDB connection
      const underlyingTicker = 'TEST';
      const asOf = new Date('2024-01-01');

      // Create index record
      const index: OptionContractIndex = {
        underlying_ticker: underlyingTicker,
        as_of: asOf,
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

    it('should handle batch upserting option contracts', async () => {
      // This test uses real QuestDB connection
      const contracts: OptionContract[] = [
        {
          ticker: 'O:TEST240315C00150000',
          contract_type: 'call',
          exercise_style: 'american',
          expiration_date: new Date('2024-03-15'),
          shares_per_contract: 100,
          strike_price: 150.0,
          underlying_ticker: 'TEST',
        },
        {
          ticker: 'O:TEST240315P00150000',
          contract_type: 'put',
          exercise_style: 'american',
          expiration_date: new Date('2024-03-15'),
          shares_per_contract: 100,
          strike_price: 150.0,
          underlying_ticker: 'TEST',
        },
      ];

      await UpsertService.batchUpsertOptionContracts(contracts);

      // Query the records back
      const result = await db.query(
        'SELECT * FROM test_option_contracts WHERE underlying_ticker = $1 ORDER BY ticker',
        ['TEST']
      );

      const questResult = result as {
        columns: { name: string; type: string }[];
        dataset: unknown[][];
      };

      expect(questResult.dataset).toHaveLength(2);
      expect(questResult.dataset[0][0]).toBe('O:TEST240315C00150000');
      expect(questResult.dataset[1][0]).toBe('O:TEST240315P00150000');
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
