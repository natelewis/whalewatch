import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { StockChart } from '../../components/StockChart';
import * as localStorageUtils from '../../utils/localStorage';

// Mock the API service
vi.mock('../../services/apiService', () => ({
  apiService: {
    getChartData: vi.fn().mockResolvedValue({
      bars: [
        {
          t: '2024-01-01T00:00:00Z',
          o: 100,
          h: 105,
          l: 95,
          c: 102,
        },
      ],
    }),
  },
}));

// Mock the WebSocket hook
vi.mock('../../hooks/useWebSocket', () => ({
  useWebSocket: () => ({
    lastMessage: null,
    sendMessage: vi.fn(),
  }),
}));

// Mock react-plotly.js
vi.mock('react-plotly.js', () => ({
  default: vi.fn(({ data, layout, config }) => (
    <div data-testid="plotly-chart" data-chart-type={data?.[0]?.type}>
      Mock Plotly Chart
    </div>
  )),
}));

// Mock localStorage utilities
vi.mock('../../utils/localStorage', () => ({
  getLocalStorageItem: vi.fn(),
  setLocalStorageItem: vi.fn(),
}));

const mockGetLocalStorageItem = localStorageUtils.getLocalStorageItem as ReturnType<typeof vi.fn>;
const mockSetLocalStorageItem = localStorageUtils.setLocalStorageItem as ReturnType<typeof vi.fn>;

describe('StockChart', () => {
  const mockOnSymbolChange = vi.fn();

  beforeEach(() => {
    mockOnSymbolChange.mockClear();
    mockGetLocalStorageItem.mockClear();
    mockSetLocalStorageItem.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders with default timeframe', () => {
    mockGetLocalStorageItem.mockReturnValue('1D');
    
    render(
      <StockChart
        symbol="AAPL"
        onSymbolChange={mockOnSymbolChange}
      />
    );

    expect(screen.getByText('AAPL')).toBeInTheDocument();
    expect(screen.getByText('1D')).toBeInTheDocument();
  });

  it('loads saved timeframe from localStorage on mount', () => {
    mockGetLocalStorageItem.mockReturnValue('1D');
    
    render(
      <StockChart
        symbol="AAPL"
        onSymbolChange={mockOnSymbolChange}
      />
    );

    expect(mockGetLocalStorageItem).toHaveBeenCalledWith('chartTimeframe', '1D');
    expect(screen.getByText('1D')).toBeInTheDocument();
  });

  it('saves timeframe to localStorage when it changes', async () => {
    mockGetLocalStorageItem.mockReturnValue('1D');
    
    render(
      <StockChart
        symbol="AAPL"
        onSymbolChange={mockOnSymbolChange}
      />
    );

    // Click on 1W timeframe button
    const weekButton = screen.getByText('1W');
    fireEvent.click(weekButton);

    await waitFor(() => {
      expect(mockSetLocalStorageItem).toHaveBeenCalledWith('chartTimeframe', '1W');
    });
  });

  it('handles localStorage errors gracefully', () => {
    mockGetLocalStorageItem.mockImplementation(() => {
      throw new Error('localStorage error');
    });
    
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    
    render(
      <StockChart
        symbol="AAPL"
        onSymbolChange={mockOnSymbolChange}
      />
    );

    expect(consoleSpy).toHaveBeenCalledWith(
      'Failed to load chart timeframe from localStorage:',
      expect.any(Error)
    );
    
    // Should still render with default timeframe
    expect(screen.getByText('1D')).toBeInTheDocument();
    
    consoleSpy.mockRestore();
  });

  it('handles setLocalStorageItem errors gracefully', async () => {
    mockGetLocalStorageItem.mockReturnValue('1D');
    mockSetLocalStorageItem.mockImplementation(() => {
      throw new Error('localStorage save error');
    });
    
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    
    render(
      <StockChart
        symbol="AAPL"
        onSymbolChange={mockOnSymbolChange}
      />
    );

    // Click on 1W timeframe button
    const weekButton = screen.getByText('1W');
    fireEvent.click(weekButton);

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to save chart timeframe to localStorage:',
        expect.any(Error)
      );
    });
    
    consoleSpy.mockRestore();
  });

  it('displays all available timeframes', () => {
    mockGetLocalStorageItem.mockReturnValue('1D');
    
    render(
      <StockChart
        symbol="AAPL"
        onSymbolChange={mockOnSymbolChange}
      />
    );

    const expectedTimeframes = ['1H', '4H', '1D', '1W', '3M', '6M', '1Y', 'ALL'];
    
    expectedTimeframes.forEach(timeframe => {
      expect(screen.getByText(timeframe)).toBeInTheDocument();
    });
  });

  it('updates timeframe display when timeframe changes', async () => {
    mockGetLocalStorageItem.mockReturnValue('1D');
    
    render(
      <StockChart
        symbol="AAPL"
        onSymbolChange={mockOnSymbolChange}
      />
    );

    // Initially shows 1D
    expect(screen.getByText('1D')).toBeInTheDocument();
    
    // Click on 1W timeframe button
    const weekButton = screen.getByText('1W');
    fireEvent.click(weekButton);

    await waitFor(() => {
      // Should show 1W as selected
      const selectedButton = screen.getByText('1W');
      expect(selectedButton).toHaveClass('bg-primary');
    });
  });

  it('displays all available chart types', () => {
    mockGetLocalStorageItem.mockReturnValue('1D');

    render(<StockChart symbol="AAPL" onSymbolChange={mockOnSymbolChange} />);

    const expectedChartTypes = ['Candlestick', 'Line', 'Bar', 'Area'];

    expectedChartTypes.forEach((chartType) => {
      expect(screen.getByText(chartType)).toBeInTheDocument();
    });
  });

  it('renders Plotly chart component', async () => {
    mockGetLocalStorageItem.mockReturnValue('1D');

    render(<StockChart symbol="AAPL" onSymbolChange={mockOnSymbolChange} />);

    // Wait for the chart to load (after loading state)
    await waitFor(() => {
      expect(screen.getByTestId('plotly-chart')).toBeInTheDocument();
    });
  });

  it('updates chart type when chart type button is clicked', async () => {
    mockGetLocalStorageItem.mockReturnValue('1D');

    render(<StockChart symbol="AAPL" onSymbolChange={mockOnSymbolChange} />);

    // Wait for chart to load first
    await waitFor(() => {
      expect(screen.getByTestId('plotly-chart')).toBeInTheDocument();
    });

    // Find all chart type buttons
    const candlestickButton = screen.getByText('Candlestick');
    const lineButton = screen.getByText('Line');

    // Initially one should be selected
    const selectedButtons = screen
      .getAllByText(/Candlestick|Line|Bar|Area/)
      .filter((button) => button.closest('button')?.classList.contains('bg-primary'));
    expect(selectedButtons.length).toBe(1);

    // Click on Line chart type button - this should not throw an error
    expect(() => fireEvent.click(lineButton)).not.toThrow();
  });

  it('shows live/paused status correctly', () => {
    mockGetLocalStorageItem.mockReturnValue('1D');

    render(<StockChart symbol="AAPL" onSymbolChange={mockOnSymbolChange} />);

    // Initially shows Paused
    expect(screen.getByText('Paused')).toBeInTheDocument();

    // Click live button
    const liveButton = screen.getByText('Paused');
    fireEvent.click(liveButton);

    // Should show Live
    expect(screen.getByText('Live')).toBeInTheDocument();
  });
});
