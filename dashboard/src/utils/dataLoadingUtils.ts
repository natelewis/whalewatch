import { CandlestickData, ChartTimeframe, AlpacaBar } from '../types';
import { BUFFER_SIZE, MAX_DATA_POINTS } from '../constants';
import { processChartData, isFakeCandle } from './chartDataUtils';
import { apiService } from '../services/apiService';
import { logger } from './logger';

export interface DataLoadingResult {
  success: boolean;
  data?: CandlestickData[];
  error?: string;
  reachedEnd?: boolean;
}

export interface DataLoadingOptions {
  symbol: string;
  timeframe: ChartTimeframe;
  direction: 'past' | 'future' | 'centered';
  startTime?: string;
  fetchPoints?: number;
}

/**
 * Merge new historical data with existing data
 */
export const mergeHistoricalData = (existingData: CandlestickData[], newData: CandlestickData[]): CandlestickData[] => {
  // Combine all data and deduplicate by timestamp
  const combinedData = [...existingData, ...newData];
  const uniqueData = combinedData.reduce((acc: CandlestickData[], current: CandlestickData) => {
    const existingIndex = acc.findIndex((item: CandlestickData) => item.timestamp === current.timestamp);
    if (existingIndex === -1) {
      acc.push(current);
    } else {
      // If duplicate timestamp, keep the newer data (from newData)
      acc[existingIndex] = current;
    }
    return acc;
  }, [] as CandlestickData[]);

  // Sort by time to ensure chronological order
  return uniqueData.sort(
    (a: CandlestickData, b: CandlestickData) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
};

/**
 * Load chart data from API
 */
export const loadChartData = async (options: DataLoadingOptions): Promise<DataLoadingResult> => {
  const { symbol, timeframe, direction, startTime, fetchPoints = BUFFER_SIZE } = options;

  try {
    logger.chart.data('Loading chart data:', {
      symbol,
      timeframe,
      direction,
      fetchPoints,
      startTime,
    });

    const response = await apiService.getChartData(symbol, timeframe, fetchPoints, startTime, direction);

    const { formattedData } = processChartData(response.bars, timeframe, fetchPoints);

    // Check if we actually got new data
    if (formattedData.length === 0) {
      logger.chart.data(`No new data available for ${direction} direction`);
      return {
        success: true,
        data: [],
        reachedEnd: true,
      };
    }

    // Check if we got significantly fewer data points than requested
    // Be very conservative about marking as "end of data"
    const dataRatio = formattedData.length / fetchPoints;
    const isExtremelyFewData = dataRatio < 0.01; // Less than 1% of requested data (extremely strict)

    // Only mark as end of data if we got extremely few results
    // This prevents false positives when there might be temporary API issues or rate limits
    if (isExtremelyFewData) {
      logger.chart.data(
        `Potentially reached end of ${direction} data: got ${formattedData.length} of ${fetchPoints} requested`
      );
      return {
        success: true,
        data: formattedData,
        reachedEnd: true,
      };
    }

    logger.chart.success('Chart data loaded successfully:', {
      symbol,
      timeframe,
      direction,
      fetched: formattedData.length,
      requested: fetchPoints,
    });

    return {
      success: true,
      data: formattedData,
      reachedEnd: false,
    };
  } catch (error) {
    logger.error('Failed to load chart data:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};

/**
 * Auto-load more data when buffered candles are rendered
 */
export const autoLoadData = async (
  options: DataLoadingOptions,
  currentData: CandlestickData[],
  reachedEndOfData: { past: boolean; future: boolean },
  isLoadingData: boolean
): Promise<DataLoadingResult> => {
  const { direction } = options;

  // Only load more data if we haven't reached the maximum yet
  if (currentData.length >= MAX_DATA_POINTS) {
    logger.chart.data('Max data points reached, skipping auto-load');
    return { success: false, error: 'Max data points reached' };
  }

  // Check if we've already reached the end of data in this direction
  if (direction !== 'centered' && reachedEndOfData[direction]) {
    logger.chart.data(`Already reached end of ${direction} data, skipping auto-load`);
    return { success: false, error: 'End of data reached' };
  }

  // Prevent multiple in-flight loads
  if (isLoadingData) {
    logger.chart.skip('Skipping auto-load, request in flight');
    return { success: false, error: 'Request in flight' };
  }

  // Determine anchor time based on direction
  const anchorTimestamp =
    direction === 'past' ? currentData[0]?.timestamp : currentData[currentData.length - 1]?.timestamp;

  if (!anchorTimestamp) {
    logger.warn('Cannot auto-load more data: no anchor timestamp');
    return { success: false, error: 'No anchor timestamp' };
  }

  const result = await loadChartData({
    ...options,
    startTime: anchorTimestamp,
  });

  if (!result.success) {
    return result;
  }

  if (result.reachedEnd) {
    return {
      ...result,
      error: `Reached end of ${direction} data`,
    };
  }

  return result;
};

/**
 * Process WebSocket data update
 */
export const processWebSocketData = (bar: AlpacaBar, currentData: CandlestickData[]): CandlestickData[] => {
  const newCandle: CandlestickData = {
    timestamp: bar.t,
    open: bar.o,
    high: bar.h,
    low: bar.l,
    close: bar.c,
    volume: bar.v ?? 0,
  };

  // Find the last real (non-fake) candle
  let lastRealCandleIndex = currentData.length - 1;
  while (lastRealCandleIndex >= 0 && isFakeCandle(currentData[lastRealCandleIndex])) {
    lastRealCandleIndex--;
  }

  // If no real candles found, just add the new candle
  if (lastRealCandleIndex < 0) {
    return [newCandle];
  }

  const lastRealCandle = currentData[lastRealCandleIndex];

  if (lastRealCandle.timestamp === newCandle.timestamp) {
    // Update existing candle - replace the last real candle
    const updatedData = [...currentData];
    updatedData[lastRealCandleIndex] = newCandle;
    return updatedData;
  } else {
    // Add new candle - insert it just before any fake candles
    const realData = currentData.slice(0, lastRealCandleIndex + 1);
    const fakeData = currentData.slice(lastRealCandleIndex + 1);

    // Insert the new candle after the last real candle, before fake candles
    return [...realData, newCandle, ...fakeData];
  }
};

/**
 * Check if auto-redraw should be triggered for WebSocket data
 */
export const shouldAutoRedraw = (
  updatedData: CandlestickData[],
  currentViewStart: number,
  currentViewEnd: number
): boolean => {
  if (updatedData.length === 0) {
    return false;
  }

  // Get the 5 newest real candles (excluding fake candles)
  const realCandles = updatedData.filter(candle => !isFakeCandle(candle));
  if (realCandles.length === 0) {
    return false;
  }

  const newestCandles = realCandles.slice(-5); // Last 5 real candles
  const newestCandleIndices = newestCandles.map(candle => updatedData.findIndex(d => d.timestamp === candle.timestamp));

  // Check if current viewport overlaps with any of the 5 newest candles
  const hasOverlap = newestCandleIndices.some(index => index >= currentViewStart && index <= currentViewEnd);

  logger.chart.viewport('Auto-redraw decision:', {
    totalDataLength: updatedData.length,
    realCandlesCount: realCandles.length,
    newestCandleIndices,
    currentViewport: `${currentViewStart}-${currentViewEnd}`,
    hasOverlap,
    willAutoRedraw: hasOverlap,
  });

  return hasOverlap;
};

/**
 * Calculate new viewport for auto-redraw
 */
export const calculateAutoRedrawViewport = (
  updatedData: CandlestickData[],
  currentViewStart: number,
  currentViewEnd: number
): { start: number; end: number } => {
  const newestCandleIndex = updatedData.length - 1;
  const viewportSize = currentViewEnd - currentViewStart;

  // Slide viewport to show the newest candle at the right edge
  const newViewEnd = newestCandleIndex;
  const newViewStart = Math.max(0, newestCandleIndex - viewportSize);

  logger.chart.loading('Auto-redraw viewport calculated:', {
    newestCandleIndex,
    previousView: `${currentViewStart}-${currentViewEnd}`,
    newView: `${newViewStart}-${newViewEnd}`,
    viewportSize,
  });

  return { start: newViewStart, end: newViewEnd };
};

/**
 * Prune data to maintain memory limits
 */
export const pruneData = (
  data: CandlestickData[],
  viewStart: number,
  viewEnd: number,
  bufferSize: number = BUFFER_SIZE
): { prunedData: CandlestickData[]; viewportShift: number } => {
  const total = data.length;
  const desiredWindow = Math.min(total, bufferSize * 2);

  const keepStart = Math.max(0, Math.min(viewStart, total - desiredWindow));
  const preliminaryEnd = Math.min(total - 1, Math.max(viewEnd, desiredWindow - 1));
  const keepEnd = Math.min(preliminaryEnd, keepStart + desiredWindow - 1);

  const leftExcess = keepStart;
  const rightExcess = total - 1 - keepEnd;

  // Only prune if we exceed the allowed window
  const shouldPrune = total > desiredWindow && (leftExcess > 0 || rightExcess > 0);

  if (!shouldPrune) {
    return { prunedData: data, viewportShift: 0 };
  }

  // Slice to the retention window
  const prunedData = data.slice(keepStart, keepEnd + 1);
  const viewportShift = -keepStart; // Negative shift since we removed data from the left

  logger.chart.data('Data pruned:', {
    originalLength: total,
    prunedLength: prunedData.length,
    keepStart,
    keepEnd,
    viewportShift,
  });

  return { prunedData, viewportShift };
};
