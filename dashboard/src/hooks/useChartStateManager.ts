import { useState, useCallback, useRef, useEffect } from 'react';
import { ChartTimeframe, ChartDimensions, DEFAULT_CHART_DATA_POINTS, CandlestickData } from '../types';
import { CHART_DATA_POINTS, BUFFER_SIZE, FIRST_LOAD_BUFFER_SIZE } from '../constants';
import { processChartData, isFakeCandle } from '../utils/chartDataUtils';
import { apiService } from '../services/apiService';
import { safeCallAsync, createUserFriendlyMessage } from '@whalewatch/shared';
import { clearTimeFormatCache, clearAllChartCaches } from '../utils/memoizedChartUtils';
import { logger } from '../utils/logger';

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
    direction?: 'past' | 'future' | 'centered'
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

  // Transform actions for vertical panning
  setCurrentVerticalPan: (y: number, k: number) => void;

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
    setState(prev => ({
      ...prev,
      currentViewStart: start,
    }));
  }, []);

  const setCurrentViewEnd = useCallback((end: number) => {
    setState(prev => ({
      ...prev,
      currentViewEnd: end,
    }));
  }, []);

  const setViewport = useCallback((start: number, end: number) => {
    setState(prev => ({
      ...prev,
      currentViewStart: start,
      currentViewEnd: end,
    }));
  }, []);

  // UI actions
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

  const setCurrentVerticalPan = useCallback((y: number, k: number) => {
    setState(prev => ({
      ...prev,
      currentTransformY: y,
      currentTransformK: k,
    }));
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
      direction: 'past' | 'future' | 'centered' = 'past'
    ) => {
      setIsLoading(true);
      setError(null);

      // Use larger buffer size for initial load to prevent glitchy behavior
      const totalDataPoints = isInitialLoadRef.current ? FIRST_LOAD_BUFFER_SIZE : BUFFER_SIZE;

      const result = await safeCallAsync(async () => {
        // Load chart data from API with new parameters
        const response = await apiService.getChartData(symbol, timeframe, totalDataPoints, startTime, direction);

        // Process the data using utility functions
        const { formattedData, dataRange } = processChartData(response.bars, timeframe, DEFAULT_CHART_DATA_POINTS);

        logger.chart.data('Initial data load:', {
          symbol,
          timeframe,
          dataPoints,
          direction,
          totalDataPoints,
          isInitialLoad: isInitialLoadRef.current,
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

        // For centered direction, set viewport to center the loaded data
        if (direction === 'centered' && result.value.formattedData.length > 0) {
          const dataLength = result.value.formattedData.length;
          // Use a smaller viewport size for centered view to show focused time range
          const viewportSize = 80;

          // Find the actual position of the target time in the data
          // The target time should be the startTime parameter passed to loadChartData
          let targetTimeIndex = Math.floor(dataLength / 2); // fallback to center

          if (startTime) {
            // Find the data point closest to the target time
            const targetTime = new Date(startTime).getTime();
            let closestIndex = 0;
            let closestDiff = Math.abs(new Date(result.value.formattedData[0].timestamp).getTime() - targetTime);

            for (let i = 1; i < dataLength; i++) {
              const diff = Math.abs(new Date(result.value.formattedData[i].timestamp).getTime() - targetTime);
              if (diff < closestDiff) {
                closestDiff = diff;
                closestIndex = i;
              }
            }
            targetTimeIndex = closestIndex;
          }

          // Calculate viewport centered around target time, ensuring we show the full viewport size
          let viewStart = Math.max(0, targetTimeIndex - Math.floor(viewportSize / 2));
          let viewEnd = viewStart + viewportSize - 1;

          // If we hit the end boundary, adjust the start to maintain viewport size
          if (viewEnd >= dataLength) {
            viewEnd = dataLength - 1;
            viewStart = Math.max(0, viewEnd - viewportSize + 1);
          }

          logger.chart.target('Centering viewport for centered data:', {
            dataLength,
            targetTimeIndex,
            viewportSize,
            viewStart,
            viewEnd,
            direction,
            startTime,
            targetTimestamp: result.value.formattedData[targetTimeIndex]?.timestamp,
          });

          // Set the viewport to center the data
          setCurrentViewStart(viewStart);
          setCurrentViewEnd(viewEnd);
        }
      } else {
        const userMessage = createUserFriendlyMessage(result.error);
        setError(userMessage);
        logger.error('Error loading chart data:', userMessage);
      }

      setIsLoading(false);
    },
    [setIsLoading, setError, setAllData, setSymbol, setTimeframe, setCurrentViewStart, setCurrentViewEnd]
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
        const { formattedData } = processChartData(response.bars, timeframe, DEFAULT_CHART_DATA_POINTS);

        logger.chart.data('Loading more data:', {
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
        logger.error('Error loading more chart data:', userMessage);
      }

      setIsLoading(false);
    },
    [state.allData, setIsLoading, setError, setAllData]
  );

  const updateChartWithLiveData = useCallback((bar: AlpacaBar) => {
    logger.chart.websocket('New WebSocket data received:', {
      timestamp: bar.t,
      open: bar.o,
      high: bar.h,
      low: bar.l,
      close: bar.c,
      volume: bar.v ?? 0,
    });

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
      const allData = prev.allData;
      let updatedAllData: CandlestickData[];

      // Find the last real (non-fake) candle
      let lastRealCandleIndex = allData.length - 1;
      while (lastRealCandleIndex >= 0 && isFakeCandle(allData[lastRealCandleIndex])) {
        lastRealCandleIndex--;
      }

      // If no real candles found, just add the new candle
      if (lastRealCandleIndex < 0) {
        updatedAllData = [newCandle];
      } else {
        const lastRealCandle = allData[lastRealCandleIndex];

        if (getCandleTime(lastRealCandle) === getCandleTime(newCandle)) {
          // Update existing candle - replace the last real candle
          updatedAllData = [...allData];
          updatedAllData[lastRealCandleIndex] = newCandle;
        } else {
          // Add new candle - insert it just before any fake candles
          // Split the array at the position where fake candles start
          const realData = allData.slice(0, lastRealCandleIndex + 1);
          const fakeData = allData.slice(lastRealCandleIndex + 1);

          // Insert the new candle after the last real candle, before fake candles
          updatedAllData = [...realData, newCandle, ...fakeData];
        }
      }

      // Auto-redraw logic: Check if current view shows any of the 5 newest candles
      const shouldAutoRedraw = (() => {
        if (updatedAllData.length === 0) {
          logger.chart.viewport('Auto-redraw check: No data available');
          return false;
        }

        // Get the 5 newest real candles (excluding fake candles)
        const realCandles = updatedAllData.filter(candle => !isFakeCandle(candle));
        if (realCandles.length === 0) {
          logger.chart.viewport('Auto-redraw check: No real candles found');
          return false;
        }

        const newestCandles = realCandles.slice(-5); // Last 5 real candles
        const newestCandleIndices = newestCandles.map(candle =>
          updatedAllData.findIndex(d => d.timestamp === candle.timestamp)
        );

        // Check if current viewport overlaps with any of the 5 newest candles
        const currentViewStart = prev.currentViewStart;
        const currentViewEnd = prev.currentViewEnd;

        // Only auto-redraw if the current viewport actually shows any of the 5 newest candles
        const hasOverlap = newestCandleIndices.some(index => index >= currentViewStart && index <= currentViewEnd);

        logger.chart.viewport('Auto-redraw decision:', {
          totalDataLength: updatedAllData.length,
          realCandlesCount: realCandles.length,
          newestCandleIndices,
          currentViewport: `${currentViewStart}-${currentViewEnd}`,
          hasOverlap,
          willAutoRedraw: hasOverlap,
        });

        return hasOverlap;
      })();

      // If auto-redraw is needed, slide to the newest candle
      let newViewStart = prev.currentViewStart;
      let newViewEnd = prev.currentViewEnd;

      if (shouldAutoRedraw && updatedAllData.length > 0) {
        const newestCandleIndex = updatedAllData.length - 1;
        const viewportSize = prev.currentViewEnd - prev.currentViewStart;

        // Slide viewport to show the newest candle at the right edge
        newViewEnd = newestCandleIndex;
        newViewStart = Math.max(0, newestCandleIndex - viewportSize);

        logger.chart.loading('Auto-redraw triggered:', {
          newestCandleIndex,
          previousView: `${prev.currentViewStart}-${prev.currentViewEnd}`,
          newView: `${newViewStart}-${newViewEnd}`,
          viewportSize,
        });
      } else {
        logger.chart.skip('Auto-redraw skipped:', {
          shouldAutoRedraw,
          dataLength: updatedAllData.length,
          currentViewport: `${prev.currentViewStart}-${prev.currentViewEnd}`,
        });
      }

      return {
        ...prev,
        allData: updatedAllData,
        currentViewStart: newViewStart,
        currentViewEnd: newViewEnd,
      };
    });
  }, []);

  // Handle initial data load - always show current date/time
  useEffect(() => {
    if (state.allData.length > 0 && isInitialLoadRef.current) {
      const totalDataLength = state.allData.length;

      // Always show the newest data (current date/time)
      const newViewEnd = totalDataLength - 1;
      const newViewStart = Math.max(0, newViewEnd - CHART_DATA_POINTS + 1);

      logger.chart.loading('Setting initial viewport to show current date/time:', {
        newViewport: `${newViewStart}-${newViewEnd}`,
        totalDataLength,
      });

      setState(prev => ({
        ...prev,
        currentViewStart: newViewStart,
        currentViewEnd: newViewEnd,
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
    setCurrentVerticalPan,
    resetChart,
    updateMultiple,
  };

  return { state, actions, isInitialLoad: isInitialLoadRef.current };
};
