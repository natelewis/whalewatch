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

export interface OptionContract {
  contract_type: 'call' | 'put';
  exercise_style: 'american' | 'european';
  expiration_date: string; // YYYY-MM-DD
  shares_per_contract: number;
  strike_price: number;
  ticker: string;
  underlying_ticker: string;
  created_at: Date;
}

export interface OptionTrade {
  ticker: string;
  underlying_ticker: string;
  timestamp: Date;
  price: number;
  size: number;
  conditions: string;
  exchange: number;
  tape: number;
  sequence_number: number;
}

export interface OptionQuote {
  ticker: string;
  underlying_ticker: string;
  timestamp: Date;
  bid_price: number;
  bid_size: number;
  ask_price: number;
  ask_size: number;
  bid_exchange: number;
  ask_exchange: number;
  sequence_number: number;
}

export interface TickerConfig {
  symbol: string;
  enabled: boolean;
  last_sync?: Date;
  last_aggregate?: Date;
}

export interface SyncState {
  ticker: string;
  last_aggregate_timestamp?: Date | undefined;
  last_sync: Date;
  is_streaming: boolean;
}
