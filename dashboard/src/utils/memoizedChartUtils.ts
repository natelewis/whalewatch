import * as d3 from 'd3';
import { CandlestickData, ChartDimensions } from '../types';
import {
  CHART_DATA_POINTS,
  PRICE_PADDING_MULTIPLIER,
  X_AXIS_MARKER_INTERVAL,
  X_AXIS_MARKER_DATA_POINT_INTERVAL,
  AXIS_DOMAIN_AND_TICKS,
  AXIS_LABELS,
  X_AXIS_LABEL_CONFIGS,
  Y_SCALE_REPRESENTATIVE_DATA_LENGTH,
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
 * Clear time formatting cache when interval changes
 * This ensures x-axis labels are properly updated when switching timeframes
 */
export const clearTimeFormatCache = (): void => {
  const keysToDelete: string[] = [];
  for (const key of calculationCache.keys()) {
    if (key.startsWith('timeFormat-')) {
      keysToDelete.push(key);
    }
  }
  keysToDelete.forEach(key => calculationCache.delete(key));
};

/**
 * Clear all chart-related caches when switching timeframes
 * This ensures fresh calculations for new data
 */
export const clearAllChartCaches = (): void => {
  calculationCache.clear();
  console.log('🧹 Cleared all chart caches');
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
    // Filter out fake candles for price range calculation
    const realData = data.filter(d => !d.isFake && d.open !== -1 && d.high !== -1 && d.low !== -1 && d.close !== -1);

    if (realData.length === 0) {
      domain = [0, 100]; // Default fallback if no real data
    } else {
      const minPrice = d3.min(realData, d => d.low) as number;
      const maxPrice = d3.max(realData, d => d.high) as number;
      const priceRange = maxPrice - minPrice;
      const padding = priceRange * PRICE_PADDING_MULTIPLIER;
      domain = [minPrice - padding, maxPrice + padding];
    }
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
  // If no fixed domain is provided, use representative data for consistency
  let yScaleDomain: [number, number];
  if (fixedYScaleDomain) {
    yScaleDomain = fixedYScaleDomain;
  } else {
    // Use representative data (last Y_SCALE_REPRESENTATIVE_DATA_LENGTH points) for consistency
    // This ensures the same zoom level as initial load even during panning
    const representativeDataLength = Math.min(Y_SCALE_REPRESENTATIVE_DATA_LENGTH, allChartData.length);
    const representativeData = allChartData.slice(-representativeDataLength);
    yScaleDomain = memoizedCalculateYScaleDomain(representativeData, null);
  }
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

  // Filter out fake candles for price range calculation
  const realData = data.filter(d => !d.isFake && d.open !== -1 && d.high !== -1 && d.low !== -1 && d.close !== -1);

  if (realData.length === 0) {
    return null;
  }

  const prices = realData.flatMap(d => [d.open, d.high, d.low, d.close]);
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
 * Find the first available time for a given date in the dataset
 * Used for date-only format where markers should appear at the earliest available time of the day
 */
const findFirstTimeForDate = (targetDate: Date, allChartData: { timestamp: string }[]): Date | null => {
  const targetDateStr = targetDate.toISOString().split('T')[0]; // Get YYYY-MM-DD format

  // Find all data points for this date and get the earliest one
  let earliestTime: Date | null = null;

  for (const dataPoint of allChartData) {
    const dataDate = new Date(dataPoint.timestamp);
    const dataDateStr = dataDate.toISOString().split('T')[0];

    if (dataDateStr === targetDateStr) {
      if (!earliestTime || dataDate < earliestTime) {
        earliestTime = dataDate;
      }
    }
  }

  return earliestTime;
};

/**
 * Align time to consistent boundaries based on interval
 * For date-only formats, finds the first available time for that date
 * For other formats, aligns to consistent hour boundaries starting from midnight
 */
const alignToTimeBoundary = (date: Date, intervalMinutes: number, allChartData?: { timestamp: string }[]): Date => {
  const aligned = new Date(date);

  // For date-only formats (1d, 1w, 1M), find the first available time for that date
  // Ignore interval minutes - just find the first time for the date
  if (intervalMinutes >= 1440 && allChartData) {
    // 1 day or more
    const firstTimeForDate = findFirstTimeForDate(aligned, allChartData);
    if (firstTimeForDate) {
      return firstTimeForDate;
    }
  }

  // For intervals >= 60 minutes, align to consistent hour boundaries starting from midnight
  if (intervalMinutes >= 60) {
    // Calculate total minutes since midnight using UTC to avoid timezone issues
    const totalMinutesSinceMidnight = aligned.getUTCHours() * 60 + aligned.getUTCMinutes();

    // Find the nearest interval boundary
    const intervalsSinceMidnight = Math.floor(totalMinutesSinceMidnight / intervalMinutes);
    const alignedMinutes = intervalsSinceMidnight * intervalMinutes;

    // Set the aligned time properly using UTC
    const alignedHours = Math.floor(alignedMinutes / 60);
    const remainingMinutes = alignedMinutes % 60;
    aligned.setUTCHours(alignedHours, remainingMinutes, 0, 0);
  } else {
    // For intervals < 60 minutes, align to the nearest interval boundary starting from the top of the hour
    const minutes = Math.floor(aligned.getUTCMinutes() / intervalMinutes) * intervalMinutes;
    aligned.setUTCMinutes(minutes, 0, 0);
  }

  return aligned;
};

/**
 * Memoized time-based tick generation with configurable intervals
 * This is called on every axis update and can be expensive with large datasets
 * Now supports showing markers aligned to consistent time boundaries (e.g., every 2 hours at 00:00, 02:00, 04:00)
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

  // Generate ticks based on time intervals aligned to consistent boundaries
  const startTime = new Date(allChartData[0].timestamp);
  const endTime = new Date(allChartData[allChartData.length - 1].timestamp);

  // For date-only intervals, generate ticks at the specified day intervals
  if (markerIntervalMinutes >= 1440) {
    // 1 day or more
    // Generate ticks at the specified trading day interval
    const tradingDaysInterval = Math.floor(markerIntervalMinutes / (60 * 24)); // Convert minutes to days

    // Get all unique trading days from the data
    const tradingDays = new Set<string>();
    allChartData.forEach(dataPoint => {
      const dataDate = new Date(dataPoint.timestamp);
      const dateStr = dataDate.toISOString().split('T')[0];
      tradingDays.add(dateStr);
    });

    // Convert to sorted array of dates
    const sortedTradingDays = Array.from(tradingDays)
      .map(dateStr => new Date(`${dateStr}T00:00:00Z`))
      .sort((a, b) => a.getTime() - b.getTime());

    // Choose alignment strategy based on interval length
    if (tradingDaysInterval <= 7) {
      // For short intervals (1-7 days), use consistent anchoring
      if (tradingDaysInterval >= 2) {
        // For 2+ day intervals, use a fixed anchor point (January 1, 2020)
        // This ensures consistent positioning regardless of data range
        const anchorDate = new Date('2020-01-01T00:00:00Z'); // Wednesday
        const anchorDayOfWeek = anchorDate.getDay(); // 3 = Wednesday

        // Find the first trading day on or after the anchor date
        const firstTradingDay = sortedTradingDays[0];
        const startDate = firstTradingDay < anchorDate ? firstTradingDay : anchorDate;

        // Calculate the offset from the anchor to align intervals
        const daysSinceAnchor = Math.floor((firstTradingDay.getTime() - anchorDate.getTime()) / (1000 * 60 * 60 * 24));
        const offset = daysSinceAnchor % tradingDaysInterval;

        // Find the first trading day that aligns with our interval
        let startIndex = 0;
        if (offset > 0) {
          startIndex = tradingDaysInterval - offset;
        }

        // Generate ticks starting from the aligned position
        for (let i = startIndex; i < sortedTradingDays.length; i += tradingDaysInterval) {
          const tradingDay = sortedTradingDays[i];
          const firstTimeForDate = findFirstTimeForDate(tradingDay, allChartData);
          if (firstTimeForDate) {
            ticks.push(firstTimeForDate);
          }
        }
      } else {
        // For 1-day intervals, show every trading day
        for (let i = 0; i < sortedTradingDays.length; i += tradingDaysInterval) {
          const tradingDay = sortedTradingDays[i];
          const firstTimeForDate = findFirstTimeForDate(tradingDay, allChartData);
          if (firstTimeForDate) {
            ticks.push(firstTimeForDate);
          }
        }
      }
    } else if (tradingDaysInterval <= 30) {
      // For medium intervals (1-4 weeks), align to week boundaries (Monday)
      const firstTradingDay = sortedTradingDays[0];
      const firstMonday = new Date(firstTradingDay);
      // Find the Monday of the week containing the first trading day
      const dayOfWeek = firstMonday.getDay();
      const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Sunday = 0, Monday = 1
      firstMonday.setDate(firstMonday.getDate() + daysToMonday);

      const weeksInterval = Math.max(1, Math.floor(tradingDaysInterval / 7));

      const currentWeek = new Date(firstMonday);
      while (currentWeek <= endTime) {
        // Find the first trading day of this week
        const firstTradingDayOfWeek = sortedTradingDays.find(day => {
          const dayOfWeekForDay = day.getDay();
          const daysToMondayForDay = dayOfWeekForDay === 0 ? -6 : 1 - dayOfWeekForDay;
          const weekStart = new Date(day);
          weekStart.setDate(weekStart.getDate() + daysToMondayForDay);
          return weekStart.getTime() === currentWeek.getTime();
        });

        if (firstTradingDayOfWeek) {
          const firstTimeForDate = findFirstTimeForDate(firstTradingDayOfWeek, allChartData);
          if (firstTimeForDate) {
            ticks.push(firstTimeForDate);
          }
        }

        // Move to the next interval week
        currentWeek.setDate(currentWeek.getDate() + 7 * weeksInterval);
      }
    } else {
      // For long intervals (1+ months), align to month boundaries (1st of each month)
      const firstTradingDay = sortedTradingDays[0];
      const firstMonth = new Date(firstTradingDay.getFullYear(), firstTradingDay.getMonth(), 1);

      const monthsInterval = Math.max(1, Math.floor(tradingDaysInterval / 30));

      const currentMonth = new Date(firstMonth);
      while (currentMonth <= endTime) {
        // Find the first trading day of this month
        const firstTradingDayOfMonth = sortedTradingDays.find(
          day => day.getFullYear() === currentMonth.getFullYear() && day.getMonth() === currentMonth.getMonth()
        );

        if (firstTradingDayOfMonth) {
          const firstTimeForDate = findFirstTimeForDate(firstTradingDayOfMonth, allChartData);
          if (firstTimeForDate) {
            ticks.push(firstTimeForDate);
          }
        }

        // Move to the next interval month
        currentMonth.setMonth(currentMonth.getMonth() + monthsInterval);
      }
    }
  } else {
    // For time-based intervals, use the existing logic
    // Align start time to the nearest consistent boundary
    const alignedStartTime = alignToTimeBoundary(startTime, markerIntervalMinutes, allChartData);

    // If the aligned start time is before our data, move to the next boundary
    const currentTime = new Date(alignedStartTime);
    if (currentTime < startTime) {
      currentTime.setMinutes(currentTime.getMinutes() + markerIntervalMinutes);
    }

    // Generate ticks at regular intervals from the aligned start time
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
  }

  calculationCache.set(cacheKey, ticks);
  cleanupCache(calculationCache, CHART_STATE_CACHE_SIZE);
  return ticks;
};

/**
 * Generate time-based ticks for visible data range only
 * This ensures consistent tick display when panning/zooming
 * Uses the same alignment logic as the main tick generation
 */
export const memoizedGenerateVisibleTimeBasedTicks = (
  visibleData: { timestamp: string }[],
  markerIntervalMinutes: number = X_AXIS_MARKER_INTERVAL,
  allChartData?: { timestamp: string }[]
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

  // Generate ticks based on the visible data range with consistent alignment
  const startTime = new Date(visibleData[0].timestamp);
  const endTime = new Date(visibleData[visibleData.length - 1].timestamp);

  // For date-only formats (1d, 1w, 1M), generate ticks at the specified trading day interval
  if (markerIntervalMinutes >= 1440) {
    // Generate ticks at the specified trading day interval
    const tradingDaysInterval = Math.floor(markerIntervalMinutes / (60 * 24)); // Convert minutes to days

    // Get all unique trading days from the visible data
    const tradingDays = new Set<string>();
    visibleData.forEach(dataPoint => {
      const dataDate = new Date(dataPoint.timestamp);
      const dateStr = dataDate.toISOString().split('T')[0];
      tradingDays.add(dateStr);
    });

    // Convert to sorted array of dates
    const sortedTradingDays = Array.from(tradingDays)
      .map(dateStr => new Date(`${dateStr}T00:00:00Z`))
      .sort((a, b) => a.getTime() - b.getTime());

    // Choose alignment strategy based on interval length
    if (tradingDaysInterval <= 7) {
      // For short intervals (1-7 days), use consistent anchoring
      if (tradingDaysInterval >= 2) {
        // For 2+ day intervals, use a fixed anchor point (January 1, 2020)
        // This ensures consistent positioning regardless of data range
        const anchorDate = new Date('2020-01-01T00:00:00Z'); // Wednesday
        const anchorDayOfWeek = anchorDate.getDay(); // 3 = Wednesday

        // Find the first trading day on or after the anchor date
        const firstTradingDay = sortedTradingDays[0];
        const startDate = firstTradingDay < anchorDate ? firstTradingDay : anchorDate;

        // Calculate the offset from the anchor to align intervals
        const daysSinceAnchor = Math.floor((firstTradingDay.getTime() - anchorDate.getTime()) / (1000 * 60 * 60 * 24));
        const offset = daysSinceAnchor % tradingDaysInterval;

        // Find the first trading day that aligns with our interval
        let startIndex = 0;
        if (offset > 0) {
          startIndex = tradingDaysInterval - offset;
        }

        // Generate ticks starting from the aligned position
        for (let i = startIndex; i < sortedTradingDays.length; i += tradingDaysInterval) {
          const tradingDay = sortedTradingDays[i];
          const firstTimeForDate = findFirstTimeForDate(tradingDay, allChartData || visibleData);
          if (firstTimeForDate) {
            ticks.push(firstTimeForDate);
          }
        }
      } else {
        // For 1-day intervals, show every trading day
        for (let i = 0; i < sortedTradingDays.length; i += tradingDaysInterval) {
          const tradingDay = sortedTradingDays[i];
          const firstTimeForDate = findFirstTimeForDate(tradingDay, allChartData || visibleData);
          if (firstTimeForDate) {
            ticks.push(firstTimeForDate);
          }
        }
      }
    } else if (tradingDaysInterval <= 30) {
      // For medium intervals (1-4 weeks), align to week boundaries (Monday)
      const firstTradingDay = sortedTradingDays[0];
      const firstMonday = new Date(firstTradingDay);
      // Find the Monday of the week containing the first trading day
      const dayOfWeek = firstMonday.getDay();
      const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Sunday = 0, Monday = 1
      firstMonday.setDate(firstMonday.getDate() + daysToMonday);

      const weeksInterval = Math.max(1, Math.floor(tradingDaysInterval / 7));

      const currentWeek = new Date(firstMonday);
      while (currentWeek <= endTime) {
        // Find the first trading day of this week
        const firstTradingDayOfWeek = sortedTradingDays.find(day => {
          const dayOfWeekForDay = day.getDay();
          const daysToMondayForDay = dayOfWeekForDay === 0 ? -6 : 1 - dayOfWeekForDay;
          const weekStart = new Date(day);
          weekStart.setDate(weekStart.getDate() + daysToMondayForDay);
          return weekStart.getTime() === currentWeek.getTime();
        });

        if (firstTradingDayOfWeek) {
          const firstTimeForDate = findFirstTimeForDate(firstTradingDayOfWeek, allChartData || visibleData);
          if (firstTimeForDate) {
            ticks.push(firstTimeForDate);
          }
        }

        // Move to the next interval week
        currentWeek.setDate(currentWeek.getDate() + 7 * weeksInterval);
      }
    } else {
      // For long intervals (1+ months), align to month boundaries (1st of each month)
      const firstTradingDay = sortedTradingDays[0];
      const firstMonth = new Date(firstTradingDay.getFullYear(), firstTradingDay.getMonth(), 1);

      const monthsInterval = Math.max(1, Math.floor(tradingDaysInterval / 30));

      const currentMonth = new Date(firstMonth);
      while (currentMonth <= endTime) {
        // Find the first trading day of this month
        const firstTradingDayOfMonth = sortedTradingDays.find(
          day => day.getFullYear() === currentMonth.getFullYear() && day.getMonth() === currentMonth.getMonth()
        );

        if (firstTradingDayOfMonth) {
          const firstTimeForDate = findFirstTimeForDate(firstTradingDayOfMonth, allChartData || visibleData);
          if (firstTimeForDate) {
            ticks.push(firstTimeForDate);
          }
        }

        // Move to the next interval month
        currentMonth.setMonth(currentMonth.getMonth() + monthsInterval);
      }
    }
  } else {
    // For time-based intervals, use the existing logic
    // Align start time to the nearest consistent boundary
    const alignedStartTime = alignToTimeBoundary(startTime, markerIntervalMinutes, allChartData);

    // If the aligned start time is before our data, move to the next boundary
    const currentTime = new Date(alignedStartTime);
    if (currentTime < startTime) {
      currentTime.setMinutes(currentTime.getMinutes() + markerIntervalMinutes);
    }

    // Generate ticks at regular intervals from the aligned start time
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
export const memoizedFormatTime = (timestamp: Date, interval?: string): string => {
  const timeKey = timestamp.getTime().toString();
  const cacheKey = `timeFormat-${timeKey}-${interval || 'default'}`;

  if (calculationCache.has(cacheKey)) {
    return calculationCache.get(cacheKey) as string;
  }

  // Get configuration for the interval, fallback to 1m if not found
  const config = X_AXIS_LABEL_CONFIGS[interval || '1m'] || X_AXIS_LABEL_CONFIGS['1m'];

  let result: string;

  switch (config.labelFormat) {
    case 'time-only':
      result = timestamp.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: config.showSeconds ? '2-digit' : undefined,
        hour12: false, // Use 24-hour format
      });
      break;
    case 'date-only': {
      // Format: 5-5-2025 (single digits, no leading zeros)
      const dateMonth = timestamp.getMonth() + 1;
      const dateDay = timestamp.getDate();
      const dateYear = timestamp.getFullYear();
      result = `${dateMonth}-${dateDay}-${dateYear}`;
      break;
    }
    case 'date-time': {
      // Friendly format without leading zeros for dates, but with leading zeros for time: 1-1-2025 9:30
      const month = timestamp.getMonth() + 1;
      const day = timestamp.getDate();
      const year = timestamp.getFullYear();
      const hour = timestamp.getHours();
      const minute = timestamp.getMinutes().toString().padStart(2, '0');
      result = `${month}-${day}-${year} ${hour}:${minute}`;
      break;
    }
    case 'short':
      result = timestamp.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false, // Use 24-hour format
      });
      break;
    case 'medium':
      result = timestamp.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false, // Use 24-hour format
      });
      break;
    case 'long':
      result = timestamp.toLocaleString('en-US', {
        weekday: 'short',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: config.showSeconds ? '2-digit' : undefined,
        hour12: false, // Use 24-hour format
      });
      break;
    default:
      result = timestamp.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false, // Use 24-hour format
      });
  }

  calculationCache.set(cacheKey, result);
  cleanupCache(calculationCache, CHART_STATE_CACHE_SIZE);
  return result;
};

/**
 * Helper function to apply axis styling without cache logic
 * Used internally to avoid code duplication
 */
const applyAxisStylingDirect = (axis: d3.Selection<SVGGElement, unknown, null, undefined>): void => {
  // Style the domain lines and tick lines
  axis
    .select('.domain')
    .style('stroke', AXIS_DOMAIN_AND_TICKS.STROKE_COLOR)
    .style('stroke-width', AXIS_DOMAIN_AND_TICKS.STROKE_WIDTH);

  axis
    .selectAll('.tick line')
    .style('stroke', AXIS_DOMAIN_AND_TICKS.STROKE_COLOR)
    .style('stroke-width', AXIS_DOMAIN_AND_TICKS.STROKE_WIDTH);

  // Style tick labels
  axis
    .selectAll('.tick text')
    .style('font-size', AXIS_LABELS.FONT_SIZE)
    .style('font-family', AXIS_LABELS.FONT_FAMILY)
    .style('fill', AXIS_LABELS.FILL_COLOR);
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
    // Even if cached, ensure styling is applied to any new ticks created during panning/zooming
    // This is crucial for new ticks created during panning/zooming
    applyAxisStylingDirect(axis);
    return; // Already styled, skip other operations
  }

  // Apply the styling
  applyAxisStylingDirect(axis);

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
