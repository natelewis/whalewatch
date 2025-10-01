import WebSocket from 'ws';
import { config } from '../config';
import { InsertIfNotExistsService } from '../utils/insert-if-not-exists';
import { OptionTrade } from '../types/database';

interface WebSocketMessage {
  ev: string;
  sym?: string;
  p?: number;
  s?: number;
  c?: number[];
  t?: number;
  x?: number;
  status?: string;
  message?: string;
}

interface HealthStatus {
  websocketConnected: boolean;
  lastMessageReceived: Date | null;
  lastFlushCompleted: Date | null;
  bufferSize: number;
  totalTradesProcessed: number;
  totalErrors: number;
  uptime: number;
  reconnectAttempts: number;
}

export class WebSocketService {
  private ws: WebSocket | null = null;
  private tradeBuffer: OptionTrade[] = [];
  private flushInterval: NodeJS.Timeout | null = null;

  // Resilience and monitoring properties
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30000;
  private isConnecting = false;
  private startTime = Date.now();
  private lastMessageReceived: Date | null = null;
  private lastFlushCompleted: Date | null = null;
  private totalTradesProcessed = 0;
  private totalErrors = 0;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private url: string = '';

  connect(url: string): void {
    if (this.isConnecting) {
      console.log('WebSocket connection already in progress, skipping...');
      return;
    }

    this.isConnecting = true;
    this.url = url;
    console.log(`Connecting to WebSocket: ${url}`);

    this.ws = new WebSocket(url);

    this.ws.on('open', () => {
      console.log('WebSocket connection established.');
      this.isConnecting = false;
      this.reconnectAttempts = 0;
      this.reconnectDelay = 1000; // Reset delay on successful connection
      this.authenticate();
      this.startHealthMonitoring();
    });

    this.ws.on('message', (data: WebSocket.Data) => {
      this.lastMessageReceived = new Date();
      try {
        const messages = JSON.parse(data.toString()) as WebSocketMessage[];
        for (const msg of messages) {
          this.handleMessage(msg);
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
        this.totalErrors++;
      }
    });

    this.ws.on('close', (code: number, reason: Buffer) => {
      console.log(`WebSocket connection closed. Code: ${code}, Reason: ${reason.toString()}`);
      this.isConnecting = false;
      this.stopHealthMonitoring();

      // Only attempt reconnection if it wasn't a manual close
      if (code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
        this.handleReconnect();
      } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        console.error('Max reconnection attempts reached. WebSocket service stopped.');
      }
    });

    this.ws.on('error', (error: Error) => {
      console.error('WebSocket error:', error);
      this.totalErrors++;
      this.isConnecting = false;
    });

    this.flushInterval = setInterval(() => this.flushTrades(), 5000);
  }

  private authenticate(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ action: 'auth', params: config.polygon.apiKey }));
    }
  }

  private handleReconnect(): void {
    this.reconnectAttempts++;
    const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), this.maxReconnectDelay);

    console.log(
      `Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`
    );

    setTimeout(() => {
      if (this.reconnectAttempts <= this.maxReconnectAttempts) {
        this.connect(this.url);
      }
    }, delay);
  }

  private startHealthMonitoring(): void {
    // Health check every 30 seconds
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, 30000);

    // Heartbeat every 5 minutes to keep connection alive
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, 300000);
  }

  private stopHealthMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private performHealthCheck(): void {
    const now = new Date();
    const healthStatus = this.getHealthStatus();

    // Check if we haven't received messages in the last 2 minutes
    if (this.lastMessageReceived && now.getTime() - this.lastMessageReceived.getTime() > 120000) {
      console.warn('No messages received in the last 2 minutes. Connection may be stale.');
    }

    // Check if buffer is getting too large
    if (this.tradeBuffer.length > 1000) {
      console.warn(`Trade buffer is large: ${this.tradeBuffer.length} items. Consider increasing flush frequency.`);
    }

    // Log health status every 5 minutes
    if (Math.floor(healthStatus.uptime / 300000) % 1 === 0) {
      console.log('Health Status:', JSON.stringify(healthStatus, null, 2));
    }
  }

  private sendHeartbeat(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      // Send a ping to keep the connection alive
      this.ws.ping();
      console.log('Sent heartbeat ping to WebSocket');
    }
  }

  public getHealthStatus(): HealthStatus {
    return {
      websocketConnected: this.ws?.readyState === WebSocket.OPEN,
      lastMessageReceived: this.lastMessageReceived,
      lastFlushCompleted: this.lastFlushCompleted,
      bufferSize: this.tradeBuffer.length,
      totalTradesProcessed: this.totalTradesProcessed,
      totalErrors: this.totalErrors,
      uptime: Date.now() - this.startTime,
      reconnectAttempts: this.reconnectAttempts,
    };
  }

  subscribe(): void {
    // we need to wait for the websocket to be open before subscribing
    while (this.ws?.readyState !== WebSocket.OPEN) {
      console.log('WebSocket not open, waiting to subscribe');
      setTimeout(() => this.subscribe(), 1000);
      return;
    }
    console.log(this.ws?.readyState, 'Subscribing to all option trades (T.*)');
    if (this.ws?.readyState === WebSocket.OPEN) {
      // Subscribe to all option trades using T.* pattern
      console.log('Subscribing to all option trades: T.*');
      this.ws.send(JSON.stringify({ action: 'subscribe', params: 'T.*' }));
    }
  }

  private handleMessage(msg: WebSocketMessage): void {
    switch (msg.ev) {
      case 'status':
        console.log(`WebSocket status: ${msg.status} - ${msg.message}`);
        break;
      case 'T':
        if (msg.sym && msg.p && msg.s && msg.t) {
          this.processTrade(msg as Required<Pick<WebSocketMessage, 'sym' | 'p' | 's' | 'c' | 't' | 'x'>>);
        }
        break;
      default:
        break;
    }
  }

  private processTrade(trade: Required<Pick<WebSocketMessage, 'sym' | 'x' | 'p' | 's' | 'c' | 't'>>): void {
    try {
      const tradeValue = trade.p * 100 * trade.s;
      if (tradeValue < config.polygon.optionTradeValueThreshold) {
        // console.log(`Trade value is less than threshold, skipping: ${tradeValue}`);
        return;
      }

      console.log(
        `[Real-Time Trade] ${trade.sym} | Price: ${trade.p} | Size: ${trade.s} | Value: $${tradeValue.toFixed(2)}`
      );

      const underlyingTickerMatch = trade.sym.match(/^O:([A-Z]+)/);
      if (!underlyingTickerMatch) {
        return;
      }

      const underlyingTicker = underlyingTickerMatch[1];

      const optionTrade: OptionTrade = {
        ticker: trade.sym,
        underlying_ticker: underlyingTicker,
        timestamp: new Date(trade.t),
        price: trade.p,
        size: trade.s,
        conditions: trade.c[0].toString(),
        exchange: trade.x,
      };

      this.tradeBuffer.push(optionTrade);
      this.totalTradesProcessed++;

      if (this.tradeBuffer.length >= 100) {
        this.flushTrades();
      }
    } catch (error) {
      console.error('Error processing trade:', error);
      this.totalErrors++;
    }
  }

  private async flushTrades(): Promise<void> {
    if (this.tradeBuffer.length === 0) {
      return;
    }

    const tradesToInsert = [...this.tradeBuffer];
    this.tradeBuffer = [];

    const maxRetries = 3;
    let retryCount = 0;
    let success = false;

    while (retryCount < maxRetries && !success) {
      try {
        // Process each trade individually to ensure proper insert-if-not-exists behavior
        for (const trade of tradesToInsert) {
          await InsertIfNotExistsService.insertOptionTradeIfNotExists(trade);
        }

        console.log(`Inserted ${tradesToInsert.length} option trades.`);
        this.lastFlushCompleted = new Date();
        success = true;
      } catch (error) {
        retryCount++;
        this.totalErrors++;

        const isRetryableError = this.isRetryableError(error);

        if (isRetryableError && retryCount < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, retryCount - 1), 10000); // Exponential backoff, max 10s
          console.warn(`Database error on flush attempt ${retryCount}/${maxRetries}, retrying in ${delay}ms:`, error);
          await new Promise(resolve => setTimeout(resolve, delay));

          // Put trades back in buffer for retry
          this.tradeBuffer.unshift(...tradesToInsert);
        } else {
          console.error(`Failed to insert ${tradesToInsert.length} option trades after ${retryCount} attempts:`, error);
          // Log the failed trades for debugging
          console.error('Failed trades:', tradesToInsert.slice(0, 5)); // Log first 5 for debugging
          break;
        }
      }
    }
  }

  private isRetryableError(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return (
        message.includes('timeout') ||
        message.includes('econnreset') ||
        message.includes('socket hang up') ||
        message.includes('etimedout') ||
        message.includes('network') ||
        message.includes('connection')
      );
    }
    return false;
  }

  close(): void {
    console.log('Closing WebSocket service...');

    // Stop health monitoring
    this.stopHealthMonitoring();

    // Clear flush interval
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }

    // Flush any remaining trades before closing
    if (this.tradeBuffer.length > 0) {
      console.log(`Flushing ${this.tradeBuffer.length} remaining trades before closing...`);
      this.flushTrades().catch(error => {
        console.error('Error flushing final trades:', error);
      });
    }

    // Close WebSocket with normal closure code
    if (this.ws) {
      this.ws.close(1000, 'Normal closure');
      this.ws = null;
    }

    console.log('WebSocket service closed.');
  }
}
