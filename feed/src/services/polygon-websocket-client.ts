import WebSocket from 'ws';
import { config } from '../config';
import { UpsertService } from '../utils/upsert';
import { OptionTrade } from '../types/database';

interface WebSocketMessage {
  ev: string;
  sym?: string;
  p?: number;
  s?: number;
  c?: number[];
  t?: number;
  status?: string;
  message?: string;
}

export class WebSocketService {
  private ws: WebSocket | null = null;
  private tradeBuffer: OptionTrade[] = [];
  private flushInterval: NodeJS.Timeout | null = null;
  private configuredTickers: string[] = [];

  connect(url: string): void {
    this.ws = new WebSocket(url);

    this.ws.on('open', () => {
      console.log('WebSocket connection established.');
      this.authenticate();
    });

    this.ws.on('message', (data: WebSocket.Data) => {
      const messages = JSON.parse(data.toString()) as WebSocketMessage[];
      for (const msg of messages) {
        this.handleMessage(msg);
      }
    });

    this.ws.on('close', () => {
      console.log('WebSocket connection closed.');
      if (this.flushInterval) {
        clearInterval(this.flushInterval);
      }
    });

    this.ws.on('error', (error: Error) => {
      console.error('WebSocket error:', error);
    });

    this.flushInterval = setInterval(() => this.flushTrades(), 5000);
  }

  private authenticate(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ action: 'auth', params: config.polygon.apiKey }));
    }
  }

  subscribe(tickers: string[]): void {
    // Store the configured tickers for filtering
    this.configuredTickers = tickers;

    // we need to wait for the websocket to be open before subscribing
    while (this.ws?.readyState !== WebSocket.OPEN) {
      console.log('WebSocket not open, waiting to subscribe');
      setTimeout(() => this.subscribe(tickers), 1000);
      return;
    }
    console.log(this.ws?.readyState, 'Subscribing to all option trades (T.*) and filtering for:', tickers);
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
          this.processTrade(msg as Required<Pick<WebSocketMessage, 'sym' | 'p' | 's' | 'c' | 't'>>);
        }
        break;
      default:
        break;
    }
  }

  private processTrade(trade: Required<Pick<WebSocketMessage, 'sym' | 'p' | 's' | 'c' | 't'>>): void {
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

    // Filter trades based on configured tickers
    if (!this.configuredTickers.includes(underlyingTicker)) {
      // console.log(`Trade for ${underlyingTicker} not in configured tickers, skipping`);
      return;
    }

    const optionTrade: OptionTrade = {
      ticker: trade.sym,
      underlying_ticker: underlyingTicker,
      timestamp: new Date(trade.t),
      price: trade.p,
      size: trade.s,
      conditions: trade.c ? JSON.stringify(trade.c) : '[]',
      exchange: 0,
      tape: 0,
      sequence_number: 0,
    };

    this.tradeBuffer.push(optionTrade);

    if (this.tradeBuffer.length >= 100) {
      this.flushTrades();
    }
  }

  private async flushTrades(): Promise<void> {
    if (this.tradeBuffer.length === 0) {
      return;
    }

    const tradesToInsert = [...this.tradeBuffer];
    this.tradeBuffer = [];

    try {
      await UpsertService.batchUpsertOptionTrades(tradesToInsert);
      console.log(`Inserted ${tradesToInsert.length} option trades.`);
    } catch (error) {
      console.error('Error inserting option trades:', error);
    }
  }

  close(): void {
    this.ws?.close();
  }
}
