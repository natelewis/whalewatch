// QuestDB Types based on the provided schema

export interface QuestDBStockTrade {
  symbol: string;
  timestamp: string; // ISO timestamp
  price: number;
  size: number;
  conditions: string;
  exchange: number;
  tape: number;
  trade_id: string;
}

export interface QuestDBStockAggregate {
  symbol: string;
  timestamp: string; // ISO timestamp
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  vwap: number;
  transaction_count: number;
}

export interface QuestDBOptionContract {
  ticker: string;
  contract_type: string;
  exercise_style: string;
  expiration_date: string;
  shares_per_contract: number;
  strike_price: number;
  underlying_ticker: string;
  created_at: string; // ISO timestamp
}

export interface QuestDBOptionTrade {
  ticker: string;
  underlying_ticker: string;
  timestamp: string; // ISO timestamp
  price: number;
  size: number;
  conditions: string;
  exchange: number;
  tape: number;
  sequence_number: number;
}

export interface QuestDBOptionQuote {
  ticker: string;
  underlying_ticker: string;
  timestamp: string; // ISO timestamp
  bid_price: number;
  bid_size: number;
  ask_price: number;
  ask_size: number;
  bid_exchange: number;
  ask_exchange: number;
  sequence_number: number;
}

export interface QuestDBSyncState {
  ticker: string;
  last_trade_timestamp: string; // ISO timestamp
  last_aggregate_timestamp: string; // ISO timestamp
  last_sync: string; // ISO timestamp
  is_streaming: boolean;
}

// Query parameters for QuestDB queries
export interface QuestDBQueryParams {
  symbol?: string | undefined;
  underlying_ticker?: string | undefined;
  start_time?: string | undefined; // ISO timestamp
  end_time?: string | undefined; // ISO timestamp
  limit?: number | undefined;
  offset?: number | undefined;
  order_by?: string | undefined;
  order_direction?: 'ASC' | 'DESC' | undefined;
}

// QuestDB response wrapper
export interface QuestDBResponse<T> {
  query: string;
  columns: Array<{
    name: string;
    type: string;
  }>;
  dataset: T[];
  count: number;
  execution_time_ms: number;
}

// WebSocket message types for real-time data
export interface QuestDBWebSocketMessage {
  type: 'stock_trade' | 'option_trade' | 'option_quote' | 'stock_aggregate' | 'error' | 'connected' | 'disconnected';
  data: QuestDBStockTrade | QuestDBOptionTrade | QuestDBOptionQuote | QuestDBStockAggregate | string;
  timestamp: string;
  symbol?: string;
  underlying_ticker?: string;
}

// Subscription types for WebSocket
export interface QuestDBSubscription {
  type: 'stock_trades' | 'option_trades' | 'option_quotes' | 'stock_aggregates';
  symbol?: string | undefined;
  underlying_ticker?: string | undefined;
  ticker?: string | undefined;
  filters?: {
    min_price?: number | undefined;
    max_price?: number | undefined;
    min_size?: number | undefined;
    max_size?: number | undefined;
  } | undefined;
}

// QuestDB connection configuration
export interface QuestDBConfig {
  host: string;
  port: number;
  username?: string | undefined;
  password?: string | undefined;
  database?: string | undefined;
  ssl?: boolean | undefined;
  timeout?: number | undefined;
  max_connections?: number | undefined;
}

// Error types
export interface QuestDBError {
  error: string;
  position: number;
  query: string;
  timestamp: string;
}
