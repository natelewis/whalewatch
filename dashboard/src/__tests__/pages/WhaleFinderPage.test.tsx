import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { WhaleFinderPage } from '../../pages/WhaleFinderPage';
import { BrowserRouter } from 'react-router-dom';
import { apiService } from '../../services/apiService';
import { useWebSocket } from '../../hooks/useWebSocket';
import { WebSocketProvider } from '../../contexts/WebSocketContext';
import type { AlpacaOptionsTrade, AlpacaOptionsContract } from '@shared/types';

// Mock the apiService
vi.mock('../../services/apiService');
const mockApiService = apiService as jest.Mocked<typeof apiService>;

// Mock the useWebSocket hook
vi.mock('../../hooks/useWebSocket');
const mockUseWebSocket = useWebSocket as jest.MockedFunction<typeof useWebSocket>;

// Mock the WhaleWatchFeed component
vi.mock('../../components/WhaleWatchFeed', () => ({
  WhaleWatchFeed: ({
    contracts,
    selectedSymbol,
    onSymbolChange,
    isLoading,
    error,
  }: {
    contracts: unknown[];
    selectedSymbol: string;
    onSymbolChange: (symbol: string) => void;
    isLoading: boolean;
    error: string | null;
  }) => (
    <div data-testid="whale-watch-feed">
      <span>Feed for {selectedSymbol}</span>
      <span>Loading: {isLoading.toString()}</span>
      {error && <span>Error: {error}</span>}
      <span>Trades count: {contracts?.length || 0}</span>
      <button onClick={() => onSymbolChange('AAPL')}>Change to AAPL</button>
    </div>
  ),
}));

const renderWithRouter = (component: React.ReactElement) => {
  return render(
    <BrowserRouter>
      <WebSocketProvider>{component}</WebSocketProvider>
    </BrowserRouter>
  );
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
    mockApiService.getOptionsContracts.mockResolvedValue({
      symbol: 'TSLA',
      contracts: [],
      total_contracts: 0,
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

    expect(screen.getByText('Options Contracts')).toBeInTheDocument();
    expect(screen.getByText('Browse available options contracts for any symbol')).toBeInTheDocument();
  });

  it('renders the whale feed section', () => {
    renderWithRouter(<WhaleFinderPage />);

    expect(screen.getByText('Options Contracts Feed')).toBeInTheDocument();
    expect(screen.getByTestId('whale-watch-feed')).toBeInTheDocument();
  });

  it('loads options contracts on mount', async () => {
    renderWithRouter(<WhaleFinderPage />);

    await waitFor(() => {
      expect(mockApiService.getOptionsContracts).toHaveBeenCalledWith('TSLA');
    });
  });

  it('subscribes to WebSocket on mount', async () => {
    renderWithRouter(<WhaleFinderPage />);

    await waitFor(() => {
      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'subscribe',
          data: { channel: 'options_contract', symbol: 'TSLA' },
        })
      );
    });
  });

  it('handles symbol change', async () => {
    renderWithRouter(<WhaleFinderPage />);

    const changeButton = screen.getByText('Change to AAPL');
    changeButton.click();

    await waitFor(() => {
      expect(mockApiService.getOptionsContracts).toHaveBeenCalledWith('AAPL');
    });
  });

  it('displays loading state', () => {
    mockApiService.getOptionsContracts.mockImplementation(() => new Promise(() => {})); // Never resolves

    renderWithRouter(<WhaleFinderPage />);

    expect(screen.getByText('Loading: true')).toBeInTheDocument();
  });

  it('displays error state', async () => {
    const errorMessage = 'Failed to load contracts';
    mockApiService.getOptionsContracts.mockRejectedValue(new Error(errorMessage));

    renderWithRouter(<WhaleFinderPage />);

    await waitFor(() => {
      expect(screen.getByText(`Error: ${errorMessage}`)).toBeInTheDocument();
    });
  });

  it('updates contracts when WebSocket message is received', () => {
    const newContract = {
      id: '3',
      symbol: 'TSLA240115C00210000',
      underlying_symbol: 'TSLA',
      exercise_style: 'american',
      expiration_date: '2024-01-15',
      strike_price: 210,
      option_type: 'call' as const,
    };
    mockUseWebSocket.mockReturnValue({
      socket: null,
      lastMessage: {
        type: 'options_contract',
        data: newContract,
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
