// ============================================================================
// SHARED TYPES - Only types actually used across modules
// ============================================================================

// ============================================================================
// ALPACA API TYPES (Used by dashboard)
// ============================================================================

export interface AlpacaAccount {
  id: string;
  account_number: string;
  status: string;
  currency: string;
  buying_power: string;
  regt_buying_power: string;
  daytrading_buying_power: string;
  non_marginable_buying_power: string;
  cash: string;
  accrued_fees: string;
  pending_transfer_out: string;
  pending_transfer_in: string;
  portfolio_value: string;
  pattern_day_trader: boolean;
  trading_blocked: boolean;
  transfers_blocked: boolean;
  account_blocked: boolean;
  created_at: string;
  trade_suspended_by_user: boolean;
  multiplier: string;
  shorting_enabled: boolean;
  equity: string;
  last_equity: string;
  long_market_value: string;
  short_market_value: string;
  initial_margin: string;
  maintenance_margin: string;
  last_maintenance_margin: string;
  sma: string;
  daytrade_count: number;
}

export interface AlpacaPosition {
  asset_id: string;
  symbol: string;
  exchange: string;
  asset_class: string;
  qty: string;
  side: string;
  market_value: string;
  cost_basis: string;
  unrealized_pl: string;
  unrealized_plpc: string;
  unrealized_intraday_pl: string;
  unrealized_intraday_plpc: string;
  current_price: string;
  lastday_price: string;
  change_today: string;
}

export interface AlpacaActivity {
  id: string;
  account_id: string;
  activity_type: string;
  transaction_time: string;
  type: string;
  qty?: string;
  side?: string;
  price?: string;
  leaves_qty?: string;
  order_id?: string;
  cum_qty?: string;
  order_status?: string;
  symbol?: string;
  asset_id?: string;
  asset_class?: string;
  notional?: string;
  net_amount?: string;
  per_share_amount?: string;
  qty_transacted?: string;
  status?: string;
  date?: string;
  net_value?: string;
  description?: string;
  symbol_code?: string;
  symbol_prefix?: string;
  symbol_suffix?: string;
  cusip?: string;
  fees?: string;
  quantity?: string;
  price_per_share?: string;
  shares?: string;
  gross_amount?: string;
  net_amount_after_tax?: string;
  withholding?: string;
  additional_fees?: string;
  additional_tax?: string;
  additional_withholding?: string;
  additional_net_amount?: string;
  additional_gross_amount?: string;
  additional_quantity?: string;
  additional_price_per_share?: string;
  additional_shares?: string;
  additional_fees_after_tax?: string;
  additional_net_amount_after_tax?: string;
  additional_withholding_after_tax?: string;
}

// Used by feed module
export interface AlpacaBar {
  t: string; // timestamp
  o: number; // open
  h: number; // high
  l: number; // low
  c: number; // close
  v: number; // volume
  n?: number; // trade count
  vw?: number; // volume weighted average price
}

// Used by dashboard
export interface AlpacaOptionsTrade {
  id: string;
  symbol: string;
  timestamp: string;
  price: number;
  size: number;
  side: 'buy' | 'sell' | 'unknown';
  conditions: string[];
  exchange: string;
  tape: string;
  contract: {
    symbol: string;
    underlying_symbol: string;
    exercise_style: string;
    expiration_date: string;
    strike_price: number;
    option_type: ContractType;
  };
  // Price history for gain calculation (only available if real data provides it)
  previous_price?: number;
  open_price?: number;
  gain_percentage?: number;
}

// Frontend-optimized option trade with parsed ticker data
export interface FrontendOptionTrade {
  ticker: string;
  underlying_ticker: string;
  timestamp: string;
  price: number;
  size: number;
  conditions: string;
  tape: string;
  sequence_number: number;
  // Parsed from ticker
  option_type: 'call' | 'put';
  strike_price: number;
  expiration_date: string; // YYYY-MM-DD format
}

// Used by feed and dashboard
export type ContractType = 'call' | 'put';

// Used by dashboard
export interface AlpacaOptionsContract {
  cfi: string;
  contract_type: ContractType;
  exercise_style: string;
  expiration_date: string;
  primary_exchange: string;
  shares_per_contract: number;
  strike_price: number;
  ticker: string;
  underlying_ticker: string;
}

// Used by dashboard
export interface CreateOrderRequest {
  symbol: string;
  qty: number;
  side: 'buy' | 'sell';
  type: 'market' | 'limit' | 'stop' | 'stop_limit';
  time_in_force: 'day' | 'gtc' | 'ioc' | 'fok';
  limit_price?: number;
  stop_price?: number;
}

// Used by dashboard
export interface CreateOrderResponse {
  id: string;
  client_order_id: string;
  created_at: string;
  updated_at: string;
  submitted_at: string;
  filled_at?: string;
  expired_at?: string;
  canceled_at?: string;
  failed_at?: string;
  replaced_at?: string;
  replaced_by?: string;
  replaces?: string;
  asset_id: string;
  symbol: string;
  asset_class: string;
  notional?: string;
  qty: string;
  filled_qty: string;
  filled_avg_price?: string;
  order_class: string;
  order_type: string;
  type: string;
  side: string;
  time_in_force: string;
  limit_price?: string;
  stop_price?: string;
  status: string;
  extended_hours: boolean;
  trail_percent?: string;
  trail_price?: string;
  hwm?: string;
}

// ============================================================================
// CHART TYPES (Used by dashboard)
// ============================================================================

export type ChartTimeframe = '1m' | '15m' | '30m' | '1h' | '1H' | '1d' | '1D' | '1W' | '3M' | '6M' | '1Y' | 'ALL';

export interface ChartDimensions {
  width: number;
  height: number;
  margin: { top: number; right: number; bottom: number; left: number };
}

// Chart Constants
export const DEFAULT_CHART_DATA_POINTS = 1000;

// Timeframe Configuration
export interface TimeframeConfig {
  value: ChartTimeframe;
  label: string;
  limit: number;
  dataPoints?: number;
}

// Candlestick Data
export interface CandlestickData {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  vwap?: number;
  tradeCount?: number;
  isFake?: boolean; // Indicates if this is a fake candle for padding
}

// Data Range
export interface DataRange {
  start: number;
  end: number;
}

// ============================================================================
// AUTH TYPES (Used by server and dashboard)
// ============================================================================

export interface User {
  id: string;
  email: string;
  name: string;
  googleId?: string;
  auth0Id?: string;
  picture?: string;
}

export interface JWTPayload {
  userId: string;
  email: string;
  googleId?: string;
  auth0Id?: string;
  iat?: number;
  exp?: number;
}

// ============================================================================
// WEBSOCKET MESSAGE TYPES (Used by dashboard and server)
// ============================================================================

export type WebSocketMessageData =
  | AlpacaOptionsTrade
  | AlpacaOptionsContract
  | { symbol: string; price: number; timestamp: string }
  | { symbol: string; bar: AlpacaBar }
  | { error: string; message?: string }
  | { status: string; message?: string }
  | { channel: string; symbol?: string }
  | { message: string } // For connection messages
  | { [key: string]: string | number | boolean | null | undefined | string[] }; // For flexible data structures

export interface WebSocketMessage {
  type:
    | 'options_whale'
    | 'options_contract'
    | 'account_quote'
    | 'chart_quote'
    | 'error'
    | 'connection'
    | 'subscription_confirmed'
    | 'unsubscription_confirmed'
    | 'subscribe'
    | 'unsubscribe'
    | 'ping'
    | 'pong';
  data: WebSocketMessageData;
  timestamp: string;
}

// ============================================================================
// ERROR TYPES (Used by server)
// ============================================================================

export interface ApiError {
  message: string;
  status: number;
  code?: string;
}
