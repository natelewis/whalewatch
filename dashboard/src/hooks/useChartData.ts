import { useState, useCallback, useRef } from 'react';
import { AlpacaBar, ChartTimeframe, ChartDataResponse, DEFAULT_CHART_DATA_POINTS } from '../types';
import { apiService } from '../services/apiService';
import {
  processChartData,
  CandlestickData,
  DataRange,
  TimeframeConfig,
} from '../utils/chartDataUtils';

export type ChartData = CandlestickData[];

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

  // Request de-duplication and boundary flags
  const lastLeftEndTimeRef = useRef<string | null>(null);
  const lastRightEndTimeRef = useRef<string | null>(null);
  const noMoreLeftDataRef = useRef<boolean>(false);
  const noMoreRightDataRef = useRef<boolean>(false);

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

  // Pan left - move view one position to the left
  const panLeft = useCallback(() => {
    if (!viewState || !canPanLeft) {
      console.log('panLeft blocked:', { hasViewState: !!viewState, canPanLeft });
      return;
    }

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

    updateViewState(newViewState);
  }, [viewState, canPanLeft, updateViewState]);

  // Pan right - move view one position to the right
  const panRight = useCallback(() => {
    if (!viewState || !canPanRight) {
      return;
    }

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

        // Find the timeframe configuration to get the appropriate data points
        const timeframeConfig = timeframes.find((tf) => tf.value === timeframe);
        const dataPoints = timeframeConfig?.dataPoints || DEFAULT_CHART_DATA_POINTS;

        let response: ChartDataResponse;

        if (enableViewBasedLoading) {
          response = await apiService.getChartData(
            symbol,
            timeframe,
            dataPoints,
            undefined,
            undefined,
            true,
            dataPoints
          );
        } else {
          response = await apiService.getChartData(
            symbol,
            timeframe,
            dataPoints,
            undefined,
            bufferPoints
          );
        }

        const { formattedData, dataRange: newDataRange } = processChartData(response.bars);

        if (enableViewBasedLoading) {
          setAllData(formattedData);

          const totalDataPoints = formattedData.length;
          const viewSize = Math.min(dataPoints, Math.max(10, Math.floor(totalDataPoints / 3)));
          const currentViewStart = Math.max(0, totalDataPoints - viewSize);
          const currentViewEnd = totalDataPoints - 1;

          const initialViewState: ViewState = {
            currentViewStart,
            currentViewEnd,
            viewSize,
            totalDataPoints,
            hasDataBefore: currentViewStart > 0,
            hasDataAfter: false,
          };

          setViewState(initialViewState);
          viewStateRef.current = initialViewState;
          const viewData = formattedData.slice(currentViewStart, currentViewEnd + 1);
          setCurrentViewData(viewData);
          setChartData(viewData);
        } else {
          setChartData(formattedData);
        }

        setDataRange(newDataRange);
        setMaxDataPoints(dataPoints);
        // Reset boundary flags when reloading base data
        noMoreLeftDataRef.current = false;
        noMoreRightDataRef.current = false;
        lastLeftEndTimeRef.current = null;
        lastRightEndTimeRef.current = null;

        if (onDataLoaded) {
          onDataLoaded(enableViewBasedLoading ? currentViewData : formattedData, newDataRange);
        }
      } catch (err: unknown) {
        const errorMessage =
          (err as { response?: { data?: { error?: string } } }).response?.data?.error ||
          'Failed to load chart data';
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
        symbol,
        timeframe,
        enableViewBasedLoading,
      });

      if (!chartData.length || isLeftLoading) {
        console.log('loadMoreDataLeft blocked:', {
          noData: !chartData.length,
          isLoading: isLeftLoading,
        });
        return;
      }

      try {
        setIsLeftLoading(true);
        setError(null);

        // Determine earliest time from current data
        const sortedData = [...chartData].sort(
          (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
        );
        const earliestTime = sortedData[0].time;
        const endTime = new Date(new Date(earliestTime).getTime() - 60000).toISOString();

        // Guard against duplicate requests and exhausted data
        if (noMoreLeftDataRef.current) {
          console.log('loadMoreDataLeft blocked: no more older data');
          return;
        }
        if (lastLeftEndTimeRef.current === endTime) {
          console.log('loadMoreDataLeft blocked: duplicate endTime', endTime);
          return;
        }
        lastLeftEndTimeRef.current = endTime;

        console.log('Making API call for left data:', {
          symbol,
          timeframe,
          dataPoints:
            timeframes.find((tf) => tf.value === timeframe)?.dataPoints ||
            DEFAULT_CHART_DATA_POINTS,
          endTime,
          bufferPoints,
          enableViewBasedLoading,
        });

        let response: ChartDataResponse;
        const dataPoints =
          timeframes.find((tf) => tf.value === timeframe)?.dataPoints || DEFAULT_CHART_DATA_POINTS;

        if (enableViewBasedLoading) {
          response = await apiService.getChartData(
            symbol,
            timeframe,
            dataPoints,
            endTime,
            undefined,
            true,
            dataPoints
          );
        } else {
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

        const { formattedData } = processChartData(response.bars);

        console.log('Left data processing:', {
          formattedDataLength: formattedData.length,
          formattedData: formattedData.slice(0, 3),
        });

        // Check if the response actually contains older data
        const responseEarliest = formattedData.length
          ? formattedData.reduce<string>(
              (min, d) => (new Date(d.time).getTime() < new Date(min).getTime() ? d.time : min),
              formattedData[0].time
            )
          : null;
        const hasOlderData =
          responseEarliest !== null &&
          new Date(responseEarliest).getTime() < new Date(earliestTime).getTime();
        if (!hasOlderData) {
          // No older data; stop further left attempts until base reload
          noMoreLeftDataRef.current = true;
          return;
        }

        if (enableViewBasedLoading) {
          setAllData((prevAllData) => {
            const existingTimes = new Set(prevAllData.map((d) => d.time));
            const newData = formattedData.filter((d) => !existingTimes.has(d.time));
            const combined = [...prevAllData, ...newData].sort(
              (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
            );
            return combined;
          });
        } else {
          setChartData((prevData) => {
            const combined = [...formattedData, ...prevData];
            const uniqueData = Array.from(
              new Map(combined.map((item) => [item.time, item])).values()
            );
            const sorted = uniqueData.sort(
              (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
            );
            return sorted;
          });
        }
      } catch (err: unknown) {
        const errorMessage =
          (err as { response?: { data?: { error?: string } } }).response?.data?.error ||
          'Failed to load more data';
        setError(errorMessage);

        if (onError) {
          onError(errorMessage);
        }
      } finally {
        setIsLeftLoading(false);
      }
    },
    [chartData, timeframes, bufferPoints, isLeftLoading, onError, enableViewBasedLoading]
  );

  const loadMoreDataRight = useCallback(
    async (symbol: string, timeframe: ChartTimeframe) => {
      console.log('loadMoreDataRight called:', {
        chartDataLength: chartData.length,
        isRightLoading,
        symbol,
        timeframe,
        enableViewBasedLoading,
      });

      if (!chartData.length || isRightLoading) {
        console.log('loadMoreDataRight blocked:', {
          noData: !chartData.length,
          isLoading: isRightLoading,
        });
        return;
      }

      try {
        setIsRightLoading(true);
        setError(null);

        const sortedData = [...chartData].sort(
          (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
        );
        const latestTime = sortedData[sortedData.length - 1].time;
        const endTime = new Date(new Date(latestTime).getTime() + 60000).toISOString();

        if (noMoreRightDataRef.current) {
          console.log('loadMoreDataRight blocked: no more newer data');
          return;
        }
        if (lastRightEndTimeRef.current === endTime) {
          console.log('loadMoreDataRight blocked: duplicate endTime', endTime);
          return;
        }
        lastRightEndTimeRef.current = endTime;

        let response: ChartDataResponse;
        const dataPoints =
          timeframes.find((tf) => tf.value === timeframe)?.dataPoints || DEFAULT_CHART_DATA_POINTS;

        if (enableViewBasedLoading) {
          response = await apiService.getChartData(
            symbol,
            timeframe,
            dataPoints,
            endTime,
            undefined,
            true,
            dataPoints
          );
        } else {
          response = await apiService.getChartData(
            symbol,
            timeframe,
            dataPoints,
            endTime,
            bufferPoints
          );
        }

        const { formattedData } = processChartData(response.bars);

        const responseLatest = formattedData.length
          ? formattedData.reduce<string>(
              (max, d) => (new Date(d.time).getTime() > new Date(max).getTime() ? d.time : max),
              formattedData[0].time
            )
          : null;
        const hasNewerData =
          responseLatest !== null &&
          new Date(responseLatest).getTime() > new Date(latestTime).getTime();
        if (!hasNewerData) {
          noMoreRightDataRef.current = true;
          return;
        }

        if (enableViewBasedLoading) {
          setAllData((prevAllData) => {
            const existingTimes = new Set(prevAllData.map((d) => d.time));
            const newData = formattedData.filter((d) => !existingTimes.has(d.time));
            const combined = [...prevAllData, ...newData].sort(
              (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
            );
            return combined;
          });
        } else {
          setChartData((prevData) => {
            const combined = [...prevData, ...formattedData];
            const uniqueData = Array.from(
              new Map(combined.map((item) => [item.time, item])).values()
            );
            const sorted = uniqueData.sort(
              (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
            );
            return sorted;
          });
        }
      } catch (err: unknown) {
        const errorMessage =
          (err as { response?: { data?: { error?: string } } }).response?.data?.error ||
          'Failed to load more data';
        setError(errorMessage);

        if (onError) {
          onError(errorMessage);
        }
      } finally {
        setIsRightLoading(false);
      }
    },
    [chartData, timeframes, bufferPoints, isRightLoading, onError, enableViewBasedLoading]
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
        setAllData((prevAllData) => {
          const lastCandle = prevAllData[prevAllData.length - 1];
          if (lastCandle && lastCandle.time === newCandle.time) {
            const updatedData = [...prevAllData];
            updatedData[updatedData.length - 1] = newCandle;
            return updatedData;
          } else {
            return [...prevAllData, newCandle];
          }
        });

        setCurrentViewData((prevViewData) => {
          const lastCandle = prevViewData[prevViewData.length - 1];
          if (lastCandle && lastCandle.time === newCandle.time) {
            const updatedData = [...prevViewData];
            updatedData[updatedData.length - 1] = newCandle;
            return updatedData;
          } else {
            return [...prevViewData, newCandle];
          }
        });
      } else {
        setChartData((prevData) => {
          const lastCandle = prevData[prevData.length - 1];
          if (lastCandle && lastCandle.time === newCandle.time) {
            const updatedData = [...prevData];
            updatedData[updatedData.length - 1] = newCandle;
            return updatedData;
          } else {
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
    panLeft,
    panRight,
    canPanLeft,
    canPanRight,
    viewState,
    updateViewState,
  };
};
