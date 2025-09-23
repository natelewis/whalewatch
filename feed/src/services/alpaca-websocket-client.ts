import WebSocket from 'ws';
import { config } from '../config';
import { AlpacaWebSocketMessage, AlpacaWebSocketSubscription } from '../types/alpaca';

export interface AlpacaWebSocketEventHandler {
  onTrade: (trade: unknown, symbol: string) => void;
  onQuote: (quote: unknown, symbol: string) => void;
  onBar: (bar: unknown, symbol: string) => void;
  onError: (error: Error) => void;
  onConnect: () => void;
  onDisconnect: () => void;
}

export class AlpacaWebSocketClient {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;
  private isConnecting = false;
  private subscriptions = new Set<string>();
  private eventHandlers: Partial<AlpacaWebSocketEventHandler> = {};

  constructor() {
    // Constructor for WebSocket client
  }

  setEventHandlers(handlers: Partial<AlpacaWebSocketEventHandler>): void {
    this.eventHandlers = { ...this.eventHandlers, ...handlers };
  }

  async connect(): Promise<void> {
    if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    this.isConnecting = true;

    return new Promise((resolve, reject) => {
      const wsUrl = config.alpaca.wsUrl;

      this.ws = new WebSocket(wsUrl);

      this.ws.on('open', () => {
        console.log('WebSocket connected to Alpaca');
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        // Send authentication message
        this.authenticate();
        this.eventHandlers.onConnect?.();
        resolve();
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        try {
          const message: AlpacaWebSocketMessage = JSON.parse(data.toString());
          this.handleMessage(message);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
          this.eventHandlers.onError?.(error as Error);
        }
      });

      this.ws.on('close', (code: number, reason: string) => {
        console.log(`WebSocket closed: ${code} - ${reason}`);
        this.isConnecting = false;
        this.eventHandlers.onDisconnect?.();
        this.handleReconnect();
      });

      this.ws.on('error', (error: Error) => {
        console.error('WebSocket error:', error);
        this.isConnecting = false;
        this.eventHandlers.onError?.(error);
        reject(error);
      });
    });
  }

  private authenticate(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const authMessage = {
        action: 'auth',
        key: config.alpaca.apiKey,
        secret: config.alpaca.secretKey,
      };
      this.ws.send(JSON.stringify(authMessage));
    }
  }

  private handleMessage(message: AlpacaWebSocketMessage): void {
    if (!message || !message.stream || !message.data) {
      return;
    }

    const symbol = this.extractSymbolFromStream(message.stream);

    switch (message.stream.split('.')[0]) {
      case 'trade':
        this.eventHandlers.onTrade?.(message.data, symbol);
        break;

      case 'quote':
        this.eventHandlers.onQuote?.(message.data, symbol);
        break;

      case 'bar':
        this.eventHandlers.onBar?.(message.data, symbol);
        break;

      default:
        console.log('Unknown Alpaca message type:', message.stream);
    }
  }

  private extractSymbolFromStream(stream: string): string {
    // Stream format: "trade.AAPL", "quote.AAPL", "bar.AAPL"
    const parts = stream.split('.');
    return parts.length > 1 ? parts[1] : 'unknown';
  }

  subscribeToTrades(symbols: string[]): void {
    const tradeSymbols = symbols.map(symbol => `trade.${symbol}`);
    this.subscribe(tradeSymbols);
  }

  subscribeToQuotes(symbols: string[]): void {
    const quoteSymbols = symbols.map(symbol => `quote.${symbol}`);
    this.subscribe(quoteSymbols);
  }

  subscribeToBars(symbols: string[]): void {
    const barSymbols = symbols.map(symbol => `bar.${symbol}`);
    this.subscribe(barSymbols);
  }

  private subscribe(streams: string[]): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('WebSocket not connected, cannot subscribe');
      return;
    }

    const subscription: AlpacaWebSocketSubscription = {
      action: 'subscribe',
      trades: streams.filter(s => s.startsWith('trade.')).map(s => s.split('.')[1]),
      quotes: streams.filter(s => s.startsWith('quote.')).map(s => s.split('.')[1]),
      bars: streams.filter(s => s.startsWith('bar.')).map(s => s.split('.')[1]),
    };

    // Remove empty arrays
    if (subscription.trades?.length === 0) delete subscription.trades;
    if (subscription.quotes?.length === 0) delete subscription.quotes;
    if (subscription.bars?.length === 0) delete subscription.bars;

    this.ws.send(JSON.stringify(subscription));
    
    streams.forEach(stream => this.subscriptions.add(stream));
    console.log('Subscribed to:', streams.join(', '));
  }

  unsubscribe(streams: string[]): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('WebSocket not connected, cannot unsubscribe');
      return;
    }

    const subscription: AlpacaWebSocketSubscription = {
      action: 'unsubscribe',
      trades: streams.filter(s => s.startsWith('trade.')).map(s => s.split('.')[1]),
      quotes: streams.filter(s => s.startsWith('quote.')).map(s => s.split('.')[1]),
      bars: streams.filter(s => s.startsWith('bar.')).map(s => s.split('.')[1]),
    };

    // Remove empty arrays
    if (subscription.trades?.length === 0) delete subscription.trades;
    if (subscription.quotes?.length === 0) delete subscription.quotes;
    if (subscription.bars?.length === 0) delete subscription.bars;

    this.ws.send(JSON.stringify(subscription));
    
    streams.forEach(stream => this.subscriptions.delete(stream));
    console.log('Unsubscribed from:', streams.join(', '));
  }


  private handleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    console.log(`Attempting to reconnect in ${this.reconnectDelay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    setTimeout(() => {
      this.connect().catch(error => {
        console.error('Reconnection failed:', error);
      });
    }, this.reconnectDelay);
  }

  async disconnect(): Promise<void> {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.subscriptions.clear();
    this.reconnectAttempts = 0;
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
