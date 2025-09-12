import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { AlpacaOptionsTrade, AlpacaBar } from '../types';

export interface PolygonWebSocketMessage {
  ev: string;
  status?: string;
  message?: string;
  [key: string]: any;
}

export interface PolygonOptionsTradeMessage extends PolygonWebSocketMessage {
  ev: 'O';
  sym: string;
  x: number;
  p: number;
  s: number;
  c: number[];
  t: number;
  i: string;
  z: number;
}

export interface PolygonQuoteMessage extends PolygonWebSocketMessage {
  ev: 'Q';
  sym: string;
  ax: number;
  ap: number;
  as: number;
  bx: number;
  bp: number;
  bs: number;
  c: number;
  t: number;
}

export interface PolygonTradeMessage extends PolygonWebSocketMessage {
  ev: 'T';
  sym: string;
  x: number;
  p: number;
  s: number;
  c: number[];
  t: number;
  i: string;
  z: number;
}

export class PolygonWebSocketService extends EventEmitter {
  private ws: WebSocket | null = null;
  private apiKey: string;
  private baseUrl: string;
  private isConnected: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private subscriptions: Set<string> = new Set();

  constructor() {
    super();
    this.apiKey = process.env.POLYGON_API_KEY || '';
    this.baseUrl = process.env.POLYGON_WS_URL || 'wss://socket.polygon.io/options';
    
    if (!this.apiKey) {
      console.warn('POLYGON_API_KEY not found in environment variables');
    }
  }

  async connect(): Promise<void> {
    if (!this.apiKey) {
      throw new Error('Polygon API key not configured');
    }

    if (this.isConnected) {
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(`${this.baseUrl}?apikey=${this.apiKey}`);

        this.ws.on('open', () => {
          console.log('✅ Connected to Polygon WebSocket');
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.emit('connected');
          resolve();
        });

        this.ws.on('message', (data: Buffer) => {
          try {
            const message: PolygonWebSocketMessage = JSON.parse(data.toString());
            this.handleMessage(message);
          } catch (error) {
            console.error('Error parsing Polygon WebSocket message:', error);
          }
        });

        this.ws.on('close', (code: number, reason: string) => {
          console.log(`Polygon WebSocket closed: ${code} ${reason}`);
          this.isConnected = false;
          this.emit('disconnected');
          this.handleReconnect();
        });

        this.ws.on('error', (error: Error) => {
          console.error('Polygon WebSocket error:', error);
          this.emit('error', error);
          reject(error);
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  private handleMessage(message: PolygonWebSocketMessage): void {
    console.log('Polygon WebSocket message received:', {
      type: message.ev,
      symbol: (message as any).sym,
      timestamp: new Date().toISOString()
    });

    switch (message.ev) {
      case 'status':
        console.log('Polygon WebSocket status:', message.message);
        break;
      case 'O': // Options trade
        this.handleOptionsTrade(message as PolygonOptionsTradeMessage);
        break;
      case 'Q': // Quote
        this.handleQuote(message as PolygonQuoteMessage);
        break;
      case 'T': // Trade
        this.handleTrade(message as PolygonTradeMessage);
        break;
      default:
        console.log('Unknown message type:', message.ev, message);
    }
  }

  private handleOptionsTrade(message: PolygonOptionsTradeMessage): void {
    try {
      // Validate required fields first
      if (!message.sym) {
        throw new Error('Options trade missing symbol field');
      }
      if (!message.p || message.p <= 0) {
        throw new Error(`Invalid options trade price: ${message.p}`);
      }
      if (!message.s || message.s <= 0) {
        throw new Error(`Invalid options trade size: ${message.s}`);
      }
      if (!message.t || message.t <= 0) {
        throw new Error(`Invalid options trade timestamp: ${message.t}`);
      }

      const strikePrice = this.extractStrikePrice(message.sym);
      const underlyingSymbol = this.extractUnderlyingSymbol(message.sym);
      const expirationDate = this.extractExpirationDate(message.sym);
      const optionType = this.extractOptionType(message.sym);
      
      // Validate extracted values
      if (strikePrice <= 0) {
        throw new Error(`Invalid strike price extracted: ${strikePrice} from symbol: ${message.sym}`);
      }
      
      // Debug logging
      console.log('Options trade received:', {
        symbol: message.sym,
        underlying: underlyingSymbol,
        strike: strikePrice,
        expiration: expirationDate,
        type: optionType,
        price: message.p,
        size: message.s
      });

      const alpacaTrade: AlpacaOptionsTrade = {
        id: message.i || `trade_${Date.now()}`,
        symbol: message.sym,
        timestamp: new Date(message.t).toISOString(),
        price: message.p,
        size: message.s,
        side: this.determineTradeSide(message.c),
        conditions: message.c.map(c => c.toString()),
        exchange: this.mapExchangeCode(message.x),
        tape: this.mapTapeCode(message.z),
        contract: {
          symbol: message.sym,
          underlying_symbol: underlyingSymbol,
          exercise_style: 'american',
          expiration_date: expirationDate,
          strike_price: strikePrice,
          option_type: optionType,
        },
      };

      this.emit('options_trade', alpacaTrade);
    } catch (error) {
      // FAIL FAST: Log the error and don't process invalid data
      console.error('❌ Invalid options trade data received - REJECTING:', {
        error: error instanceof Error ? error.message : String(error),
        message: message,
        timestamp: new Date().toISOString()
      });
      
      // Emit an error event instead of processing invalid data
      this.emit('error', new Error(`Invalid options trade data: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  private handleQuote(message: PolygonQuoteMessage): void {
    const quote = {
      symbol: message.sym,
      bid_price: message.bp,
      bid_size: message.bs,
      ask_price: message.ap,
      ask_size: message.as,
      timestamp: new Date(message.t).toISOString(),
    };

    this.emit('quote', quote);
  }

  private handleTrade(message: PolygonTradeMessage): void {
    const bar: AlpacaBar = {
      t: new Date(message.t).toISOString(),
      o: message.p,
      h: message.p,
      l: message.p,
      c: message.p,
      v: message.s,
    };

    this.emit('trade', { symbol: message.sym, bar });
  }

  subscribeToOptionsTrades(symbol: string): void {
    if (!this.isConnected || !this.ws) {
      console.warn('WebSocket not connected, cannot subscribe');
      return;
    }

    // Polygon WebSocket format for options trades
    const subscription = `O.${symbol}`;
    this.subscriptions.add(subscription);
    
    this.ws.send(JSON.stringify({
      action: 'subscribe',
      params: subscription
    }));

    console.log(`Subscribed to options trades for ${symbol} with subscription: ${subscription}`);
  }

  subscribeToQuotes(symbol: string): void {
    if (!this.isConnected || !this.ws) {
      console.warn('WebSocket not connected, cannot subscribe');
      return;
    }

    const subscription = `Q.${symbol}`;
    this.subscriptions.add(subscription);
    
    this.ws.send(JSON.stringify({
      action: 'subscribe',
      params: subscription
    }));

    console.log(`Subscribed to quotes for ${symbol}`);
  }

  subscribeToTrades(symbol: string): void {
    if (!this.isConnected || !this.ws) {
      console.warn('WebSocket not connected, cannot subscribe');
      return;
    }

    const subscription = `T.${symbol}`;
    this.subscriptions.add(subscription);
    
    this.ws.send(JSON.stringify({
      action: 'subscribe',
      params: subscription
    }));

    console.log(`Subscribed to trades for ${symbol}`);
  }

  unsubscribe(symbol: string, type: 'options' | 'quotes' | 'trades'): void {
    if (!this.isConnected || !this.ws) {
      return;
    }

    const prefix = type === 'options' ? 'O' : type === 'quotes' ? 'Q' : 'T';
    const subscription = `${prefix}.${symbol}`;
    this.subscriptions.delete(subscription);
    
    this.ws.send(JSON.stringify({
      action: 'unsubscribe',
      params: subscription
    }));

    console.log(`Unsubscribed from ${type} for ${symbol}`);
  }

  private handleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    
    console.log(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    
    this.reconnectTimeout = setTimeout(() => {
      this.connect().then(() => {
        // Resubscribe to all previous subscriptions
        this.subscriptions.forEach(subscription => {
          const [type, symbol] = subscription.split('.');
          if (type === 'O') {
            this.subscribeToOptionsTrades(symbol);
          } else if (type === 'Q') {
            this.subscribeToQuotes(symbol);
          } else if (type === 'T') {
            this.subscribeToTrades(symbol);
          }
        });
      }).catch(error => {
        console.error('Reconnection failed:', error);
      });
    }, delay);
  }

  disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    this.isConnected = false;
    this.subscriptions.clear();
  }

  // Helper methods for data transformation
  private determineTradeSide(conditions: number[]): 'buy' | 'sell' {
    // Polygon doesn't directly provide trade side, so we'll use a heuristic
    // In a real implementation, you might need additional logic
    return Math.random() > 0.5 ? 'buy' : 'sell';
  }

  private mapExchangeCode(exchangeCode: number): string {
    const exchangeMap: { [key: number]: string } = {
      1: 'CBOE',
      2: 'AMEX',
      3: 'NYSE',
      4: 'NASDAQ',
      5: 'ARCA',
      6: 'BATS',
      7: 'IEX',
      8: 'EDGX',
      9: 'EDGA',
      10: 'CHX',
      11: 'NSX',
      12: 'BX',
      13: 'PSX',
      14: 'ISE',
      15: 'PHLX',
      16: 'BATS',
      17: 'CBOE2',
      18: 'CBSX',
      19: 'CBOE3',
      20: 'CBOE4',
    };
    return exchangeMap[exchangeCode] || 'UNKNOWN';
  }

  private mapTapeCode(tapeCode: number): string {
    const tapeMap: { [key: number]: string } = {
      1: 'A',
      2: 'B',
      3: 'C',
    };
    return tapeMap[tapeCode] || 'C';
  }

  private extractUnderlyingSymbol(symbol: string): string {
    // Extract underlying symbol from options symbol (e.g., "AAPL240315C00150000" -> "AAPL")
    const match = symbol.match(/^([A-Z]+)/);
    if (match) {
      return match[1];
    }
    
    // FAIL FAST: Don't make assumptions about underlying symbols
    throw new Error(`Invalid options symbol format - cannot extract underlying symbol: ${symbol}. Expected format like 'AAPL240315C00150000'`);
  }

  private extractExpirationDate(symbol: string): string {
    // Extract expiration date from options symbol (e.g., "AAPL240315C00150000" -> "2024-03-15")
    const match = symbol.match(/^[A-Z]+(\d{6})/);
    if (match) {
      const dateStr = match[1];
      const year = '20' + dateStr.substring(0, 2);
      const month = dateStr.substring(2, 4);
      const day = dateStr.substring(4, 6);
      return `${year}-${month}-${day}`;
    }
    
    // FAIL FAST: Don't make assumptions about expiration dates
    throw new Error(`Invalid options symbol format - cannot extract expiration date: ${symbol}. Expected format like 'AAPL240315C00150000'`);
  }

  private extractStrikePrice(symbol: string): number {
    // Extract strike price from options symbol
    // Format examples: "AAPL240315C00150000" -> 150.0, "TSLA240315P00200000" -> 200.0
    const match = symbol.match(/[CP](\d{8})$/);
    if (match) {
      const strikeStr = match[1];
      // Convert from 8-digit format (e.g., "00150000" -> 150.0)
      return parseFloat(strikeStr) / 1000;
    }
    
    // Try alternative format with 5 digits (e.g., "AAPL240315C15000" -> 150.0)
    const altMatch = symbol.match(/[CP](\d{5})$/);
    if (altMatch) {
      return parseFloat(altMatch[1]) / 100;
    }
    
    // FAIL FAST: Don't make assumptions about strike prices
    throw new Error(`Invalid options symbol format - cannot extract strike price: ${symbol}. Expected format like 'AAPL240315C00150000' or 'TSLA240315P00200000'`);
  }

  private extractOptionType(symbol: string): 'call' | 'put' {
    // Extract option type from options symbol (e.g., "AAPL240315C00150000" -> "call")
    return symbol.includes('C') ? 'call' : 'put';
  }
}

export const polygonWebSocketService = new PolygonWebSocketService();
