import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { PositionsTable } from '../../components/PositionsTable';
import { AlpacaPosition } from '../../types';

const mockPositions: AlpacaPosition[] = [
  {
    asset_id: 'asset-1',
    symbol: 'AAPL',
    exchange: 'NASDAQ',
    asset_class: 'us_equity',
    qty: '10',
    side: 'long',
    market_value: '1500.00',
    cost_basis: '1400.00',
    unrealized_pl: '100.00',
    unrealized_plpc: '0.0714',
    unrealized_intraday_pl: '50.00',
    unrealized_intraday_plpc: '0.0333',
    current_price: '150.00',
    lastday_price: '145.00',
    change_today: '5.00'
  },
  {
    asset_id: 'asset-2',
    symbol: 'TSLA',
    exchange: 'NASDAQ',
    asset_class: 'us_equity',
    qty: '5',
    side: 'long',
    market_value: '1000.00',
    cost_basis: '1200.00',
    unrealized_pl: '-200.00',
    unrealized_plpc: '-0.1667',
    unrealized_intraday_pl: '-50.00',
    unrealized_intraday_plpc: '-0.05',
    current_price: '200.00',
    lastday_price: '210.00',
    change_today: '-10.00'
  }
];

describe('PositionsTable', () => {
  it('renders positions table with correct data', () => {
    render(<PositionsTable positions={mockPositions} />);

    expect(screen.getByText('AAPL')).toBeInTheDocument();
    expect(screen.getByText('TSLA')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('$150.00')).toBeInTheDocument();
    expect(screen.getByText('$200.00')).toBeInTheDocument();
  });

  it('displays profit/loss with correct colors', () => {
    render(<PositionsTable positions={mockPositions} />);

    // Positive P/L should be green
    const positivePL = screen.getByText('$100.00');
    expect(positivePL).toHaveClass('text-green-500');

    // Negative P/L should be red
    const negativePL = screen.getByText('-$200.00');
    expect(negativePL).toHaveClass('text-red-500');
  });

  it('shows correct P/L percentages', () => {
    render(<PositionsTable positions={mockPositions} />);

    expect(screen.getByText('7.14%')).toBeInTheDocument();
    expect(screen.getByText('-16.67%')).toBeInTheDocument();
  });

  it('displays exchange information', () => {
    render(<PositionsTable positions={mockPositions} />);

    expect(screen.getByText('NASDAQ')).toBeInTheDocument();
  });

  it('shows no positions message when empty', () => {
    render(<PositionsTable positions={[]} />);

    expect(screen.getByText('No open positions')).toBeInTheDocument();
  });

  it('opens position actions modal when more button is clicked', () => {
    render(<PositionsTable positions={mockPositions} />);

    const moreButtons = screen.getAllByRole('button');
    fireEvent.click(moreButtons[0]); // Click first more button

    expect(screen.getByText('Position Actions - AAPL')).toBeInTheDocument();
    expect(screen.getByText('Sell Position')).toBeInTheDocument();
    expect(screen.getByText('View Details')).toBeInTheDocument();
  });

  it('closes modal when cancel is clicked', () => {
    render(<PositionsTable positions={mockPositions} />);

    const moreButtons = screen.getAllByRole('button');
    fireEvent.click(moreButtons[0]); // Click first more button

    expect(screen.getByText('Position Actions - AAPL')).toBeInTheDocument();

    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);

    expect(screen.queryByText('Position Actions - AAPL')).not.toBeInTheDocument();
  });
});
