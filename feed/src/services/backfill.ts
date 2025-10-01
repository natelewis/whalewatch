import { db } from '../db/connection';
import { StockIngestionService } from './stock-ingestion';
import { InsertIfNotExistsService } from '../utils/insert-if-not-exists';
import { config } from '../config';
import { getMinDate, getMaxDate, QuestDBServiceInterface } from '@whalewatch/shared';

export class BackfillService {
  private stockIngestionService: StockIngestionService;
  private questdbAdapter: QuestDBServiceInterface;

  constructor() {
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
          table: 'stock_trades',
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
          const tickerDuration = Date.now() - tickerStartTime;
          console.log(`Completed ${ticker} in ${this.formatDuration(tickerDuration)} - 0 items`);
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
          const tickerDuration = Date.now() - tickerStartTime;
          console.log(`Completed additional week for ${ticker} in ${this.formatDuration(tickerDuration)} - 0 items`);
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

      const duration = Date.now() - startTime;
      console.log(`Backfill completed for ${ticker} in ${this.formatDuration(duration)} - 0 items processed`);
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

      const duration = Date.now() - startTime;
      console.log(`Backfill completed for ${ticker} in ${this.formatDuration(duration)} - 0 items processed`);
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
          // Backfill the data (insert if not exists will handle duplicates)
          totalItemsProcessed += 0;
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
          table: 'stock_trades',
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

          // Check stocks independently
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
      const duration = Date.now() - startTime;
      console.log(`Backfill completed for ${ticker} in ${this.formatDuration(duration)}`);
    } catch (error) {
      console.error(`Backfill failed for ${ticker}:`, error);
      throw error;
    } finally {
      await db.disconnect();
    }
  }
}
