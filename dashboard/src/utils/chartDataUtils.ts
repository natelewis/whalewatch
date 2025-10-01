import * as d3 from 'd3';
import {
  memoizedMapTicksToPositions,
  memoizedGenerateVisibleTimeBasedTicks,
  memoizedFormatTime,
  memoizedApplyAxisStyling,
  memoizedCreateYAxis,
} from './memoizedChartUtils';
import { AlpacaBar, ChartTimeframe, CandlestickData, DataRange } from '../types';
import { CHART_DATA_POINTS, X_AXIS_LABEL_CONFIGS } from '../constants';

/**
 * Remove duplicate entries by timestamp and sort by time
 */
const deduplicateAndSortBars = (bars: AlpacaBar[]): AlpacaBar[] => {
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
const formatBarsToCandlestickData = (bars: AlpacaBar[]): CandlestickData[] => {
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
const calculateDataRange = (bars: AlpacaBar[]): DataRange | null => {
  if (bars.length === 0) {
    return null;
  }

  return {
    start: new Date(bars[0].t).getTime(),
    end: new Date(bars[bars.length - 1].t).getTime(),
  };
};

/**
 * Process raw chart data into formatted candlestick data
 * No fake candle padding added (buffer candle on right removed per user request)
 */
export const processChartData = (
  bars: AlpacaBar[],
  _timeframe: ChartTimeframe = '1m',
  _viewWindowSize: number = 80
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

/**
 * Shared parameters for consistent x-axis calculations across all rendering scenarios
 * This ensures the same calculation logic is used for initial rendering, zooming, and panning
 */
interface XAxisCalculationParams {
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
 * Checks if a candle is fake based on its properties
 * A candle is considered fake if isFake is true OR if all price/volume values are -1
 */
export const isFakeCandle = (candle: CandlestickData): boolean => {
  return (
    candle.isFake === true ||
    (candle.open === -1 && candle.high === -1 && candle.low === -1 && candle.close === -1 && candle.volume === -1)
  );
};
