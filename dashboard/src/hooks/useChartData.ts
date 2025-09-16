import { useState, useCallback, useRef } from 'react';
import { AlpacaBar, ChartTimeframe, ChartDataResponse, DEFAULT_CHART_DATA_POINTS } from '../types';
import { apiService } from '../services/apiService';
import {
  processChartData,
  CandlestickData,
  DataRange,
  TimeframeConfig,
} from '../utils/chartDataUtils';

interface UseChartDataProps {
  timeframes: TimeframeConfig[];
  onDataLoaded?: (data: CandlestickData[], range: DataRange | null) => void;
  onError?: (error: string) => void;
  bufferPoints?: number; // Number of buffer points to load on each side
  enableViewBasedLoading?: boolean; // Enable view-based preloading
}

interface ViewState {
  currentViewStart: number; // Index of the start of current view
  currentViewEnd: number; // Index of the end of current view
  viewSize: number; // Size of one view
  totalDataPoints: number; // Total data points available
  hasDataBefore: boolean; // Whether we have data before current view
  hasDataAfter: boolean; // Whether we have data after current view
}

interface UseChartDataReturn {
  chartData: CandlestickData[];
  dataRange: DataRange | null;
  isLoading: boolean;
  error: string | null;
  loadChartData: (symbol: string, timeframe: ChartTimeframe) => Promise<void>;
  loadMoreDataLeft: (symbol: string, timeframe: ChartTimeframe) => Promise<void>;
  loadMoreDataRight: (symbol: string, timeframe: ChartTimeframe) => Promise<void>;
  updateChartWithLiveData: (bar: AlpacaBar) => void;
  clearError: () => void;
  isLeftLoading: boolean;
  isRightLoading: boolean;
  // View-based loading methods
  panLeft: () => void;
  panRight: () => void;
  canPanLeft: boolean;
  canPanRight: boolean;
  viewState: ViewState | null;
  updateViewState: (newViewState: ViewState) => void;
}

export const useChartData = ({
  timeframes,
  onDataLoaded,
  onError,
  bufferPoints = 20, // Default buffer points
  enableViewBasedLoading = false, // Default to false for backward compatibility
}: UseChartDataProps): UseChartDataReturn => {
  const [chartData, setChartData] = useState<CandlestickData[]>([]);
  const [dataRange, setDataRange] = useState<DataRange | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLeftLoading, setIsLeftLoading] = useState(false);
  const [isRightLoading, setIsRightLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentSymbol, setCurrentSymbol] = useState<string | null>(null);
  const [currentTimeframe, setCurrentTimeframe] = useState<ChartTimeframe | null>(null);
  const [hasLoadedLeft, setHasLoadedLeft] = useState(false);
  const [hasLoadedRight, setHasLoadedRight] = useState(false);
  const [leftLoadCount, setLeftLoadCount] = useState(0);
  const [rightLoadCount, setRightLoadCount] = useState(0);
  const [maxDataPoints, setMaxDataPoints] = useState<number>(0);

  // View-based loading state
  const [viewState, setViewState] = useState<ViewState>({
    currentViewStart: 0,
    currentViewEnd: 0,
    viewSize: 80,
    totalDataPoints: 0,
    hasDataBefore: false,
    hasDataAfter: false,
  });
  const [allData, setAllData] = useState<CandlestickData[]>([]); // Store all loaded data
  const [currentViewData, setCurrentViewData] = useState<CandlestickData[]>([]); // Current view data
  const viewStateRef = useRef<ViewState | null>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Helper function to update view state and current view data
  const updateViewState = useCallback(
    (newViewState: ViewState) => {
      setViewState(newViewState);
      viewStateRef.current = newViewState;

      // Update current view data based on view state
      const viewData = allData.slice(
        newViewState.currentViewStart,
        newViewState.currentViewEnd + 1
      );

      setCurrentViewData(viewData);

      // Also update chartData for the chart to display
      setChartData(viewData);
    },
    [allData]
  );

  // Helper function to check if we can pan in a direction
  const canPanLeft = viewState ? viewState.currentViewStart > 0 : false;
  const canPanRight = viewState ? viewState.currentViewEnd < viewState.totalDataPoints - 1 : false;

  // Debug logging for pan states

  // Pan left - move view one position to the left
  const panLeft = useCallback(() => {
    if (!viewState || !canPanLeft) {
      console.log('panLeft blocked:', { hasViewState: !!viewState, canPanLeft });
      return;
    }

    // Move by half the view size for more noticeable panning
    const panStep = Math.max(1, Math.floor(viewState.viewSize / 2));
    const newViewStart = Math.max(0, viewState.currentViewStart - panStep);
    const newViewEnd = newViewStart + viewState.viewSize - 1;

    const newViewState: ViewState = {
      ...viewState,
      currentViewStart: newViewStart,
      currentViewEnd: newViewEnd,
      hasDataBefore: newViewStart > 0,
      hasDataAfter: newViewEnd < viewState.totalDataPoints - 1,
    };

    console.log('panLeft newViewState:', newViewState);
    console.log('panLeft data slice:', {
      start: newViewStart,
      end: newViewEnd + 1,
      sliceLength: allData.slice(newViewStart, newViewEnd + 1).length,
      firstItem: allData[newViewStart],
      lastItem: allData[newViewEnd],
    });

    updateViewState(newViewState);
  }, [viewState, canPanLeft, updateViewState, allData]);

  // Pan right - move view one position to the right
  const panRight = useCallback(() => {
    if (!viewState || !canPanRight) return;

    // Move by half the view size for more noticeable panning
    const panStep = Math.max(1, Math.floor(viewState.viewSize / 2));
    const newViewEnd = Math.min(viewState.totalDataPoints - 1, viewState.currentViewEnd + panStep);
    const newViewStart = newViewEnd - viewState.viewSize + 1;

    const newViewState: ViewState = {
      ...viewState,
      currentViewStart: newViewStart,
      currentViewEnd: newViewEnd,
      hasDataBefore: newViewStart > 0,
      hasDataAfter: newViewEnd < viewState.totalDataPoints - 1,
    };

    updateViewState(newViewState);
  }, [viewState, canPanRight, updateViewState]);

  const loadChartData = useCallback(
    async (symbol: string, timeframe: ChartTimeframe) => {
      try {
        setIsLoading(true);
        setError(null);
        setCurrentSymbol(symbol);
        setCurrentTimeframe(timeframe);

        // Find the timeframe configuration to get the appropriate data points
        const timeframeConfig = timeframes.find((tf) => tf.value === timeframe);
        const dataPoints = timeframeConfig?.dataPoints || DEFAULT_CHART_DATA_POINTS;

        let response: ChartDataResponse;

        if (enableViewBasedLoading) {
          // Use view-based loading - load 3 views worth of data
          response = await apiService.getChartData(
            symbol,
            timeframe,
            dataPoints,
            undefined, // endTime - use current time
            undefined, // bufferPoints - not used in view-based mode
            true, // viewBasedLoading
            dataPoints // viewSize
          );
        } else {
          // Use traditional loading
          response = await apiService.getChartData(
            symbol,
            timeframe,
            dataPoints,
            undefined, // endTime - use current time
            bufferPoints // Add buffer points
          );
        }

        // Process the data using utility functions
        const { formattedData, dataRange: newDataRange } = processChartData(response.bars);

        console.log('Initial data load:', {
          symbol,
          timeframe,
          dataPoints,
          barsCount: response.bars?.length || 0,
          formattedDataLength: formattedData.length,
          dataRange: newDataRange,
          viewBasedLoading: enableViewBasedLoading,
        });

        if (enableViewBasedLoading) {
          // Store all data and set up view state
          setAllData(formattedData);

          // Initialize view state - start at the most recent data (rightmost view)
          const totalDataPoints = formattedData.length;
          // Use a smaller view size to enable panning - use 1/3 of the data or the requested dataPoints, whichever is smaller
          const viewSize = Math.min(dataPoints, Math.max(10, Math.floor(totalDataPoints / 3)));
          const currentViewStart = Math.max(0, totalDataPoints - viewSize);
          const currentViewEnd = totalDataPoints - 1;

          const initialViewState: ViewState = {
            currentViewStart,
            currentViewEnd,
            viewSize,
            totalDataPoints,
            hasDataBefore: currentViewStart > 0,
            hasDataAfter: false, // We start at the most recent data
          };

          console.log('View-based loading setup:', {
            totalDataPoints,
            viewSize,
            currentViewStart,
            currentViewEnd,
            hasDataBefore: currentViewStart > 0,
            hasDataAfter: false,
            formattedDataLength: formattedData.length,
          });

          // Set view state and current view data directly
          setViewState(initialViewState);
          viewStateRef.current = initialViewState;
          const viewData = formattedData.slice(currentViewStart, currentViewEnd + 1);

          console.log('Initial view data:', {
            viewDataLength: viewData.length,
            allDataLength: formattedData.length,
          });

          setCurrentViewData(viewData);
          // Set the main chartData to the initial view
          setChartData(viewData);
        } else {
          // Traditional mode - use all data
          setChartData(formattedData);
        }

        setDataRange(newDataRange);
        setMaxDataPoints(dataPoints);

        // Reset loading states for new data
        setLeftLoadCount(0);
        setRightLoadCount(0);

        // Call callback if provided
        if (onDataLoaded) {
          onDataLoaded(enableViewBasedLoading ? currentViewData : formattedData, newDataRange);
        }
      } catch (err: any) {
        const errorMessage = err.response?.data?.error || 'Failed to load chart data';
        setError(errorMessage);

        if (onError) {
          onError(errorMessage);
        }
      } finally {
        setIsLoading(false);
      }
    },
    [
      timeframes,
      bufferPoints,
      enableViewBasedLoading,
      onDataLoaded,
      onError,
      updateViewState,
      currentViewData,
    ]
  );

  const loadMoreDataLeft = useCallback(
    async (symbol: string, timeframe: ChartTimeframe) => {
      console.log('loadMoreDataLeft called:', {
        chartDataLength: chartData.length,
        isLeftLoading,
        leftLoadCount,
        symbol,
        timeframe,
        enableViewBasedLoading,
      });

      if (!chartData.length || isLeftLoading || leftLoadCount >= 5) {
        console.log('loadMoreDataLeft blocked:', {
          noData: !chartData.length,
          isLoading: isLeftLoading,
          tooManyLoads: leftLoadCount >= 5,
        });
        return;
      }

      try {
        setIsLeftLoading(true);
        setError(null);

        // Find the timeframe configuration to get the appropriate data points
        const timeframeConfig = timeframes.find((tf) => tf.value === timeframe);
        const dataPoints = timeframeConfig?.dataPoints || DEFAULT_CHART_DATA_POINTS;

        // Get the earliest timestamp from current data
        const sortedData = [...chartData].sort(
          (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
        );
        const earliestTime = sortedData[0].time;
        const endTime = new Date(new Date(earliestTime).getTime() - 60000).toISOString(); // Subtract 1 minute

        console.log('Making API call for left data:', {
          symbol,
          timeframe,
          dataPoints,
          endTime,
          bufferPoints,
          enableViewBasedLoading,
        });

        let response: ChartDataResponse;

        if (enableViewBasedLoading) {
          // Use view-based loading for additional data
          response = await apiService.getChartData(
            symbol,
            timeframe,
            dataPoints,
            endTime,
            undefined, // bufferPoints - not used in view-based mode
            true, // viewBasedLoading
            dataPoints // viewSize
          );
        } else {
          // Use traditional loading
          response = await apiService.getChartData(
            symbol,
            timeframe,
            dataPoints,
            endTime,
            bufferPoints
          );
        }

        console.log('Left data API response:', {
          barsCount: response.bars?.length || 0,
          response,
        });

        // Process the new data
        const { formattedData } = processChartData(response.bars);

        console.log('Left data processing:', {
          formattedDataLength: formattedData.length,
          formattedData: formattedData.slice(0, 3), // Show first 3 items
        });

        if (enableViewBasedLoading) {
          // Update all data and view state
          setAllData((prevAllData) => {
            const existingTimes = new Set(prevAllData.map((d) => d.time));
            const newData = formattedData.filter((d) => !existingTimes.has(d.time));

            const combined = [...prevAllData, ...newData].sort(
              (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
            );

            if (newData.length > 0) {
              setLeftLoadCount((prev) => prev + 1);
              console.log('Left data loaded successfully, new count:', newData.length);
            }

            return combined;
          });
        } else {
          // Traditional mode - merge with existing data
          setChartData((prevData) => {
            const combined = [...formattedData, ...prevData];
            const uniqueData = Array.from(
              new Map(combined.map((item) => [item.time, item])).values()
            );
            const sorted = uniqueData.sort(
              (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
            );

            const newDataLength = sorted.length - prevData.length;

            if (newDataLength > 0) {
              setLeftLoadCount((prev) => prev + 1);
            }

            return sorted;
          });
        }
      } catch (err: any) {
        const errorMessage = err.response?.data?.error || 'Failed to load more data';
        setError(errorMessage);

        if (onError) {
          onError(errorMessage);
        }
      } finally {
        setIsLeftLoading(false);
      }
    },
    [
      chartData,
      timeframes,
      bufferPoints,
      isLeftLoading,
      leftLoadCount,
      onError,
      enableViewBasedLoading,
    ]
  );

  const loadMoreDataRight = useCallback(
    async (symbol: string, timeframe: ChartTimeframe) => {
      console.log('loadMoreDataRight called:', {
        chartDataLength: chartData.length,
        isRightLoading,
        rightLoadCount,
        symbol,
        timeframe,
        enableViewBasedLoading,
      });

      if (!chartData.length || isRightLoading || rightLoadCount >= 5) {
        console.log('loadMoreDataRight blocked:', {
          noData: !chartData.length,
          isLoading: isRightLoading,
          tooManyLoads: rightLoadCount >= 5,
        });
        return;
      }

      try {
        setIsRightLoading(true);
        setError(null);

        // Find the timeframe configuration to get the appropriate data points
        const timeframeConfig = timeframes.find((tf) => tf.value === timeframe);
        const dataPoints = timeframeConfig?.dataPoints || DEFAULT_CHART_DATA_POINTS;

        // Get the latest timestamp from current data
        const sortedData = [...chartData].sort(
          (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
        );
        const latestTime = sortedData[sortedData.length - 1].time;

        // Use a time slightly after the latest to get newer data
        const endTime = new Date(new Date(latestTime).getTime() + 60000).toISOString(); // Add 1 minute

        let response: ChartDataResponse;

        if (enableViewBasedLoading) {
          // Use view-based loading for additional data
          response = await apiService.getChartData(
            symbol,
            timeframe,
            dataPoints,
            endTime,
            undefined, // bufferPoints - not used in view-based mode
            true, // viewBasedLoading
            dataPoints // viewSize
          );
        } else {
          // Use traditional loading
          response = await apiService.getChartData(
            symbol,
            timeframe,
            dataPoints,
            endTime,
            bufferPoints
          );
        }

        // Process the new data
        const { formattedData } = processChartData(response.bars);

        if (enableViewBasedLoading) {
          // Update all data and view state
          setAllData((prevAllData) => {
            const existingTimes = new Set(prevAllData.map((d) => d.time));
            const newData = formattedData.filter((d) => !existingTimes.has(d.time));

            const combined = [...prevAllData, ...newData].sort(
              (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
            );

            if (newData.length > 0) {
              setRightLoadCount((prev) => prev + 1);
            }

            return combined;
          });
        } else {
          // Traditional mode - merge with existing data
          setChartData((prevData) => {
            const combined = [...prevData, ...formattedData];
            const uniqueData = Array.from(
              new Map(combined.map((item) => [item.time, item])).values()
            );
            const sorted = uniqueData.sort(
              (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
            );

            const newDataLength = sorted.length - prevData.length;

            if (newDataLength > 0) {
              setRightLoadCount((prev) => prev + 1);
            }

            return sorted;
          });
        }
      } catch (err: any) {
        const errorMessage = err.response?.data?.error || 'Failed to load more data';
        setError(errorMessage);

        if (onError) {
          onError(errorMessage);
        }
      } finally {
        setIsRightLoading(false);
      }
    },
    [
      chartData,
      timeframes,
      bufferPoints,
      isRightLoading,
      rightLoadCount,
      onError,
      enableViewBasedLoading,
    ]
  );

  const updateChartWithLiveData = useCallback(
    (bar: AlpacaBar) => {
      const newCandle: CandlestickData = {
        time: bar.t,
        open: bar.o,
        high: bar.h,
        low: bar.l,
        close: bar.c,
      };

      if (enableViewBasedLoading) {
        // Update all data and current view data
        setAllData((prevAllData) => {
          const lastCandle = prevAllData[prevAllData.length - 1];
          if (lastCandle && lastCandle.time === newCandle.time) {
            // Update existing candle
            const updatedData = [...prevAllData];
            updatedData[updatedData.length - 1] = newCandle;
            return updatedData;
          } else {
            // Add new candle
            return [...prevAllData, newCandle];
          }
        });

        // Update current view data if it includes the latest data
        setCurrentViewData((prevViewData) => {
          const lastCandle = prevViewData[prevViewData.length - 1];
          if (lastCandle && lastCandle.time === newCandle.time) {
            // Update existing candle
            const updatedData = [...prevViewData];
            updatedData[updatedData.length - 1] = newCandle;
            return updatedData;
          } else {
            // Add new candle
            return [...prevViewData, newCandle];
          }
        });
      } else {
        // Traditional mode - update chart data directly
        setChartData((prevData) => {
          const lastCandle = prevData[prevData.length - 1];
          if (lastCandle && lastCandle.time === newCandle.time) {
            // Update existing candle
            const updatedData = [...prevData];
            updatedData[updatedData.length - 1] = newCandle;
            return updatedData;
          } else {
            // Add new candle
            return [...prevData, newCandle];
          }
        });
      }
    },
    [enableViewBasedLoading]
  );

  // Get the limited data for display (only show maxDataPoints)
  const getDisplayData = useCallback(() => {
    if (enableViewBasedLoading) {
      // In view-based mode, return current view data
      return currentViewData;
    }

    if (chartData.length === 0 || maxDataPoints === 0) {
      return chartData;
    }

    const sortedData = [...chartData].sort(
      (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
    );

    return sortedData;
  }, [chartData, maxDataPoints, enableViewBasedLoading, currentViewData]);

  return {
    chartData: getDisplayData(),
    dataRange,
    isLoading,
    error,
    loadChartData,
    loadMoreDataLeft,
    loadMoreDataRight,
    updateChartWithLiveData,
    clearError,
    isLeftLoading,
    isRightLoading,
    // View-based loading methods
    panLeft,
    panRight,
    canPanLeft,
    canPanRight,
    viewState,
    updateViewState,
  };
};
