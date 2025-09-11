import React from 'react';
import { render, screen } from '@testing-library/react';
import { AccountSummary } from '../../components/AccountSummary';
import { AlpacaAccount } from '../../types';

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
  daytrade_count: 0
};

describe('AccountSummary', () => {
  it('renders account information correctly', () => {
    render(<AccountSummary account={mockAccount} />);

    expect(screen.getByText('Portfolio Value')).toBeInTheDocument();
    expect(screen.getByText('$50,000.00')).toBeInTheDocument();
    expect(screen.getByText('Buying Power')).toBeInTheDocument();
    expect(screen.getByText('$10,000.00')).toBeInTheDocument();
    expect(screen.getByText('Cash')).toBeInTheDocument();
    expect(screen.getByText('$5,000.00')).toBeInTheDocument();
    expect(screen.getByText('Day Trades')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('displays pattern day trader status', () => {
    const pdtAccount = { ...mockAccount, pattern_day_trader: true };
    render(<AccountSummary account={pdtAccount} />);

    expect(screen.getByText('Pattern Day Trader')).toBeInTheDocument();
  });

  it('formats currency values correctly', () => {
    render(<AccountSummary account={mockAccount} />);

    // Check that currency values are formatted with $ symbol
    expect(screen.getByText('$50,000.00')).toBeInTheDocument();
    expect(screen.getByText('$10,000.00')).toBeInTheDocument();
    expect(screen.getByText('$5,000.00')).toBeInTheDocument();
  });

  it('shows regt buying power in subtitle', () => {
    render(<AccountSummary account={mockAccount} />);

    expect(screen.getByText('Reg T: $10,000.00')).toBeInTheDocument();
  });

  it('shows SMA in cash subtitle', () => {
    const accountWithSMA = { ...mockAccount, sma: '1000.00' };
    render(<AccountSummary account={accountWithSMA} />);

    expect(screen.getByText('SMA: $1,000.00')).toBeInTheDocument();
  });
});
