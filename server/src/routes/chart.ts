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

    // For 1-minute intervals, the data is already filtered by the time range query
    // Just return the appropriate slice based on direction
    if (params.direction === 'past') {
      return sortedData.slice(-totalPointsToCollect);
    } else {
      return sortedData.slice(0, totalPointsToCollect);
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

    // eslint-disable-next-line camelcase
    const viewBasedLoading = view_based_loading === 'true';
    // eslint-disable-next-line camelcase
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

    // Calculate how much raw data we need to fetch for proper aggregation
    const intervalMinutes = getIntervalMinutes(intervalKey);
    let rawDataLimit: number;

    if (intervalMinutes === 1) {
      // For 1-minute intervals, we need exactly the requested limit
      rawDataLimit = limitValue;
    } else {
      // For larger intervals, we need more raw data to create the requested number of aggregated bars
      // Add a buffer to account for potential gaps in data (e.g., weekends, market hours)
      const multiplier = Math.ceil(intervalMinutes * 2); // 2x buffer for safety
      rawDataLimit = limitValue * multiplier;
    }

    console.log(
      `🔍 DEBUG: Interval: ${intervalMinutes}min, Requested: ${limitValue} bars, Fetching: ${rawDataLimit} raw records`
    );

    // For past direction: get records <= startTime, ordered DESC (most recent first),
    // limit to calculated raw data count
    // For future direction: get records >= startTime, ordered ASC (earliest first),
    // limit to calculated raw data count
    const params: QuestDBQueryParams = {
      order_by: 'timestamp',
      order_direction: direction === 'past' ? 'DESC' : 'ASC',
      limit: rawDataLimit,
    };

    // Only set start_time for both directions
    params.start_time = startTime.toISOString();

    console.log(`🔍 DEBUG: Query params:`, params);

    let aggregates = await questdbService.getStockAggregates(symbol.toUpperCase(), params);
    console.log(`🔍 DEBUG: Retrieved ${aggregates.length} raw aggregates for ${symbol}`);

    if (aggregates.length > 0) {
      console.log(
        `🔍 DEBUG: Data range: ${aggregates[0].timestamp} to ${
          aggregates[aggregates.length - 1].timestamp
        }`
      );
      console.log(
        `🔍 DEBUG: First few records:`,
        aggregates.slice(0, 3).map((agg) => ({ timestamp: agg.timestamp, close: agg.close }))
      );

      // For past direction, we got data in DESC order (most recent first), but we need ASC order for display
      if (direction === 'past') {
        aggregates = aggregates.reverse();
        console.log(
          `🔍 DEBUG: Reversed order for past direction - now ${aggregates[0].timestamp} to ${
            aggregates[aggregates.length - 1].timestamp
          }`
        );
      }
    }

    // If no data found, return empty result
    if (aggregates.length === 0) {
      console.log(
        `No data found for ${symbol} in ${direction} direction from ${startTime.toISOString()}`
      );
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
    const aggregatedData = aggregateDataWithIntervals(uniqueAggregates, chartParams);

    console.log(`🔍 DEBUG: Aggregated to ${aggregatedData.length} data points for ${symbol}`);

    // If no data is available, return empty result
    if (aggregatedData.length === 0) {
      console.log('🔍 DEBUG: No data found, returning empty result');
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
