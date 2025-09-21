import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { AccountPage } from '../../pages/AccountPage';
import { apiService } from '../../services/apiService';
import { useWebSocket } from '../../hooks/useWebSocket';

// Mock the API service
jest.mock('../../services/apiService');
const mockApiService = apiService as jest.Mocked<typeof apiService>;

// Mock the WebSocket hook
jest.mock('../../hooks/useWebSocket');
const mockUseWebSocket = useWebSocket as jest.MockedFunction<typeof useWebSocket>;

// Mock the API responses
const mockAccount = {
  account: {
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
    created_at: '2023-01-01T00:00:00Z',
    trade_suspended_by_user: false,
    multiplier: '1',
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
  },
};

const mockPositions = {
  positions: [
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
      unrealized_intraday_pl: '10.00',
      unrealized_intraday_plpc: '0.0067',
      current_price: '150.00',
      lastday_price: '149.00',
      change_today: '1.00',
    },
  ],
};

const mockActivities = {
  activities: [
    {
      id: 'activity-1',
      account_id: 'test-account-id',
      activity_type: 'FILL',
      transaction_time: '2024-01-01T10:00:00Z',
      type: 'fill',
      qty: '10',
      side: 'buy',
      price: '140.00',
      leaves_qty: '0',
      order_id: 'order-1',
      cum_qty: '10',
      order_status: 'filled',
      symbol: 'AAPL',
      asset_id: 'asset-1',
      asset_class: 'us_equity',
      notional: '1400.00',
      net_amount: '1400.00',
      per_share_amount: '140.00',
      qty_transacted: '10',
      status: 'executed',
      date: '2024-01-01',
      net_value: '1400.00',
      description: 'Fill',
      symbol_code: 'AAPL',
      symbol_prefix: 'A',
      symbol_suffix: 'PL',
      cusip: '037833100',
      fees: '0.00',
      quantity: '10',
      price_per_share: '140.00',
      shares: '10',
      gross_amount: '1400.00',
      net_amount_after_tax: '1400.00',
      withholding: '0.00',
      additional_fees: '0.00',
      additional_tax: '0.00',
      additional_withholding: '0.00',
      additional_net_amount: '0.00',
      additional_gross_amount: '0.00',
      additional_quantity: '0',
      additional_price_per_share: '0.00',
      additional_shares: '0',
      additional_fees_after_tax: '0.00',
      additional_net_amount_after_tax: '0.00',
      additional_withholding_after_tax: '0.00',
    },
  ],
};

const mockWebSocket = {
  socket: null,
  lastMessage: null,
  sendMessage: jest.fn(),
  isConnected: true,
  connect: jest.fn(),
  disconnect: jest.fn(),
};

const renderWithRouter = (component: React.ReactElement) => {
  return render(<BrowserRouter>{component}</BrowserRouter>);
};

describe('AccountPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseWebSocket.mockReturnValue(mockWebSocket);
  });

  it('renders loading state initially', () => {
    mockApiService.getAccount.mockImplementation(() => new Promise(() => {})); // Never resolves
    mockApiService.getPositions.mockImplementation(() => new Promise(() => {}));
    mockApiService.getActivities.mockImplementation(() => new Promise(() => {}));

    renderWithRouter(<AccountPage />);

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders account data when loaded successfully', async () => {
    mockApiService.getAccount.mockResolvedValue(mockAccount);
    mockApiService.getPositions.mockResolvedValue(mockPositions);
    mockApiService.getActivities.mockResolvedValue(mockActivities);

    renderWithRouter(<AccountPage />);

    await waitFor(() => {
      expect(screen.getByText('Account Dashboard')).toBeInTheDocument();
      expect(screen.getByText('Portfolio Value')).toBeInTheDocument();
      expect(screen.getByText('$50,000.00')).toBeInTheDocument();
      expect(screen.getByText('Open Positions')).toBeInTheDocument();
      expect(screen.getByText('AAPL')).toBeInTheDocument();
      expect(screen.getByText('Recent Activity')).toBeInTheDocument();
    });
  });

  it('renders error state when API fails', async () => {
    mockApiService.getAccount.mockRejectedValue(new Error('API Error'));
    mockApiService.getPositions.mockRejectedValue(new Error('API Error'));
    mockApiService.getActivities.mockRejectedValue(new Error('API Error'));

    renderWithRouter(<AccountPage />);

    await waitFor(() => {
      expect(screen.getByText('API Error')).toBeInTheDocument();
      expect(screen.getByText('Try Again')).toBeInTheDocument();
    });
  });

  it('calls refresh when refresh button is clicked', async () => {
    mockApiService.getAccount.mockResolvedValue(mockAccount);
    mockApiService.getPositions.mockResolvedValue(mockPositions);
    mockApiService.getActivities.mockResolvedValue(mockActivities);

    renderWithRouter(<AccountPage />);

    await waitFor(() => {
      expect(screen.getByText('Account Dashboard')).toBeInTheDocument();
    });

    const refreshButton = screen.getByText('Refresh');
    fireEvent.click(refreshButton);

    expect(mockApiService.getAccount).toHaveBeenCalledTimes(2);
    expect(mockApiService.getPositions).toHaveBeenCalledTimes(2);
    expect(mockApiService.getActivities).toHaveBeenCalledTimes(2);
  });

  it('subscribes to WebSocket for position updates', async () => {
    mockApiService.getAccount.mockResolvedValue(mockAccount);
    mockApiService.getPositions.mockResolvedValue(mockPositions);
    mockApiService.getActivities.mockResolvedValue(mockActivities);

    renderWithRouter(<AccountPage />);

    await waitFor(() => {
      expect(mockWebSocket.sendMessage).toHaveBeenCalledWith({
        type: 'subscribe',
        data: { channel: 'account_quote', symbols: ['AAPL'] },
      });
    });
  });
});
