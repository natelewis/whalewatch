import React, { useState } from 'react';
import { StockChart } from '../components/StockChart';

export const AnalysisPage: React.FC = () => {
  const [selectedSymbol, setSelectedSymbol] = useState<string>('TSLA');

  const handleSymbolChange = (symbol: string) => {
    setSelectedSymbol(symbol);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Analysis</h1>
          <p className="text-muted-foreground">
            Analyze stock charts and market movements
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="h-[calc(100vh-200px)]">
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-foreground">Chart Analysis</h2>
          <StockChart
            symbol={selectedSymbol}
            onSymbolChange={handleSymbolChange}
          />
        </div>
      </div>
    </div>
  );
};
