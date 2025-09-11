import React from 'react';
import { render, screen } from '@testing-library/react';
import { AnalysisPage } from '../../pages/AnalysisPage';
import { BrowserRouter } from 'react-router-dom';

// Mock the StockChart component
jest.mock('../../components/StockChart', () => ({
  StockChart: ({ symbol, onSymbolChange }: { symbol: string; onSymbolChange: (symbol: string) => void }) => (
    <div data-testid="stock-chart">
      <span>Chart for {symbol}</span>
      <button onClick={() => onSymbolChange('AAPL')}>Change to AAPL</button>
    </div>
  ),
}));

const renderWithRouter = (component: React.ReactElement) => {
  return render(
    <BrowserRouter>
      {component}
    </BrowserRouter>
  );
};

describe('AnalysisPage', () => {
  it('renders the page title and description', () => {
    renderWithRouter(<AnalysisPage />);
    
    expect(screen.getByText('Analysis')).toBeInTheDocument();
    expect(screen.getByText('Analyze stock charts and market movements')).toBeInTheDocument();
  });

  it('renders the chart analysis section', () => {
    renderWithRouter(<AnalysisPage />);
    
    expect(screen.getByText('Chart Analysis')).toBeInTheDocument();
    expect(screen.getByTestId('stock-chart')).toBeInTheDocument();
  });

  it('displays the default symbol in the chart', () => {
    renderWithRouter(<AnalysisPage />);
    
    expect(screen.getByText('Chart for TSLA')).toBeInTheDocument();
  });

  it('handles symbol change', () => {
    renderWithRouter(<AnalysisPage />);
    
    const changeButton = screen.getByText('Change to AAPL');
    changeButton.click();
    
    expect(screen.getByText('Chart for AAPL')).toBeInTheDocument();
  });
});
