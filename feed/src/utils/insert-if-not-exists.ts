import { db } from '../db/connection';
import { StockAggregate, OptionTrade } from '../types/database';

/**
 * Get table name with test prefix if in test environment
 * Resilient to double prefixes - if already prefixed, returns as-is
 */
function getTableName(originalTableName: string): string {
  if (process.env.NODE_ENV === 'test') {
    // Check if already has test prefix to avoid double prefixes
    if (originalTableName.startsWith('test_')) {
      return originalTableName;
    }
    return `test_${originalTableName}`;
  }
  return originalTableName;
}

export class InsertIfNotExistsService {
  /**
   * Insert a stock aggregate record if it doesn't exist
   */
  static async insertStockAggregateIfNotExists(
    aggregate: StockAggregate,
    tableName = getTableName('stock_aggregates')
  ): Promise<void> {
    try {
      // Check if record exists using a range query to handle timestamp precision
      // QuestDB stores timestamps with microsecond precision, so we need to account for that
      const timestampStr = aggregate.timestamp.toISOString();

      const existing = await db.query(
        `SELECT symbol, timestamp FROM ${tableName} 
         WHERE symbol = $1 AND timestamp >= $2 AND timestamp < $3`,
        [
          aggregate.symbol,
          timestampStr,
          new Date(aggregate.timestamp.getTime() + 1000).toISOString(), // Add 1 second to create range
        ]
      );

      const questResult = existing as {
        columns: { name: string; type: string }[];
        dataset: unknown[][];
      };

      if (questResult.dataset && questResult.dataset.length > 0) {
        // Record already exists, skip insertion
        console.log(`Stock aggregate already exists: ${aggregate.symbol} at ${aggregate.timestamp}`);
      } else {
        // Insert new record
        await db.query(
          `INSERT INTO ${tableName} (symbol, timestamp, open, high, low, close, volume, vwap, transaction_count)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            aggregate.symbol,
            aggregate.timestamp,
            aggregate.open,
            aggregate.high,
            aggregate.low,
            aggregate.close,
            aggregate.volume,
            aggregate.vwap,
            aggregate.transaction_count,
          ]
        );
        console.log(`Inserted stock aggregate: ${aggregate.symbol} at ${aggregate.timestamp}`);
      }
    } catch (error) {
      console.error('Error inserting stock aggregate:', error);
      throw error;
    }
  }

  /**
   * Insert an option trade record if it doesn't exist
   */
  static async insertOptionTradeIfNotExists(
    trade: OptionTrade,
    tableName = getTableName('option_trades')
  ): Promise<void> {
    try {
      // Check if record exists
      const existing = await db.query(
        `SELECT ticker, timestamp FROM ${tableName} 
         WHERE ticker = $1 AND timestamp = $2 AND exchange = $3 AND conditions = $4 AND size = $5 AND price = $6`,
        [trade.ticker, trade.timestamp, trade.exchange, trade.conditions, trade.size, trade.price]
      );

      const questResult = existing as {
        columns: { name: string; type: string }[];
        dataset: unknown[][];
      };

      if (questResult.dataset && questResult.dataset.length > 0) {
        // Record already exists, skip insertion
        console.log(`Option trade already exists: ${trade.ticker} at ${trade.timestamp}`);
      } else {
        // Insert new record
        await db.query(
          `INSERT INTO ${tableName} (ticker, underlying_ticker, timestamp, price, size, conditions, exchange)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            trade.ticker,
            trade.underlying_ticker,
            trade.timestamp,
            trade.price,
            trade.size,
            trade.conditions,
            trade.exchange,
          ]
        );
        console.log(`Inserted new option trade: ${trade.ticker} at ${trade.timestamp}`);
      }
    } catch (error) {
      console.error('Error inserting option trade:', error);
      throw error;
    }
  }

  /**
   * Process multiple option trades using individual inserts
   * We check if each record exists and only insert if it doesn't exist
   */
  static async processOptionTradesIfNotExists(
    trades: OptionTrade[],
    tableName = getTableName('option_trades')
  ): Promise<void> {
    if (trades.length === 0) {
      return;
    }

    try {
      // Process each trade individually to ensure proper duplicate checking
      for (let i = 0; i < trades.length; i++) {
        await this.insertOptionTradeIfNotExists(trades[i], tableName);

        // Log progress every 100 trades
        if ((i + 1) % 100 === 0) {
          console.log(`Processed ${i + 1}/${trades.length} option trades`);
        }
      }

      console.log(`Completed processing of ${trades.length} option trades`);
    } catch (error) {
      console.error('Error processing option trades:', error);
      throw error;
    }
  }

  /**
   * Batch insert multiple stock aggregates using individual inserts to prevent duplicates
   * This ensures proper duplicate checking for each record
   */
  static async batchInsertStockAggregatesIfNotExists(
    aggregates: StockAggregate[],
    tableName = getTableName('stock_aggregates')
  ): Promise<void> {
    if (aggregates.length === 0) {
      return;
    }

    try {
      // Process in batches to avoid overwhelming the database
      const BATCH_SIZE = 50; // Smaller batch size for individual inserts

      for (let i = 0; i < aggregates.length; i += BATCH_SIZE) {
        const batch = aggregates.slice(i, i + BATCH_SIZE);

        // Process each aggregate individually to ensure proper duplicate checking
        for (const aggregate of batch) {
          await this.insertStockAggregateIfNotExists(aggregate, tableName);
        }

        console.log(
          `Processed ${batch.length} stock aggregates (batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(
            aggregates.length / BATCH_SIZE
          )})`
        );
      }

      console.log(`Completed insert of ${aggregates.length} stock aggregates`);
    } catch (error) {
      console.error('Error bulk inserting stock aggregates:', error);
      throw error;
    }
  }
}
