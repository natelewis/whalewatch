import { db } from '../db/connection';
import { AlpacaClient } from './alpaca-client';
import { OptionIngestionService } from './option-ingestion';
import { UpsertService } from '../utils/upsert';
import { StockAggregate, SyncState } from '../types/database';
import { PolygonAggregate } from '../types/polygon';
import { config } from '../config';

export class StockIngestionService {
  private alpacaClient: AlpacaClient;
  private optionIngestionService: OptionIngestionService;
  private isIngesting = false;
  private syncStates = new Map<string, SyncState>();
  private pollingInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.alpacaClient = new AlpacaClient();
    this.optionIngestionService = new OptionIngestionService();
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

      // Initialize sync states
      await this.initializeSyncStates();

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

  private async initializeSyncStates(): Promise<void> {
    try {
      // Get current sync states from database
      const result = await db.query(
        `
        SELECT ticker, last_aggregate_timestamp, last_sync, is_streaming
        FROM sync_state
        WHERE ticker IN (${config.tickers.map((_, index) => `$${index + 1}`).join(',')})
      `,
        config.tickers
      );

      // Handle QuestDB result format
      const questResult = result as {
        dataset: unknown[][];
      };

      const rows = questResult.dataset || [];

      for (const row of rows) {
        const ticker = row[0] as string;
        // eslint-disable-next-line camelcase
        const last_aggregate_timestamp = row[1] ? new Date(row[1] as string) : null;
        // eslint-disable-next-line camelcase
        const last_sync = new Date(row[2] as string);
        // eslint-disable-next-line camelcase
        const is_streaming = Boolean(row[3]);

        this.syncStates.set(ticker, {
          ticker,
          // eslint-disable-next-line camelcase
          last_aggregate_timestamp: last_aggregate_timestamp ?? undefined,
          last_sync,
          is_streaming,
        });
      }

      // Initialize missing tickers
      for (const ticker of config.tickers) {
        if (!this.syncStates.has(ticker)) {
          this.syncStates.set(ticker, {
            ticker,
            last_aggregate_timestamp: undefined,
            last_sync: new Date(),
            is_streaming: false,
          });
        }
      }

      console.log(`Initialized sync states for ${this.syncStates.size} tickers`);
    } catch (error) {
      console.error('Error initializing sync states:', error);
      throw error;
    }
  }

  private async catchUpData(): Promise<void> {
    console.log('Catching up on missing data...');

    for (const ticker of config.tickers) {
      try {
        await this.catchUpTickerData(ticker);

        // Also catch up option contracts for this ticker
        try {
          await this.optionIngestionService.catchUpOptionContracts(ticker);
        } catch (error) {
          console.error(`Error catching up option contracts for ${ticker}:`, error);
        }
      } catch (error) {
        console.error(`Error catching up data for ${ticker}:`, error);
      }
    }

    console.log('Catch-up completed');
  }

  private async catchUpTickerData(ticker: string): Promise<void> {
    const syncState = this.syncStates.get(ticker);
    if (!syncState) {
      return;
    }

    const now = new Date();

    // If last_aggregate_timestamp is null or epoch (1970), use a reasonable start date
    let lastSync: Date;
    if (!syncState.last_aggregate_timestamp || syncState.last_aggregate_timestamp.getTime() === 0) {
      // Start from 7 days ago to avoid fetching too much historical data
      lastSync = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      console.log(`No previous sync found for ${ticker}, starting from ${lastSync.toISOString()}`);
    } else {
      lastSync = syncState.last_aggregate_timestamp;
      console.log(`Catching up ${ticker} from ${lastSync.toISOString()} to ${now.toISOString()}`);
    }

    // Get missing aggregates using Alpaca
    const bars = await this.alpacaClient.getHistoricalBars(ticker, lastSync, now, '1Min');

    if (bars.length > 0) {
      console.log(`Found ${bars.length} bars for ${ticker} catch-up`);

      // Convert Alpaca bars to the format expected by insertAggregates
      const aggregates = bars.map(bar => ({
        t: new Date(bar.t).getTime(), // Convert ISO string to milliseconds
        o: bar.o,
        h: bar.h,
        l: bar.l,
        c: bar.c,
        v: bar.v,
        vw: bar.vw,
        n: bar.n,
      }));

      await this.insertAggregates(ticker, aggregates);

      // Update the last aggregate timestamp to the most recent bar
      const lastBarTimestamp = new Date(bars[bars.length - 1].t);
      syncState.last_aggregate_timestamp = lastBarTimestamp;
      console.log(`Updated ${ticker} last_aggregate_timestamp to ${lastBarTimestamp.toISOString()}`);
    } else {
      console.log(`No new bars found for ${ticker} catch-up`);
    }

    // Update sync state
    syncState.last_sync = now;
    syncState.is_streaming = true;
    await this.updateSyncState(syncState);
    console.log(`Updated sync state for ${ticker}`);
  }

  private async pollLatestData(): Promise<void> {
    if (!this.isIngesting) {
      return;
    }

    try {
      for (const ticker of config.tickers) {
        try {
          // Get the latest bar for this ticker
          const latestBar = await this.alpacaClient.getLatestBar(ticker);

          if (latestBar) {
            const stockAggregate: StockAggregate = {
              symbol: ticker,
              timestamp: new Date(latestBar.t), // Convert ISO string to Date
              open: latestBar.o,
              high: latestBar.h,
              low: latestBar.l,
              close: latestBar.c,
              volume: latestBar.v,
              vwap: latestBar.vw,
              transaction_count: latestBar.n,
            };

            await UpsertService.upsertStockAggregate(stockAggregate);
            console.log(
              `✓ Latest data for ${ticker}: $${stockAggregate.close} at ${stockAggregate.timestamp.toISOString()}`
            );
          }
        } catch (error) {
          console.error(`Error polling latest data for ${ticker}:`, error);
        }
      }
    } catch (error) {
      console.error('Error during polling:', error);
    }
  }

  private async insertAggregates(ticker: string, aggregates: PolygonAggregate[]): Promise<void> {
    const stockAggregates: StockAggregate[] = aggregates.map(aggregate => ({
      symbol: ticker,
      timestamp: new Date(aggregate.t), // aggregate.t is already converted to milliseconds in catchUpTickerData
      open: aggregate.o,
      high: aggregate.h,
      low: aggregate.l,
      close: aggregate.c,
      volume: aggregate.v,
      vwap: aggregate.vw,
      transaction_count: aggregate.n,
    }));

    await UpsertService.batchUpsertStockAggregates(stockAggregates);
  }

  private async updateSyncState(syncState: SyncState): Promise<void> {
    await UpsertService.upsertSyncState(syncState);
  }
}
