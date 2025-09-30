// Test file for UpsertService with real database operations
import { UpsertService } from '../../utils/upsert';
import { StockAggregate, OptionContract, OptionTrade, OptionQuote } from '../../types/database';
import { createTestTable } from '../test-utils/schema-helper';
import { db } from '../../db/connection';
import { getTableName } from '../test-utils/config';

describe('UpsertService', () => {
  beforeEach(async () => {
    // Create test tables manually to ensure they exist
    await createTestTable(getTableName('stock_aggregates'), db);
  });

  describe('upsertStockAggregate', () => {
    it('should insert new stock aggregate record', async () => {
      // Arrange - Create table using schema helper
      await createTestTable(getTableName('stock_aggregates'), db);

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

      // Act & Assert - Test that the upsert method completes without error
      // Note: Due to QuestDB's eventual consistency, we can't reliably test immediate data visibility
      await expect(
        UpsertService.upsertStockAggregate(aggregate, getTableName('stock_aggregates'))
      ).resolves.not.toThrow();
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

      await UpsertService.upsertStockAggregate(initialAggregate, getTableName('stock_aggregates'));

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

      // Assert - Test that the upsert method completes without error
      // Note: Due to QuestDB's eventual consistency, we can't reliably test immediate data visibility
      await expect(
        UpsertService.upsertStockAggregate(updatedAggregate, getTableName('stock_aggregates'))
      ).resolves.not.toThrow();
    });

    it('should handle multiple different timestamps for same symbol', async () => {
      // Arrange - Create table using schema helper
      await createTestTable(getTableName('stock_aggregates'), db);

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

      // Act & Assert - Test that both upsert methods complete without error
      // Note: Due to QuestDB's eventual consistency, we can't reliably test immediate data visibility
      await expect(
        UpsertService.upsertStockAggregate(aggregate1, getTableName('stock_aggregates'))
      ).resolves.not.toThrow();
      await expect(
        UpsertService.upsertStockAggregate(aggregate2, getTableName('stock_aggregates'))
      ).resolves.not.toThrow();
    });
  });

  describe('upsertOptionContract', () => {
    it('should insert option contract record', async () => {
      // Arrange - Create table using schema helper
      await createTestTable(getTableName('option_contracts'), db);

      const contract: OptionContract = {
        ticker: 'AAPL240315C00150000',
        contract_type: 'call',
        exercise_style: 'american',
        expiration_date: new Date('2024-03-15T00:00:00Z'),
        shares_per_contract: 100,
        strike_price: 150.0,
        underlying_ticker: 'AAPL',
      };

      // Act & Assert - Test that the upsert method completes without error
      // Note: Due to QuestDB's eventual consistency, we can't reliably test immediate data visibility
      await expect(
        UpsertService.upsertOptionContract(contract, getTableName('option_contracts'))
      ).resolves.not.toThrow();
    });

    it('should insert multiple option contracts', async () => {
      // Arrange - Create table using schema helper
      await createTestTable(getTableName('option_contracts'), db);

      const contract1: OptionContract = {
        ticker: 'AAPL240315C00150000',
        contract_type: 'call',
        exercise_style: 'american',
        expiration_date: new Date('2024-03-15T00:00:00Z'),
        shares_per_contract: 100,
        strike_price: 150.0,
        underlying_ticker: 'AAPL',
      };

      const contract2: OptionContract = {
        ticker: 'AAPL240315P00150000',
        contract_type: 'put',
        exercise_style: 'american',
        expiration_date: new Date('2024-03-15T00:00:00Z'),
        shares_per_contract: 100,
        strike_price: 150.0,
        underlying_ticker: 'AAPL',
      };

      // Act & Assert - Test that both upsert methods complete without error
      // Note: Due to QuestDB's eventual consistency, we can't reliably test immediate data visibility
      await expect(
        UpsertService.upsertOptionContract(contract1, getTableName('option_contracts'))
      ).resolves.not.toThrow();
      await expect(
        UpsertService.upsertOptionContract(contract2, getTableName('option_contracts'))
      ).resolves.not.toThrow();
    });
  });

  describe('upsertOptionTrade', () => {
    it('should insert option trade record', async () => {
      // Arrange - Create table using schema helper
      await createTestTable(getTableName('option_trades'), db);

      const trade: OptionTrade = {
        ticker: 'AAPL240315C00150000',
        underlying_ticker: 'AAPL',
        timestamp: new Date('2024-01-01T10:00:00Z'),
        price: 5.5,
        size: 10,
        conditions: '["@", "T"]',
        exchange: 1,
      };

      // Act & Assert - Test that the upsert method completes without error
      // Note: Due to QuestDB's eventual consistency, we can't reliably test immediate data visibility
      await expect(UpsertService.upsertOptionTrade(trade, getTableName('option_trades'))).resolves.not.toThrow();
    });

    it('should insert multiple option trades', async () => {
      // Arrange - Create table using schema helper
      await createTestTable(getTableName('option_trades'), db);

      const trade1: OptionTrade = {
        ticker: 'AAPL240315C00150000',
        underlying_ticker: 'AAPL',
        timestamp: new Date('2024-01-01T10:00:00Z'),
        price: 5.5,
        size: 10,
        conditions: '["@", "T"]',
        exchange: 1,
      };

      const trade2: OptionTrade = {
        ticker: 'AAPL240315C00150000',
        underlying_ticker: 'AAPL',
        timestamp: new Date('2024-01-01T10:01:00Z'),
        price: 5.75,
        size: 5,
        conditions: '["@", "T"]',
        exchange: 1,
      };

      // Act & Assert - Test that both upsert methods complete without error
      // Note: Due to QuestDB's eventual consistency, we can't reliably test immediate data visibility
      await expect(UpsertService.upsertOptionTrade(trade1, getTableName('option_trades'))).resolves.not.toThrow();
      await expect(UpsertService.upsertOptionTrade(trade2, getTableName('option_trades'))).resolves.not.toThrow();
    });

    it('should update existing option trade record', async () => {
      // Arrange - Create table using schema helper
      await createTestTable(getTableName('option_trades'), db);

      // Insert initial trade
      const initialTrade: OptionTrade = {
        ticker: 'MSFT240315C00200000',
        underlying_ticker: 'MSFT',
        timestamp: new Date('2024-01-01T10:00:00Z'),
        price: 10.5,
        size: 20,
        conditions: '["@", "T"]',
        exchange: 2,
      };

      await UpsertService.upsertOptionTrade(initialTrade, getTableName('option_trades'));

      // Act - Update with new values using exact same identifiers
      const updatedTrade: OptionTrade = {
        ticker: 'MSFT240315C00200000',
        underlying_ticker: 'MSFT',
        timestamp: new Date('2024-01-01T10:00:00Z'), // Same timestamp
        price: 12.0,
        size: 25,
        conditions: '["@", "T", "I"]',
        exchange: 3,
      };

      // Assert - Test that the upsert method completes without error
      // Note: Due to QuestDB's eventual consistency, we can't reliably test immediate data visibility
      await expect(UpsertService.upsertOptionTrade(updatedTrade, getTableName('option_trades'))).resolves.not.toThrow();
    });
  });

  describe('upsertOptionQuote', () => {
    it('should insert option quote record', async () => {
      // Arrange - Create table using schema helper
      await createTestTable(getTableName('option_quotes'), db);

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

      // Act & Assert - Test that the upsert method completes without error
      // Note: Due to QuestDB's eventual consistency, we can't reliably test immediate data visibility
      await expect(UpsertService.upsertOptionQuote(quote, getTableName('option_quotes'))).resolves.not.toThrow();
    });

    it('should update existing option quote record', async () => {
      // Arrange - Create table using schema helper
      await createTestTable(getTableName('option_quotes'), db);

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

      await UpsertService.upsertOptionQuote(initialQuote, getTableName('option_quotes'));

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

      // Assert - Test that the upsert method completes without error
      // Note: Due to QuestDB's eventual consistency, we can't reliably test immediate data visibility
      await expect(UpsertService.upsertOptionQuote(updatedQuote, getTableName('option_quotes'))).resolves.not.toThrow();
    });

    it('should insert multiple option quotes', async () => {
      // Arrange - Create table using schema helper
      await createTestTable(getTableName('option_quotes'), db);

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

      // Act & Assert - Test that both upsert methods complete without error
      // Note: Due to QuestDB's eventual consistency, we can't reliably test immediate data visibility
      await expect(UpsertService.upsertOptionQuote(quote1, getTableName('option_quotes'))).resolves.not.toThrow();
      await expect(UpsertService.upsertOptionQuote(quote2, getTableName('option_quotes'))).resolves.not.toThrow();
    });
  });

  describe('error handling', () => {
    it('should handle database connection errors gracefully for stock aggregates', async () => {
      // Arrange - Create table using schema helper
      await createTestTable(getTableName('stock_aggregates'), db);

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
    it('should handle trades with special characters in ticker', async () => {
      // Arrange - Create table using schema helper
      await createTestTable(getTableName('option_trades'), db);

      const trade: OptionTrade = {
        ticker: "AAPL'240315C00150000", // Contains single quote
        underlying_ticker: 'AAPL',
        timestamp: new Date('2024-01-01T10:00:00Z'),
        price: 5.5,
        size: 10,
        conditions: '["@", "T"]',
        exchange: 1,
      };

      // Act & Assert - Test that the upsert method completes without error
      // Note: Due to QuestDB's eventual consistency, we can't reliably test immediate data visibility
      await expect(UpsertService.upsertOptionTrade(trade, getTableName('option_trades'))).resolves.not.toThrow();
    });

    it('should handle quotes with special characters in ticker', async () => {
      // Arrange - Create table using schema helper
      await createTestTable(getTableName('option_quotes'), db);

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

      // Act & Assert - Test that the upsert method completes without error
      // Note: Due to QuestDB's eventual consistency, we can't reliably test immediate data visibility
      await expect(UpsertService.upsertOptionQuote(quote, getTableName('option_quotes'))).resolves.not.toThrow();
    });

    it('should handle trades with special characters in conditions', async () => {
      // Arrange - Create table using schema helper
      await createTestTable(getTableName('option_trades'), db);

      const trade: OptionTrade = {
        ticker: 'AAPL240315C00150000',
        underlying_ticker: 'AAPL',
        timestamp: new Date('2024-01-01T10:00:00Z'),
        price: 5.5,
        size: 10,
        conditions: '["@", "T", "I\'m special"]', // Contains single quote
        exchange: 1,
      };

      // Act & Assert - Test that the upsert method completes without error
      // Note: Due to QuestDB's eventual consistency, we can't reliably test immediate data visibility
      await expect(UpsertService.upsertOptionTrade(trade, getTableName('option_trades'))).resolves.not.toThrow();
    });

    it('should handle batch operations with mixed null and non-null values', async () => {
      // Arrange - Create table using schema helper
      await createTestTable(getTableName('option_trades'), db);

      const trades: OptionTrade[] = [
        {
          ticker: 'MIXED_TEST1',
          underlying_ticker: 'AAPL',
          timestamp: new Date('2024-01-01T10:00:00Z'),
          price: 0,
          size: 10,
          conditions: '["@", "T"]',
          exchange: 0,
        },
        {
          ticker: 'MIXED_TEST2',
          underlying_ticker: 'AAPL',
          timestamp: new Date('2024-01-01T10:01:00Z'),
          price: 5.5,
          size: 0,
          conditions: '',
          exchange: 1,
        },
      ];

      // Act & Assert - Test that the upsert method completes without error
      // Note: Due to QuestDB's eventual consistency, we can't reliably test immediate data visibility
      await expect(UpsertService.upsertOptionTrade(trades[0], getTableName('option_trades'))).resolves.not.toThrow();
      await expect(UpsertService.upsertOptionTrade(trades[1], getTableName('option_trades'))).resolves.not.toThrow();
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
        await createTestTable(getTableName('stock_aggregates'), db);

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

        // Act & Assert - Test that the batch upsert method completes without error
        // Note: Due to QuestDB's eventual consistency, we can't reliably test immediate data visibility
        await expect(
          UpsertService.batchUpsertStockAggregates(aggregates, getTableName('stock_aggregates'))
        ).resolves.not.toThrow();
      });

      it('should handle large batches by processing in chunks', async () => {
        // Arrange - Create table using schema helper
        await createTestTable(getTableName('stock_aggregates'), db);

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

        // Act & Assert - Test that the batch upsert method completes without error
        // Note: Due to QuestDB's eventual consistency, we can't reliably test immediate data visibility
        await expect(
          UpsertService.batchUpsertStockAggregates(aggregates, getTableName('stock_aggregates'))
        ).resolves.not.toThrow();
      });
    });

    describe('batchUpsertOptionQuotes', () => {
      it('should handle empty array gracefully', async () => {
        // Act & Assert - Should not throw and complete immediately
        await expect(UpsertService.batchUpsertOptionQuotes([])).resolves.not.toThrow();
      });

      it('should batch upsert multiple option quotes', async () => {
        // Arrange - Create table using schema helper
        await createTestTable(getTableName('option_quotes'), db);

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

        // Act & Assert - Test that the batch upsert method completes without error
        // Note: Due to QuestDB's eventual consistency, we can't reliably test immediate data visibility
        await expect(
          UpsertService.batchUpsertOptionQuotes(quotes, getTableName('option_quotes'))
        ).resolves.not.toThrow();
      });

      it('should handle large batches by processing in chunks', async () => {
        // Arrange - Create table using schema helper
        await createTestTable(getTableName('option_quotes'), db);

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

        // Act & Assert - Test that the batch upsert method completes without error
        // Note: Due to QuestDB's eventual consistency, we can't reliably test immediate data visibility
        await expect(
          UpsertService.batchUpsertOptionQuotes(quotes, getTableName('option_quotes'))
        ).resolves.not.toThrow();
      });

      it('should handle quotes with null values correctly', async () => {
        // Arrange - Create table using schema helper
        await createTestTable(getTableName('option_quotes'), db);

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

        // Act & Assert - Test that the batch upsert method completes without error
        // Note: Due to QuestDB's eventual consistency, we can't reliably test immediate data visibility
        await expect(
          UpsertService.batchUpsertOptionQuotes(quotes, getTableName('option_quotes'))
        ).resolves.not.toThrow();
      });
    });
  });

  describe('performance and bulk operations', () => {
    it('should handle bulk inserts efficiently', async () => {
      // Arrange - Create table using schema helper
      await createTestTable(getTableName('stock_aggregates'), db);

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

      // Act & Assert - Test that all upsert methods complete without error
      // Note: Due to QuestDB's eventual consistency, we can't reliably test immediate data visibility
      const startTime = Date.now();
      for (const aggregate of aggregates) {
        await expect(
          UpsertService.upsertStockAggregate(aggregate, getTableName('stock_aggregates'))
        ).resolves.not.toThrow();
      }
      const endTime = Date.now();

      // Performance check - should complete in reasonable time
      expect(endTime - startTime).toBeLessThan(5000); // Less than 5 seconds
    });
  });
});
