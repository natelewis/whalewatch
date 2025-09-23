import { db } from '../db/connection';
import { StockAggregate, OptionContract, OptionTrade, OptionQuote, SyncState } from '../types/database';

export class UpsertService {
  /**
   * Upsert a stock aggregate record
   */
  static async upsertStockAggregate(aggregate: StockAggregate): Promise<void> {
    try {
      // Check if record exists using a range query to handle timestamp precision
      // QuestDB stores timestamps with microsecond precision, so we need to account for that
      const timestampStr = aggregate.timestamp.toISOString();
      const existing = await db.query(
        `SELECT symbol, timestamp FROM stock_aggregates 
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
        // Update existing record using the exact timestamp from the database
        const existingTimestamp = questResult.dataset[0][1] as string;
        await db.query(
          `UPDATE stock_aggregates 
           SET open = $1, high = $2, low = $3, close = $4, volume = $5, vwap = $6, transaction_count = $7
           WHERE symbol = $8 AND timestamp = $9`,
          [
            aggregate.open,
            aggregate.high,
            aggregate.low,
            aggregate.close,
            aggregate.volume,
            aggregate.vwap,
            aggregate.transaction_count,
            aggregate.symbol,
            existingTimestamp,
          ]
        );
        console.log(`Updated stock aggregate: ${aggregate.symbol} at ${existingTimestamp}`);
      } else {
        // Insert new record
        await db.query(
          `INSERT INTO stock_aggregates (symbol, timestamp, open, high, low, close, volume, vwap, transaction_count)
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
        console.log(`Inserted new stock aggregate: ${aggregate.symbol} at ${aggregate.timestamp}`);
      }
    } catch (error) {
      console.error('Error upserting stock aggregate:', error);
      throw error;
    }
  }

  /**
   * Upsert an option contract record
   */
  static async upsertOptionContract(contract: OptionContract): Promise<void> {
    try {
      // Check if record exists
      const existing = await db.query(`SELECT ticker FROM option_contracts WHERE ticker = $1`, [contract.ticker]);

      const questResult = existing as {
        columns: { name: string; type: string }[];
        dataset: unknown[][];
      };

      if (questResult.dataset && questResult.dataset.length > 0) {
        // Update existing record (excluding created_at as it's the designated timestamp column)
        await db.query(
          `UPDATE option_contracts 
           SET contract_type = $1, exercise_style = $2, expiration_date = $3, 
               shares_per_contract = $4, strike_price = $5, underlying_ticker = $6
           WHERE ticker = $7`,
          [
            contract.contract_type,
            contract.exercise_style,
            contract.expiration_date,
            contract.shares_per_contract,
            contract.strike_price,
            contract.underlying_ticker,
            contract.ticker,
          ]
        );
        console.log(`Updated option contract: ${contract.ticker}`);
      } else {
        // Insert new record
        await db.query(
          `INSERT INTO option_contracts (ticker, contract_type, exercise_style, expiration_date, shares_per_contract, strike_price, underlying_ticker, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            contract.ticker,
            contract.contract_type,
            contract.exercise_style,
            contract.expiration_date,
            contract.shares_per_contract,
            contract.strike_price,
            contract.underlying_ticker,
            contract.created_at,
          ]
        );
        console.log(`Inserted new option contract: ${contract.ticker}`);
      }
    } catch (error) {
      console.error('Error upserting option contract:', error);
      throw error;
    }
  }

  /**
   * Upsert an option trade record
   */
  static async upsertOptionTrade(trade: OptionTrade): Promise<void> {
    try {
      // Check if record exists
      const existing = await db.query(
        `SELECT ticker, timestamp, sequence_number FROM option_trades 
         WHERE ticker = $1 AND timestamp = $2 AND sequence_number = $3`,
        [trade.ticker, trade.timestamp, trade.sequence_number]
      );

      const questResult = existing as {
        columns: { name: string; type: string }[];
        dataset: unknown[][];
      };

      if (questResult.dataset && questResult.dataset.length > 0) {
        // Update existing record
        await db.query(
          `UPDATE option_trades 
           SET underlying_ticker = $1, price = $2, size = $3, conditions = $4, exchange = $5, tape = $6
           WHERE ticker = $7 AND timestamp = $8 AND sequence_number = $9`,
          [
            trade.underlying_ticker,
            trade.price,
            trade.size,
            trade.conditions,
            trade.exchange,
            trade.tape,
            trade.ticker,
            trade.timestamp,
            trade.sequence_number,
          ]
        );
        console.log(`Updated option trade: ${trade.ticker} at ${trade.timestamp}`);
      } else {
        // Insert new record
        await db.query(
          `INSERT INTO option_trades (ticker, underlying_ticker, timestamp, price, size, conditions, exchange, tape, sequence_number)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            trade.ticker,
            trade.underlying_ticker,
            trade.timestamp,
            trade.price,
            trade.size,
            trade.conditions,
            trade.exchange,
            trade.tape,
            trade.sequence_number,
          ]
        );
        console.log(`Inserted new option trade: ${trade.ticker} at ${trade.timestamp}`);
      }
    } catch (error) {
      console.error('Error upserting option trade:', error);
      throw error;
    }
  }

  /**
   * Upsert an option quote record
   */
  static async upsertOptionQuote(quote: OptionQuote): Promise<void> {
    try {
      // Check if record exists
      const existing = await db.query(
        `SELECT ticker, timestamp, sequence_number FROM option_quotes 
         WHERE ticker = $1 AND timestamp = $2 AND sequence_number = $3`,
        [quote.ticker, quote.timestamp, quote.sequence_number]
      );

      const questResult = existing as {
        columns: { name: string; type: string }[];
        dataset: unknown[][];
      };

      if (questResult.dataset && questResult.dataset.length > 0) {
        // Update existing record
        await db.query(
          `UPDATE option_quotes 
           SET underlying_ticker = $1, bid_price = $2, bid_size = $3, ask_price = $4, ask_size = $5, 
               bid_exchange = $6, ask_exchange = $7
           WHERE ticker = $8 AND timestamp = $9 AND sequence_number = $10`,
          [
            quote.underlying_ticker,
            quote.bid_price,
            quote.bid_size,
            quote.ask_price,
            quote.ask_size,
            quote.bid_exchange,
            quote.ask_exchange,
            quote.ticker,
            quote.timestamp,
            quote.sequence_number,
          ]
        );
        console.log(`Updated option quote: ${quote.ticker} at ${quote.timestamp}`);
      } else {
        // Insert new record
        await db.query(
          `INSERT INTO option_quotes (ticker, underlying_ticker, timestamp, bid_price, bid_size, ask_price, ask_size, bid_exchange, ask_exchange, sequence_number)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            quote.ticker,
            quote.underlying_ticker,
            quote.timestamp,
            quote.bid_price,
            quote.bid_size,
            quote.ask_price,
            quote.ask_size,
            quote.bid_exchange,
            quote.ask_exchange,
            quote.sequence_number,
          ]
        );
        console.log(`Inserted new option quote: ${quote.ticker} at ${quote.timestamp}`);
      }
    } catch (error) {
      console.error('Error upserting option quote:', error);
      throw error;
    }
  }

  /**
   * Upsert a sync state record
   */
  static async upsertSyncState(syncState: SyncState): Promise<void> {
    try {
      // Check if record exists
      const existing = await db.query(`SELECT ticker FROM sync_state WHERE ticker = $1`, [syncState.ticker]);

      const questResult = existing as {
        columns: { name: string; type: string }[];
        dataset: unknown[][];
      };

      if (questResult.dataset && questResult.dataset.length > 0) {
        // Update existing record
        await db.query(
          `UPDATE sync_state 
           SET last_aggregate_timestamp = $1, is_streaming = $2
           WHERE ticker = $3`,
          [syncState.last_aggregate_timestamp || null, syncState.is_streaming, syncState.ticker]
        );
        console.log(`Updated sync state: ${syncState.ticker}`);
      } else {
        // Insert new record
        await db.query(
          `INSERT INTO sync_state (ticker, last_aggregate_timestamp, last_sync, is_streaming)
           VALUES ($1, $2, $3, $4)`,
          [syncState.ticker, syncState.last_aggregate_timestamp || null, syncState.last_sync, syncState.is_streaming]
        );
        console.log(`Inserted new sync state: ${syncState.ticker}`);
      }
    } catch (error) {
      console.error('Error upserting sync state:', error);
      throw error;
    }
  }

  /**
   * Batch upsert multiple stock aggregates using individual upserts to prevent duplicates
   * This ensures proper duplicate checking for each record
   */
  static async batchUpsertStockAggregates(aggregates: StockAggregate[]): Promise<void> {
    if (aggregates.length === 0) return;

    try {
      // Process in batches to avoid overwhelming the database
      const BATCH_SIZE = 50; // Smaller batch size for individual upserts

      for (let i = 0; i < aggregates.length; i += BATCH_SIZE) {
        const batch = aggregates.slice(i, i + BATCH_SIZE);

        // Process each aggregate individually to ensure proper duplicate checking
        for (const aggregate of batch) {
          await this.upsertStockAggregate(aggregate);
        }

        console.log(
          `Processed ${batch.length} stock aggregates (batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(
            aggregates.length / BATCH_SIZE
          )})`
        );
      }

      console.log(`Completed upsert of ${aggregates.length} stock aggregates`);
    } catch (error) {
      console.error('Error bulk upserting stock aggregates:', error);
      throw error;
    }
  }

  /**
   * Batch upsert multiple option trades using bulk insert
   * Uses QuestDB's deduplication feature to handle upserts efficiently
   */
  static async batchUpsertOptionTrades(trades: OptionTrade[]): Promise<void> {
    if (trades.length === 0) return;

    try {
      // Process in batches to avoid query size limits
      const BATCH_SIZE = 100; // Limit batch size to prevent URL length issues

      for (let i = 0; i < trades.length; i += BATCH_SIZE) {
        const batch = trades.slice(i, i + BATCH_SIZE);

        // Build bulk insert query with multiple VALUES
        const values = batch
          .map(trade => {
            const ticker = `'${trade.ticker.replace(/'/g, "''")}'`;
            const underlyingTicker = `'${trade.underlying_ticker.replace(/'/g, "''")}'`;
            const timestamp = `'${trade.timestamp.toISOString()}'`;
            const price = trade.price ?? 'NULL';
            const size = trade.size ?? 'NULL';
            const conditions = trade.conditions ? `'${trade.conditions.replace(/'/g, "''")}'` : 'NULL';
            const exchange = trade.exchange ?? 'NULL';
            const tape = trade.tape ?? 'NULL';
            const sequenceNumber = trade.sequence_number ?? 'NULL';

            return `(${ticker}, ${underlyingTicker}, ${timestamp}, ${price}, ${size}, ${conditions}, ${exchange}, ${tape}, ${sequenceNumber})`;
          })
          .join(',\n');

        const query = `INSERT INTO option_trades (ticker, underlying_ticker, timestamp, price, size, conditions, exchange, tape, sequence_number)
VALUES ${values}`;

        await db.bulkInsert(query);
        console.log(
          `Bulk inserted ${batch.length} option trades (batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(
            trades.length / BATCH_SIZE
          )})`
        );
      }

      console.log(`Completed bulk insert of ${trades.length} option trades`);
    } catch (error) {
      console.error('Error bulk upserting option trades:', error);
      throw error;
    }
  }

  /**
   * Batch upsert multiple option quotes using bulk insert
   * Uses QuestDB's deduplication feature to handle upserts efficiently
   * Implements retry logic and smaller batch sizes to prevent socket hang up errors
   */
  static async batchUpsertOptionQuotes(quotes: OptionQuote[]): Promise<void> {
    if (quotes.length === 0) return;

    try {
      // Use smaller batch size to prevent URL length issues and socket hang ups
      const BATCH_SIZE = parseInt(process.env.OPTION_QUOTES_BATCH_SIZE || '100');
      const MAX_RETRIES = 3;
      const RETRY_DELAY_MS = 1000;

      for (let i = 0; i < quotes.length; i += BATCH_SIZE) {
        const batch = quotes.slice(i, i + BATCH_SIZE);
        let retryCount = 0;
        let success = false;

        while (retryCount < MAX_RETRIES && !success) {
          try {
            // Build bulk insert query with multiple VALUES
            const values = batch
              .map(quote => {
                const ticker = `'${quote.ticker.replace(/'/g, "''")}'`;
                const underlyingTicker = `'${quote.underlying_ticker.replace(/'/g, "''")}'`;
                const timestamp = `'${quote.timestamp.toISOString()}'`;
                const bidPrice = quote.bid_price ?? 'NULL';
                const bidSize = quote.bid_size ?? 'NULL';
                const askPrice = quote.ask_price ?? 'NULL';
                const askSize = quote.ask_size ?? 'NULL';
                const bidExchange = quote.bid_exchange ?? 'NULL';
                const askExchange = quote.ask_exchange ?? 'NULL';
                const sequenceNumber = quote.sequence_number ?? 'NULL';

                return `(${ticker}, ${underlyingTicker}, ${timestamp}, ${bidPrice}, ${bidSize}, ${askPrice}, ${askSize}, ${bidExchange}, ${askExchange}, ${sequenceNumber})`;
              })
              .join(',\n');

            const query = `INSERT INTO option_quotes (ticker, underlying_ticker, timestamp, bid_price, bid_size, ask_price, ask_size, bid_exchange, ask_exchange, sequence_number)
VALUES ${values}`;

            await db.bulkInsert(query);
            success = true;
          } catch (error) {
            retryCount++;
            const isSocketError =
              error instanceof Error &&
              (error.message.includes('socket hang up') ||
                error.message.includes('ECONNRESET') ||
                error.message.includes('ETIMEDOUT') ||
                error.message.includes('timeout'));

            if (isSocketError && retryCount < MAX_RETRIES) {
              console.warn(
                `Socket error on batch ${
                  Math.floor(i / BATCH_SIZE) + 1
                }, retrying ${retryCount}/${MAX_RETRIES} after ${RETRY_DELAY_MS}ms delay...`
              );
              await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * retryCount));
            } else {
              console.error(`Error bulk upserting option quotes batch ${Math.floor(i / BATCH_SIZE) + 1}:`, error);
              throw error;
            }
          }
        }
      }

      const ticker = quotes.length > 0 ? quotes[0].ticker : 'unknown';
      const totalBatches = Math.ceil(quotes.length / parseInt(process.env.OPTION_QUOTES_BATCH_SIZE || '100'));
      console.log(`Bulk inserted ${quotes.length} option quotes for ${ticker} in ${totalBatches} batches`);
    } catch (error) {
      console.error('Error bulk upserting option quotes:', error);
      throw error;
    }
  }
}
