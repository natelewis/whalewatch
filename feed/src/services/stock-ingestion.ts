import { db } from '../db/connection';
import { AlpacaClient } from './alpaca-client';
import { AlpacaBar } from '../types/alpaca';
import { config } from '../config';
import { getMaxDate, QuestDBServiceInterface } from '@whalewatch/shared';

export class StockIngestionService {
  private alpacaClient: AlpacaClient;
  private isIngesting = false;
  private pollingInterval: NodeJS.Timeout | null = null;
  private questdbAdapter: QuestDBServiceInterface;

  constructor() {
    this.alpacaClient = new AlpacaClient();
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

  private startPolling(): void {
    console.log(`Starting polling for real-time data every 10 seconds for ${config.tickers.length} tickers`);

    // Poll immediately first
    this.pollLatestData();

    // Then poll every 10 seconds
    this.pollingInterval = setInterval(() => {
      this.pollLatestData();
    }, 10000);
  }

  private stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
      console.log('Stopped polling for real-time data');
    }
  }

  async startIngestion(): Promise<void> {
    try {
      console.log('Starting data ingestion...');

      // Connect to database
      await db.connect();

      // Catch up on missing data before starting real-time
      await this.catchUpData();

      // Start polling for real-time data
      this.startPolling();

      this.isIngesting = true;
      console.log('Data ingestion started successfully');
    } catch (error) {
      console.error('Failed to start ingestion:', error);
      throw error;
    }
  }

  async stopIngestion(): Promise<void> {
    console.log('Stopping data ingestion...');
    this.isIngesting = false;
    this.stopPolling();
    await db.disconnect();
    console.log('Data ingestion stopped');
  }

  private async catchUpData(): Promise<void> {
    console.log('Catching up on missing data...');

    for (const ticker of config.tickers) {
      try {
        await this.catchUpTickerData(ticker);
      } catch (error) {
        console.error(`Error catching up data for ${ticker}:`, error);
      }
    }

    console.log('Catch-up completed');
  }

  private async catchUpTickerData(ticker: string): Promise<void> {
    const now = new Date();

    // Get the newest timestamp from existing data
    const lastSync = await getMaxDate(this.questdbAdapter, {
      ticker,
      tickerField: 'symbol',
      dateField: 'timestamp',
      table: 'stock_trades',
    });

    let startDate: Date;
    if (!lastSync) {
      // Start from 7 days ago to avoid fetching too much historical data
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      console.log(`No previous data found for ${ticker}, starting from ${startDate.toISOString()}`);
    } else {
      startDate = lastSync;
      console.log(`Catching up ${ticker} from ${startDate.toISOString()} to ${now.toISOString()}`);
    }

    console.log(`Catch-up completed for ${ticker}`);
  }

  private async pollLatestData(): Promise<void> {
    if (!this.isIngesting) {
      return;
    }

    try {
      for (const ticker of config.tickers) {
        try {
          // Get the latest bar for this ticker
          const latestBar = await this.alpacaClient.getLatestStockBar(ticker);

          if (latestBar) {
            console.log(`✓ Latest data for ${ticker}: $${latestBar.c} at ${latestBar.t}`);
          }
        } catch (error) {
          console.error(`Error polling latest data for ${ticker}:`, error);
        }
      }
    } catch (error) {
      console.error('Error during polling:', error);
    }
  }

  /**
   * Public method to fetch historical bars for a ticker within a date range
   * Used by backfill service and other components that need historical data
   */
  async getHistoricalStockBars(
    ticker: string,
    startDate: Date,
    endDate: Date,
    timeframe: '1Min' | '5Min' | '15Min' | '1Hour' | '1Day' = '1Min'
  ): Promise<AlpacaBar[]> {
    return this.alpacaClient.getHistoricalStockBars(ticker, startDate, endDate, timeframe);
  }
}
