import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import D3StockChart from '../../components/D3StockChart';
import { useChartData } from '../../hooks/useChartData';
import { useChartWebSocket } from '../../hooks/useChartWebSocket';

// Mock the hooks
vi.mock('../../hooks/useChartData');
vi.mock('../../hooks/useChartWebSocket');

// Mock D3
vi.mock('d3', () => ({
  select: vi.fn(() => ({
    selectAll: vi.fn(() => ({
      remove: vi.fn(),
    })),
    append: vi.fn(() => ({
      attr: vi.fn().mockReturnThis(),
      style: vi.fn().mockReturnThis(),
      call: vi.fn().mockReturnThis(),
      on: vi.fn().mockReturnThis(),
      datum: vi.fn().mockReturnThis(),
    })),
    call: vi.fn().mockReturnThis(),
  })),
  scaleTime: vi.fn(() => ({
    domain: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    invert: vi.fn(),
  })),
  scaleLinear: vi.fn(() => ({
    domain: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    nice: vi.fn().mockReturnThis(),
  })),
  extent: vi.fn(() => [new Date('2023-01-01'), new Date('2023-01-02')]),
  min: vi.fn(() => 100),
  max: vi.fn(() => 200),
  line: vi.fn(() => ({
    x: vi.fn().mockReturnThis(),
    y: vi.fn().mockReturnThis(),
    curve: vi.fn().mockReturnThis(),
  })),
  area: vi.fn(() => ({
    x: vi.fn().mockReturnThis(),
    y0: vi.fn().mockReturnThis(),
    y1: vi.fn().mockReturnThis(),
    curve: vi.fn().mockReturnThis(),
  })),
  axisBottom: vi.fn(() => ({
    tickFormat: vi.fn().mockReturnThis(),
    tickSize: vi.fn().mockReturnThis(),
  })),
  axisRight: vi.fn(() => ({
    tickFormat: vi.fn().mockReturnThis(),
    tickSize: vi.fn().mockReturnThis(),
  })),
  axisLeft: vi.fn(() => ({
    tickFormat: vi.fn().mockReturnThis(),
    tickSize: vi.fn().mockReturnThis(),
  })),
  zoom: vi.fn(() => ({
    scaleExtent: vi.fn().mockReturnThis(),
    on: vi.fn().mockReturnThis(),
  })),
  bisector: vi.fn(() => ({
    left: vi.fn(() => 0),
  })),
  pointer: vi.fn(() => [100, 100]),
  timeFormat: vi.fn(() => vi.fn()),
  format: vi.fn(() => vi.fn()),
  curveLinear: 'linear',
}));

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

const mockChartData = [
  {
    time: '2023-01-01T00:00:00Z',
    open: 100,
    high: 110,
    low: 95,
    close: 105,
  },
  {
    time: '2023-01-02T00:00:00Z',
    open: 105,
    high: 115,
    low: 100,
    close: 110,
  },
];

const mockUseChartData = {
  chartData: mockChartData,
  dataRange: null,
  isLoading: false,
  error: null,
  loadChartData: vi.fn(),
  loadMoreDataLeft: vi.fn(),
  loadMoreDataRight: vi.fn(),
  updateChartWithLiveData: vi.fn(),
  clearError: vi.fn(),
  isLeftLoading: false,
  isRightLoading: false,
  panLeft: vi.fn(),
  panRight: vi.fn(),
  canPanLeft: false,
  canPanRight: false,
  viewState: null,
  updateViewState: vi.fn(),
};

const mockUseChartWebSocket = {
  subscribeToChartData: vi.fn(),
  unsubscribeFromChartData: vi.fn(),
};

describe('D3StockChart', () => {
  beforeEach(() => {
    vi.mocked(useChartData).mockReturnValue(mockUseChartData);
    vi.mocked(useChartWebSocket).mockReturnValue(mockUseChartWebSocket);
    localStorageMock.getItem.mockReturnValue('1h');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    render(<D3StockChart symbol="TSLA" onSymbolChange={vi.fn()} />);
    expect(screen.getByText('TSLA')).toBeInTheDocument();
  });

  it('displays loading state when data is loading', () => {
    vi.mocked(useChartData).mockReturnValue({
      ...mockUseChartData,
      isLoading: true,
    });

    render(<D3StockChart symbol="TSLA" onSymbolChange={vi.fn()} />);
    expect(screen.getByText('Loading chart data...')).toBeInTheDocument();
  });

  it('displays error state when there is an error', () => {
    vi.mocked(useChartData).mockReturnValue({
      ...mockUseChartData,
      error: 'Failed to load data',
    });

    render(<D3StockChart symbol="TSLA" onSymbolChange={vi.fn()} />);
    expect(screen.getByText('Failed to load data')).toBeInTheDocument();
    expect(screen.getByText('Retry')).toBeInTheDocument();
  });

  it('displays chart data when loaded', () => {
    render(<D3StockChart symbol="TSLA" onSymbolChange={vi.fn()} />);
    expect(screen.getByText('TSLA')).toBeInTheDocument();
    expect(screen.getByText('Data points: 2')).toBeInTheDocument();
  });

  it('allows timeframe selection', () => {
    render(<D3StockChart symbol="TSLA" onSymbolChange={vi.fn()} />);
    
    const timeframeButtons = screen.getAllByRole('button').filter(button => 
      button.textContent?.includes('1m') || 
      button.textContent?.includes('5m') || 
      button.textContent?.includes('1h')
    );
    
    expect(timeframeButtons.length).toBeGreaterThan(0);
    
    fireEvent.click(timeframeButtons[0]);
    expect(mockUseChartData.loadChartData).toHaveBeenCalled();
  });

  it('allows chart type selection', () => {
    render(<D3StockChart symbol="TSLA" onSymbolChange={vi.fn()} />);
    
    const chartTypeButtons = screen.getAllByRole('button').filter(button => 
      button.textContent?.includes('Candlestick') || 
      button.textContent?.includes('Line') || 
      button.textContent?.includes('Area')
    );
    
    expect(chartTypeButtons.length).toBeGreaterThan(0);
    
    fireEvent.click(chartTypeButtons[0]);
    // Chart type change should not trigger data reload
    expect(mockUseChartData.loadChartData).toHaveBeenCalledTimes(1); // Only initial load
  });

  it('toggles live mode', () => {
    render(<D3StockChart symbol="TSLA" onSymbolChange={vi.fn()} />);
    
    const liveButton = screen.getByText('Paused');
    fireEvent.click(liveButton);
    
    expect(screen.getByText('Live')).toBeInTheDocument();
    expect(mockUseChartWebSocket.subscribeToChartData).toHaveBeenCalled();
  });

  it('refreshes data when refresh button is clicked', () => {
    render(<D3StockChart symbol="TSLA" onSymbolChange={vi.fn()} />);
    
    const refreshButton = screen.getByTitle('Refresh data');
    fireEvent.click(refreshButton);
    
    expect(mockUseChartData.loadChartData).toHaveBeenCalledWith('TSLA', '1h');
  });

  it('resets zoom when reset button is clicked', () => {
    render(<D3StockChart symbol="TSLA" onSymbolChange={vi.fn()} />);
    
    const resetButton = screen.getByTitle('Reset zoom');
    fireEvent.click(resetButton);
    
    // Should call createChart to reset zoom
    expect(screen.getByText('Zoom: 1.00x')).toBeInTheDocument();
  });

  it('displays OHLC data in title when hovering', async () => {
    render(<D3StockChart symbol="TSLA" onSymbolChange={vi.fn()} />);
    
    // Simulate hover data
    const chartContainer = screen.getByRole('img', { hidden: true }) || screen.getByRole('img');
    if (chartContainer) {
      fireEvent.mouseMove(chartContainer, { clientX: 100, clientY: 100 });
      
      await waitFor(() => {
        // The hover data should be displayed in the title area
        expect(screen.getByText('O:')).toBeInTheDocument();
        expect(screen.getByText('H:')).toBeInTheDocument();
        expect(screen.getByText('L:')).toBeInTheDocument();
        expect(screen.getByText('C:')).toBeInTheDocument();
      });
    }
  });

  it('shows zoom and pan information in footer', () => {
    render(<D3StockChart symbol="TSLA" onSymbolChange={vi.fn()} />);
    
    expect(screen.getByText('Zoom: 1.00x')).toBeInTheDocument();
    expect(screen.getByText('Pan: 0, 0')).toBeInTheDocument();
  });

  it('shows live data indicator', () => {
    render(<D3StockChart symbol="TSLA" onSymbolChange={vi.fn()} />);
    
    expect(screen.getByText('Historical data')).toBeInTheDocument();
    expect(screen.getByText('(D3.js powered)')).toBeInTheDocument();
  });

  it('handles window resize', () => {
    render(<D3StockChart symbol="TSLA" onSymbolChange={vi.fn()} />);
    
    // Simulate window resize
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1200,
    });
    Object.defineProperty(window, 'innerHeight', {
      writable: true,
      configurable: true,
      value: 800,
    });
    
    fireEvent(window, new Event('resize'));
    
    // Chart should re-render with new dimensions
    expect(screen.getByText('TSLA')).toBeInTheDocument();
  });

  it('loads saved timeframe from localStorage', () => {
    localStorageMock.getItem.mockReturnValue('5m');
    
    render(<D3StockChart symbol="TSLA" onSymbolChange={vi.fn()} />);
    
    expect(localStorageMock.getItem).toHaveBeenCalledWith('chartTimeframe');
    expect(mockUseChartData.loadChartData).toHaveBeenCalledWith('TSLA', '5m');
  });

  it('saves timeframe to localStorage when changed', () => {
    render(<D3StockChart symbol="TSLA" onSymbolChange={vi.fn()} />);
    
    const timeframeButton = screen.getByText('5m');
    fireEvent.click(timeframeButton);
    
    expect(localStorageMock.setItem).toHaveBeenCalledWith('chartTimeframe', '5m');
  });

  it('subscribes to WebSocket when live mode is enabled', () => {
    const { rerender } = render(<D3StockChart symbol="TSLA" onSymbolChange={vi.fn()} />);
    
    // Enable live mode
    const liveButton = screen.getByText('Paused');
    fireEvent.click(liveButton);
    
    rerender(<D3StockChart symbol="TSLA" onSymbolChange={vi.fn()} />);
    
    expect(mockUseChartWebSocket.subscribeToChartData).toHaveBeenCalled();
  });

  it('unsubscribes from WebSocket when live mode is disabled', () => {
    const { rerender } = render(<D3StockChart symbol="TSLA" onSymbolChange={vi.fn()} />);
    
    // Enable then disable live mode
    const liveButton = screen.getByText('Paused');
    fireEvent.click(liveButton);
    fireEvent.click(screen.getByText('Live'));
    
    rerender(<D3StockChart symbol="TSLA" onSymbolChange={vi.fn()} />);
    
    expect(mockUseChartWebSocket.unsubscribeFromChartData).toHaveBeenCalled();
  });

  it('handles missing chart data gracefully', () => {
    (useChartData as jest.Mock).mockReturnValue({
      ...mockUseChartData,
      chartData: [],
    });

    render(<D3StockChart symbol="TSLA" onSymbolChange={vi.fn()} />);
    
    expect(screen.getByText('TSLA')).toBeInTheDocument();
    expect(screen.getByText('Data points: 0')).toBeInTheDocument();
  });

  it('displays correct chart type in controls', () => {
    render(<D3StockChart symbol="TSLA" onSymbolChange={vi.fn()} />);
    
    // Should show candlestick as default
    const candlestickButton = screen.getByText('Candlestick');
    expect(candlestickButton).toHaveClass('bg-primary');
  });

  it('updates chart when symbol changes', () => {
    const { rerender } = render(<D3StockChart symbol="TSLA" onSymbolChange={vi.fn()} />);
    
    rerender(<D3StockChart symbol="AAPL" onSymbolChange={vi.fn()} />);
    
    expect(screen.getByText('AAPL')).toBeInTheDocument();
    expect(mockUseChartData.loadChartData).toHaveBeenCalledWith('AAPL', '1h');
  });
});
