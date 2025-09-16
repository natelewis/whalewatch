import React, { useState } from 'react';
import D3StockChart from '../components/D3StockChart';
import { PageHeader } from '../components/PageHeader';

export const ExperimentalAnalysisPage: React.FC = () => {
  const [selectedSymbol, setSelectedSymbol] = useState<string>('TSLA');

  const handleSymbolChange = (symbol: string) => {
    setSelectedSymbol(symbol);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Experimental Analysis"
        subtitle="D3.js based stock chart with enhanced functionality"
        selectedSymbol={selectedSymbol}
        onSymbolChange={handleSymbolChange}
      />

      {/* Main Content */}
      <div className="h-[calc(100vh-200px)]">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-foreground">D3 Stock Chart</h2>
            <div className="text-sm text-muted-foreground">
              <span className="mr-4">🖱️ Drag to pan</span>
              <span className="mr-4">⌨️ Arrow keys to pan</span>
              <span className="mr-4">🏠 Home/End for edges</span>
              <span>🔄 Scroll to zoom</span>
            </div>
          </div>
          <D3StockChart symbol={selectedSymbol} onSymbolChange={handleSymbolChange} />
        </div>
      </div>
    </div>
  );
};
