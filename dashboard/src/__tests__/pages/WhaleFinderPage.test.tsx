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
      id: 'trade-1',
      symbol: 'TSLA',
      timestamp: '2024-01-01T10:00:00Z',
      price: 5.5,
      size: 100,
      side: 'buy' as const,
      conditions: ['regular'],
      exchange: 'OPRA',
      tape: 'C',
      contract: {
        symbol: 'TSLA240315C00150000',
        underlying_symbol: 'TSLA',
        exercise_style: 'american',
        expiration_date: '2024-03-15',
        strike_price: 150,
        option_type: 'call' as const,
      },
    },
    {
      id: 'trade-2',
      symbol: 'TSLA',
      timestamp: '2024-01-01T11:00:00Z',
      price: 3.2,
      size: 50,
      side: 'sell' as const,
      conditions: ['regular'],
      exchange: 'OPRA',
      tape: 'C',
      contract: {
        symbol: 'TSLA240315P00140000',
        underlying_symbol: 'TSLA',
        exercise_style: 'american',
        expiration_date: '2024-03-15',
        strike_price: 140,
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
      expect(mockApiService.getOptionsTrades).toHaveBeenCalledWith('TSLA', 24);
    });
  });

  it('displays trades data', async () => {
    renderWithRouter(<WhaleFinderPage />);

    await waitFor(() => {
      expect(screen.getByText('2 trades')).toBeInTheDocument();
      expect(screen.getByText('for TSLA')).toBeInTheDocument();
      expect(screen.getByText('TSLA240315C00150000')).toBeInTheDocument();
      expect(screen.getByText('TSLA240315P00140000')).toBeInTheDocument();
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
      expect(screen.getByText('No option trades found for TSLA in the last 24 hours')).toBeInTheDocument();
    });
  });
});
