import { db } from '../db/connection';
import { PolygonClient } from './polygon-client';
import { UpsertService } from '../utils/upsert';
import { config } from '../config';
import { OptionContract, OptionContractIndex, OptionTrade, OptionQuote, OptionTradeIndex } from '../types/database';
import { PolygonOptionTrade, PolygonOptionQuote } from '../types/polygon';
import { ContractType } from '@whalewatch/shared';
import { getMaxDate, getMinDate, QuestDBServiceInterface, normalizeToMidnight } from '@whalewatch/shared';
import pLimit from 'p-limit';

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

export class OptionIngestionService {
  private polygonClient: PolygonClient;
  private questdbAdapter: QuestDBServiceInterface;

  constructor() {
    this.polygonClient = new PolygonClient();
    // Create adapter for the feed's database connection
    this.questdbAdapter = {
      executeQuery: async (query: string) => {
        const result = await db.query(query);
        return result as { columns: { name: string; type: string }[]; dataset: unknown[][] };
      },
      convertArrayToObject: <T>(dataset: unknown[][], columns: { name: string; type: string }[]): T[] => {
        return dataset.map((row: unknown) => {
          if (!Array.isArray(row)) {
            throw new Error('Expected array data from QuestDB');
          }
          const obj: Record<string, string | number | boolean | null> = {};
          columns.forEach((col, index) => {
            obj[col.name] = row[index] as string | number | boolean | null;
          });
          return obj as T;
        });
      },
    };
  }

  async backfillOptionTrades(underlyingTicker: string, from: Date, to: Date): Promise<void> {
    try {
      console.log(
        `Backfilling option trades for ${underlyingTicker} from ${from.toISOString()} to ${to.toISOString()}...`
      );

      const optionTickers = await this.getOptionTickersForUnderlying(underlyingTicker, from);
      console.log(`Found ${optionTickers.length} option tickers for ${underlyingTicker}`);

      const CONCURRENCY_LIMIT = parseInt(process.env.OPTION_CONCURRENCY_LIMIT || '5');
      const limit = pLimit(CONCURRENCY_LIMIT);

      const tradePromises = optionTickers.map(ticker =>
        limit(async () => {
          try {
            const lastSync = await this.getOptionTradeLastSync(ticker);
            const backfillStart = lastSync ? new Date(lastSync.getTime() + 1) : from;

            if (backfillStart >= to) {
              console.log(`Option trades for ${ticker} are already up to date.`);
              return;
            }

            await this.ingestOptionTrades(ticker, backfillStart, to);
            await this.updateOptionTradeLastSync(ticker, to);
          } catch (error) {
            console.error(`Error backfilling option trades for ${ticker}:`, error);
          }
        })
      );

      await Promise.all(tradePromises);
      console.log(`Completed backfill of option trades for ${underlyingTicker}`);
    } catch (error) {
      console.error(`Error backfilling option trades for ${underlyingTicker}:`, error);
      throw error;
    }
  }

  async getOptionTradeLastSync(ticker: string): Promise<Date | null> {
    try {
      const result = await db.query(
        `SELECT last_sync FROM ${getTableName(
          'option_trades_index'
        )} WHERE ticker = $1 ORDER BY last_sync DESC LIMIT 1`,
        [ticker]
      );

      const rows = (result as { dataset: unknown[][] })?.dataset || [];
      if (rows.length > 0) {
        return new Date(rows[0][0] as string);
      }
      return null;
    } catch (error) {
      console.error(`Error getting last sync for ${ticker}:`, error);
      return null;
    }
  }

  async updateOptionTradeLastSync(ticker: string, lastSync: Date): Promise<void> {
    try {
      const indexRecord: OptionTradeIndex = {
        ticker: ticker,
        last_sync: lastSync,
      };
      await UpsertService.upsertOptionTradeIndex(indexRecord);
    } catch (error) {
      console.error(`Error updating last sync for ${ticker}:`, error);
    }
  }

  async ingestOptionContracts(underlyingTicker: string, asOf: Date): Promise<void> {
    try {
      const asOfStr = asOf ? asOf.toISOString().split('T')[0] : 'current';
      console.log(`Ingesting option contracts for ${underlyingTicker} as of ${asOfStr}...`);

      const contracts = await this.polygonClient.getOptionContracts(underlyingTicker, asOf);

      // Convert expiration_date from string to Date, all other fields are identical
      const optionContracts: OptionContract[] = contracts.map(contract => ({
        ...contract,
        expiration_date: new Date(contract.expiration_date),
      }));

      // Batch upsert the contracts
      // Work around Jest module loading issue
      if (typeof UpsertService.batchUpsertOptionContracts === 'function') {
        await UpsertService.batchUpsertOptionContracts(optionContracts);
      } else {
        // Fallback: process contracts individually
        for (const contract of optionContracts) {
          await UpsertService.upsertOptionContract(contract);
        }
      }

      // Record the sync in the index table with normalized timestamp
      const indexRecord: OptionContractIndex = {
        underlying_ticker: underlyingTicker,
        as_of: normalizeToMidnight(asOf),
      };
      // Work around Jest module loading issue
      if (typeof UpsertService.upsertOptionContractIndex === 'function') {
        await UpsertService.upsertOptionContractIndex(indexRecord);
      } else {
        // Fallback: insert directly
        await db.query(
          `INSERT INTO ${getTableName('option_contracts_index')} (underlying_ticker, as_of) VALUES ($1, $2)`,
          [indexRecord.underlying_ticker, indexRecord.as_of]
        );
      }

      console.log(`Ingested ${contracts.length} option contracts for ${underlyingTicker} as of ${asOfStr}`);
    } catch (error) {
      console.error(`Error ingesting option contracts for ${underlyingTicker}:`, error);
      throw error;
    }
  }

  async ingestOptionTrades(ticker: string, from: Date, to: Date): Promise<void> {
    try {
      console.log(`Ingesting option trades for ${ticker} from ${from.toISOString()} to ${to.toISOString()}...`);

      // Extract the underlying ticker from the option ticker symbol
      const underlyingTicker = this.extractUnderlyingTicker(ticker);
      if (!underlyingTicker) {
        console.warn(`Could not extract underlying ticker from option ${ticker}, skipping trades`);
        return;
      }

      const trades = await this.polygonClient.getOptionTrades(ticker, from, to);

      // Get contract details to determine shares_per_contract
      const contractDetails = await this.getContractDetails(ticker);
      const sharesPerContract = contractDetails?.shares_per_contract || 100; // Default to 100 if not found

      // Filter trades by value threshold
      const threshold = 10000;
      const filteredTrades = trades.filter(trade => {
        const optionTrade = trade as unknown as PolygonOptionTrade;
        const tradeValue = optionTrade.price * sharesPerContract * optionTrade.size;
        return tradeValue >= threshold;
      });

      const optionTrades: OptionTrade[] = filteredTrades.map(trade => {
        const optionTrade = trade as unknown as PolygonOptionTrade;
        const tradeDate = PolygonClient.convertTimestamp(optionTrade.sip_timestamp, true);

        return {
          ticker: ticker,
          underlying_ticker: underlyingTicker,
          timestamp: tradeDate,
          price: optionTrade.price,
          size: optionTrade.size,
          conditions: optionTrade.conditions ? JSON.stringify(optionTrade.conditions) : '[]',
          exchange: optionTrade.exchange || 0,
          tape: optionTrade.tape || 0,
          sequence_number: optionTrade.sequence_number,
        };
      });

      await UpsertService.batchUpsertOptionTrades(optionTrades);

      console.log(
        `Ingested ${optionTrades.length} option trades for ${ticker} (filtered from ${trades.length} total trades, threshold: $${threshold})`
      );
    } catch (error) {
      console.error(`Error ingesting option trades for ${ticker}:`, error);
      throw error;
    }
  }

  async ingestOptionQuotes(ticker: string, from: Date, to: Date): Promise<void> {
    try {
      // Extract the underlying ticker from the option ticker symbol
      const underlyingTicker = this.extractUnderlyingTicker(ticker);
      if (!underlyingTicker) {
        console.warn(`Could not extract underlying ticker from option ${ticker}, skipping quotes`);
        return;
      }

      // Process quotes in streaming fashion to reduce memory usage
      // Use smaller chunk size to prevent socket hang up errors
      const CHUNK_SIZE = parseInt(process.env.OPTION_QUOTES_CHUNK_SIZE || '1000');
      let totalProcessed = 0;
      let hasMoreData = true;
      let currentFrom = new Date(from);

      while (hasMoreData && currentFrom < to) {
        // Process in smaller time chunks to avoid memory issues
        const chunkEnd = new Date(
          Math.min(
            currentFrom.getTime() + 24 * 60 * 60 * 1000, // 1 day chunks
            to.getTime()
          )
        );

        const quotes = await this.polygonClient.getOptionQuotes(ticker, currentFrom, chunkEnd);

        if (quotes.length === 0) {
          hasMoreData = false;
        } else {
          // Process quotes in smaller batches
          for (let i = 0; i < quotes.length; i += CHUNK_SIZE) {
            const chunk = quotes.slice(i, i + CHUNK_SIZE);

            const optionQuotes: OptionQuote[] = chunk.map(quote => {
              const optionQuote = quote as unknown as PolygonOptionQuote;
              const quoteDate = PolygonClient.convertTimestamp(optionQuote.sip_timestamp, true);

              return {
                ticker: ticker,
                underlying_ticker: underlyingTicker,
                timestamp: quoteDate,
                bid_price: optionQuote.bid_price ?? 0,
                bid_size: optionQuote.bid_size ?? 0,
                ask_price: optionQuote.ask_price ?? 0,
                ask_size: optionQuote.ask_size ?? 0,
                bid_exchange: optionQuote.bid_exchange || 0,
                ask_exchange: optionQuote.ask_exchange || 0,
                sequence_number: optionQuote.sequence_number || 0,
              };
            });

            try {
              await UpsertService.batchUpsertOptionQuotes(optionQuotes);
              totalProcessed += optionQuotes.length;
            } catch (error) {
              console.error(`Error processing option quotes chunk for ${ticker}:`, error);
              // Continue processing other chunks instead of failing completely
              console.log(`Skipping failed chunk, continuing with next chunk...`);
            }
          }
        }

        currentFrom = new Date(chunkEnd);
      }

      console.log(
        `Ingested ${totalProcessed} option quotes for ${ticker} from ${from.toISOString()} to ${to.toISOString()}`
      );
    } catch (error) {
      console.error(`Error ingesting option quotes for ${ticker}:`, error);
      throw error;
    }
  }

  async getAllOptionTickers(): Promise<string[]> {
    try {
      const tickerList = config.tickers.map(t => `'${t}'`).join(',');
      const result = await db.query(`
        SELECT DISTINCT ticker FROM ${getTableName('option_contracts')}
        WHERE underlying_ticker IN (${tickerList})
      `);

      // Handle QuestDB result format
      const rows = (result as { dataset: unknown[][] })?.dataset || [];
      return rows.map((row: unknown[]) => String(row[0]));
    } catch (error) {
      console.error('Error getting option tickers:', error);
      return [];
    }
  }

  async getNewestAsOfDate(underlyingTicker: string): Promise<Date | null> {
    try {
      const result = await getMaxDate(this.questdbAdapter, {
        ticker: underlyingTicker,
        tickerField: 'underlying_ticker',
        dateField: 'as_of',
        table: 'option_contracts_index',
      });
      return result;
    } catch (error) {
      console.error('Error in getNewestAsOfDate:', error);
      return null;
    }
  }

  async getOldestAsOfDate(underlyingTicker: string): Promise<Date | null> {
    return getMinDate(this.questdbAdapter, {
      ticker: underlyingTicker,
      tickerField: 'underlying_ticker',
      dateField: 'as_of',
      table: 'option_contracts_index',
    });
  }

  async catchUpOptionContracts(underlyingTicker: string): Promise<void> {
    try {
      console.log(`Catching up option contracts for ${underlyingTicker}...`);

      // Get the newest as_of date for this underlying ticker
      const newestAsOf = await this.getNewestAsOfDate(underlyingTicker);

      if (!newestAsOf) {
        // No existing data, fetch current contracts
        console.log(`No existing option contracts found for ${underlyingTicker}, fetching current contracts`);
        await this.ingestOptionContracts(underlyingTicker, new Date()); // just get todays
        return;
      }

      // Calculate the date range from newest as_of to current day
      const now = new Date();
      const startDate = new Date(newestAsOf);
      startDate.setDate(startDate.getDate() + 1); // Start from the day after the newest as_of

      if (startDate >= now) {
        console.log(
          `Option contracts for ${underlyingTicker} are already up to date (newest as_of: ${
            newestAsOf.toISOString().split('T')[0]
          })`
        );
        return;
      }

      console.log(
        `Catching up option contracts for ${underlyingTicker} from ${startDate.toISOString().split('T')[0]} to ${
          now.toISOString().split('T')[0]
        }`
      );

      // Fetch contracts day by day from startDate to now
      const currentDate = new Date(startDate);

      while (currentDate <= now) {
        const asOfDate = new Date(currentDate);
        asOfDate.setHours(0, 0, 0, 0); // Set to start of day

        try {
          console.log(
            `Fetching option contracts for ${underlyingTicker} as of ${asOfDate.toISOString().split('T')[0]}`
          );
          await this.ingestOptionContracts(underlyingTicker, asOfDate);

          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          console.error(
            `Error fetching option contracts for ${underlyingTicker} as of ${asOfDate.toISOString().split('T')[0]}:`,
            error
          );
          // Continue with next day instead of failing completely
        }

        // Move to next day
        currentDate.setDate(currentDate.getDate() + 1);
      }

      console.log(`Completed catching up option contracts for ${underlyingTicker}`);
    } catch (error) {
      console.error(`Error catching up option contracts for ${underlyingTicker}:`, error);
      throw error;
    }
  }

  async processOptionContractsBackfill(underlyingTicker: string, from: Date, to: Date): Promise<void> {
    try {
      // First, get all option contracts for this underlying (if not skipped)
      if (!config.polygon.skipOptionContracts) {
        await this.backfillOptionContractsWithAsOf(underlyingTicker, from, to);
      } else {
        console.log(`Skipping option contracts ingestion (POLYGON_SKIP_OPTION_CONTRACTS=true)`);
      }

      // Get all option tickers for this underlying
      const optionTickers = await this.getOptionTickersForUnderlying(underlyingTicker, from);

      console.log(`Found ${optionTickers.length} option tickers for ${underlyingTicker}`);

      // Backfill trades for each option ticker (if not skipped)
      if (!config.polygon.skipOptionTrades) {
        await this.backfillOptionTrades(underlyingTicker, from, to);
      } else {
        console.log(`Skipping option trades ingestion (POLYGON_SKIP_OPTION_TRADES=true)`);
      }

      // Backfill quotes for each option ticker (if not skipped)
      if (!config.polygon.skipOptionQuotes) {
        console.log(`Starting parallel backfill of option quotes for ${optionTickers.length} tickers...`);
        const quotePromises = optionTickers.map(ticker =>
          limit(() =>
            this.ingestOptionQuotes(ticker, from, to).catch(error => {
              console.error(`Error backfilling option quotes for ${ticker}:`, error);
              return null; // Continue processing other tickers
            })
          )
        );
        await Promise.all(quotePromises);
        console.log(`Completed parallel backfill of option quotes`);
      } else {
        console.log(`Skipping option quotes ingestion (POLYGON_SKIP_OPTION_QUOTES=true)`);
      }
    } catch (error) {
      console.error(`Error backfilling option contracts for ${underlyingTicker}:`, error);
      throw error;
    }
  }

  private async getOptionTickersForUnderlying(underlyingTicker: string, activeAfter?: Date): Promise<string[]> {
    try {
      const params: (string | Date)[] = [underlyingTicker];
      let query = `
        SELECT DISTINCT ticker FROM option_contracts
        WHERE underlying_ticker = $1
      `;

      if (activeAfter) {
        query += ` AND expiration_date >= $2`;
        params.push(activeAfter);
      }

      query += ` ORDER BY ticker`;

      const result = await db.query(query, params);

      // Handle QuestDB result format
      const rows = (result as { dataset: unknown[][] })?.dataset || [];
      return rows.map((row: unknown[]) => String(row[0]));
    } catch (error) {
      console.error('Error getting option tickers for underlying:', error);
      return [];
    }
  }

  private async backfillOptionContractsWithAsOf(underlyingTicker: string, from: Date, to: Date): Promise<void> {
    try {
      console.log(
        `Backfilling option contracts for ${underlyingTicker} with as_of dates from ${
          from.toISOString().split('T')[0]
        } to ${to.toISOString().split('T')[0]}`
      );

      // Start from the oldest date -1 and work backwards day by day
      const currentDate = new Date(from);
      currentDate.setDate(currentDate.getDate() - 1); // Start from oldest date -1

      // Work backwards until we reach the target date (to parameter)
      while (currentDate >= to) {
        console.log(
          `Processing date: ${currentDate.toISOString().split('T')[0]} (from ${from.toISOString().split('T')[0]} to ${
            to.toISOString().split('T')[0]
          })`
        );

        try {
          console.log(
            `Fetching option contracts for ${underlyingTicker} as of ${currentDate.toISOString().split('T')[0]}`
          );
          await this.ingestOptionContracts(underlyingTicker, currentDate);

          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          console.error(
            `Error fetching option contracts for ${underlyingTicker} as of ${currentDate.toISOString().split('T')[0]}:`,
            error
          );
          // Continue with next day instead of failing completely
        }

        // Move to previous day AFTER processing current day
        currentDate.setDate(currentDate.getDate() - 1);
      }

      console.log(`Completed backfilling option contracts for ${underlyingTicker} with as_of dates`);
    } catch (error) {
      console.error(`Error backfilling option contracts with as_of dates for ${underlyingTicker}:`, error);
      throw error;
    }
  }

  private extractUnderlyingTicker(optionTicker: string): string | null {
    try {
      // Option ticker format: O:LLY260116C00700000
      // Extract the underlying ticker after "O:" and before the date/expiration part
      const match = optionTicker.match(/^O:([A-Z]+)/);
      if (match && match[1]) {
        return match[1];
      }

      // Fallback: if it doesn't start with "O:", try to extract from the beginning
      // This handles cases where the format might be different
      const fallbackMatch = optionTicker.match(/^([A-Z]+)/);
      if (fallbackMatch && fallbackMatch[1]) {
        return fallbackMatch[1];
      }

      return null;
    } catch (error) {
      console.error('Error extracting underlying ticker from option ticker:', error);
      return null;
    }
  }

  private async getContractDetails(ticker: string): Promise<OptionContract | null> {
    try {
      const result = await db.query(
        `SELECT ticker, contract_type, exercise_style, expiration_date, shares_per_contract, strike_price, underlying_ticker 
         FROM option_contracts 
         WHERE ticker = $1 
         LIMIT 1`,
        [ticker]
      );

      if (result && typeof result === 'object' && 'dataset' in result) {
        const dataset = (result as { dataset: unknown[][] }).dataset;
        if (dataset && dataset.length > 0) {
          const row = dataset[0];
          return {
            ticker: row[0] as string,
            contract_type: row[1] as ContractType,
            exercise_style: row[2] as 'american' | 'european',
            expiration_date: new Date(row[3] as string),
            shares_per_contract: row[4] as number,
            strike_price: row[5] as number,
            underlying_ticker: row[6] as string,
          };
        }
      }
      return null;
    } catch (error) {
      console.warn(`Could not retrieve contract details for ${ticker}:`, error);
      return null;
    }
  }
}
