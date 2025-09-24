import * as d3 from 'd3';
import {
  memoizedMapTicksToPositions,
  memoizedGenerateTimeBasedTicks,
  memoizedGenerateVisibleTimeBasedTicks,
  memoizedFormatTime,
  memoizedApplyAxisStyling,
  memoizedCreateYAxis,
} from './memoizedChartUtils';
import {
  AlpacaBar,
  ChartTimeframe,
  DEFAULT_CHART_DATA_POINTS,
  CandlestickData,
  TimeframeConfig,
  DataRange,
} from '../types';
import { CHART_DATA_POINTS, X_AXIS_LABEL_CONFIGS } from '../constants';
import { logger } from './logger';

/**
 * Remove duplicate entries by timestamp and sort by time
 */
export const deduplicateAndSortBars = (bars: AlpacaBar[]): AlpacaBar[] => {
  return bars
    .reduce((acc, bar) => {
      const timestamp = bar.t;
      if (!acc.find(b => b.t === timestamp)) {
        acc.push(bar);
      }
      return acc;
    }, [] as AlpacaBar[])
    .sort((a, b) => new Date(a.t).getTime() - new Date(b.t).getTime());
};

/**
 * Convert AlpacaBar data to CandlestickData format
 */
export const formatBarsToCandlestickData = (bars: AlpacaBar[]): CandlestickData[] => {
  return bars.map(bar => ({
    timestamp: bar.t,
    open: bar.o,
    high: bar.h,
    low: bar.l,
    close: bar.c,
    volume: bar.v,
  }));
};

/**
 * Calculate data range from processed bars
 */
export const calculateDataRange = (bars: AlpacaBar[]): DataRange | null => {
  if (bars.length === 0) {
    return null;
  }

  return {
    start: new Date(bars[0].t).getTime(),
    end: new Date(bars[bars.length - 1].t).getTime(),
  };
};

/**
 * Get data points count for a given timeframe
 */
export const getDataPointsForTimeframe = (timeframe: ChartTimeframe, timeframes: TimeframeConfig[]): number => {
  const timeframeConfig = timeframes.find(tf => tf.value === timeframe);
  return timeframeConfig?.limit || DEFAULT_CHART_DATA_POINTS;
};

/**
 * Process raw chart data into formatted candlestick data
 * No fake candle padding added (buffer candle on right removed per user request)
 */
export const processChartData = (
  bars: AlpacaBar[],
  timeframe: ChartTimeframe = '1m',
  viewWindowSize: number = 80
): {
  formattedData: CandlestickData[];
  dataRange: DataRange | null;
} => {
  const uniqueBars = deduplicateAndSortBars(bars);
  const formattedData = formatBarsToCandlestickData(uniqueBars);
  const dataRange = calculateDataRange(uniqueBars);

  // No fake candles added (buffer candle on right removed per user request)
  const paddedData = addFakeCandlesForPadding(formattedData, viewWindowSize, timeframe);

  return {
    formattedData: paddedData,
    dataRange,
  };
};

/**
 * Calculate inner dimensions from chart dimensions (width/height minus margins)
 * This is a simple calculation that doesn't need memoization
 */
export const calculateInnerDimensions = (dimensions: {
  width: number;
  height: number;
  margin: { top: number; right: number; bottom: number; left: number };
}): { innerWidth: number; innerHeight: number } => {
  return {
    innerWidth: dimensions.width - dimensions.margin.left - dimensions.margin.right,
    innerHeight: dimensions.height - dimensions.margin.top - dimensions.margin.bottom,
  };
};

/**
 * Apply consistent styling to axis elements
 */
export const applyAxisStyling = memoizedApplyAxisStyling;

// Removed legacy calculateTimeBasedTickValues (unused)

/**
 * Generate time-based ticks that account for actual time distribution
 * This creates ticks that make sense for the data's time pattern
 * Now uses memoized version for better performance with configurable intervals
 */
export const generateTimeBasedTicks = (
  allChartData: { timestamp: string }[],
  markerIntervalMinutes?: number,
  dataPointInterval?: number
): Date[] => {
  return memoizedGenerateTimeBasedTicks(allChartData, markerIntervalMinutes, dataPointInterval);
};

/**
 * Create unified time-based scale that works with transformed linear scale
 * This ensures perfect alignment between X-axis and candlesticks
 */
// Removed unused createUnifiedTimeScale (not used by renderer)

/**
 * Create a time-based scale that maps data indices to screen coordinates
 * This ensures the X-axis labels align perfectly with candlesticks
 * and properly handles time compression (e.g., trading hours only)
 */
export const createIndexToTimeScale = (
  transformedLinearScale: d3.ScaleLinear<number, number>,
  allChartData: { timestamp: string }[]
): d3.ScaleTime<Date, number> => {
  // Safety check for empty or invalid data
  if (!allChartData || allChartData.length === 0) {
    logger.warn('createIndexToTimeScale called with empty or undefined allChartData');
    // Return a default scale that won't cause errors
    const defaultScale = d3.scaleTime();
    defaultScale.domain([new Date(), new Date()]);
    defaultScale.range([0, 1]);
    return defaultScale as unknown as d3.ScaleTime<Date, number>;
  }

  if (!allChartData[0] || !allChartData[0].timestamp) {
    logger.warn('createIndexToTimeScale called with invalid chart data - missing timestamp property');
    const defaultScale = d3.scaleTime();
    defaultScale.domain([new Date(), new Date()]);
    defaultScale.range([0, 1]);
    return defaultScale as unknown as d3.ScaleTime<Date, number>;
  }

  // Create a time-based scale with the actual time domain
  const startTime = new Date(allChartData[0].timestamp);
  const endTime = new Date(allChartData[allChartData.length - 1].timestamp);

  const scale = d3.scaleTime();
  scale.domain([startTime, endTime]);
  scale.range(transformedLinearScale.range());

  return scale as unknown as d3.ScaleTime<Date, number>;
};

/**
 * Create X-axis with time-based scale configuration
 */
// Removed unused createXAxis (custom axis implementation in use)

/**
 * Shared parameters for consistent x-axis calculations across all rendering scenarios
 * This ensures the same calculation logic is used for initial rendering, zooming, and panning
 */
export interface XAxisCalculationParams {
  viewStart: number;
  viewEnd: number;
  allChartData: { timestamp: string }[];
  innerWidth: number;
  timeframe: string;
}

/**
 * Calculate consistent x-axis parameters for all rendering scenarios
 * This is the single source of truth for x-axis calculations
 */
export const calculateXAxisParams = (params: XAxisCalculationParams) => {
  const { viewStart, viewEnd, allChartData, innerWidth, timeframe } = params;

  // Get interval-based configuration - use the same logic everywhere
  const labelConfig = X_AXIS_LABEL_CONFIGS[timeframe] || X_AXIS_LABEL_CONFIGS['1m'];

  // Create consistent viewport scale
  const viewportXScale = d3.scaleLinear().domain([viewStart, viewEnd]).range([0, innerWidth]);

  // Create consistent visible slice
  const sliceStart = Math.max(0, Math.min(allChartData.length - 1, viewStart));
  const sliceEnd = Math.max(sliceStart, Math.min(allChartData.length - 1, viewEnd));
  const visibleSlice = allChartData.slice(sliceStart, sliceEnd + 1);

  return {
    viewportXScale,
    visibleSlice,
    labelConfig,
    interval: timeframe,
  };
};

/**
 * Calculate the current date/time from viewport indices
 * This represents the center of the current viewport for persistence
 */
export const calculateCurrentDateTimeFromViewport = (
  viewStart: number,
  viewEnd: number,
  allChartData: CandlestickData[]
): string | null => {
  if (!allChartData || allChartData.length === 0) {
    return null;
  }

  // Calculate the center index of the viewport
  const centerIndex = Math.floor((viewStart + viewEnd) / 2);

  // Clamp to valid range
  const clampedIndex = Math.max(0, Math.min(allChartData.length - 1, centerIndex));

  // Return the timestamp of the center candle
  return allChartData[clampedIndex]?.timestamp || null;
};

/**
 * Calculate viewport indices from a target date/time
 * This finds the closest data point and centers the viewport around it
 */
export const calculateViewportFromDateTime = (
  targetDateTime: string,
  allChartData: CandlestickData[],
  viewportSize: number = CHART_DATA_POINTS
): { viewStart: number; viewEnd: number } | null => {
  if (!allChartData || allChartData.length === 0) {
    return null;
  }

  // Find the closest data point to the target date/time
  const targetTime = new Date(targetDateTime).getTime();
  let closestIndex = 0;
  let minTimeDiff = Math.abs(new Date(allChartData[0].timestamp).getTime() - targetTime);

  for (let i = 1; i < allChartData.length; i++) {
    const timeDiff = Math.abs(new Date(allChartData[i].timestamp).getTime() - targetTime);
    if (timeDiff < minTimeDiff) {
      minTimeDiff = timeDiff;
      closestIndex = i;
    }
  }

  // Center the viewport around the closest data point
  const halfViewport = Math.floor(viewportSize / 2);
  const viewStart = Math.max(0, closestIndex - halfViewport);
  const viewEnd = Math.min(allChartData.length - 1, viewStart + viewportSize - 1);

  return { viewStart, viewEnd };
};

/**
 * Create a custom X-axis that properly handles time compression
 * Positions ticks based on data indices to align with candlesticks.
 * Supports optional marker/data-point intervals and visible data.
 *
 * This function now uses the shared calculation logic to ensure consistency
 * between initial rendering, zooming, and panning.
 */
export const createCustomTimeAxis = (
  transformedLinearScale: d3.ScaleLinear<number, number>,
  allChartData: { timestamp: string }[],
  markerIntervalMinutes?: number,
  dataPointInterval?: number,
  visibleData?: { timestamp: string }[],
  interval?: string
): d3.Axis<number | Date> => {
  // Always use visible data for tick generation when available to ensure consistency
  // This prevents generating ticks for the entire dataset during initial rendering
  const dataForTickGeneration = visibleData && visibleData.length > 0 ? visibleData : allChartData;

  const timeTicks = memoizedGenerateVisibleTimeBasedTicks(
    dataForTickGeneration,
    markerIntervalMinutes,
    allChartData,
    interval
  );

  const customAxis = (selection: d3.Selection<SVGGElement, unknown, null, undefined>) => {
    selection.each(function () {
      const context = d3.select(this);

      // Clear existing ticks/domain
      context.selectAll('.tick').remove();
      context.selectAll('.domain').remove();

      // Domain line
      const range = transformedLinearScale.range();
      context
        .append('path')
        .attr('class', 'domain')
        .attr('stroke', 'hsl(var(--muted-foreground))')
        .attr('stroke-width', 1)
        .attr('d', `M${range[0]},0V0H${range[1]}V0`);

      // Tick positions mapped to indices
      const tickData = memoizedMapTicksToPositions(
        transformedLinearScale,
        allChartData as unknown as CandlestickData[],
        timeTicks
      );

      const tickSelection = context
        .selectAll<SVGGElement, { timestamp: Date; position: number }>('g.tick')
        .data(tickData)
        .enter()
        .append('g')
        .attr('class', 'tick')
        .attr('transform', d => `translate(${d.position},0)`);

      tickSelection.append('line').attr('stroke', 'hsl(var(--muted-foreground))').attr('stroke-width', 1).attr('y2', 6);

      tickSelection
        .append('text')
        .attr('y', 9)
        .attr('dy', '0.71em')
        .attr('text-anchor', 'middle')
        .style('font-size', '12px')
        .style('fill', 'hsl(var(--muted-foreground))')
        .text(d => memoizedFormatTime(d.timestamp, interval));
    });
  };

  return customAxis as d3.Axis<number | Date>;
};

/**
 * Create Y-axis with consistent configuration
 */
export const createYAxis = memoizedCreateYAxis;

/**
 * Format price values consistently (2 decimal places)
 */
export const formatPrice = (price: number): string => {
  return price.toFixed(2);
};

/**
 * Validate that chart data is valid and non-empty
 */
export const isValidChartData = (data: unknown): data is CandlestickData[] => {
  if (!data || !Array.isArray(data) || data.length === 0) {
    return false;
  }

  // Check if all items have the required CandlestickData properties
  return data.every(
    (item): item is CandlestickData =>
      typeof item === 'object' &&
      item !== null &&
      'timestamp' in item &&
      'open' in item &&
      'high' in item &&
      'low' in item &&
      'close' in item &&
      'volume' in item &&
      typeof (item as CandlestickData).timestamp === 'string' &&
      typeof (item as CandlestickData).open === 'number' &&
      typeof (item as CandlestickData).high === 'number' &&
      typeof (item as CandlestickData).low === 'number' &&
      typeof (item as CandlestickData).close === 'number' &&
      typeof (item as CandlestickData).volume === 'number'
  );
};

/**
 * Clamp an index to valid array bounds
 */
export const clampIndex = (index: number, arrayLength: number): number => {
  return Math.max(0, Math.min(index, arrayLength - 1));
};

/**
 * Validate that required chart parameters are present
 */
export const hasRequiredChartParams = (params: {
  allChartData?: CandlestickData[];
  xScale?: d3.ScaleLinear<number, number>;
  yScale?: d3.ScaleLinear<number, number>;
  visibleData?: CandlestickData[];
}): boolean => {
  return !!(
    params.allChartData &&
    Array.isArray(params.allChartData) &&
    params.allChartData.length > 0 &&
    params.xScale &&
    params.yScale &&
    params.visibleData &&
    Array.isArray(params.visibleData) &&
    params.visibleData.length > 0
  );
};

/**
 * Fill missing intervals for any timeframe data
 */
export const fillMissingMinutes = (data: CandlestickData[], timeframe: ChartTimeframe): CandlestickData[] => {
  if (data.length === 0) {
    return data;
  }

  const filledData: CandlestickData[] = [];

  // Get interval in milliseconds based on timeframe
  const getIntervalMs = (tf: ChartTimeframe): number => {
    const intervalMap: Record<ChartTimeframe, number> = {
      '1m': 60 * 1000, // 1 minute
      '15m': 15 * 60 * 1000, // 15 minutes
      '30m': 30 * 60 * 1000, // 30 minutes
      '1h': 60 * 60 * 1000, // 1 hour
      '1H': 60 * 60 * 1000, // 1 hour (alternative)
      '1d': 24 * 60 * 60 * 1000, // 1 day
      '1D': 24 * 60 * 60 * 1000, // 1 day (alternative)
      '1W': 7 * 24 * 60 * 60 * 1000, // 1 week
      '3M': 90 * 24 * 60 * 60 * 1000, // 3 months
      '6M': 180 * 24 * 60 * 60 * 1000, // 6 months
      '1Y': 365 * 24 * 60 * 60 * 1000, // 1 year
      ALL: 0, // All data
    };
    return intervalMap[tf] || 60 * 60 * 1000; // Default to 1 hour
  };

  const intervalMs = getIntervalMs(timeframe);
  const maxGapMultiplier = 3; // Only fill gaps up to 3x the interval

  for (let i = 0; i < data.length; i++) {
    filledData.push(data[i]);

    // Check if there's a gap to the next data point
    if (i < data.length - 1) {
      const currentTime = new Date(data[i].timestamp).getTime();
      const nextTime = new Date(data[i + 1].timestamp).getTime();
      const gapMs = nextTime - currentTime;

      // If gap is more than 2 intervals but less than or equal to maxGapMultiplier, fill with last known price
      if (gapMs > intervalMs * 2 && gapMs <= intervalMs * maxGapMultiplier) {
        const missingIntervals = Math.floor(gapMs / intervalMs) - 1;
        const lastPrice = data[i].close;

        for (let j = 1; j <= missingIntervals; j++) {
          const fillTime = new Date(currentTime + j * intervalMs).toISOString();
          filledData.push({
            timestamp: fillTime,
            open: lastPrice,
            high: lastPrice,
            low: lastPrice,
            close: lastPrice,
            volume: 0,
          });
        }
      }
    }
  }

  return filledData;
};

/**
 * Creates a viewport X scale for consistent positioning between candlesticks and hover data
 * This ensures that hover data stays synchronized with candlestick positions
 */
export const createViewportXScale = (
  viewStart: number,
  viewEnd: number,
  dataLength: number,
  innerWidth: number
): d3.ScaleLinear<number, number> => {
  const desiredWindow = Math.max(1, CHART_DATA_POINTS - 1);
  let safeViewStart = Math.max(0, Math.floor(viewStart));
  let safeViewEnd = Math.min(dataLength - 1, Math.ceil(viewEnd));

  if (safeViewEnd - safeViewStart < desiredWindow) {
    safeViewEnd = Math.min(dataLength - 1, safeViewStart + desiredWindow);
    if (safeViewEnd - safeViewStart < desiredWindow) {
      safeViewStart = Math.max(0, safeViewEnd - desiredWindow);
    }
  }

  // Use full inner width for scale range to align with domain lines
  const availableWidth = innerWidth;

  return d3.scaleLinear().domain([safeViewStart, safeViewEnd]).range([0, availableWidth]);
};

/**
 * Get interval in milliseconds based on timeframe
 * Used for calculating proper timestamps for fake candles
 */
export const getTimeframeIntervalMs = (timeframe: ChartTimeframe): number => {
  const intervalMap: Record<ChartTimeframe, number> = {
    '1m': 60 * 1000, // 1 minute
    '15m': 15 * 60 * 1000, // 15 minutes
    '30m': 30 * 60 * 1000, // 30 minutes
    '1h': 60 * 60 * 1000, // 1 hour
    '1H': 60 * 60 * 1000, // 1 hour (alternative)
    '1d': 24 * 60 * 60 * 1000, // 1 day
    '1D': 24 * 60 * 60 * 1000, // 1 day (alternative)
    '1W': 7 * 24 * 60 * 60 * 1000, // 1 week
    '3M': 90 * 24 * 60 * 60 * 1000, // 3 months
    '6M': 180 * 24 * 60 * 60 * 1000, // 6 months
    '1Y': 365 * 24 * 60 * 60 * 1000, // 1 year
    ALL: 60 * 1000, // Default to 1 minute for ALL
  };
  return intervalMap[timeframe] || 60 * 1000; // Default to 1 minute
};

/**
 * Creates a fake candle with all price and volume values set to -1
 * This is used for padding to ensure proper chart spacing
 * Fake candles are never rendered to the right of the newest real candle
 */
export const createFakeCandle = (timestamp: string): CandlestickData => {
  return {
    timestamp,
    open: -1,
    high: -1,
    low: -1,
    close: -1,
    volume: -1,
    isFake: true,
  };
};

/**
 * Checks if a candle is fake based on its properties
 * A candle is considered fake if isFake is true OR if all price/volume values are -1
 */
export const isFakeCandle = (candle: CandlestickData): boolean => {
  return (
    candle.isFake === true ||
    (candle.open === -1 && candle.high === -1 && candle.low === -1 && candle.close === -1 && candle.volume === -1)
  );
};

/**
 * Adds exactly 1 fake candle to the right of the rightmost real candle for padding
 * This creates visual padding so the rightmost real candle doesn't touch the domain line
 * Never adds fake candles to the right of the newest real candle
 */
export const addRightPaddingFakeCandle = (
  data: CandlestickData[],
  timeframe: ChartTimeframe = '1m'
): CandlestickData[] => {
  if (data.length === 0) {
    return data;
  }

  // Find the last real (non-fake) candle
  let lastRealCandleIndex = data.length - 1;
  while (lastRealCandleIndex >= 0 && isFakeCandle(data[lastRealCandleIndex])) {
    lastRealCandleIndex--;
  }

  // If no real candles found, return original data
  if (lastRealCandleIndex < 0) {
    return data;
  }

  // Check if there's already a fake candle immediately after the last real candle
  const nextIndex = lastRealCandleIndex + 1;
  if (nextIndex < data.length && isFakeCandle(data[nextIndex])) {
    // Already has right padding, return as-is
    return data;
  }

  const lastRealCandle = data[lastRealCandleIndex];
  const lastRealTime = new Date(lastRealCandle.timestamp);

  // Calculate the next timestamp based on the timeframe
  const intervalMs = getTimeframeIntervalMs(timeframe);
  const nextTimestamp = new Date(lastRealTime.getTime() + intervalMs).toISOString();

  // Create exactly 1 fake candle for right padding
  const rightPaddingCandle = createFakeCandle(nextTimestamp);

  return [...data, rightPaddingCandle];
};

/**
 * Processes chart data to add appropriate fake candles for padding
 * This is the main function that should be called to prepare data for rendering
 *
 * Requirements:
 * 1. No fake candles added (buffer candle on right removed per user request)
 * 2. Never adds fake candles to the right of the newest real candle
 * 3. Fake candles can be identified programmatically (isFake: true, all values -1)
 * 4. Left padding removed to prevent interference with auto-load logic
 */
export const addFakeCandlesForPadding = (
  data: CandlestickData[],
  viewWindowSize: number = 80,
  timeframe: ChartTimeframe = '1m'
): CandlestickData[] => {
  if (data.length === 0) {
    return data;
  }

  // No padding added - return data as-is (buffer candle on right removed per user request)
  return data;
};
