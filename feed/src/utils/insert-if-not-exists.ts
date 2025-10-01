import { db } from '../db/connection';
import { OptionTrade } from '../types/database';

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
}
