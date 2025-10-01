import { db } from '../db/connection';
import { StockAggregate, OptionContract, OptionTrade, OptionQuote, OptionContractIndex } from '../types/database';

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
   * Insert an option contract record if it doesn't exist
   */
  static async insertOptionContractIfNotExists(
    contract: OptionContract,
    tableName = getTableName('option_contracts')
  ): Promise<void> {
    try {
      console.log(`Attempting to insert option contract: ${contract.ticker}`);

      // Check if record exists using ticker as unique identifier
      const existing = await db.query(`SELECT ticker FROM ${tableName} WHERE ticker = $1`, [contract.ticker]);

      console.log(`Query result:`, existing);

      // Handle undefined result by treating it as empty dataset
      const questResult = existing
        ? (existing as {
            columns: { name: string; type: string }[];
            dataset: unknown[][];
          })
        : { columns: [], dataset: [] };

      console.log(`Processed result:`, questResult);
      console.log(`Dataset length:`, questResult.dataset ? questResult.dataset.length : 0);

      if (questResult.dataset && questResult.dataset.length > 0) {
        // Record already exists, skip insertion
        console.log(`Option contract already exists: ${contract.ticker}`);
      } else {
        // Insert new record
        const insertResult = await db.query(
          `INSERT INTO ${tableName} (ticker, contract_type, exercise_style, expiration_date, shares_per_contract, strike_price, underlying_ticker)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            contract.ticker,
            contract.contract_type,
            contract.exercise_style,
            contract.expiration_date,
            contract.shares_per_contract,
            contract.strike_price,
            contract.underlying_ticker,
          ]
        );
        console.log(`Insert result:`, insertResult);
        console.log(`Inserted option contract: ${contract.ticker}`);
      }
    } catch (error) {
      console.error('Error inserting option contract:', error);
      throw error;
    }
  }

  /**
   * Insert an option contract index record if it doesn't exist
   */
  static async insertOptionContractIndexIfNotExists(
    index: OptionContractIndex,
    tableName = getTableName('option_contracts_index')
  ): Promise<void> {
    try {
      console.log(
        `Attempting to insert option contract index: ${index.underlying_ticker} for ${
          index.as_of.toISOString().split('T')[0]
        }`
      );
      console.log(`Table name: ${tableName}`);

      // Check if record exists
      console.log(`About to execute SELECT query...`);
      let existing;
      try {
        existing = await db.query(
          `SELECT underlying_ticker, as_of FROM ${tableName} 
           WHERE underlying_ticker = $1 AND as_of = $2`,
          [index.underlying_ticker, index.as_of]
        );
        console.log(`Query executed successfully`);
      } catch (error) {
        console.error(`Query failed with error:`, error);
        throw error;
      }

      console.log(`Query result:`, existing);

      // Handle undefined result by treating it as empty dataset
      const questResult = existing
        ? (existing as {
            columns: { name: string; type: string }[];
            dataset: unknown[][];
          })
        : { columns: [], dataset: [] };

      console.log(`Processed result:`, questResult);

      if (questResult.dataset && questResult.dataset.length > 0) {
        // Record already exists, skip insertion
        console.log(
          `Option contract index already exists: ${index.underlying_ticker} for ${
            index.as_of.toISOString().split('T')[0]
          }`
        );
      } else {
        // Insert new record
        console.log(`About to execute INSERT query...`);
        let insertResult;
        try {
          insertResult = await db.query(
            `INSERT INTO ${tableName} (underlying_ticker, as_of)
             VALUES ($1, $2)`,
            [index.underlying_ticker, index.as_of]
          );
          console.log(`Insert executed successfully`);
        } catch (error) {
          console.error(`Insert failed with error:`, error);
          throw error;
        }
        console.log(`Insert result:`, insertResult);
        console.log(
          `Inserted option contract index: ${index.underlying_ticker} for ${index.as_of.toISOString().split('T')[0]}`
        );
      }
    } catch (error) {
      console.error('Error inserting option contract index:', error);
      throw error;
    }
  }

  /**
   * Insert an option trade record if it doesn't exist
   */
  static async insertOptionTradeIfNotExists(trade: OptionTrade, tableName = getTableName('option_trades')): Promise<void> {
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
   * Insert an option quote record if it doesn't exist
   */
  static async insertOptionQuoteIfNotExists(quote: OptionQuote, tableName = getTableName('option_quotes')): Promise<void> {
    try {
      // Check if record exists
      const existing = await db.query(
        `SELECT ticker, timestamp, sequence_number FROM ${tableName} 
         WHERE ticker = $1 AND timestamp = $2 AND sequence_number = $3`,
        [quote.ticker, quote.timestamp, quote.sequence_number]
      );

      const questResult = existing as {
        columns: { name: string; type: string }[];
        dataset: unknown[][];
      };

      if (questResult.dataset && questResult.dataset.length > 0) {
        // Record already exists, skip insertion
        console.log(`Option quote already exists: ${quote.ticker} at ${quote.timestamp}`);
      } else {
        // Insert new record
        await db.query(
          `INSERT INTO ${tableName} (ticker, underlying_ticker, timestamp, bid_price, bid_size, ask_price, ask_size, bid_exchange, ask_exchange, sequence_number)
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
      console.error('Error inserting option quote:', error);
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

  /**
   * Batch insert multiple option contracts using individual inserts to prevent duplicates
   * This ensures proper duplicate checking for each record
   */
  static async batchInsertOptionContractsIfNotExists(
    contracts: OptionContract[],
    tableName = getTableName('option_contracts')
  ): Promise<void> {
    if (contracts.length === 0) {
      return;
    }

    try {
      // Process in batches to avoid overwhelming the database
      const BATCH_SIZE = 50; // Smaller batch size for individual inserts

      for (let i = 0; i < contracts.length; i += BATCH_SIZE) {
        const batch = contracts.slice(i, i + BATCH_SIZE);

        // Process each contract individually to ensure proper duplicate checking
        for (const contract of batch) {
          await this.insertOptionContractIfNotExists(contract, tableName);
        }

        console.log(
          `Processed ${batch.length} option contracts (batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(
            contracts.length / BATCH_SIZE
          )})`
        );
      }

      console.log(`Completed insert of ${contracts.length} option contracts`);
    } catch (error) {
      console.error('Error bulk inserting option contracts:', error);
      throw error;
    }
  }

  /**
   * Process multiple option trades using individual inserts
   * QuestDB doesn't have native upsert, so we must check and insert each record individually
   */
  static async processOptionTradesIfNotExists(trades: OptionTrade[], tableName = getTableName('option_trades')): Promise<void> {
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
   * Batch insert multiple option quotes using bulk insert
   * Uses QuestDB's deduplication feature to handle inserts efficiently
   * Implements retry logic and smaller batch sizes to prevent socket hang up errors
   */
  static async batchInsertOptionQuotesIfNotExists(
    quotes: OptionQuote[],
    tableName = getTableName('option_quotes')
  ): Promise<void> {
    if (quotes.length === 0) {
      return;
    }

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

            const query = `INSERT INTO ${tableName} (ticker, underlying_ticker, timestamp, bid_price, bid_size, ask_price, ask_size, bid_exchange, ask_exchange, sequence_number)
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
              console.error(`Error bulk inserting option quotes batch ${Math.floor(i / BATCH_SIZE) + 1}:`, error);
              throw error;
            }
          }
        }
      }

      const ticker = quotes.length > 0 ? quotes[0].ticker : 'unknown';
      const totalBatches = Math.ceil(quotes.length / parseInt(process.env.OPTION_QUOTES_BATCH_SIZE || '100'));
      console.log(`Bulk inserted ${quotes.length} option quotes for ${ticker} in ${totalBatches} batches`);
    } catch (error) {
      console.error('Error bulk inserting option quotes:', error);
      throw error;
    }
  }
}
