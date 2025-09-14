import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { PageHeader } from '../../components/PageHeader';
import * as localStorageUtils from '../../utils/localStorage';

// Mock the localStorage utilities
vi.mock('../../utils/localStorage', () => ({
  getLocalStorageItem: vi.fn(),
  setLocalStorageItem: vi.fn(),
}));

const mockGetLocalStorageItem = localStorageUtils.getLocalStorageItem as ReturnType<typeof vi.fn>;
const mockSetLocalStorageItem = localStorageUtils.setLocalStorageItem as ReturnType<typeof vi.fn>;

describe('PageHeader', () => {
  const mockOnSymbolChange = vi.fn();

  beforeEach(() => {
    mockOnSymbolChange.mockClear();
    mockGetLocalStorageItem.mockClear();
    mockSetLocalStorageItem.mockClear();
  });

  it('renders with title and subtitle', () => {
    render(
      <PageHeader
        title="Test Page"
        subtitle="Test subtitle"
        selectedSymbol="AAPL"
        onSymbolChange={mockOnSymbolChange}
      />
    );

    expect(screen.getByText('Test Page')).toBeInTheDocument();
    expect(screen.getByText('Test subtitle')).toBeInTheDocument();
  });

  it('renders ticker selector by default', () => {
    render(
      <PageHeader
        title="Test Page"
        subtitle="Test subtitle"
        selectedSymbol="AAPL"
        onSymbolChange={mockOnSymbolChange}
      />
    );

    expect(screen.getByPlaceholderText('Enter ticker symbol')).toBeInTheDocument();
    expect(screen.getByDisplayValue('AAPL')).toBeInTheDocument();
  });

  it('can hide ticker selector', () => {
    render(
      <PageHeader
        title="Test Page"
        subtitle="Test subtitle"
        selectedSymbol="AAPL"
        onSymbolChange={mockOnSymbolChange}
        showTickerSelector={false}
      />
    );

    expect(screen.queryByPlaceholderText('Enter ticker symbol')).not.toBeInTheDocument();
  });

  it('loads saved symbol from localStorage on mount', () => {
    mockGetLocalStorageItem.mockReturnValue('TSLA');

    render(
      <PageHeader
        title="Test Page"
        subtitle="Test subtitle"
        selectedSymbol="AAPL"
        onSymbolChange={mockOnSymbolChange}
      />
    );

    expect(mockGetLocalStorageItem).toHaveBeenCalledWith('globalTickerSymbol', 'AAPL');
    expect(mockOnSymbolChange).toHaveBeenCalledWith('TSLA');
  });

  it('saves symbol to localStorage when it changes', async () => {
    const user = userEvent.setup();
    mockGetLocalStorageItem.mockReturnValue('AAPL');

    const { rerender } = render(
      <PageHeader
        title="Test Page"
        subtitle="Test subtitle"
        selectedSymbol="AAPL"
        onSymbolChange={mockOnSymbolChange}
      />
    );

    // Clear the initial calls
    mockSetLocalStorageItem.mockClear();

    const input = screen.getByPlaceholderText('Enter ticker symbol');
    const submitButton = screen.getByRole('button', { name: 'Analyze' });

    await user.clear(input);
    await user.type(input, 'TSLA');
    await user.click(submitButton);

    // Wait for the symbol change to propagate
    await waitFor(() => {
      expect(mockOnSymbolChange).toHaveBeenCalledWith('TSLA');
    });

    // Now rerender with the new symbol to trigger the useEffect
    rerender(
      <PageHeader
        title="Test Page"
        subtitle="Test subtitle"
        selectedSymbol="TSLA"
        onSymbolChange={mockOnSymbolChange}
      />
    );

    // The localStorage should be called with the new symbol
    expect(mockSetLocalStorageItem).toHaveBeenCalledWith('globalTickerSymbol', 'TSLA');
  });

  it('uses custom placeholder for ticker selector', () => {
    render(
      <PageHeader
        title="Test Page"
        subtitle="Test subtitle"
        selectedSymbol="AAPL"
        onSymbolChange={mockOnSymbolChange}
        tickerSelectorPlaceholder="Enter stock symbol"
      />
    );

    expect(screen.getByPlaceholderText('Enter stock symbol')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(
      <PageHeader
        title="Test Page"
        subtitle="Test subtitle"
        selectedSymbol="AAPL"
        onSymbolChange={mockOnSymbolChange}
        className="custom-header-class"
      />
    );

    expect(container.firstChild).toHaveClass('custom-header-class');
  });

  it('calls onSymbolChange when ticker selector changes symbol', async () => {
    const user = userEvent.setup();
    mockGetLocalStorageItem.mockReturnValue('AAPL');

    render(
      <PageHeader
        title="Test Page"
        subtitle="Test subtitle"
        selectedSymbol="AAPL"
        onSymbolChange={mockOnSymbolChange}
      />
    );

    const input = screen.getByPlaceholderText('Enter ticker symbol');
    const submitButton = screen.getByRole('button', { name: 'Analyze' });

    await user.clear(input);
    await user.type(input, 'TSLA');
    await user.click(submitButton);

    expect(mockOnSymbolChange).toHaveBeenCalledWith('TSLA');
  });

  it('does not load from localStorage if saved symbol matches current symbol', () => {
    mockGetLocalStorageItem.mockReturnValue('AAPL');

    render(
      <PageHeader
        title="Test Page"
        subtitle="Test subtitle"
        selectedSymbol="AAPL"
        onSymbolChange={mockOnSymbolChange}
      />
    );

    expect(mockOnSymbolChange).not.toHaveBeenCalled();
  });

  it('updates internal state when selectedSymbol prop changes', () => {
    const { rerender } = render(
      <PageHeader
        title="Test Page"
        subtitle="Test subtitle"
        selectedSymbol="AAPL"
        onSymbolChange={mockOnSymbolChange}
      />
    );

    expect(screen.getByDisplayValue('AAPL')).toBeInTheDocument();

    rerender(
      <PageHeader
        title="Test Page"
        subtitle="Test subtitle"
        selectedSymbol="TSLA"
        onSymbolChange={mockOnSymbolChange}
      />
    );

    expect(screen.getByDisplayValue('TSLA')).toBeInTheDocument();
  });

  it('handles localStorage errors gracefully', () => {
    // Mock console.warn to avoid test output noise
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    
    mockGetLocalStorageItem.mockImplementation(() => {
      throw new Error('localStorage error');
    });

    // Should not throw error and should render the component
    expect(() => {
      render(
        <PageHeader
          title="Test Page"
          subtitle="Test subtitle"
          selectedSymbol="AAPL"
          onSymbolChange={mockOnSymbolChange}
        />
      );
    }).not.toThrow();

    // Should render the component despite localStorage error
    expect(screen.getByText('Test Page')).toBeInTheDocument();
    
    consoleSpy.mockRestore();
  });
});
