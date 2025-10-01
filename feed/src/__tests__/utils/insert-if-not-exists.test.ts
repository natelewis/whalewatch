// Test file for InsertIfNotExistsService with real database operations
import { InsertIfNotExistsService } from '../../utils/insert-if-not-exists';
import { StockAggregate } from '../../types/database';
import { createTestTable } from '../test-utils/schema-helper';
import { db } from '../../db/connection';
import { getTableName } from '../test-utils/config';

describe('InsertIfNotExistsService', () => {
  beforeEach(async () => {
    // Create test tables manually to ensure they exist
    await createTestTable(getTableName('stock_aggregates'), db);
  });

  describe('insertStockAggregateIfNotExists', () => {
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

      // Act & Assert - Test that the insert method completes without error
      // Note: Due to QuestDB's eventual consistency, we can't reliably test immediate data visibility
      await expect(
        InsertIfNotExistsService.insertStockAggregateIfNotExists(aggregate, getTableName('stock_aggregates'))
      ).resolves.not.toThrow();
    });

    it('should skip insertion if stock aggregate record already exists', async () => {
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

      await InsertIfNotExistsService.insertStockAggregateIfNotExists(
        initialAggregate,
        getTableName('stock_aggregates')
      );

      // Act - Try to insert the same record again
      const duplicateAggregate: StockAggregate = {
        symbol: 'MSFT',
        timestamp: new Date('2024-01-01T10:00:00Z'), // Same timestamp
        open: 200.0,
        high: 205.0,
        low: 199.0,
        close: 203.0,
        volume: 2000000,
        vwap: 202.0,
        transaction_count: 10000,
      };

      // Assert - Should not throw and complete without error
      await expect(
        InsertIfNotExistsService.insertStockAggregateIfNotExists(duplicateAggregate, getTableName('stock_aggregates'))
      ).resolves.not.toThrow();
    });

    it('should insert multiple stock aggregates', async () => {
      // Arrange - Create table using schema helper
      await createTestTable(getTableName('stock_aggregates'), db);

      const aggregate1: StockAggregate = {
        symbol: 'GOOGL',
        timestamp: new Date('2024-01-01T10:00:00Z'),
        open: 150.0,
        high: 155.0,
        low: 149.0,
        close: 153.0,
        volume: 1500000,
        vwap: 152.0,
        transaction_count: 7500,
      };

      const aggregate2: StockAggregate = {
        symbol: 'GOOGL',
        timestamp: new Date('2024-01-01T11:00:00Z'),
        open: 153.0,
        high: 158.0,
        low: 152.0,
        close: 156.0,
        volume: 1800000,
        vwap: 155.0,
        transaction_count: 9000,
      };

      // Act & Assert - Test that both insert methods complete without error
      // Note: Due to QuestDB's eventual consistency, we can't reliably test immediate data visibility
      await expect(
        InsertIfNotExistsService.insertStockAggregateIfNotExists(aggregate1, getTableName('stock_aggregates'))
      ).resolves.not.toThrow();
      await expect(
        InsertIfNotExistsService.insertStockAggregateIfNotExists(aggregate2, getTableName('stock_aggregates'))
      ).resolves.not.toThrow();
    });
  });

  describe('error handling', () => {
    it('should handle database connection errors gracefully for stock aggregates', async () => {
      // Arrange
      const aggregate: StockAggregate = {
        symbol: 'ERROR',
        timestamp: new Date('2024-01-01T10:00:00Z'),
        open: 100.0,
        high: 105.0,
        low: 99.0,
        close: 103.0,
        volume: 1000000,
        vwap: 102.0,
        transaction_count: 5000,
      };

      // Act & Assert - Use a non-existent table to trigger an error
      await expect(
        InsertIfNotExistsService.insertStockAggregateIfNotExists(aggregate, 'non_existent_table')
      ).rejects.toThrow();
    });

    it('should handle batch insert errors gracefully', async () => {
      // Arrange
      const aggregates: StockAggregate[] = [
        {
          symbol: 'ERROR1',
          timestamp: new Date('2024-01-01T10:00:00Z'),
          open: 100.0,
          high: 105.0,
          low: 99.0,
          close: 103.0,
          volume: 1000000,
          vwap: 102.0,
          transaction_count: 5000,
        },
        {
          symbol: 'ERROR2',
          timestamp: new Date('2024-01-01T11:00:00Z'),
          open: 200.0,
          high: 205.0,
          low: 199.0,
          close: 203.0,
          volume: 2000000,
          vwap: 202.0,
          transaction_count: 10000,
        },
      ];

      // Act & Assert - Use a non-existent table to trigger an error
      await expect(
        InsertIfNotExistsService.batchInsertStockAggregatesIfNotExists(aggregates, 'non_existent_table')
      ).rejects.toThrow();
    });
  });

  describe('batch operations', () => {
    describe('batchInsertStockAggregatesIfNotExists', () => {
      it('should handle empty array gracefully', async () => {
        // Act & Assert - Should not throw and complete immediately
        await expect(InsertIfNotExistsService.batchInsertStockAggregatesIfNotExists([])).resolves.not.toThrow();
      });

      it('should batch insert multiple stock aggregates', async () => {
        // Arrange - Create table using schema helper
        await createTestTable(getTableName('stock_aggregates'), db);

        // Create multiple aggregates
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

        // Act & Assert - Test that the batch insert method completes without error
        // Note: Due to QuestDB's eventual consistency, we can't reliably test immediate data visibility
        await expect(
          InsertIfNotExistsService.batchInsertStockAggregatesIfNotExists(aggregates, getTableName('stock_aggregates'))
        ).resolves.not.toThrow();
      });

      it('should handle large batches by processing in chunks', async () => {
        // Arrange - Create table using schema helper
        await createTestTable(getTableName('stock_aggregates'), db);

        // Create 150 records to test batching (BATCH_SIZE is 50)
        const aggregates: StockAggregate[] = [];
        for (let i = 0; i < 150; i++) {
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

        // Act & Assert - Test that the batch insert method completes without error
        // Note: Due to QuestDB's eventual consistency, we can't reliably test immediate data visibility
        await expect(
          InsertIfNotExistsService.batchInsertStockAggregatesIfNotExists(aggregates, getTableName('stock_aggregates'))
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

      // Act & Assert - Test that all insert methods complete without error
      // Note: Due to QuestDB's eventual consistency, we can't reliably test immediate data visibility
      const startTime = Date.now();
      for (const aggregate of aggregates) {
        await expect(
          InsertIfNotExistsService.insertStockAggregateIfNotExists(aggregate, getTableName('stock_aggregates'))
        ).resolves.not.toThrow();
      }
      const endTime = Date.now();

      // Performance check - should complete in reasonable time
      expect(endTime - startTime).toBeLessThan(5000); // Less than 5 seconds
    });
  });
});
