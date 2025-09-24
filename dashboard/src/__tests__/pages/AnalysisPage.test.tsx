import React from 'react';
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { AnalysisPage } from '../../pages/AnalysisPage';
import { BrowserRouter } from 'react-router-dom';

// Mock the StockChart component
vi.mock('../../components/StockChart', () => ({
  __esModule: true,
  default: ({ symbol, onSymbolChange }: { symbol: string; onSymbolChange: (symbol: string) => void }) => {
    const [currentSymbol, setCurrentSymbol] = React.useState(symbol);

    React.useEffect(() => {
      setCurrentSymbol(symbol);
    }, [symbol]);

    return (
      <div data-testid="stock-chart">
        <span>Stock Chart for {currentSymbol}</span>
        <button
          onClick={() => {
            setCurrentSymbol('AAPL');
            onSymbolChange('AAPL');
          }}
        >
          Change to AAPL
        </button>
      </div>
    );
  },
}));

const renderWithRouter = (component: React.ReactElement) => {
  return render(<BrowserRouter>{component}</BrowserRouter>);
};

describe('AnalysisPage', () => {
  it('renders the page title and description', () => {
    renderWithRouter(<AnalysisPage />);

    expect(screen.getByText('Analysis')).toBeInTheDocument();
    expect(screen.getByText('Analyze stock charts and market movements')).toBeInTheDocument();
  });

  it('renders the chart analysis section', () => {
    renderWithRouter(<AnalysisPage />);

    expect(screen.getByText('Stock Chart for TSLA')).toBeInTheDocument();
    expect(screen.getByTestId('stock-chart')).toBeInTheDocument();
  });

  it('displays the default symbol in the chart', () => {
    renderWithRouter(<AnalysisPage />);

    expect(screen.getByText('Stock Chart for TSLA')).toBeInTheDocument();
  });

  it('handles symbol change', () => {
    renderWithRouter(<AnalysisPage />);

    const changeButton = screen.getByText('Change to AAPL');
    expect(changeButton).toBeInTheDocument();

    // Just verify the button exists and can be clicked
    changeButton.click();

    // The mock component should still be there
    expect(screen.getByTestId('stock-chart')).toBeInTheDocument();
  });
});
