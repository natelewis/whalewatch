import { EventEmitter } from 'events';
import { questdbService } from './questdbService';
import { alpacaService } from './alpacaService';
import { QuestDBWebSocketMessage, QuestDBSubscription } from '../types/index';

export class QuestDBWebSocketService extends EventEmitter {
  private isStreaming: boolean = false;
  private streamingInterval: ReturnType<typeof setInterval> | null = null;
  private subscriptions: Map<string, QuestDBSubscription> = new Map();
  private lastTimestamps: Map<string, string> = new Map();
  private streamingIntervalMs: number = 5000; // Poll every 5 seconds for stock aggregates

  constructor() {
    super();
  }

  /**
   * Start streaming data for all active subscriptions
   */
  async startStreaming(): Promise<void> {
    if (this.isStreaming) {
      console.log('QuestDB streaming already active');
      return;
    }

    console.log('Starting QuestDB data streaming...');
    this.isStreaming = true;

    // Start polling for new data
    this.streamingInterval = setInterval(async () => {
      try {
        await this.pollForNewData();
      } catch (error) {
        console.error('Error polling QuestDB for new data:', error);
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

    console.log('Stopping QuestDB data streaming...');
    this.isStreaming = false;

    if (this.streamingInterval) {
      clearInterval(this.streamingInterval);
      this.streamingInterval = null;
    }

    this.emit('disconnected');
  }

  /**
   * Subscribe to real-time data
   */
  subscribe(subscription: QuestDBSubscription): void {
    const key = this.getSubscriptionKey(subscription);
    this.subscriptions.set(key, subscription);

    console.log(`✅ Subscribed to QuestDB data:`, {
      key,
      type: subscription.type,
      symbol: subscription.symbol,
      underlying_ticker: subscription.underlying_ticker,
      totalSubscriptions: this.subscriptions.size,
    });
    this.emit('subscription_confirmed', { subscription });
  }

  /**
   * Unsubscribe from real-time data
   */
  unsubscribe(subscription: QuestDBSubscription): void {
    const key = this.getSubscriptionKey(subscription);
    this.subscriptions.delete(key);
    this.lastTimestamps.delete(key);

    console.log(`Unsubscribed from QuestDB data:`, subscription);
    this.emit('unsubscription_confirmed', { subscription });
  }

  /**
   * Get all active subscriptions
   */
  getSubscriptions(): QuestDBSubscription[] {
    return Array.from(this.subscriptions.values());
  }

  /**
   * Poll QuestDB for new data based on active subscriptions
   */
  private async pollForNewData(): Promise<void> {
    if (this.subscriptions.size === 0) {
      console.log('🔍 No active subscriptions to poll');
      return;
    }

    console.log(
      `🔍 Polling ${this.subscriptions.size} active subscriptions:`,
      Array.from(this.subscriptions.values()).map(sub => sub.symbol)
    );

    for (const [key, subscription] of this.subscriptions) {
      try {
        await this.pollSubscriptionData(key, subscription);
      } catch (error) {
        console.error(`Error polling subscription ${key}:`, error);
      }
    }
  }

  /**
   * Poll data for a specific subscription
   */
  private async pollSubscriptionData(key: string, subscription: QuestDBSubscription): Promise<void> {
    const lastTimestamp = this.lastTimestamps.get(key);
    const now = new Date().toISOString();

    try {
      const newTimestamp: string | undefined = now; // Default to current time

      switch (subscription.type) {
        case 'option_trades':
          await this.pollOptionTrades(subscription, lastTimestamp, now);
          break;
        default:
          console.warn(`Unknown subscription type: ${subscription.type}`);
      }

      // Update last timestamp with the actual timestamp of processed data (or current time if no data processed)
      this.lastTimestamps.set(key, newTimestamp || now);
    } catch (error) {
      console.error(`Error polling ${subscription.type} data:`, error);
    }
  }

  /**
   * Poll for new stock trades
   */
  private async pollStockTrades(
    subscription: QuestDBSubscription,
    lastTimestamp: string | undefined,
    currentTimestamp: string
  ): Promise<void> {
    if (!subscription.symbol) {
      return;
    }

    try {
      const trades = await questdbService.getStockTrades(subscription.symbol, {
        start_time: lastTimestamp || undefined,
        end_time: currentTimestamp,
        limit: 1000,
      });

      for (const trade of trades) {
        // Apply filters if specified
        if (subscription.filters) {
          if (subscription.filters.min_price && trade.price < subscription.filters.min_price) {
            continue;
          }
          if (subscription.filters.max_price && trade.price > subscription.filters.max_price) {
            continue;
          }
          if (subscription.filters.min_size && trade.size < subscription.filters.min_size) {
            continue;
          }
          if (subscription.filters.max_size && trade.size > subscription.filters.max_size) {
            continue;
          }
        }

        const message: QuestDBWebSocketMessage = {
          type: 'stock_trade',
          data: trade,
          timestamp: new Date().toISOString(),
          symbol: trade.symbol,
        };

        this.emit('stock_trade', message);
      }
    } catch (error) {
      console.error(`Error polling stock_trades data:`, error);
      // Re-throw the error to be handled by the calling method
      throw error;
    }
  }

  /**
   * Poll for new option trades
   */
  private async pollOptionTrades(
    subscription: QuestDBSubscription,
    lastTimestamp: string | undefined,
    currentTimestamp: string
  ): Promise<void> {
    try {
      const trades = await questdbService.getOptionTrades(
        subscription.ticker || undefined,
        subscription.underlying_ticker || undefined,
        {
          start_time: lastTimestamp || undefined,
          end_time: currentTimestamp,
          limit: 1000,
        }
      );

      for (const trade of trades) {
        // Apply filters if specified
        if (subscription.filters) {
          if (subscription.filters.min_price && trade.price < subscription.filters.min_price) {
            continue;
          }
          if (subscription.filters.max_price && trade.price > subscription.filters.max_price) {
            continue;
          }
          if (subscription.filters.min_size && trade.size < subscription.filters.min_size) {
            continue;
          }
          if (subscription.filters.max_size && trade.size > subscription.filters.max_size) {
            continue;
          }
        }

        const message: QuestDBWebSocketMessage = {
          type: 'option_trade',
          data: trade,
          timestamp: new Date().toISOString(),
          symbol: trade.ticker,
          underlying_ticker: trade.underlying_ticker,
        };

        this.emit('option_trade', message);
      }
    } catch (error) {
      console.error(`Error polling option_trades data:`, error);
      // Re-throw the error to be handled by the calling method
      throw error;
    }
  }

  /**
   * Poll for new option quotes
   */
  private async pollOptionQuotes(
    subscription: QuestDBSubscription,
    lastTimestamp: string | undefined,
    currentTimestamp: string
  ): Promise<void> {
    try {
      const quotes = await questdbService.getOptionQuotes(
        subscription.ticker || undefined,
        subscription.underlying_ticker || undefined,
        {
          start_time: lastTimestamp || undefined,
          end_time: currentTimestamp,
          limit: 1000,
        }
      );

      for (const quote of quotes) {
        const message: QuestDBWebSocketMessage = {
          type: 'option_quote',
          data: quote,
          timestamp: new Date().toISOString(),
          symbol: quote.ticker,
          underlying_ticker: quote.underlying_ticker,
        };

        this.emit('option_quote', message);
      }
    } catch (error) {
      console.error(`Error polling option_quotes data:`, error);
      // Re-throw the error to be handled by the calling method
      throw error;
    }
  }

  /**
   * Poll for new stock aggregates (bars) from Alpaca
   * This replaces QuestDB polling with direct Alpaca API calls for real-time chart data
   */
  private async pollStockAggregates(
    subscription: QuestDBSubscription,
    lastTimestamp: string | undefined
  ): Promise<void> {
    if (!subscription.symbol) {
      return;
    }

    try {
      // Get the latest bar from Alpaca (most recent 1-minute bar)
      const bars = await alpacaService.getBars(subscription.symbol, '1m', 1);

      if (bars && bars.length > 0) {
        const latestBar = bars[0];

        // Check if this is a new bar (not the same as last processed)
        const barTimestamp = latestBar.t;
        const lastProcessedTimestamp = lastTimestamp;

        // Only emit if this is a new bar or if we don't have a last timestamp
        if (!lastProcessedTimestamp || barTimestamp !== lastProcessedTimestamp) {
          console.log(`📊 New stock aggregate for ${subscription.symbol}:`, {
            timestamp: barTimestamp,
            open: latestBar.o,
            high: latestBar.h,
            low: latestBar.l,
            close: latestBar.c,
            volume: latestBar.v,
          });

          const message: QuestDBWebSocketMessage = {
            type: 'stock_aggregate',
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
            symbol: latestBar.symbol || subscription.symbol,
          };

          this.emit('stock_aggregate', message);
        }
      }
    } catch (error) {
      console.error(`Error polling stock_aggregates data for ${subscription.symbol}:`, error);
      // Don't re-throw to avoid breaking other subscriptions
    }
  }

  /**
   * Generate a unique key for a subscription
   */
  private getSubscriptionKey(subscription: QuestDBSubscription): string {
    const parts = [
      subscription.type,
      subscription.symbol || '',
      subscription.underlying_ticker || '',
      subscription.ticker || '',
    ];
    return parts.join('|');
  }

  /**
   * Set the polling interval
   */
  setPollingInterval(intervalMs: number): void {
    this.streamingIntervalMs = Math.max(100, intervalMs); // Minimum 100ms
    console.log(`QuestDB polling interval set to ${this.streamingIntervalMs}ms`);
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

export const questdbWebSocketService = new QuestDBWebSocketService();
