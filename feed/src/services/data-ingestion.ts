import { db } from '../db/connection';
import { PolygonClient } from './polygon-client';
import { AlpacaClient } from './alpaca-client';
import { AlpacaWebSocketClient } from './alpaca-websocket-client';
import { UpsertService } from '../utils/upsert';
import { StockAggregate, SyncState } from '../types/database';
import { PolygonAggregate } from '../types/polygon';
import { AlpacaQuote, AlpacaBar } from '../types/alpaca';
import { config } from '../config';

export class DataIngestionService {
  private alpacaClient: AlpacaClient;
  private wsClient: AlpacaWebSocketClient;
  private isIngesting = false;
  private syncStates = new Map<string, SyncState>();

  constructor() {
    this.alpacaClient = new AlpacaClient();
    this.wsClient = new AlpacaWebSocketClient();
    this.setupWebSocketHandlers();
  }

  private setupWebSocketHandlers(): void {
    this.wsClient.setEventHandlers({
      onQuote: (quote: unknown, symbol: string) => this.handleAlpacaQuote(quote as AlpacaQuote, symbol),
      onBar: (bar: unknown, symbol: string) => this.handleAlpacaBar(bar as AlpacaBar, symbol),
      onError: (error: Error) => {
        console.error('WebSocket error:', error);
        this.handleIngestionError(error);
      },
      onConnect: () => {
        console.log('WebSocket connected, starting data ingestion');
        this.startStreaming();
      },
      onDisconnect: () => {
        console.log('WebSocket disconnected, stopping data ingestion');
        this.isIngesting = false;
      },
    });
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

      // Connect to WebSocket
      await this.wsClient.connect();

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
    await this.wsClient.disconnect();
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
        const last_aggregate_timestamp = row[1] ? new Date(row[1] as string) : null;
        const last_sync = new Date(row[2] as string);
        const is_streaming = Boolean(row[3]);

        this.syncStates.set(ticker, {
          ticker,
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
      } catch (error) {
        console.error(`Error catching up data for ${ticker}:`, error);
      }
    }

    console.log('Catch-up completed');
  }

  private async catchUpTickerData(ticker: string): Promise<void> {
    const syncState = this.syncStates.get(ticker);
    if (!syncState) return;

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

  private startStreaming(): void {
    // Subscribe to quotes and bars for all tickers
    this.wsClient.subscribeToQuotes(config.tickers);
    this.wsClient.subscribeToBars(config.tickers);

    console.log(`Subscribed to real-time data for ${config.tickers.length} tickers`);
  }

  private async handleAlpacaQuote(quote: AlpacaQuote, symbol: string): Promise<void> {
    if (!this.isIngesting) return;

    try {
      // Alpaca quotes don't directly map to our database schema
      // We could store them in a separate quotes table if needed
      console.log(`Received quote for ${symbol}: bid=${quote.bp}, ask=${quote.ap}`);
    } catch (error) {
      console.error(`Error handling quote for ${symbol}:`, error);
    }
  }

  private async handleAlpacaBar(bar: AlpacaBar, symbol: string): Promise<void> {
    if (!this.isIngesting) return;

    try {
      const stockAggregate: StockAggregate = {
        symbol: symbol,
        timestamp: new Date(bar.t), // Convert ISO string to Date
        open: bar.o,
        high: bar.h,
        low: bar.l,
        close: bar.c,
        volume: bar.v,
        vwap: bar.vw,
        transaction_count: bar.n,
      };

      await UpsertService.upsertStockAggregate(stockAggregate);
    } catch (error) {
      console.error(`Error handling bar for ${symbol}:`, error);
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

  private handleIngestionError(error: Error): void {
    console.error('Ingestion error:', error);
    // Implement retry logic or error recovery here
  }
}
