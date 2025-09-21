import { useMemo, useCallback } from 'react';
import { CandlestickData } from '../utils/chartDataUtils';
import { memoizedGetPriceRange, memoizedGetVisibleData } from '../utils/memoizedChartUtils';

/**
 * Hook for processing and managing chart data
 * Centralizes data sorting, validation, and slicing logic
 */
export const useChartDataProcessor = (data: CandlestickData[]) => {
  // Memoized sorted data to avoid repeated sorting
  const processedData = useMemo(() => {
    if (!data || data.length === 0) return [];
    return [...data].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
  }, [data]);

  // Validate data is valid and non-empty
  const isValidData = useMemo(() => {
    return !!(data && Array.isArray(data) && data.length > 0);
  }, [data]);

  // Get visible data slice using memoized function
  const getVisibleData = useCallback(
    (startIndex: number, endIndex: number): CandlestickData[] => {
      if (!isValidData) return [];
      return memoizedGetVisibleData(processedData, startIndex, endIndex);
    },
    [processedData, isValidData]
  );

  // Get data range info
  const getDataRange = useCallback(() => {
    if (!isValidData) return null;

    return {
      start: 0,
      end: processedData.length - 1,
      length: processedData.length,
      firstTime: processedData[0]?.time,
      lastTime: processedData[processedData.length - 1]?.time,
    };
  }, [processedData, isValidData]);

  // Get price range for Y-axis scaling using memoized function
  const getPriceRange = useCallback(() => {
    if (!isValidData) return null;
    return memoizedGetPriceRange(processedData);
  }, [processedData, isValidData]);

  // Find data point by time
  const findDataByTime = useCallback(
    (time: string): CandlestickData | null => {
      if (!isValidData) return null;
      return processedData.find((d) => d.time === time) || null;
    },
    [processedData, isValidData]
  );

  // Find data point by index
  const findDataByIndex = useCallback(
    (index: number): CandlestickData | null => {
      if (!isValidData || index < 0 || index >= processedData.length) return null;
      return processedData[index];
    },
    [processedData, isValidData]
  );

  return {
    processedData,
    isValidData,
    getVisibleData,
    getDataRange,
    getPriceRange,
    findDataByTime,
    findDataByIndex,
  };
};
