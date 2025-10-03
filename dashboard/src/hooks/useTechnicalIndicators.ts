/**
 * Unified Technical Indicators Hook - Manages multiple types of technical indicators
 * This hook supports Moving Averages, MACD, and can be extended for other indicators
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { CandlestickData } from '../types';
import {
  calculateMovingAverage,
  MovingAverageConfig,
  DEFAULT_MOVING_AVERAGE_CONFIGS,
  getMovingAverageLabel,
} from '../utils/movingAverageUtils';
import {
  calculateMACD,
  MACDConfig,
  MACDData,
  DEFAULT_MACD_CONFIG,
  getMACDLabel,
  getMACDPresets,
} from '../utils/macdUtils';
import { getLocalStorageItem, setLocalStorageItem } from '../utils/localStorage';
import { MovingAverageData } from '../types';

// Base indicator types
export type IndicatorType = 'moving_average' | 'macd';

export interface BaseIndicatorItem {
  id: string;
  type: IndicatorType;
  enabled: boolean;
  color: string;
  label: string;
}

export interface MovingAverageIndicatorItem extends BaseIndicatorItem {
  type: 'moving_average';
  config: MovingAverageConfig;
  data: MovingAverageData[];
}

export interface MACDIndicatorItem extends BaseIndicatorItem {
  type: 'macd';
  config: MACDConfig;
  data: MACDData[];
}

export type IndicatorItem = MovingAverageIndicatorItem | MACDIndicatorItem;

export interface TechnicalIndicatorsState {
  items: IndicatorItem[];
}

export interface TechnicalIndicatorsActions {
  toggleItem: (id: string) => void;
  setItemEnabled: (id: string, enabled: boolean) => void;
  setItemColor: (id: string, color: string) => void;
  addMovingAverage: (config: MovingAverageConfig) => void;
  addMACD: (config: MACDConfig) => void;
  removeItem: (id: string) => void;
  resetAll: () => void;
  enableAll: () => void;
  disableAll: () => void;
}

export interface TechnicalIndicatorsHook {
  state: TechnicalIndicatorsState;
  actions: TechnicalIndicatorsActions;
  enabledItems: IndicatorItem[];
}

/**
 * Calculates the data for a given indicator item.
 * @param item - The indicator item configuration.
 * @param chartData - The candlestick data to calculate from.
 * @returns The calculated indicator data.
 */
export const calculateIndicatorData = (
  item: IndicatorItem,
  chartData: CandlestickData[]
): MovingAverageData[] | MACDData[] => {
  if (item.type === 'moving_average') {
    return chartData.length >= item.config.period ? calculateMovingAverage(chartData, item.config) : [];
  }
  if (item.type === 'macd') {
    return chartData.length >= item.config.slowPeriod ? calculateMACD(chartData, item.config) : [];
  }
  return [];
};

// Predefined colors for indicators
const INDICATOR_COLORS = [
  '#3b82f6', // Blue
  '#ef4444', // Red
  '#10b981', // Green
  '#f59e0b', // Amber
  '#8b5cf6', // Purple
  '#06b6d4', // Cyan
  '#84cc16', // Lime
  '#f97316', // Orange
  '#ec4899', // Pink
  '#6366f1', // Indigo
];

// Create default indicator items
const createDefaultItems = (): IndicatorItem[] => {
  const items: IndicatorItem[] = [];
  let colorIndex = 0;

  // Add default moving averages
  DEFAULT_MOVING_AVERAGE_CONFIGS.forEach(config => {
    items.push({
      id: `ma-${config.type}-${config.period}`,
      type: 'moving_average',
      config,
      enabled: false,
      color: INDICATOR_COLORS[colorIndex % INDICATOR_COLORS.length],
      label: getMovingAverageLabel(config),
      data: [],
    });
    colorIndex++;
  });

  // Add default MACD configurations
  getMACDPresets().forEach(config => {
    items.push({
      id: `macd-${config.fastPeriod}-${config.slowPeriod}-${config.signalPeriod}`,
      type: 'macd',
      config,
      enabled: false,
      color: INDICATOR_COLORS[colorIndex % INDICATOR_COLORS.length],
      label: getMACDLabel(config),
      data: [],
    });
    colorIndex++;
  });

  return items;
};

const DEFAULT_STATE: TechnicalIndicatorsState = {
  items: createDefaultItems(),
};

// localStorage key for persisting technical indicators state
const TECHNICAL_INDICATORS_STORAGE_KEY = 'technicalIndicatorsState';

/**
 * Hook for managing multiple technical indicators simultaneously
 * Completely self-contained and doesn't pollute core chart state
 * Automatically persists state to localStorage
 */
export const useTechnicalIndicators = (): TechnicalIndicatorsHook => {
  // Track if this is the initial load to prevent persisting default state
  const isInitialLoadRef = useRef(true);

  // Load initial state from localStorage or use default
  const [state, setState] = useState<TechnicalIndicatorsState>(() => {
    try {
      const savedState = getLocalStorageItem<TechnicalIndicatorsState>(TECHNICAL_INDICATORS_STORAGE_KEY, DEFAULT_STATE);
      // Validate that the saved state has the expected structure
      if (savedState && Array.isArray(savedState.items)) {
        return savedState;
      }
      return DEFAULT_STATE;
    } catch (error) {
      console.warn('Failed to load technical indicators state from localStorage:', error);
      return DEFAULT_STATE;
    }
  });

  // Persist state to localStorage whenever it changes (but not on initial load)
  useEffect(() => {
    if (isInitialLoadRef.current) {
      isInitialLoadRef.current = false;
      return;
    }

    try {
      setLocalStorageItem(TECHNICAL_INDICATORS_STORAGE_KEY, state);
    } catch (error) {
      console.warn('Failed to save technical indicators state to localStorage:', error);
    }
  }, [state]);

  // Get enabled items
  const enabledItems = useMemo(() => {
    return state.items.filter(item => item.enabled);
  }, [state.items]);

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

  const addMovingAverage = useCallback(
    (config: MovingAverageConfig) => {
      const id = `ma-${config.type}-${config.period}`;
      const label = getMovingAverageLabel(config);
      const color = INDICATOR_COLORS[state.items.length % INDICATOR_COLORS.length];

      const newItem: MovingAverageIndicatorItem = {
        id,
        type: 'moving_average',
        config,
        enabled: true,
        color,
        label,
        data: [],
      };

      setState(prev => ({
        ...prev,
        items: [...prev.items, newItem],
      }));
    },
    [state.items.length]
  );

  const addMACD = useCallback(
    (config: MACDConfig) => {
      const id = `macd-${config.fastPeriod}-${config.slowPeriod}-${config.signalPeriod}`;
      const label = getMACDLabel(config);
      const color = INDICATOR_COLORS[state.items.length % INDICATOR_COLORS.length];

      const newItem: MACDIndicatorItem = {
        id,
        type: 'macd',
        config,
        enabled: true,
        color,
        label,
        data: [],
      };

      setState(prev => ({
        ...prev,
        items: [...prev.items, newItem],
      }));
    },
    [state.items.length]
  );

  const removeItem = useCallback((id: string) => {
    setState(prev => ({
      ...prev,
      items: prev.items.filter(item => item.id !== id),
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

  const actions: TechnicalIndicatorsActions = {
    toggleItem,
    setItemEnabled,
    setItemColor,
    addMovingAverage,
    addMACD,
    removeItem,
    resetAll,
    enableAll,
    disableAll,
  };

  return {
    state,
    actions,
    enabledItems,
  };
};

/**
 * Get available colors for indicators
 */
export const getAvailableColors = () => INDICATOR_COLORS;

/**
 * Get a color that's not currently in use
 */
export const getNextAvailableColor = (usedColors: string[]): string => {
  const available = INDICATOR_COLORS.filter(color => !usedColors.includes(color));
  return available.length > 0 ? available[0] : INDICATOR_COLORS[0];
};

/**
 * Get indicator type display name
 */
export const getIndicatorTypeLabel = (type: IndicatorType): string => {
  switch (type) {
    case 'moving_average':
      return 'Moving Average';
    case 'macd':
      return 'MACD';
    default:
      return 'Unknown';
  }
};
