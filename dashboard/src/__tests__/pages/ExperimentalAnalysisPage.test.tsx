import React from 'react';
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import ExperimentalAnalysisPage from '../../pages/ExperimentalAnalysisPage';

// Mock the D3StockChart component
vi.mock('../../components/D3StockChart', () => ({
  default: ({ symbol, onSymbolChange }: { symbol: string; onSymbolChange: (symbol: string) => void }) => (
    <div data-testid="d3-stock-chart">
      <div>D3 Stock Chart for {symbol}</div>
      <button onClick={() => onSymbolChange('AAPL')}>Change to AAPL</button>
    </div>
  ),
}));

// Mock the PageHeader component
vi.mock('../../components/PageHeader', () => ({
  PageHeader: ({ title, subtitle, selectedSymbol, onSymbolChange }: {
    title: string;
    subtitle: string;
    selectedSymbol: string;
    onSymbolChange: (symbol: string) => void;
  }) => (
    <div data-testid="page-header">
      <h1>{title}</h1>
      <p>{subtitle}</p>
      <div>Selected Symbol: {selectedSymbol}</div>
      <button onClick={() => onSymbolChange('MSFT')}>Change Symbol</button>
    </div>
  ),
}));

describe('ExperimentalAnalysisPage', () => {
  it('renders without crashing', () => {
    render(<ExperimentalAnalysisPage />);
    expect(screen.getByText('Experimental Analysis')).toBeInTheDocument();
  });

  it('displays the page header with correct title and subtitle', () => {
    render(<ExperimentalAnalysisPage />);
    
    expect(screen.getByText('Experimental Analysis')).toBeInTheDocument();
    expect(screen.getByText('D3.js based stock chart with enhanced functionality')).toBeInTheDocument();
  });

  it('displays the D3 stock chart component', () => {
    render(<ExperimentalAnalysisPage />);
    
    expect(screen.getByTestId('d3-stock-chart')).toBeInTheDocument();
    expect(screen.getByText('D3 Stock Chart for TSLA')).toBeInTheDocument();
  });

  it('initializes with TSLA as the default symbol', () => {
    render(<ExperimentalAnalysisPage />);
    
    expect(screen.getByText('Selected Symbol: TSLA')).toBeInTheDocument();
    expect(screen.getByText('D3 Stock Chart for TSLA')).toBeInTheDocument();
  });

  it('handles symbol change from PageHeader', () => {
    render(<ExperimentalAnalysisPage />);
    
    const changeButton = screen.getByText('Change Symbol');
    changeButton.click();
    
    expect(screen.getByText('Selected Symbol: MSFT')).toBeInTheDocument();
    expect(screen.getByText('D3 Stock Chart for MSFT')).toBeInTheDocument();
  });

  it('handles symbol change from D3StockChart', () => {
    render(<ExperimentalAnalysisPage />);
    
    const changeButton = screen.getByText('Change to AAPL');
    changeButton.click();
    
    expect(screen.getByText('Selected Symbol: AAPL')).toBeInTheDocument();
    expect(screen.getByText('D3 Stock Chart for AAPL')).toBeInTheDocument();
  });

  it('displays the main content section with correct heading', () => {
    render(<ExperimentalAnalysisPage />);
    
    expect(screen.getByText('D3 Stock Chart')).toBeInTheDocument();
  });

  it('has proper layout structure', () => {
    render(<ExperimentalAnalysisPage />);
    
    // Check for main container
    const mainContainer = screen.getByText('Experimental Analysis').closest('div');
    expect(mainContainer).toHaveClass('space-y-6');
    
    // Check for main content area
    const mainContent = screen.getByText('D3 Stock Chart').closest('div');
    expect(mainContent).toHaveClass('h-[calc(100vh-200px)]');
  });

  it('passes correct props to PageHeader', () => {
    render(<ExperimentalAnalysisPage />);
    
    const pageHeader = screen.getByTestId('page-header');
    expect(pageHeader).toBeInTheDocument();
    
    // The PageHeader component should receive the correct props
    expect(screen.getByText('Experimental Analysis')).toBeInTheDocument();
    expect(screen.getByText('D3.js based stock chart with enhanced functionality')).toBeInTheDocument();
  });

  it('passes correct props to D3StockChart', () => {
    render(<ExperimentalAnalysisPage />);
    
    const d3Chart = screen.getByTestId('d3-stock-chart');
    expect(d3Chart).toBeInTheDocument();
    
    // The D3StockChart should receive the symbol and onSymbolChange props
    expect(screen.getByText('D3 Stock Chart for TSLA')).toBeInTheDocument();
  });

  it('maintains state consistency between components', () => {
    render(<ExperimentalAnalysisPage />);
    
    // Change symbol from PageHeader
    const headerChangeButton = screen.getByText('Change Symbol');
    headerChangeButton.click();
    
    // Verify both components reflect the change
    expect(screen.getByText('Selected Symbol: MSFT')).toBeInTheDocument();
    expect(screen.getByText('D3 Stock Chart for MSFT')).toBeInTheDocument();
    
    // Change symbol from D3StockChart
    const chartChangeButton = screen.getByText('Change to AAPL');
    chartChangeButton.click();
    
    // Verify both components reflect the change
    expect(screen.getByText('Selected Symbol: AAPL')).toBeInTheDocument();
    expect(screen.getByText('D3 Stock Chart for AAPL')).toBeInTheDocument();
  });
});
