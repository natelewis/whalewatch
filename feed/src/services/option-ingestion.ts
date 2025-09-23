import { db } from '../db/connection';
import { PolygonClient } from './polygon-client';
import { UpsertService } from '../utils/upsert';
import { config } from '../config';
import { OptionContract, OptionTrade, OptionQuote } from '../types/database';
import { PolygonOptionContract, PolygonOptionTrade, PolygonOptionQuote } from '../types/polygon';

export class OptionIngestionService {
  private polygonClient: PolygonClient;

  constructor() {
    this.polygonClient = new PolygonClient();
  }

  async ingestOptionContracts(underlyingTicker: string): Promise<void> {
    try {
      console.log(`Ingesting option contracts for ${underlyingTicker}...`);

      const contracts = await this.polygonClient.getOptionContracts(underlyingTicker);

      for (const contract of contracts) {
        await this.insertOptionContract(contract);
      }

      console.log(`Ingested ${contracts.length} option contracts for ${underlyingTicker}`);
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

      const optionTrades: OptionTrade[] = trades.map(trade => {
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

      console.log(`Ingested ${trades.length} option trades for ${ticker}`);
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

  private async insertOptionContract(contract: PolygonOptionContract): Promise<void> {
    const optionContract: OptionContract = {
      ticker: contract.ticker,
      contract_type: contract.contract_type,
      exercise_style: contract.exercise_style,
      expiration_date: contract.expiration_date,
      shares_per_contract: contract.shares_per_contract,
      strike_price: contract.strike_price,
      underlying_ticker: contract.underlying_ticker,
      created_at: new Date(),
    };

    await UpsertService.upsertOptionContract(optionContract);
  }

  async getAllOptionTickers(): Promise<string[]> {
    try {
      const tickerList = config.tickers.map(t => `'${t}'`).join(',');
      const result = await db.query(`
        SELECT DISTINCT ticker FROM option_contracts
        WHERE underlying_ticker IN (${tickerList})
      `);

      // Handle QuestDB result format
      const rows = (result as any)?.dataset || [];
      return rows.map((row: string[]) => row[0]);
    } catch (error) {
      console.error('Error getting option tickers:', error);
      return [];
    }
  }

  async backfillOptionData(underlyingTicker: string, from: Date, to: Date): Promise<void> {
    try {
      // First, get all option contracts for this underlying (if not skipped)
      if (!config.polygon.skipOptionContracts) {
        await this.ingestOptionContracts(underlyingTicker);
      } else {
        console.log(`Skipping option contracts ingestion (POLYGON_SKIP_OPTION_CONTACTS=true)`);
      }

      // Get all option tickers for this underlying
      const optionTickers = await this.getOptionTickersForUnderlying(underlyingTicker);

      console.log(`Found ${optionTickers.length} option tickers for ${underlyingTicker}`);

      // Process option tickers in parallel with controlled concurrency
      const CONCURRENCY_LIMIT = parseInt(process.env.OPTION_CONCURRENCY_LIMIT || '5');
      const pLimit = (await import('p-limit')).default;
      const limit = pLimit(CONCURRENCY_LIMIT);

      // Backfill trades for each option ticker (if not skipped)
      if (!config.polygon.skipOptionTrades) {
        console.log(`Starting parallel backfill of option trades for ${optionTickers.length} tickers...`);
        const tradePromises = optionTickers.map(ticker =>
          limit(() =>
            this.ingestOptionTrades(ticker, from, to).catch(error => {
              console.error(`Error backfilling option trades for ${ticker}:`, error);
              return null; // Continue processing other tickers
            })
          )
        );
        await Promise.all(tradePromises);
        console.log(`Completed parallel backfill of option trades`);
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
      console.error(`Error backfilling option data for ${underlyingTicker}:`, error);
      throw error;
    }
  }

  private async getOptionTickersForUnderlying(underlyingTicker: string): Promise<string[]> {
    try {
      // Use parameterized query for better performance and security
      const result = await db.query(
        `
        SELECT DISTINCT ticker FROM option_contracts
        WHERE underlying_ticker = $1
        ORDER BY ticker
      `,
        [underlyingTicker]
      );

      // Handle QuestDB result format
      const rows = (result as any)?.dataset || [];
      return rows.map((row: string[]) => row[0]);
    } catch (error) {
      console.error('Error getting option tickers for underlying:', error);
      return [];
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
}
