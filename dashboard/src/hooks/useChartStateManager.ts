import { useState, useCallback, useRef, useEffect } from 'react';
import { ChartTimeframe, ChartDimensions, DEFAULT_CHART_DATA_POINTS, CandlestickData } from '../types';
import { CHART_DATA_POINTS, BUFFER_SIZE } from '../constants';
import { processChartData } from '../utils/chartDataUtils';
import { apiService } from '../services/apiService';
import { safeCallAsync, createUserFriendlyMessage } from '@whalewatch/shared';
import { clearTimeFormatCache, clearAllChartCaches } from '../utils/memoizedChartUtils';

// Import types from centralized location
import { HoverData, ChartState, ChartTransform, DateDisplayData } from '../types';
import type { AlpacaBar } from '../types';

const getCandleTime = (d: CandlestickData): string => d.timestamp;

export interface ChartActions {
  // Data actions
  setData: (data: CandlestickData[]) => void;
  setAllData: (data: CandlestickData[]) => void;
  addDataPoint: (point: CandlestickData) => void;
  updateData: (updates: Partial<{ data: CandlestickData[]; allData: CandlestickData[] }>) => void;

  // Data loading actions
  loadChartData: (
    symbol: string,
    timeframe: ChartTimeframe,
    dataPoints?: number,
    startTime?: string,
    direction?: 'past' | 'future'
  ) => Promise<void>;
  loadMoreData: (
    symbol: string,
    timeframe: ChartTimeframe,
    direction: 'past' | 'future',
    dataPoints?: number
  ) => Promise<void>;
  updateChartWithLiveData: (bar: AlpacaBar) => void; // AlpacaBar type

  // Transform actions
  setTransform: (transform: ChartTransform) => void;
  updateTransform: (updates: Partial<ChartTransform>) => void;
  resetTransform: () => void;

  // Viewport actions
  setCurrentViewStart: (start: number) => void;
  setCurrentViewEnd: (end: number) => void;
  setViewport: (start: number, end: number) => void;

  // UI actions
  setIsLive: (isLive: boolean) => void;
  setIsWebSocketEnabled: (isWebSocketEnabled: boolean) => void;
  setIsZooming: (isZooming: boolean) => void;
  setIsLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  setChartLoaded: (loaded: boolean) => void;
  setChartExists: (exists: boolean) => void;
  setHoverData: (hoverData: HoverData | null) => void;
  setDateDisplay: (dateDisplay: DateDisplayData | null) => void;

  // Configuration actions
  setTimeframe: (timeframe: ChartTimeframe) => void;
  setSymbol: (symbol: string) => void;
  setDimensions: (dimensions: ChartDimensions) => void;
  setFixedYScaleDomain: (domain: [number, number] | null) => void;

  // Utility actions
  resetChart: () => void;
  updateMultiple: (updates: Partial<ChartState>) => void;
}

const DEFAULT_DIMENSIONS: ChartDimensions = {
  width: 800,
  height: 400,
  margin: { top: 20, right: 60, bottom: 40, left: 0 },
};

const DEFAULT_TRANSFORM: ChartTransform = {
  x: 0,
  y: 0,
  k: 1,
};

/**
 * Calculate buffer size based on chart dimensions
 */
function calculateBufferSize(): number {
  // Fixed chunk size
  return BUFFER_SIZE;
}

/**
 * Consolidated chart state management hook
 * Combines the best patterns from D3StockChart and useChartState
 */
export const useChartStateManager = (initialSymbol: string, initialTimeframe: ChartTimeframe | null = null) => {
  const [state, setState] = useState<ChartState>({
    data: [],
    allData: [],
    dimensions: DEFAULT_DIMENSIONS,
    transform: DEFAULT_TRANSFORM,
    currentViewStart: 0,
    currentViewEnd: 0,
    isLive: false,
    isWebSocketEnabled: false,
    isZooming: false,
    isLoading: false,
    error: null,
    chartLoaded: false,
    chartExists: false,
    hoverData: null,
    dateDisplay: null,
    timeframe: initialTimeframe,
    symbol: initialSymbol,
    fixedYScaleDomain: null,
  });

  // Refs for tracking previous values and preventing unnecessary updates
  const prevDataLengthRef = useRef(0);
  const isInitialLoadRef = useRef(true);

  // Data actions
  const setData = useCallback((data: CandlestickData[]) => {
    setState(prev => ({ ...prev, data }));
    prevDataLengthRef.current = data.length;
  }, []);

  const setAllData = useCallback((allData: CandlestickData[]) => {
    setState(prev => ({ ...prev, allData }));
  }, []);

  const addDataPoint = useCallback((point: CandlestickData) => {
    setState(prev => ({
      ...prev,
      data: [...prev.data, point],
      allData: [...prev.allData, point],
    }));
  }, []);

  const updateData = useCallback((updates: Partial<{ data: CandlestickData[]; allData: CandlestickData[] }>) => {
    setState(prev => ({ ...prev, ...updates }));
  }, []);

  // Transform actions
  const setTransform = useCallback((transform: ChartTransform) => {
    setState(prev => ({ ...prev, transform }));
  }, []);

  const updateTransform = useCallback((updates: Partial<ChartTransform>) => {
    setState(prev => ({
      ...prev,
      transform: { ...prev.transform, ...updates },
    }));
  }, []);

  const resetTransform = useCallback(() => {
    setState(prev => ({
      ...prev,
      transform: DEFAULT_TRANSFORM,
    }));
  }, []);

  // Viewport actions
  const setCurrentViewStart = useCallback((start: number) => {
    setState(prev => ({ ...prev, currentViewStart: start }));
  }, []);

  const setCurrentViewEnd = useCallback((end: number) => {
    setState(prev => ({ ...prev, currentViewEnd: end }));
  }, []);

  const setViewport = useCallback((start: number, end: number) => {
    setState(prev => ({
      ...prev,
      currentViewStart: start,
      currentViewEnd: end,
    }));
  }, []);

  // UI actions
  const setIsLive = useCallback((isLive: boolean) => {
    setState(prev => ({ ...prev, isLive }));
  }, []);

  const setIsWebSocketEnabled = useCallback((isWebSocketEnabled: boolean) => {
    setState(prev => ({ ...prev, isWebSocketEnabled }));
  }, []);

  const setIsZooming = useCallback((isZooming: boolean) => {
    setState(prev => ({ ...prev, isZooming }));
  }, []);

  const setIsLoading = useCallback((isLoading: boolean) => {
    setState(prev => ({ ...prev, isLoading }));
  }, []);

  const setError = useCallback((error: string | null) => {
    setState(prev => ({ ...prev, error }));
  }, []);

  const setChartLoaded = useCallback((loaded: boolean) => {
    setState(prev => ({ ...prev, chartLoaded: loaded }));
  }, []);

  const setChartExists = useCallback((exists: boolean) => {
    setState(prev => ({ ...prev, chartExists: exists }));
  }, []);

  const setHoverData = useCallback((hoverData: HoverData | null) => {
    setState(prev => ({ ...prev, hoverData }));
  }, []);

  const setDateDisplay = useCallback((dateDisplay: DateDisplayData | null) => {
    setState(prev => ({ ...prev, dateDisplay }));
  }, []);

  // Configuration actions
  const setTimeframe = useCallback((timeframe: ChartTimeframe) => {
    // Clear time formatting cache when timeframe changes to ensure x-axis labels update correctly
    clearTimeFormatCache();
    setState(prev => ({ ...prev, timeframe }));
  }, []);

  const setSymbol = useCallback((symbol: string) => {
    setState(prev => ({ ...prev, symbol }));
  }, []);

  const setDimensions = useCallback((dimensions: ChartDimensions) => {
    setState(prev => ({ ...prev, dimensions }));
  }, []);

  const setFixedYScaleDomain = useCallback((domain: [number, number] | null) => {
    setState(prev => ({ ...prev, fixedYScaleDomain: domain }));
  }, []);

  // Utility actions
  const resetChart = useCallback(() => {
    // Clear all caches when resetting chart to ensure fresh calculations
    clearAllChartCaches();
    setState(prev => ({
      ...prev,
      data: [],
      allData: [],
      transform: DEFAULT_TRANSFORM,
      currentViewStart: 0,
      currentViewEnd: 0,
      isLive: false,
      // Preserve isWebSocketEnabled state when resetting chart
      // isWebSocketEnabled: prev.isWebSocketEnabled,
      isZooming: false,
      isLoading: false,
      error: null,
      chartLoaded: false,
      chartExists: false,
      hoverData: null,
      dateDisplay: null,
      fixedYScaleDomain: null,
    }));
    isInitialLoadRef.current = true;
  }, []);

  const updateMultiple = useCallback((updates: Partial<ChartState>) => {
    setState(prev => ({ ...prev, ...updates }));
  }, []);

  // Data loading actions
  const loadChartData = useCallback(
    async (
      symbol: string,
      timeframe: ChartTimeframe,
      dataPoints: number = DEFAULT_CHART_DATA_POINTS,
      startTime?: string,
      direction: 'past' | 'future' = 'past'
    ) => {
      setIsLoading(true);
      setError(null);

      // Always request exactly BUFFER_SIZE
      const totalDataPoints = BUFFER_SIZE;

      const result = await safeCallAsync(async () => {
        // Load chart data from API with new parameters
        const response = await apiService.getChartData(symbol, timeframe, totalDataPoints, startTime, direction);

        // Process the data using utility functions
        const { formattedData, dataRange } = processChartData(response.bars);

        console.log('Initial data load:', {
          symbol,
          timeframe,
          dataPoints,
          direction,
          barsCount: response.bars?.length || 0,
          formattedDataLength: formattedData.length,
          dataRange,
        });

        return { formattedData, symbol, timeframe };
      });

      if (result.isOk()) {
        // Update state with new data
        setAllData(result.value.formattedData);
        setSymbol(result.value.symbol);
        setTimeframe(result.value.timeframe);
      } else {
        const userMessage = createUserFriendlyMessage(result.error);
        setError(userMessage);
        console.error('Error loading chart data:', userMessage);
      }

      setIsLoading(false);
    },
    [setIsLoading, setError, setAllData, setSymbol, setTimeframe]
  );

  const loadMoreData = useCallback(
    async (
      symbol: string,
      timeframe: ChartTimeframe,
      direction: 'past' | 'future',
      dataPoints: number = DEFAULT_CHART_DATA_POINTS
    ) => {
      setIsLoading(true);
      setError(null);

      const result = await safeCallAsync(async () => {
        // Determine start time based on current data and direction
        let startTime: string;
        if (direction === 'past') {
          // For past data, start from the earliest data point we have
          const earliestData = state.allData[0];
          if (!earliestData) {
            throw new Error('No existing data to load more past data from');
          }
          startTime = getCandleTime(earliestData);
        } else {
          // For future data, start from the latest data point we have
          const latestData = state.allData[state.allData.length - 1];
          if (!latestData) {
            throw new Error('No existing data to load more future data from');
          }
          startTime = getCandleTime(latestData);
        }

        // Always request exactly BUFFER_SIZE more
        const totalDataPoints = BUFFER_SIZE;

        // Load more chart data from API
        const response = await apiService.getChartData(symbol, timeframe, totalDataPoints, startTime, direction);

        // Process the new data
        const { formattedData } = processChartData(response.bars);

        console.log('Loading more data:', {
          symbol,
          timeframe,
          direction,
          dataPoints,
          newBarsCount: response.bars?.length || 0,
          newFormattedDataLength: formattedData.length,
        });

        // Merge new data with existing data
        let updatedAllData: CandlestickData[];
        if (direction === 'past') {
          // For past data, prepend to existing data
          updatedAllData = [...formattedData, ...state.allData];
        } else {
          // For future data, append to existing data
          updatedAllData = [...state.allData, ...formattedData];
        }

        // Remove duplicates based on timestamp
        const uniqueData = updatedAllData.reduce((acc, current) => {
          const currentTime = getCandleTime(current);
          const existing = acc.find(item => getCandleTime(item) === currentTime);
          if (!existing) {
            acc.push(current);
          }
          return acc;
        }, [] as CandlestickData[]);

        // Sort by timestamp to maintain chronological order
        uniqueData.sort((a, b) => new Date(getCandleTime(a)).getTime() - new Date(getCandleTime(b)).getTime());

        return uniqueData;
      });

      if (result.isOk()) {
        setAllData(result.value);
      } else {
        const userMessage = createUserFriendlyMessage(result.error);
        setError(userMessage);
        console.error('Error loading more chart data:', userMessage);
      }

      setIsLoading(false);
    },
    [state.allData, setIsLoading, setError, setAllData]
  );

  const updateChartWithLiveData = useCallback((bar: AlpacaBar) => {
    const newCandle: CandlestickData = {
      timestamp: bar.t,
      open: bar.o,
      high: bar.h,
      low: bar.l,
      close: bar.c,
      volume: bar.v ?? 0,
    };

    // Update chart data directly
    setState(prev => {
      const lastCandle = prev.allData[prev.allData.length - 1];
      let updatedAllData: CandlestickData[];

      if (lastCandle && getCandleTime(lastCandle) === getCandleTime(newCandle)) {
        // Update existing candle
        updatedAllData = [...prev.allData];
        updatedAllData[updatedAllData.length - 1] = newCandle;
      } else {
        // Add new candle
        updatedAllData = [...prev.allData, newCandle];
      }

      return {
        ...prev,
        allData: updatedAllData,
      };
    });
  }, []);

  // Handle initial data load
  useEffect(() => {
    if (state.allData.length > 0 && isInitialLoadRef.current) {
      const totalDataLength = state.allData.length;
      const newEndIndex = totalDataLength - 1;
      // Use centralized default view size
      const newStartIndex = Math.max(0, newEndIndex - CHART_DATA_POINTS + 1);

      setState(prev => ({
        ...prev,
        currentViewStart: newStartIndex,
        currentViewEnd: newEndIndex,
      }));

      isInitialLoadRef.current = false;
    }
  }, [state.allData.length]);

  const actions: ChartActions = {
    setData,
    setAllData,
    addDataPoint,
    updateData,
    loadChartData,
    loadMoreData,
    updateChartWithLiveData,
    setTransform,
    updateTransform,
    resetTransform,
    setCurrentViewStart,
    setCurrentViewEnd,
    setViewport,
    setIsLive,
    setIsWebSocketEnabled,
    setIsZooming,
    setIsLoading,
    setError,
    setChartLoaded,
    setChartExists,
    setHoverData,
    setDateDisplay,
    setTimeframe,
    setSymbol,
    setDimensions,
    setFixedYScaleDomain,
    resetChart,
    updateMultiple,
  };

  return { state, actions, isInitialLoad: isInitialLoadRef.current };
};
