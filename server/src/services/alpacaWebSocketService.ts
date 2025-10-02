import { EventEmitter } from 'events';
import { alpacaService } from './alpacaService';
import { polygonService } from './polygonService';
import { AlpacaBar } from '../types';
import { isValidOptionTicker } from '@whalewatch/shared';

export interface AlpacaSubscription {
  type: 'chart_quote';
  symbol: string;
}

export interface AlpacaWebSocketMessage {
  type: 'chart_quote';
  data: AlpacaBar;
  timestamp: string;
  symbol: string;
}

export class AlpacaWebSocketService extends EventEmitter {
  private isStreaming: boolean = false;
  private streamingInterval: ReturnType<typeof setInterval> | null = null;
  private subscriptions: Map<string, AlpacaSubscription> = new Map();
  private lastTimestamps: Map<string, string> = new Map();
  private streamingIntervalMs: number = 5000; // Poll every 5 seconds for chart data

  constructor() {
    super();
  }

  /**
   * Start streaming data for all active subscriptions
   */
  async startStreaming(): Promise<void> {
    if (this.isStreaming) {
      console.log('Alpaca streaming already active');
      return;
    }

    console.log('Starting Alpaca chart data streaming...');
    this.isStreaming = true;

    // Start polling for new data
    this.streamingInterval = setInterval(async () => {
      try {
        await this.pollForNewData();
      } catch (error) {
        console.error('Error polling Alpaca for new chart data:', error);
        this.emit('error', error);
      }
    }, this.streamingIntervalMs);

    this.emit('connected');
  }

  /**
   * Stop streaming data
   */
  stopStreaming(): void {
    if (!this.isStreaming) {
      return;
    }

    console.log('Stopping Alpaca chart data streaming...');
    this.isStreaming = false;

    if (this.streamingInterval) {
      clearInterval(this.streamingInterval);
      this.streamingInterval = null;
    }

    this.emit('disconnected');
  }

  /**
   * Subscribe to real-time chart data
   */
  subscribe(subscription: AlpacaSubscription): void {
    const key = this.getSubscriptionKey(subscription);
    this.subscriptions.set(key, subscription);

    console.log(`✅ Subscribed to Alpaca chart data:`, {
      key,
      symbol: subscription.symbol,
      totalSubscriptions: this.subscriptions.size,
    });
    this.emit('subscription_confirmed', { subscription });
  }

  /**
   * Unsubscribe from real-time chart data
   */
  unsubscribe(subscription: AlpacaSubscription): void {
    const key = this.getSubscriptionKey(subscription);
    this.subscriptions.delete(key);
    this.lastTimestamps.delete(key);

    console.log(`Unsubscribed from Alpaca chart data:`, subscription);
    this.emit('unsubscription_confirmed', { subscription });
  }

  /**
   * Get all active subscriptions
   */
  getSubscriptions(): AlpacaSubscription[] {
    return Array.from(this.subscriptions.values());
  }

  /**
   * Poll Alpaca for new chart data based on active subscriptions
   */
  private async pollForNewData(): Promise<void> {
    if (this.subscriptions.size === 0) {
      console.log('🔍 No active chart subscriptions to poll');
      return;
    }

    console.log(
      `🔍 [ALPACA] Polling ${this.subscriptions.size} active chart subscriptions:`,
      Array.from(this.subscriptions.values()).map(sub => sub.symbol)
    );

    for (const [key, subscription] of Array.from(this.subscriptions.entries())) {
      try {
        await this.pollSubscriptionData(key, subscription);
      } catch (error) {
        console.error(`Error polling chart subscription ${key}:`, error);
      }
    }
  }

  /**
   * Poll chart data for a specific subscription
   * Handles both stocks (Alpaca) and options (Polygon)
   */
  private async pollSubscriptionData(key: string, subscription: AlpacaSubscription): Promise<void> {
    const lastTimestamp = this.lastTimestamps.get(key);

    try {
      // Determine if this is an option contract or stock symbol
      const isOptionContract = isValidOptionTicker(subscription.symbol);

      let latestBar: AlpacaBar | null = null;
      let dataSource: string;

      if (isOptionContract) {
        // Get the latest bar from Polygon for options
        latestBar = await polygonService.getLatestOptionBar(subscription.symbol);
        dataSource = 'POLYGON';
      } else {
        // Get the latest bar from Alpaca for stocks
        latestBar = await alpacaService.getLatestStockBar(subscription.symbol);
        dataSource = 'ALPACA';
      }

      if (latestBar) {
        // Check if this is a new bar (not the same as last processed)
        const barTimestamp = latestBar.t;
        const lastProcessedTimestamp = lastTimestamp;

        // Only emit if this is a new bar or if we don't have a last timestamp
        if (!lastProcessedTimestamp || barTimestamp !== lastProcessedTimestamp) {
          console.log(`📊 [${dataSource}] NEW BAR for ${subscription.symbol}:`, {
            timestamp: barTimestamp,
            open: latestBar.o,
            high: latestBar.h,
            low: latestBar.l,
            close: latestBar.c,
            volume: latestBar.v,
            change: lastProcessedTimestamp ? 'UPDATED' : 'FIRST_BAR',
            dataSource,
          });

          const message: AlpacaWebSocketMessage = {
            type: 'chart_quote',
            data: {
              t: latestBar.t,
              o: latestBar.o,
              h: latestBar.h,
              l: latestBar.l,
              c: latestBar.c,
              v: latestBar.v,
              n: latestBar.n || 0,
              vw: latestBar.vw || latestBar.c,
            },
            timestamp: new Date().toISOString(),
            symbol: subscription.symbol,
          };

          this.emit('chart_quote', message);

          // Update last timestamp
          this.lastTimestamps.set(key, barTimestamp);
        } else {
          console.log(`⏸️ [${dataSource}] No change for ${subscription.symbol} (same timestamp: ${barTimestamp})`);
        }
      } else {
        console.log(`⚠️ [${dataSource}] No data available for ${subscription.symbol}`);
      }
    } catch (error) {
      console.error(`Error polling chart data for ${subscription.symbol}:`, error);
      // Don't re-throw to avoid breaking other subscriptions
    }
  }

  /**
   * Generate a unique key for a subscription
   */
  private getSubscriptionKey(subscription: AlpacaSubscription): string {
    return `${subscription.type}:${subscription.symbol}`;
  }

  /**
   * Set the polling interval
   */
  setPollingInterval(intervalMs: number): void {
    this.streamingIntervalMs = Math.max(1000, intervalMs); // Minimum 1 second
    console.log(`Alpaca polling interval set to ${this.streamingIntervalMs}ms`);
  }

  /**
   * Get current streaming status
   */
  getStatus(): {
    isStreaming: boolean;
    subscriptionCount: number;
    pollingIntervalMs: number;
  } {
    return {
      isStreaming: this.isStreaming,
      subscriptionCount: this.subscriptions.size,
      pollingIntervalMs: this.streamingIntervalMs,
    };
  }
}

export const alpacaWebSocketService = new AlpacaWebSocketService();
