/**
 * Moving Average Toggle - Clean, minimal toggle component for moving average
 * This component provides a simple interface for enabling/disabling moving average
 */

import React from 'react';
import { useMovingAverage, getMovingAveragePresets } from '../hooks/useMovingAverage';
import { CandlestickData } from '../types';
import { MovingAverageData } from '../utils/movingAverageUtils';

interface MovingAverageToggleProps {
  chartData: CandlestickData[];
  onMovingAverageChange?: (enabled: boolean, data: MovingAverageData[]) => void;
  className?: string;
}

export const MovingAverageToggle: React.FC<MovingAverageToggleProps> = ({
  chartData,
  onMovingAverageChange,
  className = '',
}) => {
  const { state, actions, data, label } = useMovingAverage(chartData);
  const presets = getMovingAveragePresets();

  // Notify parent when moving average state changes
  React.useEffect(() => {
    onMovingAverageChange?.(state.enabled, data);
  }, [state.enabled, data, onMovingAverageChange]);

  return (
    <div className={`flex items-center space-x-2 ${className}`}>
      {/* Toggle Button */}
      <button
        onClick={actions.toggle}
        className={`px-3 py-1 text-xs rounded-md transition-colors ${
          state.enabled ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
        }`}
        title={state.enabled ? `Disable ${label}` : `Enable ${label}`}
      >
        MA
      </button>

      {/* Period Selector (only shown when enabled) */}
      {state.enabled && (
        <select
          value={state.period}
          onChange={e => actions.setPeriod(parseInt(e.target.value))}
          className="px-2 py-1 text-xs rounded-md bg-muted text-muted-foreground hover:bg-muted/80 border border-border focus:outline-none focus:ring-2 focus:ring-primary/20"
        >
          {presets.map(preset => (
            <option key={`${preset.type}-${preset.period}`} value={preset.period}>
              {preset.label}
            </option>
          ))}
        </select>
      )}

      {/* Type Selector (only shown when enabled) */}
      {state.enabled && (
        <select
          value={state.type}
          onChange={e => actions.setType(e.target.value as 'simple' | 'exponential')}
          className="px-2 py-1 text-xs rounded-md bg-muted text-muted-foreground hover:bg-muted/80 border border-border focus:outline-none focus:ring-2 focus:ring-primary/20"
        >
          <option value="simple">SMA</option>
          <option value="exponential">EMA</option>
        </select>
      )}
    </div>
  );
};
