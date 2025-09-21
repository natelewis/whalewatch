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
    t: string;
    o: number;
    h: number;
    l: number;
    c: number;
    v: number;
    n?: number;
    vw?: number;
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
export interface CreateOrderRequest {
    symbol: string;
    qty: number;
    side: 'buy' | 'sell';
    type: 'market' | 'limit' | 'stop' | 'stop_limit';
    time_in_force: 'day' | 'gtc' | 'ioc' | 'fok';
    limit_price?: number;
    stop_price?: number;
}
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
    legs?: unknown[];
    trail_percent?: string;
    trail_price?: string;
    hwm?: string;
}
export interface AccountInfoResponse {
    account: AlpacaAccount;
}
export interface PositionsResponse {
    positions: AlpacaPosition[];
}
export interface ActivityResponse {
    activities: AlpacaActivity[];
}
export interface ChartDataResponse {
    bars: AlpacaBar[];
    symbol: string;
    timeframe: string;
}
export interface OptionsTradesResponse {
    trades: AlpacaOptionsTrade[];
    symbol: string;
}
export interface ApiResponse<T> {
    data?: T;
    error?: string;
    message?: string;
}
export interface WebSocketMessage {
    type: 'options_whale' | 'options_contract' | 'account_quote' | 'chart_quote' | 'error' | 'connection' | 'subscription_confirmed' | 'unsubscription_confirmed' | 'pong';
    data: unknown;
    timestamp: string;
}
export interface OptionsWhaleMessage extends WebSocketMessage {
    type: 'options_whale';
    data: AlpacaOptionsTrade;
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
export type ChartTimeframe = '1m' | '5m' | '15m' | '30m' | '1h' | '1H' | '2h' | '4h' | '4H' | '1d' | '1D' | '1w' | '1W' | '3M' | '6M' | '1Y' | '1M' | 'ALL';
export type ChartType = 'candlestick' | 'bar' | 'line' | 'area';
export interface ChartDimensions {
    width: number;
    height: number;
    margin: {
        top: number;
        right: number;
        bottom: number;
        left: number;
    };
}
export declare const DEFAULT_CHART_DATA_POINTS = 1000;
export interface TimeframeConfig {
    value: ChartTimeframe;
    label: string;
    limit: number;
    dataPoints?: number;
}
export interface CandlestickData {
    timestamp: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    vwap?: number;
    tradeCount?: number;
}
export interface DataRange {
    start: number;
    end: number;
}
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
    auth0Id?: string;
    iat?: number;
    exp?: number;
}
export interface Auth0User {
    id: string;
    auth0Id: string;
    email: string;
    name: string;
    picture?: string;
}
export interface ApiError {
    message: string;
    status: number;
    code?: string;
}
export interface WhaleConfig {
    minPremium: number;
    minVolume: number;
    minSize: number;
    symbols?: string[];
    enabled?: boolean;
}
//# sourceMappingURL=index.d.ts.map