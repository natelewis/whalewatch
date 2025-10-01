// Database table schemas and types

export interface StockAggregate {
  symbol: string;
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  vwap: number;
  transaction_count: number;
}

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
