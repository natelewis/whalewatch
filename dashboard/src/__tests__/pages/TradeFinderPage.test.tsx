import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { TradeFinderPage } from '../../pages/TradeFinderPage';
import { BrowserRouter } from 'react-router-dom';
import { apiService } from '../../services/apiService';

// Mock the apiService
vi.mock('../../services/apiService');
const mockApiService = apiService as jest.Mocked<typeof apiService>;

const renderWithRouter = (component: React.ReactElement) => {
  return render(<BrowserRouter>{component}</BrowserRouter>);
};

describe('TradeFinderPage', () => {
  const user = userEvent.setup();
  const mockTrades = [
    {
      ticker: 'O:TSLA251003C00150000',
      underlying_ticker: 'TSLA',
      timestamp: '2024-01-01T10:00:00Z',
      price: 5.5,
      size: 100,
      conditions: 'regular',
      option_type: 'call' as const,
      strike_price: 150,
      expiration_date: '2025-10-03',
      repeat_count: 1,
      volume: 100,
    },
    {
      ticker: 'O:TSLA251003P00120000',
      underlying_ticker: 'TSLA',
      timestamp: '2024-01-01T11:00:00Z',
      price: 3.2,
      size: 50,
      conditions: 'regular',
      option_type: 'put' as const,
      strike_price: 120,
      expiration_date: '2025-10-03',
      repeat_count: 2,
      volume: 150,
    },
  ];

  beforeEach(() => {
    mockApiService.getOptionsTrades.mockResolvedValue({
      symbol: 'TSLA',
      trades: mockTrades,
      hours: 24,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders the page title and description', () => {
    renderWithRouter(<TradeFinderPage />);

    expect(screen.getByRole('heading', { name: 'Trade Finder', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('View recent option trading activity for any symbol')).toBeInTheDocument();
  });

  it('renders the options trades section', () => {
    renderWithRouter(<TradeFinderPage />);

    expect(screen.getByRole('heading', { name: 'Option Trade Explorer', level: 2 })).toBeInTheDocument();
  });

  it('does not load options trades on mount when no symbol is selected', async () => {
    renderWithRouter(<TradeFinderPage />);

    // Wait a bit to ensure no API call is made
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(mockApiService.getOptionsTrades).not.toHaveBeenCalled();
  });

  it('displays trades data when symbol is entered', async () => {
    renderWithRouter(<TradeFinderPage />);

    // First enter a symbol to trigger the API call
    const tickerInput = screen.getByPlaceholderText('Enter ticker symbol');
    await user.type(tickerInput, 'TSLA');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(screen.getByText('2 trades')).toBeInTheDocument();

      // Test new column headers (no x column)
      expect(screen.getByText('Price')).toBeInTheDocument();
      expect(screen.getByText('Size')).toBeInTheDocument();

      // Test new columns
      expect(screen.getByText('Repeat')).toBeInTheDocument();
      expect(screen.getByText('Volume')).toBeInTheDocument();
      expect(screen.getByText('1')).toBeInTheDocument(); // repeat_count for first trade
      expect(screen.getByText('2')).toBeInTheDocument(); // repeat_count for second trade

      // Test price and P/C indicators (should show $5.50 with C in green box and $3.20 with P in red box)
      expect(screen.getByText('$5.50')).toBeInTheDocument();
      expect(screen.getByText('$3.20')).toBeInTheDocument();
      expect(screen.getByText('C')).toBeInTheDocument();
      expect(screen.getByText('P')).toBeInTheDocument();

      // Test volume values
      expect(screen.getByText('100')).toBeInTheDocument(); // Volume for first trade
      expect(screen.getByText('150')).toBeInTheDocument(); // Volume for second trade
    });
  });

  it('displays loading state when symbol is entered', async () => {
    mockApiService.getOptionsTrades.mockImplementation(() => new Promise(() => {})); // Never resolves

    renderWithRouter(<TradeFinderPage />);

    // Enter a symbol to trigger loading
    const tickerInput = screen.getByPlaceholderText('Enter ticker symbol');
    await user.type(tickerInput, 'TSLA');
    await user.keyboard('{Enter}');

    // Look for the loading spinner by its class
    const spinner = document.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  it('displays error state when symbol is entered', async () => {
    const errorMessage = 'Failed to load trades';
    mockApiService.getOptionsTrades.mockRejectedValue(new Error(errorMessage));

    renderWithRouter(<TradeFinderPage />);

    // Enter a symbol to trigger the error
    const tickerInput = screen.getByPlaceholderText('Enter ticker symbol');
    await user.type(tickerInput, 'TSLA');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(screen.getByText(`Failed to load trades`)).toBeInTheDocument();
    });
  });

  it('displays empty state when no trades found', async () => {
    mockApiService.getOptionsTrades.mockResolvedValue({
      symbol: 'TSLA',
      trades: [],
      hours: 24,
    });

    renderWithRouter(<TradeFinderPage />);

    // Enter a symbol to trigger the API call
    const tickerInput = screen.getByPlaceholderText('Enter ticker symbol');
    await user.type(tickerInput, 'TSLA');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(screen.getByText(/No option trades found for TSLA on/)).toBeInTheDocument();
    });
  });
});
