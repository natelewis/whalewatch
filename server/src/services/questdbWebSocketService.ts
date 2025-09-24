import { EventEmitter } from 'events';
import { questdbService } from './questdbService';
import { QuestDBWebSocketMessage, QuestDBSubscription } from '../types/questdb';

export class QuestDBWebSocketService extends EventEmitter {
  private isStreaming: boolean = false;
  private streamingInterval: ReturnType<typeof setInterval> | null = null;
  private subscriptions: Map<string, QuestDBSubscription> = new Map();
  private lastTimestamps: Map<string, string> = new Map();
  private streamingIntervalMs: number = 10000; // Poll every 10 seconds for stock aggregates

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
      let newTimestamp: string | undefined = now; // Default to current time

      switch (subscription.type) {
        case 'stock_trades':
          await this.pollStockTrades(subscription, lastTimestamp, now);
          break;
        case 'option_trades':
          await this.pollOptionTrades(subscription, lastTimestamp, now);
          break;
        case 'option_quotes':
          await this.pollOptionQuotes(subscription, lastTimestamp, now);
          break;
        case 'stock_aggregates':
          newTimestamp = await this.pollStockAggregates(subscription, lastTimestamp);
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
  }

  /**
   * Poll for new option trades
   */
  private async pollOptionTrades(
    subscription: QuestDBSubscription,
    lastTimestamp: string | undefined,
    currentTimestamp: string
  ): Promise<void> {
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
  }

  /**
   * Poll for new option quotes
   */
  private async pollOptionQuotes(
    subscription: QuestDBSubscription,
    lastTimestamp: string | undefined,
    currentTimestamp: string
  ): Promise<void> {
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
  }

  /**
   * Poll for new stock aggregates
   */
  private async pollStockAggregates(
    subscription: QuestDBSubscription,
    lastTimestamp: string | undefined
  ): Promise<string | undefined> {
    if (!subscription.symbol) {
      console.log('⚠️ No symbol provided for stock aggregates subscription');
      return;
    }

    // console.log(`🔍 Polling latest stock aggregate for ${subscription.symbol}`);

    // Get the latest record for this symbol
    const aggregates = await questdbService.getStockAggregates(subscription.symbol, {
      limit: 1,
      order_by: 'timestamp',
      order_direction: 'DESC', // Get the most recent record
    });

    if (aggregates.length === 0) {
      console.log(`📊 No stock aggregates found for ${subscription.symbol}`);
      return lastTimestamp; // Return the same timestamp since we didn't process anything
    }

    const latestAggregate = aggregates[0];
    // console.log(`📊 Latest stock aggregate for ${subscription.symbol}:`, {
    //   timestamp: latestAggregate.timestamp,
    //   close: latestAggregate.close,
    //   volume: latestAggregate.volume,
    // });

    // Check if this is a new record we haven't processed yet
    if (lastTimestamp && new Date(latestAggregate.timestamp) <= new Date(lastTimestamp)) {
      // console.log(
      //   `📊 No new data for ${subscription.symbol} (latest: ${latestAggregate.timestamp}, last processed: ${lastTimestamp})`
      // );
      return lastTimestamp; // Return the same timestamp since we didn't process anything
    }

    // This is new data, emit it
    const message: QuestDBWebSocketMessage = {
      type: 'stock_aggregate',
      data: latestAggregate,
      timestamp: new Date().toISOString(),
      symbol: latestAggregate.symbol,
    };

    this.emit('stock_aggregate', message);

    // Return the timestamp of the data we just processed
    return latestAggregate.timestamp;
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
