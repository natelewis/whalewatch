import { http, HttpResponse } from 'msw';
import { AlpacaAccount, AlpacaPosition, AlpacaActivity, AlpacaBar, AlpacaOptionsTrade } from '../../types';

// Mock data
const mockAccount: AlpacaAccount = {
  id: 'test-account-id',
  account_number: '123456789',
  status: 'ACTIVE',
  currency: 'USD',
  buying_power: '10000.00',
  regt_buying_power: '10000.00',
  daytrading_buying_power: '10000.00',
  non_marginable_buying_power: '10000.00',
  cash: '5000.00',
  accrued_fees: '0.00',
  pending_transfer_out: '0.00',
  pending_transfer_in: '0.00',
  portfolio_value: '50000.00',
  pattern_day_trader: false,
  trading_blocked: false,
  transfers_blocked: false,
  account_blocked: false,
  created_at: '2024-01-01T00:00:00Z',
  trade_suspended_by_user: false,
  multiplier: '4',
  shorting_enabled: true,
  equity: '50000.00',
  last_equity: '50000.00',
  long_market_value: '50000.00',
  short_market_value: '0.00',
  initial_margin: '0.00',
  maintenance_margin: '0.00',
  last_maintenance_margin: '0.00',
  sma: '0.00',
  daytrade_count: 0,
};

const mockPositions: AlpacaPosition[] = [
  {
    asset_id: 'asset-1',
    symbol: 'AAPL',
    exchange: 'NASDAQ',
    asset_class: 'us_equity',
    qty: '10',
    side: 'long',
    market_value: '1500.00',
    cost_basis: '1400.00',
    unrealized_pl: '100.00',
    unrealized_plpc: '0.0714',
    unrealized_intraday_pl: '50.00',
    unrealized_intraday_plpc: '0.0333',
    current_price: '150.00',
    lastday_price: '145.00',
    change_today: '5.00',
  },
];

const mockActivities: AlpacaActivity[] = [
  {
    id: 'activity-1',
    account_id: 'test-account-id',
    activity_type: 'FILL',
    transaction_time: '2024-01-01T10:00:00Z',
    type: 'fill',
    qty: '10',
    side: 'buy',
    price: '140.00',
    symbol: 'AAPL',
    asset_class: 'us_equity',
    notional: '1400.00',
    net_amount: '-1400.00',
  },
];

const mockBars: AlpacaBar[] = [
  {
    t: '2024-01-01T00:00:00Z',
    o: 100,
    h: 105,
    l: 95,
    c: 102,
    v: 1000000,
    n: 5000,
    vw: 101,
  },
];

const mockOptionsTrades: AlpacaOptionsTrade[] = [
  {
    id: 'trade-1',
    symbol: 'TSLA',
    timestamp: '2024-01-01T10:00:00Z',
    price: 5.5,
    size: 100,
    side: 'buy',
    conditions: ['regular'],
    exchange: 'OPRA',
    tape: 'C',
    contract: {
      symbol: 'TSLA240315C00150000',
      underlying_symbol: 'TSLA',
      exercise_style: 'american',
      expiration_date: '2024-03-15',
      strike_price: 150,
      option_type: 'call',
    },
  },
];

export const handlers = [
  // Auth endpoints
  http.post('http://localhost:3001/api/auth/login', () => {
    return HttpResponse.json({
      token: 'mock-jwt-token',
      user: {
        id: '1',
        email: 'demo@whalewatch.com',
        name: 'Demo User',
      },
    });
  }),

  http.post('http://localhost:3001/api/auth/register', () => {
    return HttpResponse.json(
      {
        token: 'mock-jwt-token',
        user: {
          id: '2',
          email: 'newuser@whalewatch.com',
          name: 'New User',
        },
      },
      { status: 201 }
    );
  }),

  http.get('http://localhost:3001/api/auth/verify', () => {
    return HttpResponse.json({
      valid: true,
      user: {
        id: '1',
        email: 'demo@whalewatch.com',
      },
    });
  }),

  // Account endpoints
  http.get('http://localhost:3001/api/account/info', () => {
    return HttpResponse.json({ account: mockAccount });
  }),

  http.get('http://localhost:3001/api/account/positions', () => {
    return HttpResponse.json({ positions: mockPositions });
  }),

  http.get('http://localhost:3001/api/account/activity', () => {
    return HttpResponse.json({ activities: mockActivities });
  }),

  // Chart endpoints
  http.get('http://localhost:3001/api/chart/:symbol', () => {
    return HttpResponse.json({
      symbol: 'AAPL',
      timeframe: '1D',
      bars: mockBars,
    });
  }),

  // Options endpoints
  http.get('http://localhost:3001/api/options/:symbol/recent', () => {
    return HttpResponse.json({
      symbol: 'TSLA',
      trades: mockOptionsTrades,
      hours: 1,
    });
  }),

  // Order endpoints
  http.post('http://localhost:3001/api/orders/sell', () => {
    return HttpResponse.json(
      {
        message: 'Order created successfully',
        order: {
          id: 'order-123',
          symbol: 'AAPL',
          qty: '10',
          side: 'sell',
          type: 'limit',
          status: 'new',
        },
      },
      { status: 201 }
    );
  }),

  http.post('http://localhost:3001/api/orders/buy', () => {
    return HttpResponse.json(
      {
        message: 'Order created successfully',
        order: {
          id: 'order-124',
          symbol: 'AAPL',
          qty: '10',
          side: 'buy',
          type: 'market',
          status: 'new',
        },
      },
      { status: 201 }
    );
  }),

  // Health check
  http.get('http://localhost:3001/health', () => {
    return HttpResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: 123.45,
    });
  }),
];
