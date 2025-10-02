/**
 * Multi Technical Indicators Selector - Unified interface for multiple indicator types
 * This component provides a clean interface for selecting multiple technical indicators
 */

import React, { useState } from 'react';
import { useTechnicalIndicators, getAvailableColors, getIndicatorTypeLabel } from '../hooks/useTechnicalIndicators';
import { CandlestickData } from '../types';
import { IndicatorItem, IndicatorType } from '../hooks/useTechnicalIndicators';

interface MultiTechnicalIndicatorsSelectorProps {
  chartData: CandlestickData[];
  onIndicatorsChange?: (enabledData: any[]) => void;
  className?: string;
  compact?: boolean; // Show compact version for toolbar
}

export const MultiTechnicalIndicatorsSelector: React.FC<MultiTechnicalIndicatorsSelectorProps> = ({
  chartData,
  onIndicatorsChange,
  className = '',
  compact = false,
}) => {
  const { state, actions, enabledData } = useTechnicalIndicators(chartData);
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedType, setSelectedType] = useState<IndicatorType>('moving_average');
  const availableColors = getAvailableColors();

  // Notify parent when indicators change
  React.useEffect(() => {
    onIndicatorsChange?.(enabledData);
  }, [enabledData, onIndicatorsChange]);

  // Group items by type for better organization
  const itemsByType = React.useMemo(() => {
    const groups: Record<IndicatorType, IndicatorItem[]> = {
      moving_average: [],
      macd: [],
    };

    state.items.forEach(item => {
      groups[item.type].push(item);
    });

    return groups;
  }, [state.items]);

  if (compact) {
    return (
      <div className={`relative ${className}`}>
        {/* Compact Toggle Button */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className={`px-3 py-1 text-xs rounded-md transition-colors ${
            enabledData.length > 0
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:bg-muted/80'
          }`}
          title={`${enabledData.length} Technical Indicator${enabledData.length !== 1 ? 's' : ''} enabled`}
        >
          Indicators ({enabledData.length})
        </button>

        {/* Dropdown Menu */}
        {isExpanded && (
          <div className="absolute top-full left-0 mt-1 w-80 bg-background border border-border rounded-md shadow-lg z-50 p-3">
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-foreground">Technical Indicators</h3>
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

            {/* Moving Averages Section */}
            <div className="space-y-2 mb-4">
              <h4 className="text-xs font-medium text-foreground">Moving Averages</h4>
              <div className="space-y-1">
                {itemsByType.moving_average.map(item => (
                  <div key={item.id} className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id={item.id}
                      checked={item.enabled}
                      onChange={() => actions.toggleItem(item.id)}
                      className="w-3 h-3 text-primary bg-background border-border rounded focus:ring-primary focus:ring-1"
                    />
                    <div className="w-3 h-3 rounded border border-border" style={{ backgroundColor: item.color }} />
                    <label htmlFor={item.id} className="text-xs text-foreground cursor-pointer flex-1">
                      {item.label}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            {/* MACD Section */}
            <div className="space-y-2">
              <h4 className="text-xs font-medium text-foreground">MACD</h4>
              <div className="space-y-1">
                {itemsByType.macd.map(item => (
                  <div key={item.id} className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id={item.id}
                      checked={item.enabled}
                      onChange={() => actions.toggleItem(item.id)}
                      className="w-3 h-3 text-primary bg-background border-border rounded focus:ring-primary focus:ring-1"
                    />
                    <div className="w-3 h-3 rounded border border-border" style={{ backgroundColor: item.color }} />
                    <label htmlFor={item.id} className="text-xs text-foreground cursor-pointer flex-1">
                      {item.label}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            {/* Summary */}
            {enabledData.length > 0 && (
              <div className="pt-2 mt-3 border-t border-border">
                <p className="text-xs text-muted-foreground">
                  {enabledData.length} indicator{enabledData.length !== 1 ? 's' : ''} enabled
                </p>
              </div>
            )}
          </div>
        )}

        {/* Click outside to close */}
        {isExpanded && <div className="fixed inset-0 z-40" onClick={() => setIsExpanded(false)} />}
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">Technical Indicators</h3>
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

      {/* Indicator Type Tabs */}
      <div className="flex space-x-1 border-b border-border">
        {(['moving_average', 'macd'] as IndicatorType[]).map(type => (
          <button
            key={type}
            onClick={() => setSelectedType(type)}
            className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
              selectedType === type
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {getIndicatorTypeLabel(type)}
          </button>
        ))}
      </div>

      {/* Moving Averages Section */}
      {selectedType === 'moving_average' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-medium text-foreground">Moving Averages</h4>
            <button
              onClick={() => {
                // Add a custom moving average
                const period = prompt('Enter period (e.g., 15):');
                const type = prompt('Enter type (simple or exponential):') as 'simple' | 'exponential';
                if (period && type && ['simple', 'exponential'].includes(type)) {
                  actions.addMovingAverage({
                    period: parseInt(period),
                    type,
                  });
                }
              }}
              className="px-2 py-1 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Add Custom
            </button>
          </div>

          <div className="space-y-2">
            {itemsByType.moving_average.map(item => (
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
                      className={`w-4 h-4 rounded border-2 ${
                        item.color === color ? 'border-foreground' : 'border-border'
                      }`}
                      style={{ backgroundColor: color }}
                      title={`Set color to ${color}`}
                    />
                  ))}
                </div>

                {/* Remove Button */}
                <button
                  onClick={() => actions.removeItem(item.id)}
                  className="px-2 py-1 text-xs rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  title="Remove indicator"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MACD Section */}
      {selectedType === 'macd' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-medium text-foreground">MACD</h4>
            <button
              onClick={() => {
                // Add a custom MACD
                const fastPeriod = prompt('Enter fast period (e.g., 12):');
                const slowPeriod = prompt('Enter slow period (e.g., 26):');
                const signalPeriod = prompt('Enter signal period (e.g., 9):');
                if (fastPeriod && slowPeriod && signalPeriod) {
                  actions.addMACD({
                    fastPeriod: parseInt(fastPeriod),
                    slowPeriod: parseInt(slowPeriod),
                    signalPeriod: parseInt(signalPeriod),
                  });
                }
              }}
              className="px-2 py-1 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Add Custom
            </button>
          </div>

          <div className="space-y-2">
            {itemsByType.macd.map(item => (
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
                      className={`w-4 h-4 rounded border-2 ${
                        item.color === color ? 'border-foreground' : 'border-border'
                      }`}
                      style={{ backgroundColor: color }}
                      title={`Set color to ${color}`}
                    />
                  ))}
                </div>

                {/* Remove Button */}
                <button
                  onClick={() => actions.removeItem(item.id)}
                  className="px-2 py-1 text-xs rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  title="Remove indicator"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary */}
      {enabledData.length > 0 && (
        <div className="pt-2 border-t border-border">
          <p className="text-xs text-muted-foreground">
            {enabledData.length} indicator{enabledData.length !== 1 ? 's' : ''} enabled
          </p>
        </div>
      )}
    </div>
  );
};

/**
 * Compact version for toolbar integration
 */
export const MultiTechnicalIndicatorsToggle: React.FC<
  Omit<MultiTechnicalIndicatorsSelectorProps, 'compact'>
> = props => {
  return <MultiTechnicalIndicatorsSelector {...props} compact={true} />;
};
