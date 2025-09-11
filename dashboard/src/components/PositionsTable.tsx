import React, { useState } from 'react';
import { AlpacaPosition } from '../types';
import { TrendingUp, TrendingDown, MoreHorizontal } from 'lucide-react';

interface PositionsTableProps {
  positions: AlpacaPosition[];
}

export const PositionsTable: React.FC<PositionsTableProps> = ({ positions }) => {
  const [selectedPosition, setSelectedPosition] = useState<AlpacaPosition | null>(null);

  const formatCurrency = (value: string): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(parseFloat(value));
  };

  const formatPercentage = (value: string): string => {
    return `${(parseFloat(value) * 100).toFixed(2)}%`;
  };

  const getPLColor = (pl: string): string => {
    const plValue = parseFloat(pl);
    if (plValue > 0) return 'text-green-500';
    if (plValue < 0) return 'text-red-500';
    return 'text-muted-foreground';
  };

  const getPLIcon = (pl: string) => {
    const plValue = parseFloat(pl);
    if (plValue > 0) return <TrendingUp className="h-4 w-4 text-green-500" />;
    if (plValue < 0) return <TrendingDown className="h-4 w-4 text-red-500" />;
    return null;
  };

  if (positions.length === 0) {
    return (
      <div className="bg-card p-8 rounded-lg border border-border text-center">
        <p className="text-muted-foreground">No open positions</p>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-lg border border-border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Symbol
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Qty
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Price
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Market Value
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                P/L
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                P/L %
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {positions.map((position) => (
              <tr key={position.asset_id} className="hover:bg-muted/50">
                <td className="px-4 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div className="text-sm font-medium text-foreground">
                      {position.symbol}
                    </div>
                    <div className="ml-2 text-xs text-muted-foreground">
                      {position.exchange}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-4 whitespace-nowrap text-sm text-foreground">
                  {position.qty}
                </td>
                <td className="px-4 py-4 whitespace-nowrap text-sm text-foreground">
                  {formatCurrency(position.current_price)}
                </td>
                <td className="px-4 py-4 whitespace-nowrap text-sm text-foreground">
                  {formatCurrency(position.market_value)}
                </td>
                <td className="px-4 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    {getPLIcon(position.unrealized_pl)}
                    <span className={`ml-1 text-sm font-medium ${getPLColor(position.unrealized_pl)}`}>
                      {formatCurrency(position.unrealized_pl)}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-4 whitespace-nowrap">
                  <span className={`text-sm font-medium ${getPLColor(position.unrealized_plpc)}`}>
                    {formatPercentage(position.unrealized_plpc)}
                  </span>
                </td>
                <td className="px-4 py-4 whitespace-nowrap text-sm">
                  <button
                    onClick={() => setSelectedPosition(position)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Position Actions Modal */}
      {selectedPosition && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-card p-6 rounded-lg border border-border max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-foreground mb-4">
              Position Actions - {selectedPosition.symbol}
            </h3>
            <div className="space-y-4">
              <button className="w-full px-4 py-2 bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90">
                Sell Position
              </button>
              <button className="w-full px-4 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/90">
                View Details
              </button>
              <button
                onClick={() => setSelectedPosition(null)}
                className="w-full px-4 py-2 border border-border rounded-md hover:bg-muted"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
