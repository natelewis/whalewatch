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
import { CHART_DATA_POINTS, CHART_RIGHT_PADDING } from '../constants';

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
 */
export const processChartData = (
  bars: AlpacaBar[]
): {
  formattedData: CandlestickData[];
  dataRange: DataRange | null;
} => {
  const uniqueBars = deduplicateAndSortBars(bars);
  const formattedData = formatBarsToCandlestickData(uniqueBars);
  const dataRange = calculateDataRange(uniqueBars);

  return {
    formattedData,
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
    console.warn('createIndexToTimeScale called with empty or undefined allChartData');
    // Return a default scale that won't cause errors
    const defaultScale = d3.scaleTime();
    defaultScale.domain([new Date(), new Date()]);
    defaultScale.range([0, 1]);
    return defaultScale as unknown as d3.ScaleTime<Date, number>;
  }

  if (!allChartData[0] || !allChartData[0].timestamp) {
    console.warn('createIndexToTimeScale called with invalid chart data - missing timestamp property');
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
 * Create a custom X-axis that properly handles time compression
 * Positions ticks based on data indices to align with candlesticks.
 * Supports optional marker/data-point intervals and visible data.
 */
export const createCustomTimeAxis = (
  transformedLinearScale: d3.ScaleLinear<number, number>,
  allChartData: { timestamp: string }[],
  markerIntervalMinutes?: number,
  dataPointInterval?: number,
  visibleData?: { timestamp: string }[],
  interval?: string
): d3.Axis<number | Date> => {
  const timeTicks =
    visibleData && visibleData.length > 0
      ? memoizedGenerateVisibleTimeBasedTicks(visibleData, markerIntervalMinutes, allChartData)
      : generateTimeBasedTicks(allChartData, markerIntervalMinutes, dataPointInterval);

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
      '5m': 5 * 60 * 1000, // 5 minutes
      '15m': 15 * 60 * 1000, // 15 minutes
      '30m': 30 * 60 * 1000, // 30 minutes
      '1h': 60 * 60 * 1000, // 1 hour
      '1H': 60 * 60 * 1000, // 1 hour (alternative)
      '1d': 24 * 60 * 60 * 1000, // 1 day
      '1D': 24 * 60 * 60 * 1000, // 1 day (alternative)
      '1w': 7 * 24 * 60 * 60 * 1000, // 1 week
      '1W': 7 * 24 * 60 * 60 * 1000, // 1 week (alternative)
      '3M': 90 * 24 * 60 * 60 * 1000, // 3 months
      '6M': 180 * 24 * 60 * 60 * 1000, // 6 months
      '1Y': 365 * 24 * 60 * 60 * 1000, // 1 year
      '1M': 30 * 24 * 60 * 60 * 1000, // 1 month (30 days)
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

      // If gap is more than 2 intervals but less than maxGapMultiplier, fill with last known price
      if (gapMs > intervalMs * 2 && gapMs < intervalMs * maxGapMultiplier) {
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

  // Add padding to prevent overlap with vertical domain line
  const availableWidth = innerWidth - CHART_RIGHT_PADDING;

  return d3.scaleLinear().domain([safeViewStart, safeViewEnd]).range([0, availableWidth]);
};
