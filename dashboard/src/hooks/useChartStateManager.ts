import { useState, useCallback, useRef, useEffect } from 'react';
import { ChartTimeframe, ChartDimensions, DEFAULT_CHART_DATA_POINTS } from '../types';
import { CandlestickData, processChartData, DataRange } from '../utils/chartDataUtils';
import { apiService } from '../services/apiService';

// Helper function to get interval in milliseconds
function getIntervalMs(interval: string): number {
  const intervalMap: { [key: string]: number } = {
    '1m': 60 * 1000,
    '5m': 5 * 60 * 1000,
    '30m': 30 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '2h': 2 * 60 * 60 * 1000,
    '4h': 4 * 60 * 60 * 1000,
    '1d': 24 * 60 * 60 * 1000,
    '1w': 7 * 24 * 60 * 60 * 1000,
    '1M': 30 * 24 * 60 * 60 * 1000,
  };

  return intervalMap[interval] || 60 * 60 * 1000; // Default to 1 hour
}

export interface ChartTransform {
  x: number;
  y: number;
  k: number; // scale factor
}

export interface HoverData {
  x: number;
  y: number;
  data: CandlestickData | null;
}

export interface ChartState {
  // Data
  data: CandlestickData[];
  allData: CandlestickData[];

  // Dimensions
  dimensions: ChartDimensions;

  // Transform and viewport
  transform: ChartTransform;
  currentViewStart: number;
  currentViewEnd: number;

  // UI state
  isLive: boolean;
  isZooming: boolean;
  isLoading: boolean;
  error: string | null;
  chartLoaded: boolean;
  chartExists: boolean;

  // Hover state
  hoverData: HoverData | null;

  // Configuration
  timeframe: ChartTimeframe | null;
  symbol: string;
  dataPointsToShow: number;

  // Y-scale management
  fixedYScaleDomain: [number, number] | null;
}

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
    bufferPoints?: number
  ) => Promise<void>;
  updateChartWithLiveData: (bar: any) => void; // AlpacaBar type

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
  setIsZooming: (isZooming: boolean) => void;
  setIsLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  setChartLoaded: (loaded: boolean) => void;
  setChartExists: (exists: boolean) => void;
  setHoverData: (hoverData: HoverData | null) => void;

  // Configuration actions
  setTimeframe: (timeframe: ChartTimeframe) => void;
  setSymbol: (symbol: string) => void;
  setDimensions: (dimensions: ChartDimensions) => void;
  setDataPointsToShow: (points: number) => void;
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

const DEFAULT_DATA_POINTS = 80;

/**
 * Consolidated chart state management hook
 * Combines the best patterns from D3StockChart and useChartState
 */
export const useChartStateManager = (
  initialSymbol: string,
  initialTimeframe: ChartTimeframe | null = null
) => {
  const [state, setState] = useState<ChartState>({
    data: [],
    allData: [],
    dimensions: DEFAULT_DIMENSIONS,
    transform: DEFAULT_TRANSFORM,
    currentViewStart: 0,
    currentViewEnd: 0,
    isLive: false,
    isZooming: false,
    isLoading: false,
    error: null,
    chartLoaded: false,
    chartExists: false,
    hoverData: null,
    timeframe: initialTimeframe,
    symbol: initialSymbol,
    dataPointsToShow: DEFAULT_DATA_POINTS,
    fixedYScaleDomain: null,
  });

  // Refs for tracking previous values and preventing unnecessary updates
  const prevDataLengthRef = useRef(0);
  const isInitialLoadRef = useRef(true);

  // Data actions
  const setData = useCallback((data: CandlestickData[]) => {
    setState((prev) => ({ ...prev, data }));
    prevDataLengthRef.current = data.length;
  }, []);

  const setAllData = useCallback((allData: CandlestickData[]) => {
    setState((prev) => ({ ...prev, allData }));
  }, []);

  const addDataPoint = useCallback((point: CandlestickData) => {
    setState((prev) => ({
      ...prev,
      data: [...prev.data, point],
      allData: [...prev.allData, point],
    }));
  }, []);

  const updateData = useCallback(
    (updates: Partial<{ data: CandlestickData[]; allData: CandlestickData[] }>) => {
      setState((prev) => ({ ...prev, ...updates }));
    },
    []
  );

  // Transform actions
  const setTransform = useCallback((transform: ChartTransform) => {
    setState((prev) => ({ ...prev, transform }));
  }, []);

  const updateTransform = useCallback((updates: Partial<ChartTransform>) => {
    setState((prev) => ({
      ...prev,
      transform: { ...prev.transform, ...updates },
    }));
  }, []);

  const resetTransform = useCallback(() => {
    setState((prev) => ({
      ...prev,
      transform: DEFAULT_TRANSFORM,
    }));
  }, []);

  // Viewport actions
  const setCurrentViewStart = useCallback((start: number) => {
    setState((prev) => ({ ...prev, currentViewStart: start }));
  }, []);

  const setCurrentViewEnd = useCallback((end: number) => {
    setState((prev) => ({ ...prev, currentViewEnd: end }));
  }, []);

  const setViewport = useCallback((start: number, end: number) => {
    setState((prev) => ({
      ...prev,
      currentViewStart: start,
      currentViewEnd: end,
    }));
  }, []);

  // UI actions
  const setIsLive = useCallback((isLive: boolean) => {
    setState((prev) => ({ ...prev, isLive }));
  }, []);

  const setIsZooming = useCallback((isZooming: boolean) => {
    setState((prev) => ({ ...prev, isZooming }));
  }, []);

  const setIsLoading = useCallback((isLoading: boolean) => {
    setState((prev) => ({ ...prev, isLoading }));
  }, []);

  const setError = useCallback((error: string | null) => {
    setState((prev) => ({ ...prev, error }));
  }, []);

  const setChartLoaded = useCallback((loaded: boolean) => {
    setState((prev) => ({ ...prev, chartLoaded: loaded }));
  }, []);

  const setChartExists = useCallback((exists: boolean) => {
    setState((prev) => ({ ...prev, chartExists: exists }));
  }, []);

  const setHoverData = useCallback((hoverData: HoverData | null) => {
    setState((prev) => ({ ...prev, hoverData }));
  }, []);

  // Configuration actions
  const setTimeframe = useCallback((timeframe: ChartTimeframe) => {
    setState((prev) => ({ ...prev, timeframe }));
  }, []);

  const setSymbol = useCallback((symbol: string) => {
    setState((prev) => ({ ...prev, symbol }));
  }, []);

  const setDimensions = useCallback((dimensions: ChartDimensions) => {
    setState((prev) => ({ ...prev, dimensions }));
  }, []);

  const setDataPointsToShow = useCallback((points: number) => {
    setState((prev) => ({ ...prev, dataPointsToShow: points }));
  }, []);

  const setFixedYScaleDomain = useCallback((domain: [number, number] | null) => {
    setState((prev) => ({ ...prev, fixedYScaleDomain: domain }));
  }, []);

  // Utility actions
  const resetChart = useCallback(() => {
    setState((prev) => ({
      ...prev,
      data: [],
      allData: [],
      transform: DEFAULT_TRANSFORM,
      currentViewStart: 0,
      currentViewEnd: 0,
      isLive: false,
      isZooming: false,
      isLoading: false,
      error: null,
      chartLoaded: false,
      chartExists: false,
      hoverData: null,
      fixedYScaleDomain: null,
    }));
    isInitialLoadRef.current = true;
  }, []);

  const updateMultiple = useCallback((updates: Partial<ChartState>) => {
    setState((prev) => ({ ...prev, ...updates }));
  }, []);

  // Data loading actions
  const loadChartData = useCallback(
    async (
      symbol: string,
      timeframe: ChartTimeframe,
      dataPoints: number = DEFAULT_CHART_DATA_POINTS,
      bufferPoints: number = 20
    ) => {
      try {
        setIsLoading(true);
        setError(null);

        // Calculate start time based on timeframe and data points
        const intervalMs = getIntervalMs(timeframe);
        const endTime = new Date();
        const startTime = new Date(endTime.getTime() - dataPoints * intervalMs);

        // Load chart data from API
        const response = await apiService.getChartData(
          symbol,
          timeframe,
          dataPoints,
          startTime.toISOString(),
          endTime.toISOString(),
          bufferPoints
        );

        // Process the data using utility functions
        const { formattedData, dataRange } = processChartData(response.bars);

        console.log('Initial data load:', {
          symbol,
          timeframe,
          dataPoints,
          barsCount: response.bars?.length || 0,
          formattedDataLength: formattedData.length,
          dataRange,
        });

        // Update state with new data
        setAllData(formattedData);
        setDataPointsToShow(dataPoints);
        setSymbol(symbol);
        setTimeframe(timeframe);
      } catch (err: any) {
        const errorMessage = err.response?.data?.error || 'Failed to load chart data';
        setError(errorMessage);
        console.error('Error loading chart data:', errorMessage);
      } finally {
        setIsLoading(false);
      }
    },
    [setIsLoading, setError, setAllData, setDataPointsToShow, setSymbol, setTimeframe]
  );

  const updateChartWithLiveData = useCallback((bar: any) => {
    const newCandle: CandlestickData = {
      time: bar.t,
      open: bar.o,
      high: bar.h,
      low: bar.l,
      close: bar.c,
    };

    // Update chart data directly
    setState((prev) => {
      const lastCandle = prev.allData[prev.allData.length - 1];
      let updatedAllData: CandlestickData[];

      if (lastCandle && lastCandle.time === newCandle.time) {
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
      const newStartIndex = Math.max(0, newEndIndex - state.dataPointsToShow + 1);

      setState((prev) => ({
        ...prev,
        currentViewStart: newStartIndex,
        currentViewEnd: newEndIndex,
      }));

      isInitialLoadRef.current = false;
    }
  }, [state.allData.length, state.dataPointsToShow]);

  const actions: ChartActions = {
    setData,
    setAllData,
    addDataPoint,
    updateData,
    loadChartData,
    updateChartWithLiveData,
    setTransform,
    updateTransform,
    resetTransform,
    setCurrentViewStart,
    setCurrentViewEnd,
    setViewport,
    setIsLive,
    setIsZooming,
    setIsLoading,
    setError,
    setChartLoaded,
    setChartExists,
    setHoverData,
    setTimeframe,
    setSymbol,
    setDimensions,
    setDataPointsToShow,
    setFixedYScaleDomain,
    resetChart,
    updateMultiple,
  };

  return { state, actions, isInitialLoad: isInitialLoadRef.current };
};
