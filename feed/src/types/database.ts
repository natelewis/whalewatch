// Database table schemas and types

export interface OptionTrade {
  ticker: string;
  underlying_ticker: string;
  timestamp: Date;
  price: number;
  size: number;
  conditions: string;
  exchange: number;
}

export interface TickerConfig {
  ticker: string;
  type: 'stock' | 'option';
}
