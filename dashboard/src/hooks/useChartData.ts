import { useState, useCallback } from 'react';
import { AlpacaBar, ChartTimeframe, ChartDataResponse, DEFAULT_CHART_DATA_POINTS } from '../types';
import { apiService } from '../services/apiService';
import { processChartData, CandlestickData, DataRange, TimeframeConfig } from '../utils/chartDataUtils';

interface UseChartDataProps {
  timeframes: TimeframeConfig[];
  onDataLoaded?: (data: CandlestickData[], range: DataRange | null) => void;
  onError?: (error: string) => void;
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
}: UseChartDataProps): UseChartDataReturn => {
  const [chartData, setChartData] = useState<CandlestickData[]>([]);
  const [dataRange, setDataRange] = useState<DataRange | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const loadChartData = useCallback(async (symbol: string, timeframe: ChartTimeframe) => {
    try {
      setIsLoading(true);
      setError(null);

      // Find the timeframe configuration to get the appropriate data points
      const timeframeConfig = timeframes.find((tf) => tf.value === timeframe);
      const dataPoints = timeframeConfig?.dataPoints || DEFAULT_CHART_DATA_POINTS;

      const response: ChartDataResponse = await apiService.getChartData(
        symbol,
        timeframe,
        dataPoints
      );

      // Process the data using utility functions
      const { formattedData, dataRange: newDataRange } = processChartData(response.bars);

      // Update state
      setChartData(formattedData);
      setDataRange(newDataRange);

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
  }, [timeframes]);

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

  return {
    chartData,
    dataRange,
    isLoading,
    error,
    loadChartData,
    updateChartWithLiveData,
    clearError,
  };
};
