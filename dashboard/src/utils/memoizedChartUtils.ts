import * as d3 from 'd3';
import { CandlestickData, ChartDimensions } from '../types';
import {
  CHART_DATA_POINTS,
  PRICE_PADDING_MULTIPLIER,
  X_AXIS_MARKER_INTERVAL,
  X_AXIS_MARKER_DATA_POINT_INTERVAL,
} from '../constants';

// Types for cache values
type YScaleDomain = [number, number];
type PriceRange = { minPrice: number; maxPrice: number };
type ChartState = {
  innerWidth: number;
  innerHeight: number;
  baseXScale: d3.ScaleLinear<number, number>;
  baseYScale: d3.ScaleLinear<number, number>;
  transformedXScale: d3.ScaleLinear<number, number>;
  transformedYScale: d3.ScaleLinear<number, number>;
  viewStart: number;
  viewEnd: number;
  visibleData: CandlestickData[];
  allData: CandlestickData[];
  transformString: string;
};
type TickPosition = { timestamp: Date; position: number };
type InnerDimensions = { innerWidth: number; innerHeight: number };
type CacheValue =
  | YScaleDomain
  | PriceRange
  | ChartState
  | CandlestickData[]
  | TickPosition[]
  | Date[]
  | InnerDimensions
  | string
  | boolean
  | d3.Axis<d3.NumberValue>;

// Memoization cache for expensive calculations
const calculationCache = new Map<string, CacheValue>();
const Y_SCALE_CACHE_SIZE = 100;
const CHART_STATE_CACHE_SIZE = 200;

// Cache cleanup function to prevent memory leaks
const cleanupCache = (cache: Map<string, CacheValue>, maxSize: number) => {
  if (cache.size > maxSize) {
    const entries = Array.from(cache.entries());
    // Remove oldest 25% of entries
    const toRemove = Math.floor(maxSize * 0.25);
    for (let i = 0; i < toRemove; i++) {
      cache.delete(entries[i][0]);
    }
  }
};

/**
 * Memoized Y-scale domain calculation
 * This is one of the most expensive operations called frequently during chart updates
 */
export const memoizedCalculateYScaleDomain = (
  data: CandlestickData[],
  fixedDomain: [number, number] | null = null
): YScaleDomain => {
  // Create cache key based on data length, first/last prices, and fixed domain
  const dataKey =
    data.length > 0
      ? `${data.length}-${data[0]?.timestamp}-${data[data.length - 1]?.timestamp}-${data[0]?.low}-${
          data[data.length - 1]?.high
        }`
      : 'empty';
  const cacheKey = `yScale-${dataKey}-${fixedDomain ? `${fixedDomain[0]}-${fixedDomain[1]}` : 'null'}`;

  if (calculationCache.has(cacheKey)) {
    return calculationCache.get(cacheKey) as YScaleDomain;
  }

  // Calculate the domain
  let domain: [number, number];

  if (fixedDomain) {
    domain = fixedDomain;
  } else if (!data || data.length === 0) {
    domain = [0, 100]; // Default fallback
  } else {
    const minPrice = d3.min(data, d => d.low) as number;
    const maxPrice = d3.max(data, d => d.high) as number;
    const priceRange = maxPrice - minPrice;
    const padding = priceRange * PRICE_PADDING_MULTIPLIER;
    domain = [minPrice - padding, maxPrice + padding];
  }

  // Cache the result
  calculationCache.set(cacheKey, domain);
  cleanupCache(calculationCache, Y_SCALE_CACHE_SIZE);

  return domain;
};

/**
 * Memoized chart state calculation
 * This is the most expensive operation called during every zoom/pan event
 */
export const memoizedCalculateChartState = ({
  dimensions,
  allChartData,
  transform,
  fixedYScaleDomain,
}: {
  dimensions: ChartDimensions;
  allChartData: CandlestickData[];
  transform: d3.ZoomTransform;
  fixedYScaleDomain: [number, number] | null;
}): ChartState => {
  // Create cache key based on all inputs
  const dataKey =
    allChartData.length > 0
      ? `${allChartData.length}-${allChartData[0]?.timestamp}-${allChartData[allChartData.length - 1]?.timestamp}`
      : 'empty';
  const transformKey = `${transform.x.toFixed(2)}-${transform.y.toFixed(2)}-${transform.k.toFixed(2)}`;
  const dimensionsKey = `${dimensions.width}-${dimensions.height}`;
  const fixedDomainKey = fixedYScaleDomain ? `${fixedYScaleDomain[0]}-${fixedYScaleDomain[1]}` : 'null';

  const cacheKey = `chartState-${dataKey}-${transformKey}-${dimensionsKey}-${fixedDomainKey}`;

  if (calculationCache.has(cacheKey)) {
    return calculationCache.get(cacheKey) as ChartState;
  }

  // Calculate the chart state (original logic from ChartRenderer.ts)
  const { innerWidth, innerHeight } = calculateInnerDimensions(dimensions);

  // RIGHT-ALIGNED SYSTEM: Rightmost data is always at right edge (ground 0)
  const availableDataLength = allChartData.length;
  const bandWidth = innerWidth / CHART_DATA_POINTS;

  // Calculate pan offset in data points (positive = pan left, negative = pan right)
  const panOffsetPixels = transform.x;
  const panOffsetDataPoints = panOffsetPixels / bandWidth;

  // Calculate which portion of the full dataset should be visible
  const rightmostDataIndex = availableDataLength - 1;
  // Clamp viewEnd into data bounds to avoid invalid ranges when transform.x is extreme
  const unclampedViewEnd = rightmostDataIndex - panOffsetDataPoints;
  const viewEnd = Math.max(0, Math.min(rightmostDataIndex, unclampedViewEnd));
  let viewStart = Math.max(0, Math.min(viewEnd, viewEnd - CHART_DATA_POINTS + 1));
  // If view collapes to 0-0 due to extreme pan, center window on available range
  if (viewEnd === 0) {
    const window = Math.min(CHART_DATA_POINTS - 1, rightmostDataIndex);
    viewStart = Math.max(0, 0);
  }

  // Calculate the scale range to accommodate the full dataset
  const totalDataWidth = availableDataLength * bandWidth;
  const rightmostX = innerWidth;
  const leftmostX = rightmostX - totalDataWidth;

  // Create X scale that maps the full dataset to a range that allows panning
  const baseXScale = d3
    .scaleLinear()
    .domain([0, availableDataLength - 1])
    .range([leftmostX, rightmostX]);

  // Create Y scale using memoized calculation
  const yScaleDomain = memoizedCalculateYScaleDomain(allChartData, fixedYScaleDomain);
  const baseYScale = d3.scaleLinear().domain(yScaleDomain).range([innerHeight, 0]);

  // Calculate transformed scales
  const transformedXScale = transform.rescaleX(baseXScale);
  const transformedYScale = transform.rescaleY(baseYScale);

  // Get visible data slice for tooltips and other interactions
  const visibleData = allChartData.slice(viewStart, viewEnd + 1);

  const result = {
    innerWidth,
    innerHeight,
    baseXScale,
    baseYScale,
    transformedXScale,
    transformedYScale,
    viewStart,
    viewEnd,
    visibleData,
    allData: allChartData,
    transformString: transform.toString(),
  };

  // Cache the result
  calculationCache.set(cacheKey, result);
  cleanupCache(calculationCache, CHART_STATE_CACHE_SIZE);

  return result;
};

/**
 * Memoized price range calculation
 * Used for Y-axis scaling and price validation
 */
export const memoizedGetPriceRange = (data: CandlestickData[]): PriceRange | null => {
  if (!data || data.length === 0) {
    return null;
  }

  const dataKey = `${data.length}-${data[0]?.timestamp}-${data[data.length - 1]?.timestamp}`;
  const cacheKey = `priceRange-${dataKey}`;

  if (calculationCache.has(cacheKey)) {
    return calculationCache.get(cacheKey) as PriceRange;
  }

  const prices = data.flatMap(d => [d.open, d.high, d.low, d.close]);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);

  const result = { minPrice, maxPrice };
  calculationCache.set(cacheKey, result);
  cleanupCache(calculationCache, Y_SCALE_CACHE_SIZE);

  return result;
};

/**
 * Memoized visible data calculation
 * Used frequently during pan/zoom operations
 */
export const memoizedGetVisibleData = (
  data: CandlestickData[],
  startIndex: number,
  endIndex: number
): CandlestickData[] => {
  if (!data || data.length === 0) {
    return [];
  }

  const dataKey = `${data.length}-${data[0]?.timestamp}-${data[data.length - 1]?.timestamp}`;
  const cacheKey = `visibleData-${dataKey}-${startIndex}-${endIndex}`;

  if (calculationCache.has(cacheKey)) {
    return calculationCache.get(cacheKey) as CandlestickData[];
  }

  const clampedStart = Math.max(0, startIndex);
  const clampedEnd = Math.min(data.length - 1, endIndex);

  if (clampedStart > clampedEnd) {
    calculationCache.set(cacheKey, []);
    return [];
  }

  const result = data.slice(clampedStart, clampedEnd + 1);
  calculationCache.set(cacheKey, result);
  cleanupCache(calculationCache, CHART_STATE_CACHE_SIZE);

  return result;
};

/**
 * Clear all caches - useful for testing or memory management
 */
export const clearCalculationCache = () => {
  calculationCache.clear();
};

/**
 * Get cache statistics for debugging
 */
export const getCacheStats = () => {
  return {
    totalEntries: calculationCache.size,
    yScaleEntries: Array.from(calculationCache.keys()).filter(k => k.startsWith('yScale-')).length,
    chartStateEntries: Array.from(calculationCache.keys()).filter(k => k.startsWith('chartState-')).length,
    priceRangeEntries: Array.from(calculationCache.keys()).filter(k => k.startsWith('priceRange-')).length,
    visibleDataEntries: Array.from(calculationCache.keys()).filter(k => k.startsWith('visibleData-')).length,
  };
};

/**
 * Memoized time-based tick generation with configurable intervals
 * This is called on every axis update and can be expensive with large datasets
 * Now supports showing 1-minute markers only on specific intervals (e.g., 30-minute boundaries)
 * Uses a more dynamic approach to ensure all visible 30-minute boundaries are shown
 */
export const memoizedGenerateTimeBasedTicks = (
  allChartData: { timestamp: string }[],
  markerIntervalMinutes: number = X_AXIS_MARKER_INTERVAL,
  dataPointInterval: number = X_AXIS_MARKER_DATA_POINT_INTERVAL
): Date[] => {
  if (!allChartData || allChartData.length === 0) {
    return [];
  }

  const dataKey = `${allChartData.length}-${allChartData[0]?.timestamp}-${
    allChartData[allChartData.length - 1]?.timestamp
  }`;
  const cacheKey = `timeTicks-${dataKey}-${markerIntervalMinutes}-${dataPointInterval}`;

  if (calculationCache.has(cacheKey)) {
    return calculationCache.get(cacheKey) as Date[];
  }

  const ticks: Date[] = [];

  // More intelligent approach: Generate ticks based on time intervals rather than data point intervals
  // This ensures we don't miss any 30-minute boundaries regardless of data density
  const startTime = new Date(allChartData[0].timestamp);
  const endTime = new Date(allChartData[allChartData.length - 1].timestamp);

  // Round start time down to the nearest marker interval
  const startMinutes = startTime.getMinutes();
  const roundedStartMinutes = Math.floor(startMinutes / markerIntervalMinutes) * markerIntervalMinutes;
  const roundedStartTime = new Date(startTime);
  roundedStartTime.setMinutes(roundedStartMinutes, 0, 0);

  // Generate ticks at regular intervals from the rounded start time
  const currentTime = new Date(roundedStartTime);
  while (currentTime <= endTime) {
    // Check if this time exists in our data (within a reasonable tolerance)
    const timeInData = allChartData.some(d => {
      const dataTime = new Date(d.timestamp);
      const timeDiff = Math.abs(dataTime.getTime() - currentTime.getTime());
      return timeDiff < 60000; // Within 1 minute tolerance
    });

    if (timeInData) {
      ticks.push(new Date(currentTime));
    }

    // Move to next marker interval
    currentTime.setMinutes(currentTime.getMinutes() + markerIntervalMinutes);
  }

  calculationCache.set(cacheKey, ticks);
  cleanupCache(calculationCache, CHART_STATE_CACHE_SIZE);
  return ticks;
};

/**
 * Generate time-based ticks for visible data range only
 * This ensures consistent tick display when panning/zooming
 */
export const memoizedGenerateVisibleTimeBasedTicks = (
  visibleData: { timestamp: string }[],
  markerIntervalMinutes: number = X_AXIS_MARKER_INTERVAL
): Date[] => {
  if (!visibleData || visibleData.length === 0) {
    return [];
  }

  const dataKey = `${visibleData.length}-${visibleData[0]?.timestamp}-${
    visibleData[visibleData.length - 1]?.timestamp
  }`;
  const cacheKey = `visibleTimeTicks-${dataKey}-${markerIntervalMinutes}`;

  if (calculationCache.has(cacheKey)) {
    return calculationCache.get(cacheKey) as Date[];
  }

  const ticks: Date[] = [];

  // Generate ticks based on the visible data range
  const startTime = new Date(visibleData[0].timestamp);
  const endTime = new Date(visibleData[visibleData.length - 1].timestamp);

  // Round start time down to the nearest marker interval
  const startMinutes = startTime.getMinutes();
  const roundedStartMinutes = Math.floor(startMinutes / markerIntervalMinutes) * markerIntervalMinutes;
  const roundedStartTime = new Date(startTime);
  roundedStartTime.setMinutes(roundedStartMinutes, 0, 0);

  // Generate ticks at regular intervals from the rounded start time
  const currentTime = new Date(roundedStartTime);
  while (currentTime <= endTime) {
    // Check if this time exists in our visible data (within a reasonable tolerance)
    const timeInData = visibleData.some(d => {
      const dataTime = new Date(d.timestamp);
      const timeDiff = Math.abs(dataTime.getTime() - currentTime.getTime());
      return timeDiff < 60000; // Within 1 minute tolerance
    });

    if (timeInData) {
      ticks.push(new Date(currentTime));
    }

    // Move to next marker interval
    currentTime.setMinutes(currentTime.getMinutes() + markerIntervalMinutes);
  }

  calculationCache.set(cacheKey, ticks);
  cleanupCache(calculationCache, CHART_STATE_CACHE_SIZE);
  return ticks;
};

/**
 * Calculate inner dimensions from chart dimensions (width/height minus margins)
 * This is a simple calculation that doesn't need memoization
 */
const calculateInnerDimensions = (dimensions: {
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
 * Memoized time formatting for axis labels
 * Expensive string operations that are repeated for the same timestamps
 */
export const memoizedFormatTime = (timestamp: Date): string => {
  const timeKey = timestamp.getTime().toString();
  const cacheKey = `timeFormat-${timeKey}`;

  if (calculationCache.has(cacheKey)) {
    return calculationCache.get(cacheKey) as string;
  }

  const result = timestamp.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });

  calculationCache.set(cacheKey, result);
  cleanupCache(calculationCache, CHART_STATE_CACHE_SIZE);
  return result;
};

/**
 * Memoized axis styling application
 * Prevents repeated DOM operations for the same styling
 */
export const memoizedApplyAxisStyling = (axis: d3.Selection<SVGGElement, unknown, null, undefined>): void => {
  // Create a unique key based on the axis element and its current state
  const axisElement = axis.node();
  if (!axisElement) {
    return;
  }

  const axisId = axisElement.getAttribute('class') || 'unknown';
  const hasDomain = !axis.select('.domain').empty();
  const hasTicks = axis.selectAll('.tick').size() > 0;
  const cacheKey = `axisStyle-${axisId}-${hasDomain}-${hasTicks}`;

  // Check if we've already applied this exact styling
  if (calculationCache.has(cacheKey)) {
    // Even if cached, ensure font-size and color are consistently applied to prevent size variations
    axis
      .selectAll('.tick text')
      .style('font-size', '12px')
      .style('font-family', 'system-ui, -apple-system, sans-serif')
      .style('fill', 'hsl(var(--muted-foreground))');
    return; // Already styled, skip other operations
  }

  // Apply the styling
  // Style the domain lines to be gray and remove end tick marks (nubs)
  axis.select('.domain').style('stroke', '#666').style('stroke-width', 1);

  // Style tick lines to be gray, keep labels white
  axis.selectAll('.tick line').style('stroke', '#666').style('stroke-width', 1);

  // Always apply consistent font-size to prevent size variations during re-renders
  // Use CSS custom property for muted-foreground color (HSL format)
  axis
    .selectAll('.tick text')
    .style('font-size', '12px')
    .style('font-family', 'system-ui, -apple-system, sans-serif')
    .style('fill', 'hsl(var(--muted-foreground))');

  // Mark as styled
  calculationCache.set(cacheKey, true);
  cleanupCache(calculationCache, CHART_STATE_CACHE_SIZE);
};

/**
 * Memoized Y-axis creation
 * Prevents recreating the same axis configuration repeatedly
 */
export const memoizedCreateYAxis = (
  scale: d3.ScaleLinear<number, number>,
  tickCount: number = 10
): d3.Axis<d3.NumberValue> => {
  const scaleKey = `yAxis-${scale.domain().join('-')}-${scale.range().join('-')}-${tickCount}`;
  const cacheKey = `yAxis-${scaleKey}`;

  if (calculationCache.has(cacheKey)) {
    return calculationCache.get(cacheKey) as d3.Axis<d3.NumberValue>;
  }

  const result = d3.axisRight(scale).tickSizeOuter(0).ticks(tickCount).tickFormat(d3.format('.2f'));

  calculationCache.set(cacheKey, result);
  cleanupCache(calculationCache, CHART_STATE_CACHE_SIZE);
  return result;
};

/**
 * Memoized mapping from time-based ticks to on-screen positions using a transformed linear scale
 * OPTIMIZED: Uses binary search instead of linear search for O(log n) performance per tick
 */
export const memoizedMapTicksToPositions = (
  transformedLinearScale: d3.ScaleLinear<number, number>,
  allChartData: CandlestickData[],
  ticks: Date[]
): TickPosition[] => {
  if (!allChartData || allChartData.length === 0 || ticks.length === 0) {
    return [];
  }

  const dataKey = `${allChartData.length}-${allChartData[0]?.timestamp}-${
    allChartData[allChartData.length - 1]?.timestamp
  }`;
  const ticksKey = ticks.map(t => t.getTime()).join(',');
  const scaleKey = `range:${transformedLinearScale.range().join('-')}:domain:${transformedLinearScale
    .domain()
    .map(v => v.toFixed(2))
    .join('-')}`;
  const cacheKey = `tickPos-${dataKey}-${ticksKey}-${scaleKey}`;

  if (calculationCache.has(cacheKey)) {
    return calculationCache.get(cacheKey) as TickPosition[];
  }

  // Pre-compute timestamps for binary search (only once per call)
  const timestamps = allChartData.map(d => new Date(d.timestamp).getTime());

  const result: TickPosition[] = ticks.map(tick => {
    const tickTime = tick.getTime();

    // Binary search for closest timestamp
    let left = 0;
    let right = timestamps.length - 1;
    let closestIndex = 0;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const midTime = timestamps[mid];

      if (midTime === tickTime) {
        closestIndex = mid;
        break;
      } else if (midTime < tickTime) {
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }

    // If we didn't find exact match, check neighbors
    if (timestamps[closestIndex] !== tickTime) {
      const leftDiff = closestIndex > 0 ? Math.abs(timestamps[closestIndex - 1] - tickTime) : Infinity;
      const rightDiff =
        closestIndex < timestamps.length - 1 ? Math.abs(timestamps[closestIndex + 1] - tickTime) : Infinity;
      const currentDiff = Math.abs(timestamps[closestIndex] - tickTime);

      if (leftDiff < currentDiff && leftDiff < rightDiff) {
        closestIndex = closestIndex - 1;
      } else if (rightDiff < currentDiff) {
        closestIndex = closestIndex + 1;
      }
    }

    const position = transformedLinearScale(closestIndex);
    return { timestamp: tick, position };
  });

  calculationCache.set(cacheKey, result);
  cleanupCache(calculationCache, CHART_STATE_CACHE_SIZE);
  return result;
};
