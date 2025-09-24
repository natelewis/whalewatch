import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { WhaleFinderPage } from '../../pages/WhaleFinderPage';
import { BrowserRouter } from 'react-router-dom';
import { apiService } from '../../services/apiService';
import { useWebSocket } from '../../hooks/useWebSocket';
import { AlpacaOptionsTrade } from '../../types';

// Mock the apiService
vi.mock('../../services/apiService', () => ({
  apiService: {
    getOptionsTrades: vi.fn(),
  },
}));

// Mock the useWebSocket hook
vi.mock('../../hooks/useWebSocket', () => ({
  useWebSocket: vi.fn(),
}));

// Mock the WhaleWatchFeed component
vi.mock('../../components/WhaleWatchFeed', () => ({
  WhaleWatchFeed: ({
    trades,
    selectedSymbol,
    onSymbolChange,
    isLoading,
    error,
  }: {
    trades: AlpacaOptionsTrade[];
    selectedSymbol: string;
    onSymbolChange: (symbol: string) => void;
    isLoading: boolean;
    error: string | null;
  }) => (
    <div data-testid="whale-watch-feed">
      <span>Feed for {selectedSymbol}</span>
      <span>Loading: {isLoading.toString()}</span>
      {error && <span>Error: {error}</span>}
      <span>Trades count: {trades.length}</span>
      <button onClick={() => onSymbolChange('AAPL')}>Change to AAPL</button>
    </div>
  ),
}));

const mockApiService = apiService as ReturnType<typeof vi.fn>;
const mockUseWebSocket = useWebSocket as ReturnType<typeof vi.fn>;

const renderWithRouter = (component: React.ReactElement) => {
  return render(<BrowserRouter>{component}</BrowserRouter>);
};

describe('WhaleFinderPage', () => {
  const mockSendMessage = vi.fn();
  const mockTrades = [
    {
      id: '1',
      symbol: 'TSLA',
      timestamp: '2023-01-01T00:00:00Z',
      price: 200.0,
      size: 100,
      side: 'buy' as const,
      conditions: [],
      exchange: 'NASDAQ',
      tape: 'A',
      contract: {
        symbol: 'TSLA240115C00200000',
        underlying_symbol: 'TSLA',
        exercise_style: 'american',
        expiration_date: '2024-01-15',
        strike_price: 200,
        option_type: 'call' as const,
      },
    },
    {
      id: '2',
      symbol: 'TSLA',
      timestamp: '2023-01-01T00:00:00Z',
      price: 190.0,
      size: 50,
      side: 'sell' as const,
      conditions: [],
      exchange: 'NASDAQ',
      tape: 'A',
      contract: {
        symbol: 'TSLA240115P00190000',
        underlying_symbol: 'TSLA',
        exercise_style: 'american',
        expiration_date: '2024-01-15',
        strike_price: 190,
        option_type: 'put' as const,
      },
    },
  ];

  beforeEach(() => {
    mockApiService.getOptionsTrades.mockResolvedValue({
      symbol: 'TSLA',
      trades: mockTrades,
      hours: 24,
    });
    mockUseWebSocket.mockReturnValue({
      socket: null,
      lastMessage: null,
      sendMessage: mockSendMessage,
      isConnected: true,
      connect: vi.fn(),
      disconnect: vi.fn(),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders the page title and description', () => {
    renderWithRouter(<WhaleFinderPage />);

    expect(screen.getByText('Whale Finder')).toBeInTheDocument();
    expect(screen.getByText('Monitor large options trades and discover whale activity')).toBeInTheDocument();
  });

  it('renders the whale feed section', () => {
    renderWithRouter(<WhaleFinderPage />);

    expect(screen.getByText('Options Whale Feed')).toBeInTheDocument();
    expect(screen.getByTestId('whale-watch-feed')).toBeInTheDocument();
  });

  it('loads whale trades on mount', async () => {
    renderWithRouter(<WhaleFinderPage />);

    await waitFor(() => {
      expect(mockApiService.getOptionsTrades).toHaveBeenCalledWith('TSLA', 1);
    });
  });

  it('subscribes to WebSocket on mount', async () => {
    renderWithRouter(<WhaleFinderPage />);

    await waitFor(() => {
      expect(mockSendMessage).toHaveBeenCalledWith({
        type: 'subscribe',
        data: { channel: 'options_whale', symbol: 'TSLA' },
      });
    });
  });

  it('handles symbol change', async () => {
    renderWithRouter(<WhaleFinderPage />);

    const changeButton = screen.getByText('Change to AAPL');
    changeButton.click();

    await waitFor(() => {
      expect(mockApiService.getOptionsTrades).toHaveBeenCalledWith('AAPL', 1);
    });
  });

  it('displays loading state', () => {
    mockApiService.getOptionsTrades.mockImplementation(() => new Promise(() => {})); // Never resolves

    renderWithRouter(<WhaleFinderPage />);

    expect(screen.getByText('Loading: true')).toBeInTheDocument();
  });

  it('displays error state', async () => {
    const errorMessage = 'Failed to load trades';
    mockApiService.getOptionsTrades.mockRejectedValue(new Error(errorMessage));

    renderWithRouter(<WhaleFinderPage />);

    await waitFor(() => {
      expect(screen.getByText(`Error: ${errorMessage}`)).toBeInTheDocument();
    });
  });

  it('updates trades when WebSocket message is received', () => {
    const newTrade = {
      id: '3',
      symbol: 'TSLA',
      timestamp: '2023-01-01T00:00:00Z',
      price: 210.0,
      size: 200,
      side: 'buy' as const,
      conditions: [],
      exchange: 'NASDAQ',
      tape: 'A',
      contract: {
        symbol: 'TSLA240115C00210000',
        underlying_symbol: 'TSLA',
        exercise_style: 'american',
        expiration_date: '2024-01-15',
        strike_price: 210,
        option_type: 'call' as const,
      },
    };
    mockUseWebSocket.mockReturnValue({
      socket: null,
      lastMessage: {
        type: 'options_whale',
        data: newTrade,
        timestamp: '2023-01-01T00:00:00Z',
      },
      sendMessage: mockSendMessage,
      isConnected: true,
      connect: vi.fn(),
      disconnect: vi.fn(),
    });

    renderWithRouter(<WhaleFinderPage />);

    expect(screen.getByText('Trades count: 1')).toBeInTheDocument();
  });
});
