// API Types (shared with server)
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
  additional_additional_fees?: string;
  additional_additional_tax?: string;
  additional_additional_withholding?: string;
  additional_additional_net_amount?: string;
  additional_additional_gross_amount?: string;
  additional_additional_quantity?: string;
  additional_additional_price_per_share?: string;
  additional_additional_shares?: string;
  additional_additional_fees_after_tax?: string;
  additional_additional_net_amount_after_tax?: string;
  additional_additional_withholding_after_tax?: string;
}

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
    option_type: 'call' | 'put';
  };
  // Price history for gain calculation (only available if real data provides it)
  previous_price?: number;
  open_price?: number;
  gain_percentage?: number;
}

export interface AlpacaOptionsContract {
  cfi: string;
  contract_type: string;
  exercise_style: string;
  expiration_date: string;
  primary_exchange: string;
  shares_per_contract: number;
  strike_price: number;
  ticker: string;
  underlying_ticker: string;
}

// WebSocket Message Types
export interface WebSocketMessage {
  type:
    | 'options_contract'
    | 'account_quote'
    | 'chart_quote'
    | 'error'
    | 'connection'
    | 'subscription_confirmed'
    | 'unsubscription_confirmed'
    | 'pong';
  data: any;
  timestamp: string;
}

export interface OptionsContractMessage extends WebSocketMessage {
  type: 'options_contract';
  data: AlpacaOptionsContract;
}

export interface AccountQuoteMessage extends WebSocketMessage {
  type: 'account_quote';
  data: {
    symbol: string;
    price: number;
    timestamp: string;
  };
}

export interface ChartQuoteMessage extends WebSocketMessage {
  type: 'chart_quote';
  data: {
    symbol: string;
    bar: AlpacaBar;
  };
}

// Chart Types
export type ChartTimeframe = '1m' | '5m' | '30m' | '1h' | '2h' | '4h' | '1d' | '1w' | '1M';
export type ChartType = 'candlestick' | 'bar' | 'line' | 'area';

// Chart Constants
export const DEFAULT_CHART_DATA_POINTS = parseInt(
  import.meta.env.VITE_DEFAULT_CHART_DATA_POINTS || '500',
  10
);

// Technical Indicators
export interface MovingAverage {
  id: string;
  type: 'SMA' | 'EMA';
  period: number;
  color: string;
  visible: boolean;
}

export interface RSI {
  id: string;
  period: number;
  overbought: number;
  oversold: number;
  color: string;
  visible: boolean;
}

export interface MACD {
  id: string;
  fastPeriod: number;
  slowPeriod: number;
  signalPeriod: number;
  visible: boolean;
}

export interface BollingerBands {
  id: string;
  period: number;
  standardDeviation: number;
  color: string;
  visible: boolean;
}

// Drawing Tools
export interface TrendLine {
  id: string;
  type: 'trendline';
  points: { x: number; y: number }[];
  color: string;
  style: 'solid' | 'dashed' | 'dotted';
}

export interface HorizontalLine {
  id: string;
  type: 'horizontal';
  price: number;
  color: string;
  style: 'solid' | 'dashed' | 'dotted';
}

export interface FibonacciRetracement {
  id: string;
  type: 'fibonacci';
  start: { x: number; y: number };
  end: { x: number; y: number };
  levels: number[];
  color: string;
}

// User Interface Types
export interface User {
  id: string;
  email: string;
  name: string;
  googleId?: string;
  picture?: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  loginWithGoogle: () => void;
  handleOAuthCallback: (token: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
}

// API Response Types
export interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
}

// Chart API Response Types
export interface ChartDataResponse {
  symbol: string;
  interval: string;
  limit: number;
  direction: 'past' | 'future';
  view_based_loading?: boolean;
  view_size?: number;
  bars: AlpacaBar[];
  data_source: string;
  success: boolean;
  query_params: {
    start_time: string;
    direction: 'past' | 'future';
    interval: string;
    requested_limit: number;
    view_based_loading?: boolean;
    view_size?: number;
  };
  actual_data_range?: {
    earliest: string;
    latest: string;
  } | null;
}

// OAuth Types
export interface OAuthUser {
  id: string;
  googleId: string;
  email: string;
  name: string;
  picture?: string;
}

export interface OAuthResponse {
  token: string;
  user: OAuthUser;
}

// Legacy types for backward compatibility (deprecated)
export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export interface CreateOrderRequest {
  symbol: string;
  qty: number;
  side: 'buy' | 'sell';
  type: 'market' | 'limit' | 'stop' | 'stop_limit';
  time_in_force: 'day' | 'gtc' | 'ioc' | 'fok';
  limit_price?: number;
  stop_price?: number;
}

// Chart Configuration
export interface ChartDimensions {
  width: number;
  height: number;
  margin: { top: number; right: number; bottom: number; left: number };
}

export interface ChartConfig {
  symbol: string;
  timeframe: ChartTimeframe;
  chartType: ChartType;
  indicators: {
    movingAverages: MovingAverage[];
    rsi: RSI | null;
    macd: MACD | null;
    bollingerBands: BollingerBands | null;
  };
  drawings: {
    trendLines: TrendLine[];
    horizontalLines: HorizontalLine[];
    fibonacci: FibonacciRetracement[];
  };
  showVolume: boolean;
  showCrosshair: boolean;
}

// Whale Watch Configuration
export interface WhaleConfig {
  minPremium: number;
  minVolume: number;
  minSize: number;
  symbols: string[];
  enabled: boolean;
}
