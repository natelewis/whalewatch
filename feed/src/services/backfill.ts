import { db } from '../db/connection';
import { OptionIngestionService } from './option-ingestion';
import { StockIngestionService } from './stock-ingestion';
import { InsertIfNotExistsService } from '../utils/insert-if-not-exists';
import { config } from '../config';
import { StockAggregate } from '../types/database';
import { getMinDate, getMaxDate, QuestDBServiceInterface, normalizeToMidnight } from '@whalewatch/shared';

export class BackfillService {
  private optionIngestionService: OptionIngestionService;
  private stockIngestionService: StockIngestionService;
  private questdbAdapter: QuestDBServiceInterface;

  constructor() {
    this.optionIngestionService = new OptionIngestionService();
    this.stockIngestionService = new StockIngestionService();
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

  private formatDuration(milliseconds: number): string {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      const remainingMinutes = minutes % 60;
      const remainingSeconds = seconds % 60;
      return `${hours}h ${remainingMinutes}m ${remainingSeconds}s`;
    } else if (minutes > 0) {
      const remainingSeconds = seconds % 60;
      return `${minutes}m ${remainingSeconds}s`;
    } else {
      return `${seconds}s`;
    }
  }

  async backfillAll(): Promise<void> {
    console.log('Starting backfill for all tickers...');
    const startTime = Date.now();

    try {
      await db.connect();
      await db.executeSchema();

      // Get the oldest timestamp across all tickers
      let oldestTimestamp: Date | null = null;
      for (const ticker of config.tickers) {
        const tickerOldest = await getMinDate(this.questdbAdapter, {
          ticker,
          tickerField: 'symbol',
          dateField: 'timestamp',
          table: 'stock_aggregates',
        });
        if (tickerOldest && (!oldestTimestamp || tickerOldest < oldestTimestamp)) {
          oldestTimestamp = tickerOldest;
        }
      }

      const oldestSync = oldestTimestamp;

      const backfillStart = oldestSync ? new Date(oldestSync) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago if no data
      const backfillEnd = new Date();

      console.log(`Backfilling from ${backfillStart.toISOString()} to ${backfillEnd.toISOString()}`);

      let totalItemsProcessed = 0;

      // Backfill each ticker
      for (const ticker of config.tickers) {
        try {
          const tickerStartTime = Date.now();
          const itemsProcessed = await this.processStockAggregateBackfill(ticker, backfillStart, backfillEnd);
          const tickerDuration = Date.now() - tickerStartTime;
          totalItemsProcessed += itemsProcessed;
          console.log(`Completed ${ticker} in ${this.formatDuration(tickerDuration)} - ${itemsProcessed} items`);
        } catch (error) {
          console.error(`Error backfilling ${ticker}:`, error);
        }
      }

      // Add one more week of data for all tickers
      const additionalWeekStart = backfillEnd;
      const additionalWeekEnd = new Date(backfillEnd.getTime() + 7 * 24 * 60 * 60 * 1000);

      console.log('Adding additional week of data...');

      for (const ticker of config.tickers) {
        try {
          const tickerStartTime = Date.now();
          const itemsProcessed = await this.processStockAggregateBackfill(
            ticker,
            additionalWeekStart,
            additionalWeekEnd
          );
          const tickerDuration = Date.now() - tickerStartTime;
          totalItemsProcessed += itemsProcessed;
          console.log(
            `Completed additional week for ${ticker} in ${this.formatDuration(
              tickerDuration
            )} - ${itemsProcessed} items`
          );
        } catch (error) {
          console.error(`Error backfilling additional week for ${ticker}:`, error);
        }
      }

      const totalDuration = Date.now() - startTime;
      console.log(
        `Backfill completed for all tickers in ${this.formatDuration(
          totalDuration
        )} - Total items processed: ${totalItemsProcessed}`
      );
    } catch (error) {
      console.error('Backfill failed:', error);
      throw error;
    } finally {
      await db.disconnect();
    }
  }

  async backfillTicker(ticker: string): Promise<void> {
    console.log(`Starting backfill for ticker: ${ticker}`);
    const startTime = Date.now();

    try {
      await db.connect();
      await db.executeSchema();

      // Get the newest timestamp from existing data
      const newestTimestamp = await getMaxDate(this.questdbAdapter, {
        ticker,
        tickerField: 'symbol',
        dateField: 'timestamp',
        table: 'stock_aggregates',
      });

      const backfillStart = newestTimestamp || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago if no data
      const backfillEnd = new Date();

      const itemsProcessed = await this.processStockAggregateBackfill(ticker, backfillStart, backfillEnd);

      const duration = Date.now() - startTime;
      console.log(
        `Backfill completed for ${ticker} in ${this.formatDuration(duration)} - ${itemsProcessed} items processed`
      );
    } catch (error) {
      console.error(`Backfill failed for ${ticker}:`, error);
      throw error;
    } finally {
      await db.disconnect();
    }
  }

  async backfillTickerFromDate(ticker: string, startDate: Date): Promise<void> {
    console.log(`Starting backfill for ticker: ${ticker} from ${startDate.toISOString().split('T')[0]}`);
    const startTime = Date.now();

    try {
      await db.connect();
      await db.executeSchema();

      // Calculate the date range based on configuration - go backwards from start date
      const maxDays = config.app.backfillMaxDays;
      const backfillStart =
        maxDays > 0
          ? new Date(startDate.getTime() - maxDays * 24 * 60 * 60 * 1000)
          : new Date(startDate.getTime() - 365 * 24 * 60 * 60 * 1000); // Default to 1 year back if no limit
      const backfillEnd = startDate;

      if (maxDays > 0) {
        console.log(
          `Backfill limited to ${maxDays} days backwards from start date. Date range: ${
            backfillStart.toISOString().split('T')[0]
          } to ${backfillEnd.toISOString().split('T')[0]}`
        );
      }

      const itemsProcessed = await this.processStockAggregateBackfill(ticker, backfillStart, backfillEnd);

      // Also backfill option contracts and trades for this ticker
      console.log(`Backfilling option contractsdata for ${ticker}...`);
      await this.optionIngestionService.processOptionContractsBackfill(ticker, backfillStart, backfillEnd);

      const duration = Date.now() - startTime;
      console.log(
        `Backfill completed for ${ticker} in ${this.formatDuration(duration)} - ${itemsProcessed} items processed`
      );
    } catch (error) {
      console.error(`Backfill failed for ${ticker}:`, error);
      throw error;
    } finally {
      await db.disconnect();
    }
  }

  async backfillAllFromDate(startDate: Date): Promise<void> {
    console.log(`Starting backfill for all tickers from ${startDate.toISOString().split('T')[0]}`);
    const startTime = Date.now();

    try {
      await db.connect();
      await db.executeSchema();

      // Calculate the date range based on configuration - go backwards from start date
      const maxDays = config.app.backfillMaxDays;
      const backfillStart =
        maxDays > 0
          ? new Date(startDate.getTime() - maxDays * 24 * 60 * 60 * 1000)
          : new Date(startDate.getTime() - 365 * 24 * 60 * 60 * 1000); // Default to 1 year back if no limit
      const backfillEnd = startDate;

      if (maxDays > 0) {
        console.log(
          `Backfill limited to ${maxDays} days backwards from start date. Date range: ${
            backfillStart.toISOString().split('T')[0]
          } to ${backfillEnd.toISOString().split('T')[0]}`
        );
      }

      let totalItemsProcessed = 0;

      // Backfill each ticker
      for (const ticker of config.tickers) {
        try {
          // Backfill the data (upserts will handle duplicates)
          const itemsProcessed = await this.processStockAggregateBackfill(ticker, backfillStart, backfillEnd);
          totalItemsProcessed += itemsProcessed;

          // Also backfill option contracts and trades for this ticker
          console.log(`Backfilling option contracts for ${ticker}...`);
          await this.optionIngestionService.processOptionContractsBackfill(ticker, backfillStart, backfillEnd);
        } catch (error) {
          console.error(`Error backfilling ${ticker}:`, error);
        }
      }

      const totalDuration = Date.now() - startTime;
      console.log(
        `Backfill completed for all tickers in ${this.formatDuration(
          totalDuration
        )} - Total items processed: ${totalItemsProcessed}`
      );
    } catch (error) {
      console.error('Backfill failed:', error);
      throw error;
    } finally {
      await db.disconnect();
    }
  }

  async backfillAllToDate(endDate: Date): Promise<void> {
    console.log(
      `Starting backfill for all tickers TO ${
        endDate.toISOString().split('T')[0]
      } (ensuring all tickers have data through this date)`
    );
    const startTime = Date.now();

    try {
      await db.connect();
      await db.executeSchema();

      // Get the oldest timestamp across all tickers
      let oldestTimestamp: Date | null = null;
      for (const ticker of config.tickers) {
        const tickerOldest = await getMinDate(this.questdbAdapter, {
          ticker,
          tickerField: 'symbol',
          dateField: 'timestamp',
          table: 'stock_aggregates',
        });
        if (tickerOldest && (!oldestTimestamp || tickerOldest < oldestTimestamp)) {
          oldestTimestamp = tickerOldest;
        }
      }

      // Use the oldest sync date as the starting point, or default to a reasonable historical date
      const oldestSync = oldestTimestamp;
      const backfillStart = oldestSync ? new Date(oldestSync) : new Date(endDate.getTime() - 365 * 24 * 60 * 60 * 1000); // Default to 1 year back if no data

      console.log(
        `Backfilling all tickers from ${backfillStart.toISOString().split('T')[0]} to ${
          endDate.toISOString().split('T')[0]
        }`
      );

      let totalItemsProcessed = 0;

      // Backfill each ticker to ensure they all have data through the end date
      for (const ticker of config.tickers) {
        try {
          const tickerStartTime = Date.now();

          // Check stocks and options independently
          await this.backfillStockAggregatesAndOptions(ticker, endDate);
          totalItemsProcessed += 1; // Count ticker as processed

          const tickerDuration = Date.now() - tickerStartTime;
          console.log(`Completed ${ticker} in ${this.formatDuration(tickerDuration)}`);
        } catch (error) {
          console.error(`Error backfilling ${ticker}:`, error);
        }
      }

      const totalDuration = Date.now() - startTime;
      console.log(
        `Backfill completed for all tickers in ${this.formatDuration(
          totalDuration
        )} - Total items processed: ${totalItemsProcessed}`
      );
    } catch (error) {
      console.error('Backfill failed:', error);
      throw error;
    } finally {
      await db.disconnect();
    }
  }

  async backfillTickerToDate(ticker: string, endDate: Date): Promise<void> {
    console.log(`Starting backfill for ticker: ${ticker} TO ${endDate.toISOString().split('T')[0]}`);
    const startTime = Date.now();

    try {
      await db.connect();
      await db.executeSchema();

      // Use the new independent check logic
      await this.backfillStockAggregatesAndOptions(ticker, endDate);

      const duration = Date.now() - startTime;
      console.log(`Backfill completed for ${ticker} in ${this.formatDuration(duration)}`);
    } catch (error) {
      console.error(`Backfill failed for ${ticker}:`, error);
      throw error;
    } finally {
      await db.disconnect();
    }
  }

  private async backfillStockAggregates(ticker: string, endDate: Date): Promise<void> {
    console.log(
      `Checking stock aggregates backfill requirements for ${ticker} to ${endDate.toISOString().split('T')[0]}`
    );

    // Check if stock aggregates backfill is skipped
    if (config.alpaca.skipStockAggregates) {
      console.log(`Skipping stock aggregates backfill (ALPACA_SKIP_STOCK_AGGREGATES=true)`);
      return;
    }

    // Check stocks independently
    const oldestStockDataDate = await getMinDate(this.questdbAdapter, {
      ticker,
      tickerField: 'symbol',
      dateField: 'timestamp',
      table: 'stock_aggregates',
    });
    let stocksNeedBackfill = false;
    let stockBackfillStart: Date | null = null;

    if (oldestStockDataDate) {
      if (oldestStockDataDate <= endDate) {
        console.log(
          `${ticker} stock aggregates already have data through ${endDate.toISOString().split('T')[0]} (oldest data: ${
            oldestStockDataDate.toISOString().split('T')[0]
          }), skipping stock backfill`
        );
      } else {
        stocksNeedBackfill = true;
        stockBackfillStart = endDate;
        console.log(
          `${ticker} stocks oldest data is ${
            oldestStockDataDate.toISOString().split('T')[0]
          }, backfilling stocks from ${endDate.toISOString().split('T')[0]} TO ${
            oldestStockDataDate.toISOString().split('T')[0]
          }`
        );
      }
    } else {
      stocksNeedBackfill = true;
      stockBackfillStart = new Date(endDate.getTime() - 365 * 24 * 60 * 60 * 1000); // 1 year back
      console.log(
        `${ticker} has no existing stock data, backfilling stocks from historical date to ${
          endDate.toISOString().split('T')[0]
        }`
      );
    }

    // Backfill stocks if needed
    if (stocksNeedBackfill && stockBackfillStart) {
      try {
        await this.processStockAggregateBackfill(ticker, stockBackfillStart, endDate);
      } catch (error) {
        console.error(`Error backfilling stocks for ${ticker}:`, error);
      }
    }
  }

  private async backfillOptionContracts(ticker: string, endDate: Date): Promise<void> {
    console.log(
      `Checking option contracts backfill requirements for ${ticker} to ${endDate.toISOString().split('T')[0]}`
    );

    // Check options independently
    const oldestOptionAsOfDate = await this.optionIngestionService.getOldestAsOfDate(ticker);
    let optionsNeedBackfill = false;
    let optionBackfillStart: Date | null = null;

    if (oldestOptionAsOfDate) {
      if (oldestOptionAsOfDate <= endDate) {
        console.log(
          `${ticker} options contracts already have data through ${
            endDate.toISOString().split('T')[0]
          } (oldest as_of: ${oldestOptionAsOfDate.toISOString().split('T')[0]}), skipping option backfill`
        );
      } else {
        optionsNeedBackfill = true;
        // Start from the oldest as_of date and work backwards to the target date
        optionBackfillStart = normalizeToMidnight(new Date(oldestOptionAsOfDate));

        console.log(
          `${ticker} options oldest as_of is ${
            oldestOptionAsOfDate.toISOString().split('T')[0]
          }, backfilling options from ${optionBackfillStart.toISOString().split('T')[0]} TO ${
            endDate.toISOString().split('T')[0]
          }`
        );
      }
    } else {
      optionsNeedBackfill = true;
      // If no existing option contracts, start from today and work backwards to the target date
      optionBackfillStart = normalizeToMidnight(new Date());
      console.log(
        `${ticker} has no existing option contracts, backfilling options from today TO: ${
          endDate.toISOString().split('T')[0]
        }`
      );
    }

    // Backfill options if needed
    if (optionsNeedBackfill && optionBackfillStart) {
      try {
        console.log(`Backfilling option contracts for ${ticker}...`);
        await this.optionIngestionService.processOptionContractsBackfill(ticker, optionBackfillStart, endDate);
        await this.optionIngestionService.backfillOptionTrades(ticker, endDate);
      } catch (error) {
        console.error(`Error backfilling options for ${ticker}:`, error);
      }
    }
  }

  private async backfillStockAggregatesAndOptions(ticker: string, endDate: Date): Promise<void> {
    console.log(`Checking backfill requirements for ${ticker} to ${endDate.toISOString().split('T')[0]}`);

    // Backfill stocks and options independently
    await this.backfillStockAggregates(ticker, endDate);
    await this.backfillOptionContracts(ticker, endDate);
  }

  private async processStockAggregateBackfill(ticker: string, startDate: Date, endDate: Date): Promise<number> {
    console.log(`Backfilling ${ticker} from ${startDate.toISOString()} to ${endDate.toISOString()}`);

    // Validate dates
    const now = new Date();
    if (endDate > now) {
      console.warn(`WARNING: End date ${endDate.toISOString()} is in the future. Current time: ${now.toISOString()}`);
    }
    if (startDate > endDate) {
      console.warn(`WARNING: Start date ${startDate.toISOString()} is after end date ${endDate.toISOString()}`);
    }

    // Start from the start date and work forwards to end date
    const currentDate = new Date(startDate);
    let totalItemsProcessed = 0;

    while (currentDate <= endDate) {
      // Process one day at a time, going forwards
      const dayEnd = new Date(currentDate.getTime() + 24 * 60 * 60 * 1000);
      const actualEnd = dayEnd > endDate ? endDate : dayEnd;

      try {
        const bars = await this.stockIngestionService.getHistoricalStockBars(ticker, currentDate, actualEnd, '1Min');

        console.log(
          `Fetched ${bars.length} bars from Alpaca for ${ticker} on ${currentDate.toISOString().split('T')[0]}`
        );
        if (bars.length > 0) {
          console.log(`Processing ${bars.length} bars for ${ticker} on ${currentDate.toISOString().split('T')[0]}`);

          // Convert Alpaca bars to the format expected by insertAlpacaAggregates
          const aggregates = bars.map(bar => ({
            symbol: ticker,
            timestamp: new Date(bar.t),
            open: bar.o,
            high: bar.h,
            low: bar.l,
            close: bar.c,
            volume: bar.v,
            vw: bar.vw,
            n: bar.n,
          }));

          console.log(`About to insert ${aggregates.length} aggregates for ${ticker}`);
          try {
            await this.insertAlpacaAggregates(ticker, aggregates);
            totalItemsProcessed += aggregates.length;
            console.log(
              `Successfully inserted ${aggregates.length} aggregates for ${ticker} on ${
                currentDate.toISOString().split('T')[0]
              }`
            );
          } catch (insertError) {
            console.error(`Error inserting aggregates for ${ticker}:`, insertError);
            throw insertError;
          }

          // Data successfully inserted
        } else {
          console.log(`No data found for ${ticker} on ${currentDate.toISOString().split('T')[0]}`);
        }
      } catch (error) {
        console.error(`Error backfilling ${ticker} for ${currentDate.toISOString().split('T')[0]}:`, error);
        // Continue with next day
      }

      // Move to the next day
      currentDate.setDate(currentDate.getDate() + 1);

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return totalItemsProcessed;
  }

  private async insertAlpacaAggregates(
    ticker: string,
    aggregates: Array<{
      symbol: string;
      timestamp: Date;
      open: number;
      high: number;
      low: number;
      close: number;
      volume: number;
      vw: number;
      n: number;
    }>
  ): Promise<void> {
    const stockAggregates: StockAggregate[] = aggregates.map(aggregate => ({
      symbol: ticker,
      timestamp: aggregate.timestamp, // Already converted to Date in the mapping above
      open: aggregate.open,
      high: aggregate.high,
      low: aggregate.low,
      close: aggregate.close,
      volume: aggregate.volume,
      vwap: aggregate.vw,
      transaction_count: aggregate.n,
    }));

    await InsertIfNotExistsService.batchInsertStockAggregatesIfNotExists(stockAggregates);
  }
}
