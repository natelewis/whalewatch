/**
 * Multi Moving Average Selector - Checkbox-based interface for multiple MAs
 * This component provides a clean interface for selecting multiple moving averages
 */

import React, { useState } from 'react';
import { useMultiMovingAverage, getAvailableColors } from '../hooks/useMultiMovingAverage';
import { CandlestickData } from '../types';

interface MultiMovingAverageSelectorProps {
  chartData: CandlestickData[];
  onMovingAveragesChange?: (enabledData: any[]) => void;
  className?: string;
  compact?: boolean; // Show compact version for toolbar
}

export const MultiMovingAverageSelector: React.FC<MultiMovingAverageSelectorProps> = ({
  chartData,
  onMovingAveragesChange,
  className = '',
  compact = false,
}) => {
  const { state, actions, enabledData } = useMultiMovingAverage(chartData);
  const [isExpanded, setIsExpanded] = useState(false);
  const availableColors = getAvailableColors();

  // Notify parent when moving averages change
  React.useEffect(() => {
    onMovingAveragesChange?.(enabledData);
  }, [enabledData, onMovingAveragesChange]);

  if (compact) {
    return (
      <div className={`flex items-center space-x-2 ${className}`}>
        {/* Compact Toggle Button */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className={`px-3 py-1 text-xs rounded-md transition-colors ${
            enabledData.length > 0
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:bg-muted/80'
          }`}
          title={`${enabledData.length} Moving Average${enabledData.length !== 1 ? 's' : ''} enabled`}
        >
          MA ({enabledData.length})
        </button>

        {/* Quick Actions */}
        {enabledData.length > 0 && (
          <button
            onClick={actions.disableAll}
            className="px-2 py-1 text-xs rounded-md bg-muted text-muted-foreground hover:bg-muted/80"
            title="Disable all moving averages"
          >
            Clear
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">Moving Averages</h3>
        <div className="flex space-x-1">
          <button
            onClick={actions.enableAll}
            className="px-2 py-1 text-xs rounded-md bg-muted text-muted-foreground hover:bg-muted/80"
          >
            All
          </button>
          <button
            onClick={actions.disableAll}
            className="px-2 py-1 text-xs rounded-md bg-muted text-muted-foreground hover:bg-muted/80"
          >
            None
          </button>
        </div>
      </div>

      {/* Moving Average Items */}
      <div className="space-y-2">
        {state.items.map(item => (
          <div key={item.id} className="flex items-center space-x-3">
            {/* Checkbox */}
            <input
              type="checkbox"
              id={item.id}
              checked={item.enabled}
              onChange={() => actions.toggleItem(item.id)}
              className="w-4 h-4 text-primary bg-background border-border rounded focus:ring-primary focus:ring-2"
            />

            {/* Color Indicator */}
            <div className="w-4 h-4 rounded border border-border" style={{ backgroundColor: item.color }} />

            {/* Label */}
            <label htmlFor={item.id} className="flex-1 text-sm text-foreground cursor-pointer">
              {item.label}
            </label>

            {/* Color Picker */}
            <div className="flex space-x-1">
              {availableColors.slice(0, 6).map(color => (
                <button
                  key={color}
                  onClick={() => actions.setItemColor(item.id, color)}
                  className={`w-4 h-4 rounded border-2 ${item.color === color ? 'border-foreground' : 'border-border'}`}
                  style={{ backgroundColor: color }}
                  title={`Set color to ${color}`}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Summary */}
      {enabledData.length > 0 && (
        <div className="pt-2 border-t border-border">
          <p className="text-xs text-muted-foreground">
            {enabledData.length} moving average{enabledData.length !== 1 ? 's' : ''} enabled
          </p>
        </div>
      )}
    </div>
  );
};

/**
 * Compact version for toolbar integration
 */
export const MultiMovingAverageToggle: React.FC<Omit<MultiMovingAverageSelectorProps, 'compact'>> = props => {
  return <MultiMovingAverageSelector {...props} compact={true} />;
};
