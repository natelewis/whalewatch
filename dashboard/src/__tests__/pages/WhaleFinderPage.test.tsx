import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { WhaleFinderPage } from '../../pages/WhaleFinderPage';
import { BrowserRouter } from 'react-router-dom';
import { apiService } from '../../services/apiService';

// Mock the apiService
vi.mock('../../services/apiService');
const mockApiService = apiService as jest.Mocked<typeof apiService>;

const renderWithRouter = (component: React.ReactElement) => {
  return render(<BrowserRouter>{component}</BrowserRouter>);
};

describe('WhaleFinderPage', () => {
  const mockTrades = [
    {
      ticker: 'O:TSLA251003C00150000',
      underlying_ticker: 'TSLA',
      timestamp: '2024-01-01T10:00:00Z',
      price: 5.5,
      size: 100,
      conditions: 'regular',
      tape: 'C',
      sequence_number: 1,
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
      tape: 'C',
      sequence_number: 2,
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
    renderWithRouter(<WhaleFinderPage />);

    expect(screen.getByRole('heading', { name: 'Option Trades', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('View recent option trading activity for any symbol')).toBeInTheDocument();
  });

  it('renders the options trades section', () => {
    renderWithRouter(<WhaleFinderPage />);

    expect(screen.getByRole('heading', { name: 'Recent Option Trades', level: 2 })).toBeInTheDocument();
  });

  it('loads options trades on mount', async () => {
    renderWithRouter(<WhaleFinderPage />);

    await waitFor(() => {
      expect(mockApiService.getOptionsTrades).toHaveBeenCalledWith(
        'TSLA',
        expect.any(Date),
        expect.any(Date),
        1000,
        10,
        1000
      );
    });
  });

  it('displays trades data', async () => {
    renderWithRouter(<WhaleFinderPage />);

    await waitFor(() => {
      expect(screen.getByText('2 trades')).toBeInTheDocument();
      expect(screen.getByText('for TSLA')).toBeInTheDocument();

      // Test new column headers (no x column)
      expect(screen.getByText('Price')).toBeInTheDocument();
      expect(screen.getByText('Size')).toBeInTheDocument();

      // Test new columns
      expect(screen.getByText('Repeat')).toBeInTheDocument();
      expect(screen.getByText('Volume')).toBeInTheDocument();
      expect(screen.getByText('1')).toBeInTheDocument(); // repeat_count for first trade
      expect(screen.getByText('2')).toBeInTheDocument(); // repeat_count for second trade

      // Test price with P/C indicator (should show $5.50 C and $3.20 P)
      expect(screen.getByText('$5.50 C')).toBeInTheDocument();
      expect(screen.getByText('$3.20 P')).toBeInTheDocument();

      // Test volume values
      expect(screen.getByText('100')).toBeInTheDocument(); // Volume for first trade
      expect(screen.getByText('150')).toBeInTheDocument(); // Volume for second trade
    });
  });

  it('displays loading state', () => {
    mockApiService.getOptionsTrades.mockImplementation(() => new Promise(() => {})); // Never resolves

    renderWithRouter(<WhaleFinderPage />);

    // Look for the loading spinner by its class
    const spinner = document.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  it('displays error state', async () => {
    const errorMessage = 'Failed to load trades';
    mockApiService.getOptionsTrades.mockRejectedValue(new Error(errorMessage));

    renderWithRouter(<WhaleFinderPage />);

    await waitFor(() => {
      expect(screen.getByText(`Failed to load trades`)).toBeInTheDocument();
    });
  });

  it('displays empty state when no trades', async () => {
    mockApiService.getOptionsTrades.mockResolvedValue({
      symbol: 'TSLA',
      trades: [],
      hours: 24,
    });

    renderWithRouter(<WhaleFinderPage />);

    await waitFor(() => {
      expect(screen.getByText(/No option trades found for TSLA on/)).toBeInTheDocument();
    });
  });
});
