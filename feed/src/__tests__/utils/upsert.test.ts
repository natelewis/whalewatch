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

    it('should update existing option trade record', async () => {
      // Arrange - Create table using schema helper
      await createTestTable('test_option_trades', db);

      // Insert initial trade
      const initialTrade: OptionTrade = {
        ticker: 'MSFT240315C00200000',
        underlying_ticker: 'MSFT',
        timestamp: new Date('2024-01-01T10:00:00Z'),
        price: 10.5,
        size: 20,
        conditions: '["@", "T"]',
        exchange: 2,
        tape: 2,
        sequence_number: 54321,
      };

      await UpsertService.upsertOptionTrade(initialTrade, 'test_option_trades');

      // Wait for initial insert with verification
      await waitForRecordCount('test_option_trades', 1);

      // Act - Update with new values using exact same identifiers
      const updatedTrade: OptionTrade = {
        ticker: 'MSFT240315C00200000',
        underlying_ticker: 'MSFT',
        timestamp: new Date('2024-01-01T10:00:00Z'), // Same timestamp
        price: 12.0,
        size: 25,
        conditions: '["@", "T", "I"]',
        exchange: 3,
        tape: 3,
        sequence_number: 54321, // Same sequence number
      };

      await UpsertService.upsertOptionTrade(updatedTrade, 'test_option_trades');

      // Wait for QuestDB partitioned table to commit data with verification of updated values
      await waitForRecordWithValues('test_option_trades', "ticker = 'MSFT240315C00200000'", {
        price: 12.0,
        size: 25,
        conditions: '["@", "T", "I"]',
        exchange: 3,
        tape: 3,
      });

      // Assert
      const data = await getTestTableData('test_option_trades');
      const msftRecords = data.filter((record: any) => record.ticker === 'MSFT240315C00200000');
      expect(msftRecords).toHaveLength(1); // Should still be only one record

      const record = msftRecords[0] as any;
      expect(record.price).toBe(12.0); // Updated values
      expect(record.size).toBe(25);
      expect(record.conditions).toBe('["@", "T", "I"]');
      expect(record.exchange).toBe(3);
      expect(record.tape).toBe(3);
      expect(record.sequence_number).toBe(54321);
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

    it('should update existing option quote record', async () => {
      // Arrange - Create table using schema helper
      await createTestTable('test_option_quotes', db);

      // Insert initial quote
      const initialQuote: OptionQuote = {
        ticker: 'GOOGL240315C00300000',
        underlying_ticker: 'GOOGL',
        timestamp: new Date('2024-01-01T10:00:00Z'),
        bid_price: 15.25,
        bid_size: 200,
        ask_price: 15.75,
        ask_size: 200,
        bid_exchange: 2,
        ask_exchange: 2,
        sequence_number: 98765,
      };

      await UpsertService.upsertOptionQuote(initialQuote, 'test_option_quotes');

      // Wait for initial insert with verification
      await waitForRecordCount('test_option_quotes', 1);

      // Act - Update with new values using exact same identifiers
      const updatedQuote: OptionQuote = {
        ticker: 'GOOGL240315C00300000',
        underlying_ticker: 'GOOGL',
        timestamp: new Date('2024-01-01T10:00:00Z'), // Same timestamp
        bid_price: 16.0,
        bid_size: 300,
        ask_price: 16.5,
        ask_size: 300,
        bid_exchange: 3,
        ask_exchange: 3,
        sequence_number: 98765, // Same sequence number
      };

      await UpsertService.upsertOptionQuote(updatedQuote, 'test_option_quotes');

      // Wait for QuestDB partitioned table to commit data with verification of updated values
      await waitForRecordWithValues('test_option_quotes', "ticker = 'GOOGL240315C00300000'", {
        bid_price: 16.0,
        bid_size: 300,
        ask_price: 16.5,
        ask_size: 300,
        bid_exchange: 3,
        ask_exchange: 3,
      });

      // Assert
      const data = await getTestTableData('test_option_quotes');
      const googlRecords = data.filter((record: any) => record.ticker === 'GOOGL240315C00300000');
      expect(googlRecords).toHaveLength(1); // Should still be only one record

      const record = googlRecords[0] as any;
      expect(record.bid_price).toBe(16.0); // Updated values
      expect(record.bid_size).toBe(300);
      expect(record.ask_price).toBe(16.5);
      expect(record.ask_size).toBe(300);
      expect(record.bid_exchange).toBe(3);
      expect(record.ask_exchange).toBe(3);
      expect(record.sequence_number).toBe(98765);
    });

    it('should insert multiple option quotes', async () => {
      // Arrange - Create table using schema helper
      await createTestTable('test_option_quotes', db);

      const quote1: OptionQuote = {
        ticker: 'TSLA240315C00250000',
        underlying_ticker: 'TSLA',
        timestamp: new Date('2024-01-01T10:00:00Z'),
        bid_price: 25.5,
        bid_size: 100,
        ask_price: 26.0,
        ask_size: 100,
        bid_exchange: 1,
        ask_exchange: 1,
        sequence_number: 11111,
      };

      const quote2: OptionQuote = {
        ticker: 'TSLA240315C00250000',
        underlying_ticker: 'TSLA',
        timestamp: new Date('2024-01-01T10:01:00Z'),
        bid_price: 25.75,
        bid_size: 150,
        ask_price: 26.25,
        ask_size: 150,
        bid_exchange: 1,
        ask_exchange: 1,
        sequence_number: 11112,
      };

      // Act
      await UpsertService.upsertOptionQuote(quote1, 'test_option_quotes');
      await UpsertService.upsertOptionQuote(quote2, 'test_option_quotes');

      // Wait for QuestDB partitioned table to commit data with verification
      await waitForRecordCount('test_option_quotes', 2);

      // Assert
      const data = await getTestTableData('test_option_quotes');
      expect(data).toHaveLength(2);

      const sortedData = data.sort(
        (a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      ) as any[];

      expect(sortedData[0].bid_price).toBe(25.5);
      expect(sortedData[1].bid_price).toBe(25.75);
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
    it('should handle database connection errors gracefully for stock aggregates', async () => {
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

    it('should handle database connection errors gracefully for option contracts', async () => {
      // Arrange
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

      // Act & Assert - Use a non-existent table to trigger an error
      await expect(UpsertService.upsertOptionContract(contract, 'non_existent_table')).rejects.toThrow();
    });

    it('should handle database connection errors gracefully for option trades', async () => {
      // Arrange
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

      // Act & Assert - Use a non-existent table to trigger an error
      await expect(UpsertService.upsertOptionTrade(trade, 'non_existent_table')).rejects.toThrow();
    });

    it('should handle database connection errors gracefully for option quotes', async () => {
      // Arrange
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

      // Act & Assert - Use a non-existent table to trigger an error
      await expect(UpsertService.upsertOptionQuote(quote, 'non_existent_table')).rejects.toThrow();
    });

    it('should handle database connection errors gracefully for sync state', async () => {
      // Arrange
      const syncState: SyncState = {
        ticker: 'AAPL',
        last_aggregate_timestamp: new Date('2024-01-01T10:00:00Z'),
        last_sync: new Date('2024-01-01T10:00:00Z'),
        is_streaming: true,
      };

      // Act & Assert - Use a non-existent table to trigger an error
      await expect(UpsertService.upsertSyncState(syncState, 'non_existent_table')).rejects.toThrow();
    });

    it('should handle database connection errors gracefully for batch stock aggregates', async () => {
      // Arrange
      const aggregates: StockAggregate[] = [
        {
          symbol: 'AAPL',
          timestamp: new Date('2024-01-01T10:00:00Z'),
          open: 100.0,
          high: 105.0,
          low: 99.0,
          close: 103.0,
          volume: 1000000,
          vwap: 102.0,
          transaction_count: 5000,
        },
      ];

      // Act & Assert - Use a non-existent table to trigger an error
      await expect(UpsertService.batchUpsertStockAggregates(aggregates, 'non_existent_table')).rejects.toThrow();
    });

    it('should handle database connection errors gracefully for batch option trades', async () => {
      // Arrange
      const trades: OptionTrade[] = [
        {
          ticker: 'AAPL240315C00150000',
          underlying_ticker: 'AAPL',
          timestamp: new Date('2024-01-01T10:00:00Z'),
          price: 5.5,
          size: 10,
          conditions: '["@", "T"]',
          exchange: 1,
          tape: 1,
          sequence_number: 12345,
        },
      ];

      // Act & Assert - Use a non-existent table to trigger an error
      await expect(UpsertService.batchUpsertOptionTrades(trades, 'non_existent_table')).rejects.toThrow();
    });

    it('should handle database connection errors gracefully for batch option quotes', async () => {
      // Arrange
      const quotes: OptionQuote[] = [
        {
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
        },
      ];

      // Act & Assert - Use a non-existent table to trigger an error
      await expect(UpsertService.batchUpsertOptionQuotes(quotes, 'non_existent_table')).rejects.toThrow();
    });
  });

  describe('edge cases and special scenarios', () => {
    it('should handle sync state with null last_aggregate_timestamp', async () => {
      // Arrange - Create table using schema helper
      await createTestTable('test_sync_state', db);

      const syncState: SyncState = {
        ticker: 'NULL_TEST',
        last_aggregate_timestamp: undefined,
        last_sync: new Date('2024-01-01T10:00:00Z'),
        is_streaming: false,
      };

      // Act
      await UpsertService.upsertSyncState(syncState, 'test_sync_state');

      // Wait for QuestDB partitioned table to commit data with verification
      await waitForRecordCount('test_sync_state', 1);

      // Assert
      const data = await getTestTableData('test_sync_state');
      const foundRecord = data.find((record: any) => record.ticker === 'NULL_TEST') as any;
      expect(foundRecord).toBeDefined();
      expect(foundRecord.last_aggregate_timestamp).toBeNull();
      expect(foundRecord.is_streaming).toBe(false);
    });

    it('should handle sync state update with null last_aggregate_timestamp', async () => {
      // Arrange - Create table using schema helper
      await createTestTable('test_sync_state', db);

      // Insert initial state with timestamp
      const initialState: SyncState = {
        ticker: 'UPDATE_NULL_TEST',
        last_aggregate_timestamp: new Date('2024-01-01T10:00:00Z'),
        last_sync: new Date('2024-01-01T10:00:00Z'),
        is_streaming: true,
      };

      await UpsertService.upsertSyncState(initialState, 'test_sync_state');

      // Wait for initial insert with verification
      await waitForRecordCount('test_sync_state', 1);

      // Act - Update with undefined timestamp
      const updatedState: SyncState = {
        ticker: 'UPDATE_NULL_TEST',
        last_aggregate_timestamp: undefined,
        last_sync: new Date('2024-01-01T11:00:00Z'),
        is_streaming: false,
      };

      await UpsertService.upsertSyncState(updatedState, 'test_sync_state');

      // Wait for QuestDB partitioned table to commit data with verification of updated values
      await waitForRecordWithValues('test_sync_state', "ticker = 'UPDATE_NULL_TEST'", {
        last_aggregate_timestamp: null,
        is_streaming: false,
      });

      // Assert
      const data = await getTestTableData('test_sync_state');
      const foundRecord = data.find((record: any) => record.ticker === 'UPDATE_NULL_TEST') as any;
      expect(foundRecord).toBeDefined();
      expect(foundRecord.last_aggregate_timestamp).toBeNull();
      expect(foundRecord.is_streaming).toBe(false);
    });

    it('should handle trades with special characters in ticker', async () => {
      // Arrange - Create table using schema helper
      await createTestTable('test_option_trades', db);

      const trade: OptionTrade = {
        ticker: "AAPL'240315C00150000", // Contains single quote
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
      const foundRecord = data.find((record: any) => record.ticker === "AAPL'240315C00150000") as any;
      expect(foundRecord).toBeDefined();
      expect(foundRecord.ticker).toBe("AAPL'240315C00150000");
    });

    it('should handle quotes with special characters in ticker', async () => {
      // Arrange - Create table using schema helper
      await createTestTable('test_option_quotes', db);

      const quote: OptionQuote = {
        ticker: "AAPL'240315C00150000", // Contains single quote
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
      const foundRecord = data.find((record: any) => record.ticker === "AAPL'240315C00150000") as any;
      expect(foundRecord).toBeDefined();
      expect(foundRecord.ticker).toBe("AAPL'240315C00150000");
    });

    it('should handle trades with special characters in conditions', async () => {
      // Arrange - Create table using schema helper
      await createTestTable('test_option_trades', db);

      const trade: OptionTrade = {
        ticker: 'AAPL240315C00150000',
        underlying_ticker: 'AAPL',
        timestamp: new Date('2024-01-01T10:00:00Z'),
        price: 5.5,
        size: 10,
        conditions: '["@", "T", "I\'m special"]', // Contains single quote
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
      const foundRecord = data.find((record: any) => record.ticker === 'AAPL240315C00150000') as any;
      expect(foundRecord).toBeDefined();
      expect(foundRecord.conditions).toBe('["@", "T", "I\'m special"]');
    });

    it('should handle batch operations with mixed null and non-null values', async () => {
      // Arrange - Create table using schema helper
      await createTestTable('test_option_trades', db);

      const trades: OptionTrade[] = [
        {
          ticker: 'MIXED_TEST1',
          underlying_ticker: 'AAPL',
          timestamp: new Date('2024-01-01T10:00:00Z'),
          price: 0,
          size: 10,
          conditions: '["@", "T"]',
          exchange: 0,
          tape: 1,
          sequence_number: 12345,
        },
        {
          ticker: 'MIXED_TEST2',
          underlying_ticker: 'AAPL',
          timestamp: new Date('2024-01-01T10:01:00Z'),
          price: 5.5,
          size: 0,
          conditions: '',
          exchange: 1,
          tape: 0,
          sequence_number: 12346,
        },
      ];

      // Act
      await UpsertService.batchUpsertOptionTrades(trades, 'test_option_trades');

      // Wait for QuestDB partitioned table to commit data with verification
      await waitForRecordCount('test_option_trades', 2);

      // Assert
      const data = await getTestTableData('test_option_trades');
      const mixedRecords = data.filter((record: any) => record.ticker.startsWith('MIXED_TEST'));
      expect(mixedRecords).toHaveLength(2);

      const record1 = mixedRecords.find((record: any) => record.ticker === 'MIXED_TEST1') as any;
      const record2 = mixedRecords.find((record: any) => record.ticker === 'MIXED_TEST2') as any;

      expect(record1.price).toBe(0);
      expect(record1.size).toBe(10);
      expect(record1.exchange).toBe(0);
      expect(record1.tape).toBe(1);

      expect(record2.price).toBe(5.5);
      expect(record2.size).toBe(0);
      expect(record2.conditions).toBeNull(); // Database returns null for empty strings
      expect(record2.exchange).toBe(1);
      expect(record2.tape).toBe(0);
    });
  });

  describe('batch operations', () => {
    describe('batchUpsertStockAggregates', () => {
      it('should handle empty array gracefully', async () => {
        // Act & Assert - Should not throw and complete immediately
        await expect(UpsertService.batchUpsertStockAggregates([])).resolves.not.toThrow();
      });

      it('should batch upsert multiple stock aggregates', async () => {
        // Arrange - Create table using schema helper
        await createTestTable('test_stock_aggregates', db);

        // Create multiple records
        const aggregates: StockAggregate[] = [];
        for (let i = 0; i < 5; i++) {
          aggregates.push({
            symbol: `BATCH${i}`,
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
        await UpsertService.batchUpsertStockAggregates(aggregates, 'test_stock_aggregates');

        // Wait for QuestDB partitioned table to commit data with verification
        await waitForRecordCount('test_stock_aggregates', 5);

        // Assert
        const data = await getTestTableData('test_stock_aggregates');
        const batchRecords = data.filter((record: any) => record.symbol.startsWith('BATCH'));
        expect(batchRecords).toHaveLength(5);

        // Verify all records were inserted correctly
        const sortedBatchRecords = batchRecords.sort((a: any, b: any) => a.symbol.localeCompare(b.symbol));
        sortedBatchRecords.forEach((record: any, index: number) => {
          expect(record.symbol).toBe(`BATCH${index}`);
          expect(record.open).toBe(100.0 + index);
          expect(record.high).toBe(105.0 + index);
          expect(record.low).toBe(99.0 + index);
          expect(record.close).toBe(103.0 + index);
        });
      });

      it('should handle large batches by processing in chunks', async () => {
        // Arrange - Create table using schema helper
        await createTestTable('test_stock_aggregates', db);

        // Create 75 records to test batching (BATCH_SIZE is 50)
        const aggregates: StockAggregate[] = [];
        for (let i = 0; i < 75; i++) {
          aggregates.push({
            symbol: `LARGE${i}`,
            timestamp: new Date(`2024-01-01T${10 + (i % 14)}:00:00Z`), // Use modulo 14 to avoid invalid hours
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
        await UpsertService.batchUpsertStockAggregates(aggregates, 'test_stock_aggregates');

        // Wait for QuestDB partitioned table to commit data with verification
        await waitForRecordCount('test_stock_aggregates', 75);

        // Assert
        const data = await getTestTableData('test_stock_aggregates');
        const largeRecords = data.filter((record: any) => record.symbol.startsWith('LARGE'));
        expect(largeRecords).toHaveLength(75);
      });
    });

    describe('batchUpsertOptionTrades', () => {
      it('should handle empty array gracefully', async () => {
        // Act & Assert - Should not throw and complete immediately
        await expect(UpsertService.batchUpsertOptionTrades([])).resolves.not.toThrow();
      });

      it('should batch upsert multiple option trades', async () => {
        // Arrange - Create table using schema helper
        await createTestTable('test_option_trades', db);

        // Create multiple trades
        const trades: OptionTrade[] = [];
        for (let i = 0; i < 5; i++) {
          trades.push({
            ticker: `BATCH_TRADE${i}`,
            underlying_ticker: 'AAPL',
            timestamp: new Date(`2024-01-01T${10 + i}:00:00Z`),
            price: 5.0 + i,
            size: 10 + i,
            conditions: '["@", "T"]',
            exchange: 1,
            tape: 1,
            sequence_number: 10000 + i,
          });
        }

        // Act
        await UpsertService.batchUpsertOptionTrades(trades, 'test_option_trades');

        // Wait for QuestDB partitioned table to commit data with verification
        await waitForRecordCount('test_option_trades', 5);

        // Assert
        const data = await getTestTableData('test_option_trades');
        const batchRecords = data.filter((record: any) => record.ticker.startsWith('BATCH_TRADE'));
        expect(batchRecords).toHaveLength(5);

        // Verify all records were inserted correctly
        const sortedBatchRecords = batchRecords.sort((a: any, b: any) => a.ticker.localeCompare(b.ticker));
        sortedBatchRecords.forEach((record: any, index: number) => {
          expect(record.ticker).toBe(`BATCH_TRADE${index}`);
          expect(record.price).toBe(5.0 + index);
          expect(record.size).toBe(10 + index);
          expect(record.sequence_number).toBe(10000 + index);
        });
      });

      it('should handle large batches by processing in chunks', async () => {
        // Arrange - Create table using schema helper
        await createTestTable('test_option_trades', db);

        // Create 150 records to test batching (BATCH_SIZE is 100)
        const trades: OptionTrade[] = [];
        for (let i = 0; i < 150; i++) {
          trades.push({
            ticker: `LARGE_TRADE${i}`,
            underlying_ticker: 'MSFT',
            timestamp: new Date(`2024-01-01T${10 + (i % 14)}:00:00Z`), // Use modulo 14 to avoid invalid hours
            price: 10.0 + i,
            size: 20 + i,
            conditions: '["@", "T"]',
            exchange: 2,
            tape: 2,
            sequence_number: 20000 + i,
          });
        }

        // Act
        await UpsertService.batchUpsertOptionTrades(trades, 'test_option_trades');

        // Wait for QuestDB partitioned table to commit data with verification
        await waitForRecordCount('test_option_trades', 150);

        // Assert
        const data = await getTestTableData('test_option_trades');
        const largeRecords = data.filter((record: any) => record.ticker.startsWith('LARGE_TRADE'));
        expect(largeRecords).toHaveLength(150);
      });

      it('should handle trades with null values correctly', async () => {
        // Arrange - Create table using schema helper
        await createTestTable('test_option_trades', db);

        const trades: OptionTrade[] = [
          {
            ticker: 'NULL_TEST1',
            underlying_ticker: 'AAPL',
            timestamp: new Date('2024-01-01T10:00:00Z'),
            price: 0,
            size: 0,
            conditions: '',
            exchange: 0,
            tape: 0,
            sequence_number: 0,
          },
          {
            ticker: 'NULL_TEST2',
            underlying_ticker: 'AAPL',
            timestamp: new Date('2024-01-01T10:01:00Z'),
            price: 5.5,
            size: 10,
            conditions: '["@", "T"]',
            exchange: 1,
            tape: 1,
            sequence_number: 12345,
          },
        ];

        // Act
        await UpsertService.batchUpsertOptionTrades(trades, 'test_option_trades');

        // Wait for QuestDB partitioned table to commit data with verification
        await waitForRecordCount('test_option_trades', 2);

        // Assert
        const data = await getTestTableData('test_option_trades');
        const nullTestRecords = data.filter((record: any) => record.ticker.startsWith('NULL_TEST'));
        expect(nullTestRecords).toHaveLength(2);

        const nullRecord = nullTestRecords.find((record: any) => record.ticker === 'NULL_TEST1') as any;
        const normalRecord = nullTestRecords.find((record: any) => record.ticker === 'NULL_TEST2') as any;

        expect(nullRecord.price).toBe(0);
        expect(nullRecord.size).toBe(0);
        expect(nullRecord.conditions).toBeNull(); // Database returns null for empty strings
        expect(nullRecord.exchange).toBe(0);
        expect(nullRecord.tape).toBe(0);
        expect(nullRecord.sequence_number).toBe(0);

        expect(normalRecord.price).toBe(5.5);
        expect(normalRecord.size).toBe(10);
        expect(normalRecord.conditions).toBe('["@", "T"]');
        expect(normalRecord.exchange).toBe(1);
        expect(normalRecord.tape).toBe(1);
        expect(normalRecord.sequence_number).toBe(12345);
      });
    });

    describe('batchUpsertOptionQuotes', () => {
      it('should handle empty array gracefully', async () => {
        // Act & Assert - Should not throw and complete immediately
        await expect(UpsertService.batchUpsertOptionQuotes([])).resolves.not.toThrow();
      });

      it('should batch upsert multiple option quotes', async () => {
        // Arrange - Create table using schema helper
        await createTestTable('test_option_quotes', db);

        // Create multiple quotes
        const quotes: OptionQuote[] = [];
        for (let i = 0; i < 5; i++) {
          quotes.push({
            ticker: `BATCH_QUOTE${i}`,
            underlying_ticker: 'AAPL',
            timestamp: new Date(`2024-01-01T${10 + i}:00:00Z`),
            bid_price: 5.0 + i,
            bid_size: 100 + i,
            ask_price: 5.5 + i,
            ask_size: 100 + i,
            bid_exchange: 1,
            ask_exchange: 1,
            sequence_number: 30000 + i,
          });
        }

        // Act
        await UpsertService.batchUpsertOptionQuotes(quotes, 'test_option_quotes');

        // Wait for QuestDB partitioned table to commit data with verification
        await waitForRecordCount('test_option_quotes', 5);

        // Assert
        const data = await getTestTableData('test_option_quotes');
        const batchRecords = data.filter((record: any) => record.ticker.startsWith('BATCH_QUOTE'));
        expect(batchRecords).toHaveLength(5);

        // Verify all records were inserted correctly
        const sortedBatchRecords = batchRecords.sort((a: any, b: any) => a.ticker.localeCompare(b.ticker));
        sortedBatchRecords.forEach((record: any, index: number) => {
          expect(record.ticker).toBe(`BATCH_QUOTE${index}`);
          expect(record.bid_price).toBe(5.0 + index);
          expect(record.bid_size).toBe(100 + index);
          expect(record.ask_price).toBe(5.5 + index);
          expect(record.ask_size).toBe(100 + index);
          expect(record.sequence_number).toBe(30000 + index);
        });
      });

      it('should handle large batches by processing in chunks', async () => {
        // Arrange - Create table using schema helper
        await createTestTable('test_option_quotes', db);

        // Create 150 records to test batching (BATCH_SIZE is 100)
        const quotes: OptionQuote[] = [];
        for (let i = 0; i < 150; i++) {
          quotes.push({
            ticker: `LARGE_QUOTE${i}`,
            underlying_ticker: 'MSFT',
            timestamp: new Date(`2024-01-01T${10 + (i % 14)}:00:00Z`), // Use modulo 14 to avoid invalid hours
            bid_price: 10.0 + i,
            bid_size: 200 + i,
            ask_price: 10.5 + i,
            ask_size: 200 + i,
            bid_exchange: 2,
            ask_exchange: 2,
            sequence_number: 40000 + i,
          });
        }

        // Act
        await UpsertService.batchUpsertOptionQuotes(quotes, 'test_option_quotes');

        // Wait for QuestDB partitioned table to commit data with verification
        await waitForRecordCount('test_option_quotes', 150);

        // Assert
        const data = await getTestTableData('test_option_quotes');
        const largeRecords = data.filter((record: any) => record.ticker.startsWith('LARGE_QUOTE'));
        expect(largeRecords).toHaveLength(150);
      });

      it('should handle quotes with null values correctly', async () => {
        // Arrange - Create table using schema helper
        await createTestTable('test_option_quotes', db);

        const quotes: OptionQuote[] = [
          {
            ticker: 'NULL_QUOTE1',
            underlying_ticker: 'AAPL',
            timestamp: new Date('2024-01-01T10:00:00Z'),
            bid_price: 0,
            bid_size: 0,
            ask_price: 0,
            ask_size: 0,
            bid_exchange: 0,
            ask_exchange: 0,
            sequence_number: 0,
          },
          {
            ticker: 'NULL_QUOTE2',
            underlying_ticker: 'AAPL',
            timestamp: new Date('2024-01-01T10:01:00Z'),
            bid_price: 5.25,
            bid_size: 100,
            ask_price: 5.75,
            ask_size: 100,
            bid_exchange: 1,
            ask_exchange: 1,
            sequence_number: 12345,
          },
        ];

        // Act
        await UpsertService.batchUpsertOptionQuotes(quotes, 'test_option_quotes');

        // Wait for QuestDB partitioned table to commit data with verification
        await waitForRecordCount('test_option_quotes', 2);

        // Assert
        const data = await getTestTableData('test_option_quotes');
        const nullTestRecords = data.filter((record: any) => record.ticker.startsWith('NULL_QUOTE'));
        expect(nullTestRecords).toHaveLength(2);

        const nullRecord = nullTestRecords.find((record: any) => record.ticker === 'NULL_QUOTE1') as any;
        const normalRecord = nullTestRecords.find((record: any) => record.ticker === 'NULL_QUOTE2') as any;

        expect(nullRecord.bid_price).toBe(0);
        expect(nullRecord.bid_size).toBe(0);
        expect(nullRecord.ask_price).toBe(0);
        expect(nullRecord.ask_size).toBe(0);
        expect(nullRecord.bid_exchange).toBe(0);
        expect(nullRecord.ask_exchange).toBe(0);
        expect(nullRecord.sequence_number).toBe(0);

        expect(normalRecord.bid_price).toBe(5.25);
        expect(normalRecord.bid_size).toBe(100);
        expect(normalRecord.ask_price).toBe(5.75);
        expect(normalRecord.ask_size).toBe(100);
        expect(normalRecord.bid_exchange).toBe(1);
        expect(normalRecord.ask_exchange).toBe(1);
        expect(normalRecord.sequence_number).toBe(12345);
      });
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
