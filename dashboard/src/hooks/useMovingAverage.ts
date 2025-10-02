/**
 * Moving Average Hook - Self-contained moving average functionality
 * This hook manages moving average state independently without polluting the core chart state
 */

import { useState, useCallback, useMemo } from 'react';
import { CandlestickData } from '../types';
import {
  calculateMovingAverage,
  MovingAverageConfig,
  MovingAverageData,
  DEFAULT_MOVING_AVERAGE_CONFIGS,
  getMovingAverageLabel,
} from '../utils/movingAverageUtils';

export interface MovingAverageState {
  enabled: boolean;
  period: number;
  type: 'simple' | 'exponential';
}

export interface MovingAverageActions {
  setEnabled: (enabled: boolean) => void;
  setPeriod: (period: number) => void;
  setType: (type: 'simple' | 'exponential') => void;
  toggle: () => void;
  reset: () => void;
}

export interface MovingAverageHook {
  state: MovingAverageState;
  actions: MovingAverageActions;
  data: MovingAverageData[];
  label: string;
}

const DEFAULT_STATE: MovingAverageState = {
  enabled: false,
  period: 20,
  type: 'simple',
};

/**
 * Hook for managing moving average functionality
 * Completely self-contained and doesn't pollute core chart state
 */
export const useMovingAverage = (chartData: CandlestickData[]): MovingAverageHook => {
  const [state, setState] = useState<MovingAverageState>(DEFAULT_STATE);

  // Calculate moving average data based on current state
  const data = useMemo(() => {
    if (!state.enabled || chartData.length < state.period) {
      return [];
    }

    const config: MovingAverageConfig = {
      period: state.period,
      type: state.type,
    };

    return calculateMovingAverage(chartData, config);
  }, [chartData, state.enabled, state.period, state.type]);

  // Generate label for display
  const label = useMemo(() => {
    const config: MovingAverageConfig = {
      period: state.period,
      type: state.type,
    };
    return getMovingAverageLabel(config);
  }, [state.period, state.type]);

  // Actions
  const setEnabled = useCallback((enabled: boolean) => {
    setState(prev => ({ ...prev, enabled }));
  }, []);

  const setPeriod = useCallback((period: number) => {
    setState(prev => ({ ...prev, period: Math.max(1, period) }));
  }, []);

  const setType = useCallback((type: 'simple' | 'exponential') => {
    setState(prev => ({ ...prev, type }));
  }, []);

  const toggle = useCallback(() => {
    setState(prev => ({ ...prev, enabled: !prev.enabled }));
  }, []);

  const reset = useCallback(() => {
    setState(DEFAULT_STATE);
  }, []);

  const actions: MovingAverageActions = {
    setEnabled,
    setPeriod,
    setType,
    toggle,
    reset,
  };

  return {
    state,
    actions,
    data,
    label,
  };
};

/**
 * Get predefined moving average configurations for quick selection
 */
export const getMovingAveragePresets = () =>
  DEFAULT_MOVING_AVERAGE_CONFIGS.map(config => ({
    ...config,
    label: getMovingAverageLabel(config),
  }));
