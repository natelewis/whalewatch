// Test file for UpsertService with real database operations
import { UpsertService } from '../../utils/upsert';
import { StockAggregate, OptionContract, OptionTrade, OptionQuote, SyncState } from '../../types/database';
import { getTestTableData, dropTestTables } from '../test-utils/database';
import { createTestTable } from '../test-utils/schema-helper';
import { db } from '../../db/connection';
import { waitForRecordCount, waitForSymbolRecordCount, waitForRecordWithValues } from '../test-utils/data-verification';

describe('UpsertService', () => {
  beforeEach(async () => {
    // Create test tables manually to ensure they exist
    await createTestTable('test_stock_aggregates', db);
  });

  afterAll(async () => {
    // Clean up test tables
    await dropTestTables();
  });

  describe('upsertStockAggregate', () => {
    it('should insert new stock aggregate record', async () => {
      // Arrange - Create table using schema helper
      await createTestTable('test_stock_aggregates', db);

      const aggregate: StockAggregate = {
        symbol: 'AAPL',
        timestamp: new Date('2024-01-01T10:00:00Z'),
        open: 100.0,
        high: 105.0,
        low: 99.0,
        close: 103.0,
        volume: 1000000,
        vwap: 102.0,
        transaction_count: 5000,
      };

      // Act
      await UpsertService.upsertStockAggregate(aggregate, 'test_stock_aggregates');

      // Wait for QuestDB partitioned table to commit data with verification
      await waitForRecordCount('test_stock_aggregates', 1);

      // Assert
      const data = await getTestTableData('test_stock_aggregates');
      expect(data).toHaveLength(1);

      const record = data[0] as any;
      expect(record.symbol).toBe('AAPL');
      expect(record.open).toBe(100.0);
      expect(record.high).toBe(105.0);
      expect(record.low).toBe(99.0);
      expect(record.close).toBe(103.0);
      expect(record.volume).toBe(1000000);
      expect(record.vwap).toBe(102.0);
      expect(record.transaction_count).toBe(5000);
    });

    it('should update existing stock aggregate record', async () => {
      // Arrange - Insert initial record
      const initialAggregate: StockAggregate = {
        symbol: 'MSFT',
        timestamp: new Date('2024-01-01T10:00:00Z'),
        open: 200.0,
        high: 205.0,
        low: 199.0,
        close: 203.0,
        volume: 2000000,
        vwap: 202.0,
        transaction_count: 10000,
      };

      await UpsertService.upsertStockAggregate(initialAggregate, 'test_stock_aggregates');

      // Wait for initial insert to complete with verification
      await waitForSymbolRecordCount('test_stock_aggregates', 'MSFT', 1);

      // Act - Update with new values using exact same timestamp
      const updatedAggregate: StockAggregate = {
        symbol: 'MSFT',
        timestamp: new Date('2024-01-01T10:00:00Z'), // Same timestamp
        open: 210.0,
        high: 215.0,
        low: 209.0,
        close: 213.0,
        volume: 2500000,
        vwap: 212.0,
        transaction_count: 12000,
      };

      await UpsertService.upsertStockAggregate(updatedAggregate, 'test_stock_aggregates');

      // Wait for QuestDB partitioned table to commit data with verification of updated values
      await waitForRecordWithValues('test_stock_aggregates', "symbol = 'MSFT'", {
        open: 210.0,
        high: 215.0,
        low: 209.0,
        close: 213.0,
        volume: 2500000,
        vwap: 212.0,
        transaction_count: 12000,
      });

      // Assert
      const data = await getTestTableData('test_stock_aggregates');
      const msftRecords = data.filter((record: any) => record.symbol === 'MSFT');
      expect(msftRecords).toHaveLength(1); // Should still be only one record

      const record = msftRecords[0] as any;
      expect(record.open).toBe(210.0); // Updated values
      expect(record.high).toBe(215.0);
      expect(record.low).toBe(209.0);
      expect(record.close).toBe(213.0);
      expect(record.volume).toBe(2500000);
      expect(record.vwap).toBe(212.0);
      expect(record.transaction_count).toBe(12000);
    });

    it('should handle multiple different timestamps for same symbol', async () => {
      // Arrange - Create table using schema helper
      await createTestTable('test_stock_aggregates', db);

      const aggregate1: StockAggregate = {
        symbol: 'GOOGL',
        timestamp: new Date('2024-01-01T10:00:00Z'),
        open: 100.0,
        high: 105.0,
        low: 99.0,
        close: 103.0,
        volume: 1000000,
        vwap: 102.0,
        transaction_count: 5000,
      };

      const aggregate2: StockAggregate = {
        symbol: 'GOOGL',
        timestamp: new Date('2024-01-01T11:00:00Z'), // Different timestamp
        open: 103.0,
        high: 108.0,
        low: 102.0,
        close: 106.0,
        volume: 1200000,
        vwap: 105.0,
        transaction_count: 6000,
      };

      // Act
      await UpsertService.upsertStockAggregate(aggregate1, 'test_stock_aggregates');
      await UpsertService.upsertStockAggregate(aggregate2, 'test_stock_aggregates');

      // Wait for QuestDB partitioned table to commit data with verification
      await waitForSymbolRecordCount('test_stock_aggregates', 'GOOGL', 2);

      // Assert
      const data = await getTestTableData('test_stock_aggregates');
      const googlRecords = data.filter((record: any) => record.symbol === 'GOOGL');
      expect(googlRecords).toHaveLength(2); // Should have two separate records
    });
  });

  describe('upsertOptionContract', () => {
    it('should insert option contract record', async () => {
      // Arrange - Create table using schema helper
      await createTestTable('test_option_contracts', db);

      const contract: OptionContract = {
        ticker: 'AAPL240315C00150000',
        contract_type: 'call',
        exercise_style: 'american',
        expiration_date: new Date('2024-03-15T00:00:00Z'),
        shares_per_contract: 100,
        strike_price: 150.0,
        underlying_ticker: 'AAPL',
        as_of: new Date('2024-01-01T10:00:00Z'),
      };

      // Act
      await UpsertService.upsertOptionContract(contract, 'test_option_contracts');

      // Wait for QuestDB partitioned table to commit data with verification
      await waitForRecordCount('test_option_contracts', 1);

      // Assert
      const data = await getTestTableData('test_option_contracts');
      expect(data).toHaveLength(1);

      const record = data[0] as any;
      expect(record.ticker).toBe('AAPL240315C00150000');
      expect(record.contract_type).toBe('call');
      expect(record.exercise_style).toBe('american');
      expect(record.shares_per_contract).toBe(100);
      expect(record.strike_price).toBe(150.0);
      expect(record.underlying_ticker).toBe('AAPL');
    });

    it('should insert multiple option contracts', async () => {
      // Arrange - Create table using schema helper
      await createTestTable('test_option_contracts', db);

      const contract1: OptionContract = {
        ticker: 'AAPL240315C00150000',
        contract_type: 'call',
        exercise_style: 'american',
        expiration_date: new Date('2024-03-15T00:00:00Z'),
        shares_per_contract: 100,
        strike_price: 150.0,
        underlying_ticker: 'AAPL',
        as_of: new Date('2024-01-01T10:00:00Z'),
      };

      const contract2: OptionContract = {
        ticker: 'AAPL240315P00150000',
        contract_type: 'put',
        exercise_style: 'american',
        expiration_date: new Date('2024-03-15T00:00:00Z'),
        shares_per_contract: 100,
        strike_price: 150.0,
        underlying_ticker: 'AAPL',
        as_of: new Date('2024-01-01T10:00:00Z'),
      };

      // Act
      await UpsertService.upsertOptionContract(contract1, 'test_option_contracts');
      await UpsertService.upsertOptionContract(contract2, 'test_option_contracts');

      // Wait for QuestDB partitioned table to commit data with verification
      await waitForRecordCount('test_option_contracts', 2);

      // Assert
      const data = await getTestTableData('test_option_contracts');
      expect(data).toHaveLength(2);

      const callContract = data.find((record: any) => record.contract_type === 'call') as any;
      const putContract = data.find((record: any) => record.contract_type === 'put') as any;

      expect(callContract).toBeDefined();
      expect(putContract).toBeDefined();
      expect(callContract.ticker).toBe('AAPL240315C00150000');
      expect(putContract.ticker).toBe('AAPL240315P00150000');
    });
  });

  describe('upsertOptionTrade', () => {
    it('should insert option trade record', async () => {
      // Arrange - Create table using schema helper
      await createTestTable('test_option_trades', db);

      const trade: OptionTrade = {
        ticker: 'AAPL240315C00150000',
        underlying_ticker: 'AAPL',
        timestamp: new Date('2024-01-01T10:00:00Z'),
        price: 5.5,
        size: 10,
        conditions: '["@", "T"]',
        exchange: 1,
        tape: 1,
        sequence_number: 12345,
      };

      // Act
      await UpsertService.upsertOptionTrade(trade, 'test_option_trades');

      // Wait for QuestDB partitioned table to commit data with verification
      await waitForRecordCount('test_option_trades', 1);

      // Assert
      const data = await getTestTableData('test_option_trades');
      expect(data).toHaveLength(1);

      const record = data[0] as any;
      expect(record.ticker).toBe('AAPL240315C00150000');
      expect(record.underlying_ticker).toBe('AAPL');
      expect(record.price).toBe(5.5);
      expect(record.size).toBe(10);
      expect(record.conditions).toBe('["@", "T"]');
      expect(record.exchange).toBe(1);
      expect(record.tape).toBe(1);
      expect(record.sequence_number).toBe(12345);
    });

    it('should insert multiple option trades', async () => {
      // Arrange - Create table using schema helper
      await createTestTable('test_option_trades', db);

      const trade1: OptionTrade = {
        ticker: 'AAPL240315C00150000',
        underlying_ticker: 'AAPL',
        timestamp: new Date('2024-01-01T10:00:00Z'),
        price: 5.5,
        size: 10,
        conditions: '["@", "T"]',
        exchange: 1,
        tape: 1,
        sequence_number: 12345,
      };

      const trade2: OptionTrade = {
        ticker: 'AAPL240315C00150000',
        underlying_ticker: 'AAPL',
        timestamp: new Date('2024-01-01T10:01:00Z'),
        price: 5.75,
        size: 5,
        conditions: '["@", "T"]',
        exchange: 1,
        tape: 1,
        sequence_number: 12346,
      };

      // Act
      await UpsertService.upsertOptionTrade(trade1, 'test_option_trades');
      await UpsertService.upsertOptionTrade(trade2, 'test_option_trades');

      // Wait for QuestDB partitioned table to commit data with verification
      await waitForRecordCount('test_option_trades', 2);

      // Assert
      const data = await getTestTableData('test_option_trades');
      expect(data).toHaveLength(2);

      const sortedData = data.sort(
        (a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      ) as any[];

      expect(sortedData[0].price).toBe(5.5);
      expect(sortedData[1].price).toBe(5.75);
    });
  });

  describe('upsertOptionQuote', () => {
    it('should insert option quote record', async () => {
      // Arrange - Create table using schema helper
      await createTestTable('test_option_quotes', db);

      const quote: OptionQuote = {
        ticker: 'AAPL240315C00150000',
        underlying_ticker: 'AAPL',
        timestamp: new Date('2024-01-01T10:00:00Z'),
        bid_price: 5.25,
        bid_size: 100,
        ask_price: 5.75,
        ask_size: 100,
        bid_exchange: 1,
        ask_exchange: 1,
        sequence_number: 12345,
      };

      // Act
      await UpsertService.upsertOptionQuote(quote, 'test_option_quotes');

      // Wait for QuestDB partitioned table to commit data with verification
      await waitForRecordCount('test_option_quotes', 1);

      // Assert
      const data = await getTestTableData('test_option_quotes');
      expect(data).toHaveLength(1);

      const record = data[0] as any;
      expect(record.ticker).toBe('AAPL240315C00150000');
      expect(record.underlying_ticker).toBe('AAPL');
      expect(record.bid_price).toBe(5.25);
      expect(record.bid_size).toBe(100);
      expect(record.ask_price).toBe(5.75);
      expect(record.ask_size).toBe(100);
      expect(record.bid_exchange).toBe(1);
      expect(record.ask_exchange).toBe(1);
      expect(record.sequence_number).toBe(12345);
    });
  });

  describe('upsertSyncState', () => {
    it('should insert sync state record', async () => {
      // Arrange - Create table using schema helper
      await createTestTable('test_sync_state', db);

      const syncState: SyncState = {
        ticker: 'AAPL',
        last_aggregate_timestamp: new Date('2024-01-01T10:00:00Z'),
        last_sync: new Date('2024-01-01T10:00:00Z'),
        is_streaming: true,
      };

      // Act
      await UpsertService.upsertSyncState(syncState, 'test_sync_state');

      // Wait for QuestDB partitioned table to commit data with verification
      await waitForRecordCount('test_sync_state', 1);

      // Assert
      const data = await getTestTableData('test_sync_state');
      expect(data).toHaveLength(1);

      const record = data[0] as any;
      expect(record.ticker).toBe('AAPL');
      expect(record.is_streaming).toBe(true);
    });

    it('should update existing sync state', async () => {
      // Arrange - Create table using schema helper
      await createTestTable('test_sync_state', db);

      // Insert initial state
      const initialState: SyncState = {
        ticker: 'MSFT',
        last_aggregate_timestamp: new Date('2024-01-01T10:00:00Z'),
        last_sync: new Date('2024-01-01T10:00:00Z'),
        is_streaming: false,
      };

      await UpsertService.upsertSyncState(initialState, 'test_sync_state');

      // Wait for initial insert with verification
      await waitForRecordCount('test_sync_state', 1);

      // Act - Update state
      const updatedState: SyncState = {
        ticker: 'MSFT',
        last_aggregate_timestamp: new Date('2024-01-01T11:00:00Z'),
        last_sync: new Date('2024-01-01T11:00:00Z'),
        is_streaming: true,
      };

      await UpsertService.upsertSyncState(updatedState, 'test_sync_state');

      // Wait for QuestDB partitioned table to commit data with verification of updated values
      await waitForRecordWithValues('test_sync_state', "ticker = 'MSFT'", { is_streaming: true });

      // Assert
      const data = await getTestTableData('test_sync_state');
      const msftRecords = data.filter((record: any) => record.ticker === 'MSFT');
      expect(msftRecords).toHaveLength(1); // Should still be only one record

      const record = msftRecords[0] as any;
      expect(record.is_streaming).toBe(true); // Updated value
    });
  });

  describe('error handling', () => {
    it('should handle database connection errors gracefully', async () => {
      // Arrange - Create table using schema helper
      await createTestTable('test_stock_aggregates', db);

      // Arrange - Invalid data that should cause an error
      const invalidAggregate = {
        symbol: 'AAPL',
        timestamp: new Date('2024-01-01T10:00:00Z'),
        open: 100.0,
        high: 105.0,
        low: 99.0,
        close: 103.0,
        volume: 1000000,
        vwap: 102.0,
        transaction_count: 5000,
      } as StockAggregate;

      // Act & Assert - Use a non-existent table to trigger an error
      await expect(UpsertService.upsertStockAggregate(invalidAggregate, 'non_existent_table')).rejects.toThrow();
    });
  });

  describe('performance and bulk operations', () => {
    it('should handle bulk inserts efficiently', async () => {
      // Arrange - Create table using schema helper
      await createTestTable('test_stock_aggregates', db);

      // Create multiple records
      const aggregates: StockAggregate[] = [];
      for (let i = 0; i < 10; i++) {
        aggregates.push({
          symbol: `TEST${i}`,
          timestamp: new Date(`2024-01-01T${10 + i}:00:00Z`),
          open: 100.0 + i,
          high: 105.0 + i,
          low: 99.0 + i,
          close: 103.0 + i,
          volume: 1000000 + i * 100000,
          vwap: 102.0 + i,
          transaction_count: 5000 + i * 100,
        });
      }

      // Act
      const startTime = Date.now();
      for (const aggregate of aggregates) {
        await UpsertService.upsertStockAggregate(aggregate, 'test_stock_aggregates');
      }
      const endTime = Date.now();

      // Wait for QuestDB partitioned table to commit data with verification
      await waitForRecordCount('test_stock_aggregates', 10);

      // Assert
      const data = await getTestTableData('test_stock_aggregates');
      const testRecords = data.filter((record: any) => record.symbol.startsWith('TEST'));
      expect(testRecords).toHaveLength(10);

      // Performance check - should complete in reasonable time
      expect(endTime - startTime).toBeLessThan(5000); // Less than 5 seconds
    });
  });
});
