import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
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
    portfolio_value: '50000.00',
    cash: '5000.00',
    daytrade_count: 0,
    pattern_day_trader: false,
  },
};

const mockPositions = {
  positions: [
    {
      asset_id: 'asset-1',
      symbol: 'AAPL',
      qty: '10',
      side: 'long',
      market_value: '1500.00',
      unrealized_pl: '100.00',
      unrealized_plpc: '0.0714',
      current_price: '150.00',
    },
  ],
};

const mockActivities = {
  activities: [
    {
      id: 'activity-1',
      activity_type: 'FILL',
      transaction_time: '2024-01-01T10:00:00Z',
      symbol: 'AAPL',
      side: 'buy',
      qty: '10',
      price: '140.00',
    },
  ],
};

const mockWebSocket = {
  lastMessage: null,
  sendMessage: jest.fn(),
  isConnected: true,
  connect: jest.fn(),
  disconnect: jest.fn(),
};

const renderWithRouter = (component: React.ReactElement) => {
  return render(
    <BrowserRouter>
      {component}
    </BrowserRouter>
  );
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
