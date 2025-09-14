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

// Mock lightweight-charts
vi.mock('lightweight-charts', () => ({
  createChart: vi.fn(() => ({
    addCandlestickSeries: vi.fn(() => ({
      setData: vi.fn(),
      update: vi.fn(),
    })),
    applyOptions: vi.fn(),
    remove: vi.fn(),
  })),
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
    mockGetLocalStorageItem.mockReturnValue('1W');
    
    render(
      <StockChart
        symbol="AAPL"
        onSymbolChange={mockOnSymbolChange}
      />
    );

    expect(screen.getByText('AAPL')).toBeInTheDocument();
    expect(screen.getByText('1W')).toBeInTheDocument();
  });

  it('loads saved timeframe from localStorage on mount', () => {
    mockGetLocalStorageItem.mockReturnValue('1D');
    
    render(
      <StockChart
        symbol="AAPL"
        onSymbolChange={mockOnSymbolChange}
      />
    );

    expect(mockGetLocalStorageItem).toHaveBeenCalledWith('chartTimeframe', '1W');
    expect(screen.getByText('1D')).toBeInTheDocument();
  });

  it('saves timeframe to localStorage when it changes', async () => {
    mockGetLocalStorageItem.mockReturnValue('1W');
    
    render(
      <StockChart
        symbol="AAPL"
        onSymbolChange={mockOnSymbolChange}
      />
    );

    // Click on 1D timeframe button
    const dayButton = screen.getByText('1D');
    fireEvent.click(dayButton);

    await waitFor(() => {
      expect(mockSetLocalStorageItem).toHaveBeenCalledWith('chartTimeframe', '1D');
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
    expect(screen.getByText('1W')).toBeInTheDocument();
    
    consoleSpy.mockRestore();
  });

  it('handles setLocalStorageItem errors gracefully', async () => {
    mockGetLocalStorageItem.mockReturnValue('1W');
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

    // Click on 1D timeframe button
    const dayButton = screen.getByText('1D');
    fireEvent.click(dayButton);

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to save chart timeframe to localStorage:',
        expect.any(Error)
      );
    });
    
    consoleSpy.mockRestore();
  });

  it('displays all available timeframes', () => {
    mockGetLocalStorageItem.mockReturnValue('1W');
    
    render(
      <StockChart
        symbol="AAPL"
        onSymbolChange={mockOnSymbolChange}
      />
    );

    const expectedTimeframes = ['1m', '5m', '15m', '1H', '4H', '1D', '1W'];
    
    expectedTimeframes.forEach(timeframe => {
      expect(screen.getByText(timeframe)).toBeInTheDocument();
    });
  });

  it('updates timeframe display when timeframe changes', async () => {
    mockGetLocalStorageItem.mockReturnValue('1W');
    
    render(
      <StockChart
        symbol="AAPL"
        onSymbolChange={mockOnSymbolChange}
      />
    );

    // Initially shows 1W
    expect(screen.getByText('1W')).toBeInTheDocument();
    
    // Click on 1D timeframe button
    const dayButton = screen.getByText('1D');
    fireEvent.click(dayButton);

    await waitFor(() => {
      // Should show 1D as selected
      const selectedButton = screen.getByText('1D');
      expect(selectedButton).toHaveClass('bg-primary');
    });
  });
});
