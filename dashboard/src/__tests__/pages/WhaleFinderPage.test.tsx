import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { WhaleFinderPage } from '../../pages/WhaleFinderPage';
import { BrowserRouter } from 'react-router-dom';
import { apiService } from '../../services/apiService';
import { useWebSocket } from '../../hooks/useWebSocket';

// Mock the apiService
jest.mock('../../services/apiService', () => ({
  apiService: {
    getOptionsTrades: jest.fn(),
  },
}));

// Mock the useWebSocket hook
jest.mock('../../hooks/useWebSocket', () => ({
  useWebSocket: jest.fn(),
}));

// Mock the WhaleWatchFeed component
jest.mock('../../components/WhaleWatchFeed', () => ({
  WhaleWatchFeed: ({ 
    trades, 
    selectedSymbol, 
    onSymbolChange, 
    isLoading, 
    error, 
  }: { 
    trades: any[]; 
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

const mockApiService = apiService as jest.Mocked<typeof apiService>;
const mockUseWebSocket = useWebSocket as jest.MockedFunction<typeof useWebSocket>;

const renderWithRouter = (component: React.ReactElement) => {
  return render(
    <BrowserRouter>
      {component}
    </BrowserRouter>
  );
};

describe('WhaleFinderPage', () => {
  const mockSendMessage = jest.fn();
  const mockTrades = [
    { id: '1', symbol: 'TSLA', side: 'buy', size: 100 },
    { id: '2', symbol: 'TSLA', side: 'sell', size: 50 },
  ];

  beforeEach(() => {
    mockApiService.getOptionsTrades.mockResolvedValue({ trades: mockTrades });
    mockUseWebSocket.mockReturnValue({
      lastMessage: null,
      sendMessage: mockSendMessage,
      isConnected: true,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
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
    const newTrade = { id: '3', symbol: 'TSLA', side: 'buy', size: 200 };
    mockUseWebSocket.mockReturnValue({
      lastMessage: { type: 'options_whale', data: newTrade },
      sendMessage: mockSendMessage,
      isConnected: true,
    });
    
    renderWithRouter(<WhaleFinderPage />);
    
    expect(screen.getByText('Trades count: 1')).toBeInTheDocument();
  });
});
