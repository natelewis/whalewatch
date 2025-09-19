import { useState, useCallback, useRef } from 'react';
import { AlpacaBar, ChartTimeframe, ChartDataResponse, DEFAULT_CHART_DATA_POINTS } from '../types';
import { apiService } from '../services/apiService';
import {
  processChartData,
  CandlestickData,
  DataRange,
  TimeframeConfig,
} from '../utils/chartDataUtils';

// THIS FILE IS DEPRECATED -

// Only FOR OLD ANALYSIS USE

export type ChartData = CandlestickData[];

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
  updateChartWithLiveData: (bar: AlpacaBar) => void;
  clearError: () => void;
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
  const [error, setError] = useState<string | null>(null);
  const [maxDataPoints, setMaxDataPoints] = useState<number>(0);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const loadChartData = useCallback(
    async (symbol: string, timeframe: ChartTimeframe) => {
      try {
        setIsLoading(true);
        setError(null);

        // Find the timeframe configuration to get the appropriate data points
        const timeframeConfig = timeframes.find((tf) => tf.value === timeframe);
        const dataPoints = timeframeConfig?.dataPoints || DEFAULT_CHART_DATA_POINTS;

        // Load chart data
        const response = await apiService.getChartData(
          symbol,
          timeframe,
          dataPoints,
          undefined, // endTime - use current time
          bufferPoints // Add buffer points
        );

        // Process the data using utility functions
        const { formattedData, dataRange: newDataRange } = processChartData(response.bars);

        console.log('Initial data load:', {
          symbol,
          timeframe,
          dataPoints,
          barsCount: response.bars?.length || 0,
          formattedDataLength: formattedData.length,
          dataRange: newDataRange,
        });

        // Set chart data
        setChartData(formattedData);
        setDataRange(newDataRange);
        setMaxDataPoints(dataPoints);

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

  const updateChartWithLiveData = useCallback((bar: AlpacaBar) => {
    const newCandle: CandlestickData = {
      time: bar.t,
      open: bar.o,
      high: bar.h,
      low: bar.l,
      close: bar.c,
    };

    // Update chart data directly
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

    return sortedData;
  }, [chartData, maxDataPoints]);

  return {
    chartData: getDisplayData(),
    dataRange,
    isLoading,
    error,
    loadChartData,
    updateChartWithLiveData,
    clearError,
  };
};
