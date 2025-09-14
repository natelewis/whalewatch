import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { TickerSelector } from '../../components/TickerSelector';

describe('TickerSelector', () => {
  const mockOnSymbolChange = vi.fn();

  beforeEach(() => {
    mockOnSymbolChange.mockClear();
  });

  it('renders with default props', () => {
    render(
      <TickerSelector
        selectedSymbol="AAPL"
        onSymbolChange={mockOnSymbolChange}
      />
    );

    expect(screen.getByPlaceholderText('Enter ticker symbol')).toBeInTheDocument();
    expect(screen.getByDisplayValue('AAPL')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Analyze' })).toBeInTheDocument();
  });

  it('renders with custom props', () => {
    render(
      <TickerSelector
        selectedSymbol="TSLA"
        onSymbolChange={mockOnSymbolChange}
        placeholder="Enter stock symbol"
        showLabel={true}
        label="Stock Symbol"
        className="custom-class"
      />
    );

    expect(screen.getByPlaceholderText('Enter stock symbol')).toBeInTheDocument();
    expect(screen.getByText('Stock Symbol')).toBeInTheDocument();
    expect(screen.getByDisplayValue('TSLA')).toBeInTheDocument();
  });

  it('calls onSymbolChange when valid symbol is submitted', async () => {
    const user = userEvent.setup();
    render(
      <TickerSelector
        selectedSymbol=""
        onSymbolChange={mockOnSymbolChange}
      />
    );

    const input = screen.getByPlaceholderText('Enter ticker symbol');
    const submitButton = screen.getByRole('button', { name: 'Analyze' });

    await user.type(input, 'AAPL');
    await user.click(submitButton);

    expect(mockOnSymbolChange).toHaveBeenCalledWith('AAPL');
  });

  it('shows error for invalid symbol format', async () => {
    const user = userEvent.setup();
    render(
      <TickerSelector
        selectedSymbol=""
        onSymbolChange={mockOnSymbolChange}
      />
    );

    const input = screen.getByPlaceholderText('Enter ticker symbol');
    const submitButton = screen.getByRole('button', { name: 'Analyze' });

    await user.type(input, '123');
    await user.click(submitButton);

    expect(screen.getByText('Invalid format (1-5 letters only)')).toBeInTheDocument();
    expect(mockOnSymbolChange).not.toHaveBeenCalled();
  });

  it('shows error for empty symbol', async () => {
    const user = userEvent.setup();
    render(
      <TickerSelector
        selectedSymbol=""
        onSymbolChange={mockOnSymbolChange}
      />
    );

    const submitButton = screen.getByRole('button', { name: 'Analyze' });
    await user.click(submitButton);

    expect(screen.getByText('Please enter a ticker symbol')).toBeInTheDocument();
    expect(mockOnSymbolChange).not.toHaveBeenCalled();
  });

  it('shows real-time validation feedback', async () => {
    const user = userEvent.setup();
    render(
      <TickerSelector
        selectedSymbol=""
        onSymbolChange={mockOnSymbolChange}
      />
    );

    const input = screen.getByPlaceholderText('Enter ticker symbol');

    await user.type(input, '123');
    await waitFor(() => {
      expect(screen.getByText('Invalid format (1-5 letters only)')).toBeInTheDocument();
    });
  });

  it('clears error when user starts typing valid input', async () => {
    const user = userEvent.setup();
    render(
      <TickerSelector
        selectedSymbol=""
        onSymbolChange={mockOnSymbolChange}
      />
    );

    const input = screen.getByPlaceholderText('Enter ticker symbol');
    const submitButton = screen.getByRole('button', { name: 'Analyze' });

    // First, create an error
    await user.type(input, '123');
    await user.click(submitButton);
    expect(screen.getByText('Invalid format (1-5 letters only)')).toBeInTheDocument();

    // Then type valid input
    await user.clear(input);
    await user.type(input, 'AAPL');
    await waitFor(() => {
      expect(screen.queryByText('Invalid ticker symbol (1-5 letters only)')).not.toBeInTheDocument();
    });
  });

  it('converts input to uppercase', async () => {
    const user = userEvent.setup();
    render(
      <TickerSelector
        selectedSymbol=""
        onSymbolChange={mockOnSymbolChange}
      />
    );

    const input = screen.getByPlaceholderText('Enter ticker symbol');

    await user.type(input, 'aapl');
    expect(screen.getByDisplayValue('AAPL')).toBeInTheDocument();
  });

  it('limits input to 5 characters', () => {
    render(
      <TickerSelector
        selectedSymbol=""
        onSymbolChange={mockOnSymbolChange}
      />
    );

    const input = screen.getByPlaceholderText('Enter ticker symbol');
    expect(input).toHaveAttribute('maxLength', '5');
  });

  it('shows clear button when input has value', () => {
    render(
      <TickerSelector
        selectedSymbol="AAPL"
        onSymbolChange={mockOnSymbolChange}
      />
    );

    expect(screen.getByRole('button', { name: '' })).toBeInTheDocument(); // Clear button
  });

  it('clears input when clear button is clicked', async () => {
    const user = userEvent.setup();
    render(
      <TickerSelector
        selectedSymbol="AAPL"
        onSymbolChange={mockOnSymbolChange}
      />
    );

    const clearButton = screen.getByRole('button', { name: '' });
    await user.click(clearButton);

    expect(screen.getByDisplayValue('')).toBeInTheDocument();
  });

  it('disables submit button when there is an error', async () => {
    const user = userEvent.setup();
    render(
      <TickerSelector
        selectedSymbol=""
        onSymbolChange={mockOnSymbolChange}
      />
    );

    const input = screen.getByPlaceholderText('Enter ticker symbol');
    const submitButton = screen.getByRole('button', { name: 'Analyze' });

    await user.type(input, '123');
    await waitFor(() => {
      expect(submitButton).toBeDisabled();
    });
  });

  it('does not call onSymbolChange if symbol has not changed', async () => {
    const user = userEvent.setup();
    render(
      <TickerSelector
        selectedSymbol="AAPL"
        onSymbolChange={mockOnSymbolChange}
      />
    );

    const input = screen.getByPlaceholderText('Enter ticker symbol');
    const submitButton = screen.getByRole('button', { name: 'Analyze' });

    // Input is already AAPL, so submitting should not call onSymbolChange
    await user.click(submitButton);

    expect(mockOnSymbolChange).not.toHaveBeenCalled();
  });

  it('updates input when selectedSymbol prop changes', () => {
    const { rerender } = render(
      <TickerSelector
        selectedSymbol="AAPL"
        onSymbolChange={mockOnSymbolChange}
      />
    );

    expect(screen.getByDisplayValue('AAPL')).toBeInTheDocument();

    rerender(
      <TickerSelector
        selectedSymbol="TSLA"
        onSymbolChange={mockOnSymbolChange}
      />
    );

    expect(screen.getByDisplayValue('TSLA')).toBeInTheDocument();
  });
});
