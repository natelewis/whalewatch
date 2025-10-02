/**
 * Multi Moving Average Hook - Manages multiple moving averages simultaneously
 * This hook allows users to enable/disable multiple moving averages with different colors
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

export interface MovingAverageItem {
  id: string;
  config: MovingAverageConfig;
  enabled: boolean;
  color: string;
  label: string;
}

export interface MultiMovingAverageState {
  items: MovingAverageItem[];
}

export interface MultiMovingAverageActions {
  toggleItem: (id: string) => void;
  setItemEnabled: (id: string, enabled: boolean) => void;
  setItemColor: (id: string, color: string) => void;
  resetAll: () => void;
  enableAll: () => void;
  disableAll: () => void;
}

export interface MultiMovingAverageHook {
  state: MultiMovingAverageState;
  actions: MultiMovingAverageActions;
  enabledItems: MovingAverageItem[];
  enabledData: { item: MovingAverageItem; data: MovingAverageData[] }[];
}

// Predefined colors for moving averages
const MA_COLORS = [
  '#3b82f6', // Blue
  '#ef4444', // Red
  '#10b981', // Green
  '#f59e0b', // Amber
  '#8b5cf6', // Purple
  '#06b6d4', // Cyan
  '#84cc16', // Lime
  '#f97316', // Orange
];

const DEFAULT_STATE: MultiMovingAverageState = {
  items: DEFAULT_MOVING_AVERAGE_CONFIGS.map((config, index) => ({
    id: `${config.type}-${config.period}`,
    config,
    enabled: false,
    color: MA_COLORS[index % MA_COLORS.length],
    label: getMovingAverageLabel(config),
  })),
};

/**
 * Hook for managing multiple moving averages simultaneously
 * Completely self-contained and doesn't pollute core chart state
 */
export const useMultiMovingAverage = (chartData: CandlestickData[]): MultiMovingAverageHook => {
  const [state, setState] = useState<MultiMovingAverageState>(DEFAULT_STATE);

  // Get enabled items
  const enabledItems = useMemo(() => {
    return state.items.filter(item => item.enabled);
  }, [state.items]);

  // Calculate moving average data for enabled items
  const enabledData = useMemo(() => {
    return enabledItems.map(item => {
      const data = chartData.length >= item.config.period ? calculateMovingAverage(chartData, item.config) : [];

      return { item, data };
    });
  }, [enabledItems, chartData]);

  // Actions
  const toggleItem = useCallback((id: string) => {
    setState(prev => ({
      ...prev,
      items: prev.items.map(item => (item.id === id ? { ...item, enabled: !item.enabled } : item)),
    }));
  }, []);

  const setItemEnabled = useCallback((id: string, enabled: boolean) => {
    setState(prev => ({
      ...prev,
      items: prev.items.map(item => (item.id === id ? { ...item, enabled } : item)),
    }));
  }, []);

  const setItemColor = useCallback((id: string, color: string) => {
    setState(prev => ({
      ...prev,
      items: prev.items.map(item => (item.id === id ? { ...item, color } : item)),
    }));
  }, []);

  const resetAll = useCallback(() => {
    setState(DEFAULT_STATE);
  }, []);

  const enableAll = useCallback(() => {
    setState(prev => ({
      ...prev,
      items: prev.items.map(item => ({ ...item, enabled: true })),
    }));
  }, []);

  const disableAll = useCallback(() => {
    setState(prev => ({
      ...prev,
      items: prev.items.map(item => ({ ...item, enabled: false })),
    }));
  }, []);

  const actions: MultiMovingAverageActions = {
    toggleItem,
    setItemEnabled,
    setItemColor,
    resetAll,
    enableAll,
    disableAll,
  };

  return {
    state,
    actions,
    enabledItems,
    enabledData,
  };
};

/**
 * Get available colors for moving averages
 */
export const getAvailableColors = () => MA_COLORS;

/**
 * Get a color that's not currently in use
 */
export const getNextAvailableColor = (usedColors: string[]): string => {
  const available = MA_COLORS.filter(color => !usedColors.includes(color));
  return available.length > 0 ? available[0] : MA_COLORS[0];
};
