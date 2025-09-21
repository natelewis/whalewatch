import * as d3 from 'd3';
import { CandlestickData, ChartDimensions } from '../types';
import { CHART_DATA_POINTS, PRICE_PADDING_MULTIPLIER } from '../constants';
import { calculateInnerDimensions } from './chartDataUtils';

// Memoization cache for expensive calculations
const calculationCache = new Map<string, any>();
const Y_SCALE_CACHE_SIZE = 100;
const CHART_STATE_CACHE_SIZE = 200;

// Cache cleanup function to prevent memory leaks
const cleanupCache = (cache: Map<string, any>, maxSize: number) => {
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
): [number, number] => {
  // Create cache key based on data length, first/last prices, and fixed domain
  const dataKey =
    data.length > 0
      ? `${data.length}-${data[0]?.timestamp}-${data[data.length - 1]?.timestamp}-${data[0]?.low}-${
          data[data.length - 1]?.high
        }`
      : 'empty';
  const cacheKey = `yScale-${dataKey}-${
    fixedDomain ? `${fixedDomain[0]}-${fixedDomain[1]}` : 'null'
  }`;

  if (calculationCache.has(cacheKey)) {
    return calculationCache.get(cacheKey);
  }

  // Calculate the domain
  let domain: [number, number];

  if (fixedDomain) {
    domain = fixedDomain;
  } else if (!data || data.length === 0) {
    domain = [0, 100]; // Default fallback
  } else {
    const minPrice = d3.min(data, (d) => d.low) as number;
    const maxPrice = d3.max(data, (d) => d.high) as number;
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
}) => {
  // Create cache key based on all inputs
  const dataKey =
    allChartData.length > 0
      ? `${allChartData.length}-${allChartData[0]?.timestamp}-${
          allChartData[allChartData.length - 1]?.timestamp
        }`
      : 'empty';
  const transformKey = `${transform.x.toFixed(2)}-${transform.y.toFixed(2)}-${transform.k.toFixed(
    2
  )}`;
  const dimensionsKey = `${dimensions.width}-${dimensions.height}`;
  const fixedDomainKey = fixedYScaleDomain
    ? `${fixedYScaleDomain[0]}-${fixedYScaleDomain[1]}`
    : 'null';

  const cacheKey = `chartState-${dataKey}-${transformKey}-${dimensionsKey}-${fixedDomainKey}`;

  if (calculationCache.has(cacheKey)) {
    return calculationCache.get(cacheKey);
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
  const viewEnd = Math.min(rightmostDataIndex, rightmostDataIndex - panOffsetDataPoints);
  const viewStart = Math.max(0, viewEnd - CHART_DATA_POINTS + 1);

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
export const memoizedGetPriceRange = (data: CandlestickData[]) => {
  if (!data || data.length === 0) return null;

  const dataKey = `${data.length}-${data[0]?.timestamp}-${data[data.length - 1]?.timestamp}`;
  const cacheKey = `priceRange-${dataKey}`;

  if (calculationCache.has(cacheKey)) {
    return calculationCache.get(cacheKey);
  }

  const prices = data.flatMap((d) => [d.open, d.high, d.low, d.close]);
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
  if (!data || data.length === 0) return [];

  const dataKey = `${data.length}-${data[0]?.timestamp}-${data[data.length - 1]?.timestamp}`;
  const cacheKey = `visibleData-${dataKey}-${startIndex}-${endIndex}`;

  if (calculationCache.has(cacheKey)) {
    return calculationCache.get(cacheKey);
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
    yScaleEntries: Array.from(calculationCache.keys()).filter((k) => k.startsWith('yScale-'))
      .length,
    chartStateEntries: Array.from(calculationCache.keys()).filter((k) =>
      k.startsWith('chartState-')
    ).length,
    priceRangeEntries: Array.from(calculationCache.keys()).filter((k) =>
      k.startsWith('priceRange-')
    ).length,
    visibleDataEntries: Array.from(calculationCache.keys()).filter((k) =>
      k.startsWith('visibleData-')
    ).length,
  };
};
