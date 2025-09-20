import { Router, Request, Response } from 'express';
import { questdbService } from '../services/questdbService';
import { QuestDBQueryParams, QuestDBStockAggregate } from '../types/questdb';

const router = Router();

/**
 * Supported aggregation intervals in minutes
 */
export const AGGREGATION_INTERVALS = {
  '1m': 1,
  '5m': 5,
  '30m': 30,
  '1h': 60,
  '2h': 120,
  '4h': 240,
  '1d': 1440,
  '1w': 10080,
  '1M': 43200, // 30 days
} as const;

export type AggregationInterval = keyof typeof AGGREGATION_INTERVALS;

/**
 * Chart query parameters for the new system
 */
interface ChartQueryParams {
  startTime: string; // ISO timestamp
  direction: 'past' | 'future'; // Direction to load data from start_time
  interval: AggregationInterval;
  limit: number; // Number of data points to return
  viewBasedLoading?: boolean; // Enable view-based preloading
  viewSize?: number; // Size of one view (defaults to limit)
}

/**
 * Get the interval in minutes for a given aggregation interval
 */
function getIntervalMinutes(interval: AggregationInterval): number {
  return AGGREGATION_INTERVALS[interval];
}

/**
 * Aggregate stock data with the new system that skips intervals without data
 */
function aggregateDataWithIntervals(
  data: QuestDBStockAggregate[],
  params: ChartQueryParams
): QuestDBStockAggregate[] {
  if (data.length === 0) {
    return data;
  }

  const intervalMinutes = getIntervalMinutes(params.interval);
  const intervalMs = intervalMinutes * 60 * 1000;
  const startTime = new Date(params.startTime).getTime();

  // Sort data by timestamp to ensure proper aggregation
  const sortedData = [...data].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  // For 1-minute intervals, no aggregation needed - just return the data
  if (intervalMinutes === 1) {
    const totalPointsToCollect = params.viewBasedLoading
      ? (params.viewSize || params.limit) * 3 // 1 view before + 1 current + 1 after
      : params.limit;

    // Filter data based on direction from start_time
    const filteredData = sortedData.filter((item) => {
      const itemTime = new Date(item.timestamp).getTime();
      if (params.direction === 'past') {
        return itemTime <= startTime;
      } else {
        return itemTime >= startTime;
      }
    });

    // Return the appropriate slice based on direction
    if (params.direction === 'past') {
      return filteredData.slice(-totalPointsToCollect);
    } else {
      return filteredData.slice(0, totalPointsToCollect);
    }
  }

  // Use time-based bucketing for proper aggregation
  const buckets = new Map<number, QuestDBStockAggregate[]>();

  for (const item of sortedData) {
    const itemTime = new Date(item.timestamp).getTime();
    // Create buckets based on time intervals (floor to the nearest interval)
    const bucketTime = Math.floor(itemTime / intervalMs) * intervalMs;

    if (!buckets.has(bucketTime)) {
      buckets.set(bucketTime, []);
    }
    const bucket = buckets.get(bucketTime);
    if (bucket) {
      bucket.push(item);
    }
  }

  // Convert buckets to aggregated data based on direction
  const aggregatedData: QuestDBStockAggregate[] = [];
  let sortedBuckets: [number, QuestDBStockAggregate[]][];

  if (params.direction === 'past') {
    // For past direction, work backwards from start_time
    sortedBuckets = Array.from(buckets.entries())
      .sort(([a], [b]) => b - a) // Sort descending to work backwards
      .filter(([bucketTime]) => bucketTime <= startTime); // Only include buckets up to start_time
  } else {
    // For future direction, work forwards from start_time
    sortedBuckets = Array.from(buckets.entries())
      .sort(([a], [b]) => a - b) // Sort ascending to work forwards
      .filter(([bucketTime]) => bucketTime >= startTime); // Only include buckets from start_time onwards
  }

  let dataPointsCollected = 0;
  const totalPointsToCollect = params.viewBasedLoading
    ? (params.viewSize || params.limit) * 3 // 1 view before + 1 current + 1 after
    : params.limit;

  for (const [bucketTime, bucketData] of sortedBuckets) {
    if (dataPointsCollected >= totalPointsToCollect) {
      break;
    }

    if (bucketData.length > 0) {
      const aggregated = aggregateGroup(bucketData);
      // Use the bucket time as the timestamp for consistency
      aggregated.timestamp = new Date(bucketTime).toISOString();

      if (params.direction === 'past') {
        aggregatedData.unshift(aggregated); // Add to beginning to maintain chronological order
      } else {
        aggregatedData.push(aggregated); // Add to end for future direction
      }
      dataPointsCollected++;
    }
  }

  return aggregatedData;
}

/**
 * Aggregate a group of stock data into a single bar
 */
function aggregateGroup(group: QuestDBStockAggregate[]): QuestDBStockAggregate {
  if (group.length === 1) {
    return group[0];
  }

  // Sort by timestamp to ensure proper order
  const sortedGroup = group.sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const first = sortedGroup[0];
  const last = sortedGroup[sortedGroup.length - 1];

  return {
    symbol: first.symbol,
    timestamp: first.timestamp, // Use the first timestamp as the bar timestamp
    open: first.open,
    high: Math.max(...sortedGroup.map((item) => item.high)),
    low: Math.min(...sortedGroup.map((item) => item.low)),
    close: last.close,
    volume: sortedGroup.reduce((sum, item) => sum + item.volume, 0),
    vwap:
      sortedGroup.reduce((sum, item) => sum + item.vwap * item.volume, 0) /
      sortedGroup.reduce((sum, item) => sum + item.volume, 0),
    transaction_count: sortedGroup.reduce((sum, item) => sum + item.transaction_count, 0),
  };
}

// Generate mock data for testing when database is empty
function generateMockData(
  symbol: string,
  limit: number,
  interval: string
): QuestDBStockAggregate[] {
  const mockData: QuestDBStockAggregate[] = [];
  const now = new Date();
  const intervalMs = getIntervalMs(interval);

  for (let i = 0; i < limit; i++) {
    const timestamp = new Date(now.getTime() - (limit - i - 1) * intervalMs);
    const basePrice = 100 + Math.sin(i * 0.1) * 10 + Math.random() * 5;

    mockData.push({
      symbol: symbol.toUpperCase(),
      timestamp: timestamp.toISOString(),
      open: basePrice,
      high: basePrice + Math.random() * 2,
      low: basePrice - Math.random() * 2,
      close: basePrice + (Math.random() - 0.5) * 2,
      volume: Math.floor(Math.random() * 1000) + 100,
      transaction_count: Math.floor(Math.random() * 100) + 10,
      vwap: basePrice + (Math.random() - 0.5) * 1,
    });
  }

  return mockData;
}

// Helper function to get interval in milliseconds
function getIntervalMs(interval: string): number {
  const intervalMap: { [key: string]: number } = {
    '1m': 60 * 1000,
    '5m': 5 * 60 * 1000,
    '30m': 30 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '2h': 2 * 60 * 60 * 1000,
    '4h': 4 * 60 * 60 * 1000,
    '1d': 24 * 60 * 60 * 1000,
    '1w': 7 * 24 * 60 * 60 * 1000,
    '1M': 30 * 24 * 60 * 60 * 1000,
  };

  return intervalMap[interval] || 60 * 60 * 1000; // Default to 1 hour
}

// Get chart data for a symbol from QuestDB with new parameters
router.get('/:symbol', async (req: Request, res: Response) => {
  try {
    const { symbol } = req.params;
    const {
      start_time,
      direction = 'past',
      interval = '1h',
      limit = process.env.DEFAULT_CHART_DATA_POINTS || '1000',
      view_based_loading,
      view_size,
    } = req.query;

    if (!symbol) {
      return res.status(400).json({ error: 'Symbol is required' });
    }

    // Validate direction parameter
    if (direction !== 'past' && direction !== 'future') {
      return res.status(400).json({ error: 'direction must be either "past" or "future"' });
    }

    const intervalKey = interval as AggregationInterval;
    if (!AGGREGATION_INTERVALS[intervalKey]) {
      return res.status(400).json({
        error: `Invalid interval. Supported intervals: ${Object.keys(AGGREGATION_INTERVALS).join(
          ', '
        )}`,
      });
    }

    const limitValue = parseInt(limit as string, 10);
    if (isNaN(limitValue) || limitValue <= 0) {
      return res.status(400).json({ error: 'limit must be a positive integer' });
    }

    const viewBasedLoading = view_based_loading === 'true';
    const viewSize = view_size ? parseInt(view_size as string, 10) : limitValue;
    if (viewSize <= 0) {
      return res.status(400).json({ error: 'view_size must be a positive integer' });
    }

    // Use current time as default start_time if not provided
    const startTime = start_time ? new Date(start_time as string) : new Date();
    if (isNaN(startTime.getTime())) {
      return res.status(400).json({ error: 'start_time must be a valid ISO timestamp' });
    }

    const chartParams: ChartQueryParams = {
      startTime: startTime.toISOString(),
      direction: direction as 'past' | 'future',
      interval: intervalKey,
      limit: limitValue,
      viewBasedLoading: viewBasedLoading,
      viewSize: viewSize,
    };

    console.log(
      `🔍 DEBUG: Querying ${symbol} from ${startTime.toISOString()} in ${direction} direction with ${intervalKey} intervals, requesting ${limitValue} data points${
        viewBasedLoading ? ` (view-based loading: ${viewSize} per view)` : ''
      }`
    );

    // Calculate time range for QuestDB query based on direction and limit
    const intervalMs = getIntervalMinutes(intervalKey) * 60 * 1000;
    const timeRange = limitValue * intervalMs;

    let queryStartTime: string;
    let queryEndTime: string;

    if (direction === 'past') {
      queryStartTime = new Date(startTime.getTime() - timeRange).toISOString();
      queryEndTime = startTime.toISOString();
    } else {
      queryStartTime = startTime.toISOString();
      queryEndTime = new Date(startTime.getTime() + timeRange).toISOString();
    }

    // Get aggregates from QuestDB
    const params: QuestDBQueryParams = {
      start_time: queryStartTime,
      end_time: queryEndTime,
      order_by: 'timestamp',
      order_direction: 'ASC', // Get data in chronological order
    };

    let aggregates = await questdbService.getStockAggregates(symbol.toUpperCase(), params);
    console.log(`🔍 DEBUG: Retrieved ${aggregates.length} raw aggregates for ${symbol}`);

    // If no data found in the specified time range, try to get the most recent available data
    if (aggregates.length === 0) {
      console.log(
        `No data found for ${symbol} in ${direction} direction from ${startTime.toISOString()}`
      );

      // Query for the most recent available data without time restrictions
      const fallbackParams: QuestDBQueryParams = {
        order_by: 'timestamp',
        order_direction: direction === 'past' ? 'DESC' : 'ASC',
        limit: 1000, // Get some recent data to work with
      };

      const recentData = await questdbService.getStockAggregates(
        symbol.toUpperCase(),
        fallbackParams
      );

      if (recentData.length > 0) {
        const latestTimestamp = recentData[0].timestamp;
        const earliestTimestamp = recentData[recentData.length - 1].timestamp;
        console.log(
          `Found most recent data for ${symbol} from ${earliestTimestamp} to ${latestTimestamp}`
        );

        // Use the available data range
        const actualStartTime = new Date(earliestTimestamp);
        const actualEndTime = new Date(latestTimestamp);
        console.log(
          `Using actual time range: ${actualStartTime.toISOString()} to ${actualEndTime.toISOString()}`
        );

        // Update chart params with actual time range
        chartParams.startTime = actualStartTime.toISOString();

        // Query again with the actual time range
        const adjustedParams: QuestDBQueryParams = {
          start_time: actualStartTime.toISOString(),
          end_time: actualEndTime.toISOString(),
          order_by: 'timestamp',
          order_direction: 'ASC',
        };

        aggregates = await questdbService.getStockAggregates(symbol.toUpperCase(), adjustedParams);
        console.log(`Found ${aggregates.length} records with actual time range`);
      }
    }

    // Remove duplicates by timestamp and aggregate them properly
    const uniqueAggregates = aggregates.reduce((acc, agg) => {
      const timestamp = agg.timestamp;
      const existing = acc.find((a) => a.timestamp === timestamp);

      if (!existing) {
        acc.push(agg);
      } else {
        // If duplicate found, aggregate the data properly
        existing.high = Math.max(existing.high, agg.high);
        existing.low = Math.min(existing.low, agg.low);
        existing.close = agg.close; // Use the latest close price
        existing.volume += agg.volume;
        existing.transaction_count += agg.transaction_count;
        existing.vwap =
          (existing.vwap * existing.volume + agg.vwap * agg.volume) /
          (existing.volume + agg.volume);
      }
      return acc;
    }, [] as typeof aggregates);

    // Aggregate data using the new system that skips intervals without data
    let aggregatedData = aggregateDataWithIntervals(uniqueAggregates, chartParams);

    console.log(`🔍 DEBUG: Aggregated to ${aggregatedData.length} data points for ${symbol}`);

    // If no data is available, generate mock data for testing
    if (aggregatedData.length === 0) {
      console.log('🔍 DEBUG: No data found, generating mock data for testing');
      const mockDataPoints = chartParams.viewBasedLoading
        ? (chartParams.viewSize || chartParams.limit) * 3
        : chartParams.limit;

      aggregatedData = generateMockData(symbol, mockDataPoints, chartParams.interval);
    }

    // Convert QuestDB aggregates to Alpaca bar format for frontend compatibility
    const bars = aggregatedData.map((agg) => ({
      t: agg.timestamp,
      o: agg.open,
      h: agg.high,
      l: agg.low,
      c: agg.close,
      v: agg.volume,
      n: agg.transaction_count,
      vw: agg.vwap,
    }));

    return res.json({
      symbol: symbol.toUpperCase(),
      interval: intervalKey,
      limit: limitValue,
      direction: chartParams.direction,
      view_based_loading: viewBasedLoading,
      view_size: viewSize,
      bars,
      data_source: 'questdb',
      success: true,
      query_params: {
        start_time: chartParams.startTime,
        direction: chartParams.direction,
        interval: chartParams.interval,
        requested_limit: chartParams.limit,
        view_based_loading: chartParams.viewBasedLoading,
        view_size: chartParams.viewSize,
      },
      actual_data_range:
        aggregatedData.length > 0
          ? {
              earliest: aggregatedData[0]?.timestamp,
              latest: aggregatedData[aggregatedData.length - 1]?.timestamp,
            }
          : null,
    });
  } catch (error: unknown) {
    console.error('Error fetching chart data from QuestDB:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return res.status(500).json({
      error: `Failed to fetch chart data: ${errorMessage}`,
      data_source: 'questdb',
      success: false,
    });
  }
});

export { router as chartRoutes };
