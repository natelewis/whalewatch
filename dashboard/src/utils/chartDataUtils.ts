import * as d3 from 'd3';
import { AlpacaBar, ChartTimeframe, DEFAULT_CHART_DATA_POINTS } from '../types';

export interface CandlestickData {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface DataRange {
  earliest: string;
  latest: string;
}

export interface TimeframeConfig {
  value: ChartTimeframe;
  label: string;
  dataPoints: number;
}

/**
 * Remove duplicate entries by timestamp and sort by time
 */
export const deduplicateAndSortBars = (bars: AlpacaBar[]): AlpacaBar[] => {
  return bars
    .reduce((acc, bar) => {
      const timestamp = bar.t;
      if (!acc.find((b) => b.t === timestamp)) {
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
  return bars.map((bar) => ({
    time: bar.t,
    open: bar.o,
    high: bar.h,
    low: bar.l,
    close: bar.c,
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
    earliest: bars[0].t,
    latest: bars[bars.length - 1].t,
  };
};

/**
 * Get data points count for a given timeframe
 */
export const getDataPointsForTimeframe = (
  timeframe: ChartTimeframe,
  timeframes: TimeframeConfig[]
): number => {
  const timeframeConfig = timeframes.find((tf) => tf.value === timeframe);
  return timeframeConfig?.dataPoints || DEFAULT_CHART_DATA_POINTS;
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
export const applyAxisStyling = (
  axis: d3.Selection<SVGGElement, unknown, null, undefined>
): void => {
  // Style the domain lines to be gray and remove end tick marks (nubs)
  axis.select('.domain').style('stroke', '#666').style('stroke-width', 1);

  // Style tick lines to be gray, keep labels white
  axis.selectAll('.tick line').style('stroke', '#666').style('stroke-width', 1);
  axis.selectAll('.tick text').style('font-size', '12px');
};

/**
 * Calculate dynamic tick values for time-based scale (every 20 data points)
 */
export const calculateTimeBasedTickValues = (
  allChartData: { time: string }[],
  interval: number = 20
): Date[] => {
  const tickValues: Date[] = [];

  // Generate ticks every 'interval' data points
  for (let i = 0; i < allChartData.length; i += interval) {
    tickValues.push(new Date(allChartData[i].time));
  }

  return tickValues;
};

/**
 * Create unified time-based scale that works with transformed linear scale
 * This ensures perfect alignment between X-axis and candlesticks
 */
export const createUnifiedTimeScale = (
  transformedLinearScale: d3.ScaleLinear<number, number>,
  allChartData: { time: string }[]
): d3.ScaleTime<Date, number> => {
  // Get the domain from the transformed linear scale (data indices)
  const [domainStart, domainEnd] = transformedLinearScale.domain();

  // Use exact data indices to map to time values for perfect alignment
  const startIndex = Math.max(0, Math.floor(domainStart));
  const endIndex = Math.min(allChartData.length - 1, Math.ceil(domainEnd));

  const startTime = new Date(allChartData[startIndex]?.time || allChartData[0].time);
  const endTime = new Date(
    allChartData[endIndex]?.time || allChartData[allChartData.length - 1].time
  );

  // Create time-based scale with the same range as the transformed linear scale
  // This ensures perfect alignment with the linear scale's positioning
  const range = transformedLinearScale.range();
  const scale = d3.scaleTime<Date, number>();
  scale.domain([startTime, endTime]);
  (scale as any).range([range[0], range[1]]);
  return scale;
};

/**
 * Create a time-based scale that maps data indices to screen coordinates
 * This ensures the X-axis labels align perfectly with candlesticks
 */
export const createIndexToTimeScale = (
  transformedLinearScale: d3.ScaleLinear<number, number>,
  allChartData: { time: string }[]
): d3.ScaleTime<Date, number> => {
  // Get the domain from the transformed linear scale (data indices)
  const [domainStart, domainEnd] = transformedLinearScale.domain();

  // Handle the case where we're panning beyond the actual data
  // We need to extend the time domain to match the linear scale's behavior
  const dataLength = allChartData.length;

  let startTime: Date;
  let endTime: Date;

  if (domainStart < 0) {
    // Panning before the data - extrapolate backwards
    const timeStep = getAverageTimeStep(allChartData);
    const extrapolatedTime = new Date(allChartData[0].time).getTime() + domainStart * timeStep;
    startTime = new Date(extrapolatedTime);
  } else if (domainStart >= dataLength) {
    // Panning after the data - extrapolate forwards
    const timeStep = getAverageTimeStep(allChartData);
    const extrapolatedTime =
      new Date(allChartData[dataLength - 1].time).getTime() +
      (domainStart - dataLength + 1) * timeStep;
    startTime = new Date(extrapolatedTime);
  } else {
    // Within data bounds - interpolate normally
    startTime = interpolateTimeAtIndex(allChartData, domainStart);
  }

  if (domainEnd < 0) {
    // Panning before the data - extrapolate backwards
    const timeStep = getAverageTimeStep(allChartData);
    const extrapolatedTime = new Date(allChartData[0].time).getTime() + domainEnd * timeStep;
    endTime = new Date(extrapolatedTime);
  } else if (domainEnd >= dataLength) {
    // Panning after the data - extrapolate forwards
    const timeStep = getAverageTimeStep(allChartData);
    const extrapolatedTime =
      new Date(allChartData[dataLength - 1].time).getTime() +
      (domainEnd - dataLength + 1) * timeStep;
    endTime = new Date(extrapolatedTime);
  } else {
    // Within data bounds - interpolate normally
    endTime = interpolateTimeAtIndex(allChartData, domainEnd);
  }

  // Create time-based scale that maps time values to screen coordinates
  // The key is that this scale should produce the same screen positions as the linear scale
  const range = transformedLinearScale.range();
  const scale = d3.scaleTime<Date, number>();
  scale.domain([startTime, endTime]);
  (scale as any).range([range[0], range[1]]);
  return scale;
};

/**
 * Get the average time step between data points
 * This is used to extrapolate time values beyond the actual data
 */
const getAverageTimeStep = (allChartData: { time: string }[]): number => {
  if (allChartData.length < 2) {
    // If we have less than 2 data points, assume 1 minute intervals
    return 60 * 1000; // 1 minute in milliseconds
  }

  const firstTime = new Date(allChartData[0].time).getTime();
  const lastTime = new Date(allChartData[allChartData.length - 1].time).getTime();

  // Calculate average time step in milliseconds
  return (lastTime - firstTime) / (allChartData.length - 1);
};

/**
 * Interpolate time value at a fractional data index
 * This ensures precise mapping between data indices and time values
 */
const interpolateTimeAtIndex = (allChartData: { time: string }[], index: number): Date => {
  const floorIndex = Math.floor(index);
  const ceilIndex = Math.ceil(index);

  if (floorIndex === ceilIndex) {
    // Exact index, return the time directly
    return new Date(allChartData[floorIndex]?.time || allChartData[0].time);
  }

  // Interpolate between the two adjacent data points
  const floorTime = new Date(allChartData[floorIndex]?.time || allChartData[0].time).getTime();
  const ceilTime = new Date(
    allChartData[ceilIndex]?.time || allChartData[allChartData.length - 1].time
  ).getTime();

  const fraction = index - floorIndex;
  const interpolatedTime = floorTime + (ceilTime - floorTime) * fraction;

  return new Date(interpolatedTime);
};

/**
 * Create X-axis with time-based scale configuration
 */
export const createXAxis = (
  scale: d3.ScaleTime<Date, number> | d3.ScaleTime<number, number>,
  allChartData: { time: string }[],
  customTickValues?: Date[]
): d3.Axis<d3.NumberValue> => {
  const axis = d3
    .axisBottom(scale as d3.AxisScale<Date | d3.NumberValue>)
    .tickSizeOuter(0)
    .tickFormat((d) => {
      // For time-based scale, d is already a Date object
      const date = d as Date;
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    });

  // Use custom tick values if provided, otherwise use default time-based ticks
  if (customTickValues) {
    return axis.tickValues(customTickValues);
  } else {
    return axis.ticks(8); // Default to 8 ticks
  }
};

/**
 * Create Y-axis with consistent configuration
 */
export const createYAxis = (
  scale: d3.ScaleLinear<number, number>,
  tickCount: number = 10
): d3.Axis<d3.NumberValue> => {
  return d3.axisRight(scale).tickSizeOuter(0).ticks(tickCount).tickFormat(d3.format('.2f'));
};

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
  return !!(data && Array.isArray(data) && data.length > 0);
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
  allChartData?: unknown;
  xScale?: unknown;
  yScale?: unknown;
  visibleData?: unknown;
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
export const fillMissingMinutes = (
  data: CandlestickData[],
  timeframe: ChartTimeframe
): CandlestickData[] => {
  if (data.length === 0) {
    return data;
  }

  const filledData: CandlestickData[] = [];

  // Get interval in milliseconds based on timeframe
  const getIntervalMs = (tf: ChartTimeframe): number => {
    const intervalMap: Record<ChartTimeframe, number> = {
      '1m': 60 * 1000, // 1 minute
      '5m': 5 * 60 * 1000, // 5 minutes
      '30m': 30 * 60 * 1000, // 30 minutes
      '1h': 60 * 60 * 1000, // 1 hour
      '2h': 2 * 60 * 60 * 1000, // 2 hours
      '4h': 4 * 60 * 60 * 1000, // 4 hours
      '1d': 24 * 60 * 60 * 1000, // 1 day
      '1w': 7 * 24 * 60 * 60 * 1000, // 1 week
      '1M': 30 * 24 * 60 * 60 * 1000, // 1 month (30 days)
    };
    return intervalMap[tf] || 60 * 60 * 1000; // Default to 1 hour
  };

  const intervalMs = getIntervalMs(timeframe);
  const maxGapMultiplier = 3; // Only fill gaps up to 3x the interval

  for (let i = 0; i < data.length; i++) {
    filledData.push(data[i]);

    // Check if there's a gap to the next data point
    if (i < data.length - 1) {
      const currentTime = new Date(data[i].time).getTime();
      const nextTime = new Date(data[i + 1].time).getTime();
      const gapMs = nextTime - currentTime;

      // If gap is more than 2 intervals but less than maxGapMultiplier, fill with last known price
      if (gapMs > intervalMs * 2 && gapMs < intervalMs * maxGapMultiplier) {
        const missingIntervals = Math.floor(gapMs / intervalMs) - 1;
        const lastPrice = data[i].close;

        for (let j = 1; j <= missingIntervals; j++) {
          const fillTime = new Date(currentTime + j * intervalMs).toISOString();
          filledData.push({
            time: fillTime,
            open: lastPrice,
            high: lastPrice,
            low: lastPrice,
            close: lastPrice,
          });
        }
      }
    }
  }

  return filledData;
};
