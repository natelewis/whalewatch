import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import StockChart from '../components/StockChart';
import { PageHeader } from '../components/PageHeader';

export const AnalysisPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedSymbol, setSelectedSymbol] = useState<string>(() => {
    // Get symbol from URL params, fallback to empty string
    const symbolFromUrl = searchParams.get('symbol');
    return symbolFromUrl || '';
  });

  const handleSymbolChange = (symbol: string) => {
    setSelectedSymbol(symbol);
    // Update URL query parameters when symbol changes
    const newSearchParams = new URLSearchParams(searchParams);
    if (symbol.trim()) {
      newSearchParams.set('symbol', symbol);
    } else {
      newSearchParams.delete('symbol');
    }
    setSearchParams(newSearchParams);
  };

  // Update symbol when URL params change
  useEffect(() => {
    const symbolFromUrl = searchParams.get('symbol');
    if (symbolFromUrl && symbolFromUrl !== selectedSymbol) {
      setSelectedSymbol(symbolFromUrl);
    }
  }, [searchParams, selectedSymbol]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Analysis"
        subtitle="Analyze stock charts and market movements"
        selectedSymbol={selectedSymbol}
        onSymbolChange={handleSymbolChange}
      />

      {/* Main Content */}
      <div className="h-[calc(100vh-200px)]">
        <div className="space-y-4">
          <StockChart symbol={selectedSymbol} onSymbolChange={handleSymbolChange} />
        </div>
      </div>
    </div>
  );
};
