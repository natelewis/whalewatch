import { useState, useCallback } from 'react';
import { AlpacaBar, ChartTimeframe, ChartDataResponse, DEFAULT_CHART_DATA_POINTS } from '../types';
import { apiService } from '../services/apiService';
import { processChartData, CandlestickData, DataRange, TimeframeConfig } from '../utils/chartDataUtils';

interface UseChartDataProps {
  timeframes: TimeframeConfig[];
  onDataLoaded?: (data: CandlestickData[], range: DataRange | null) => void;
  onError?: (error: string) => void;
  bufferPoints?: number; // Number of buffer points to load on each side
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
}

export const useChartData = ({
  timeframes,
  onDataLoaded,
  onError,
  bufferPoints = 20, // Default buffer points
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

  const clearError = useCallback(() => {
    setError(null);
  }, []);

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

        const response: ChartDataResponse = await apiService.getChartData(
          symbol,
          timeframe,
          dataPoints,
          undefined, // endTime - use current time
          bufferPoints // Add buffer points
        );

        // Process the data using utility functions
        const { formattedData, dataRange: newDataRange } = processChartData(response.bars);

        // Update state
        setChartData(formattedData);
        setDataRange(newDataRange);
        setMaxDataPoints(dataPoints); // Set the maximum data points to show

        // Reset loading states for new data
        setHasLoadedLeft(false);
        setHasLoadedRight(false);
        setLeftLoadCount(0);
        setRightLoadCount(0);

        // Call callback if provided
        if (onDataLoaded) {
          onDataLoaded(formattedData, newDataRange);
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
    [timeframes, bufferPoints, onDataLoaded, onError]
  );

  const loadMoreDataLeft = useCallback(
    async (symbol: string, timeframe: ChartTimeframe) => {
      if (!chartData.length || isLeftLoading || hasLoadedLeft || leftLoadCount >= 3) return;

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

        const response: ChartDataResponse = await apiService.getChartData(
          symbol,
          timeframe,
          dataPoints,
          earliestTime, // Use earliest time as end time to get older data
          bufferPoints
        );

        // Process the new data
        const { formattedData } = processChartData(response.bars);

        // Merge with existing data, keeping only unique timestamps
        setChartData((prevData) => {
          const existingTimes = new Set(prevData.map((d) => d.time));
          const newData = formattedData.filter((d) => !existingTimes.has(d.time));

          // Combine and sort by time
          const combined = [...prevData, ...newData].sort(
            (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
          );

           // If we got new data, mark as loaded and increment count
           if (newData.length > 0) {
             setHasLoadedLeft(true);
             setLeftLoadCount((prev) => prev + 1);
           } else {
             // No new data means we've reached the boundary
             setHasLoadedLeft(true);
           }

          return combined;
        });
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
    [chartData, timeframes, bufferPoints, isLeftLoading, hasLoadedLeft, leftLoadCount, onError]
  );

  const loadMoreDataRight = useCallback(
    async (symbol: string, timeframe: ChartTimeframe) => {
      if (!chartData.length || isRightLoading || hasLoadedRight || rightLoadCount >= 3) return;

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

        const response: ChartDataResponse = await apiService.getChartData(
          symbol,
          timeframe,
          dataPoints,
          endTime,
          bufferPoints
        );

        // Process the new data
        const { formattedData } = processChartData(response.bars);

        // Merge with existing data, keeping only unique timestamps
        setChartData((prevData) => {
          const existingTimes = new Set(prevData.map((d) => d.time));
          const newData = formattedData.filter((d) => !existingTimes.has(d.time));

          // Combine and sort by time
          const combined = [...prevData, ...newData].sort(
            (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
          );

           // If we got new data, mark as loaded and increment count
           if (newData.length > 0) {
             setHasLoadedRight(true);
             setRightLoadCount((prev) => prev + 1);
           } else {
             // No new data means we've reached the boundary
             setHasLoadedRight(true);
           }

          return combined;
        });
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
    [chartData, timeframes, bufferPoints, isRightLoading, hasLoadedRight, rightLoadCount, onError]
  );

  const updateChartWithLiveData = useCallback((bar: AlpacaBar) => {
    const newCandle: CandlestickData = {
      time: bar.t,
      open: bar.o,
      high: bar.h,
      low: bar.l,
      close: bar.c,
    };

    // Update the last candle or add a new one
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
  }, []);

  // Get the limited data for display (only show maxDataPoints)
  const getDisplayData = useCallback(() => {
    if (chartData.length === 0 || maxDataPoints === 0) {
      return chartData;
    }

    const sortedData = [...chartData].sort(
      (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
    );

    // If we have more data than maxDataPoints, show only the most recent data
    if (sortedData.length > maxDataPoints) {
      return sortedData.slice(-maxDataPoints);
    }

    return sortedData;
  }, [chartData, maxDataPoints]);

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
  };
};
