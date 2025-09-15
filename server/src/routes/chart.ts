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
  endTime: string; // ISO timestamp
  interval: AggregationInterval;
  dataPoints: number; // Number of data points to return
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
  if (data.length === 0) return data;

  const intervalMinutes = getIntervalMinutes(params.interval);
  const intervalMs = intervalMinutes * 60 * 1000;
  const endTime = new Date(params.endTime).getTime();

  // Sort data by timestamp to ensure proper aggregation
  const sortedData = [...data].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  // For 1-minute intervals, no aggregation needed - just return the data
  if (intervalMinutes === 1) {
    return sortedData.slice(-params.dataPoints);
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
    buckets.get(bucketTime)!.push(item);
  }

  // Convert buckets to aggregated data, working backwards from end time
  const aggregatedData: QuestDBStockAggregate[] = [];
  const sortedBuckets = Array.from(buckets.entries())
    .sort(([a], [b]) => b - a) // Sort descending to work backwards from end time
    .filter(([bucketTime]) => bucketTime <= endTime); // Only include buckets up to end time

  let dataPointsCollected = 0;
  for (const [bucketTime, bucketData] of sortedBuckets) {
    if (dataPointsCollected >= params.dataPoints) break;

    if (bucketData.length > 0) {
      const aggregated = aggregateGroup(bucketData);
      // Use the bucket time as the timestamp for consistency
      aggregated.timestamp = new Date(bucketTime).toISOString();
      aggregatedData.unshift(aggregated); // Add to beginning to maintain chronological order
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
      end_time,
      interval = '1h',
      data_points = process.env.DEFAULT_CHART_DATA_POINTS || '80',
    } = req.query;

    if (!symbol) {
      return res.status(400).json({ error: 'Symbol is required' });
    }

    // Validate parameters
    if (!end_time) {
      return res.status(400).json({ error: 'end_time parameter is required' });
    }

    const intervalKey = interval as AggregationInterval;
    if (!AGGREGATION_INTERVALS[intervalKey]) {
      return res.status(400).json({
        error: `Invalid interval. Supported intervals: ${Object.keys(AGGREGATION_INTERVALS).join(
          ', '
        )}`,
      });
    }

    const dataPoints = parseInt(data_points as string, 10);
    if (isNaN(dataPoints) || dataPoints <= 0) {
      return res.status(400).json({ error: 'data_points must be a positive integer' });
    }

    // Validate end_time format
    const endTime = new Date(end_time as string);
    if (isNaN(endTime.getTime())) {
      return res.status(400).json({ error: 'end_time must be a valid ISO timestamp' });
    }

    const chartParams: ChartQueryParams = {
      endTime: endTime.toISOString(),
      interval: intervalKey,
      dataPoints: dataPoints,
    };

    console.log(
      `🔍 DEBUG: Querying ${symbol} up to ${endTime.toISOString()} with ${intervalKey} intervals, requesting ${dataPoints} data points`
    );

    // Get aggregates from QuestDB - only specify end_time, let QuestDB return all available data up to that point
    const params: QuestDBQueryParams = {
      end_time: endTime.toISOString(),
      order_by: 'timestamp',
      order_direction: 'DESC', // Get most recent data first
    };

    let aggregates = await questdbService.getStockAggregates(symbol.toUpperCase(), params);
    console.log(`🔍 DEBUG: Retrieved ${aggregates.length} raw aggregates for ${symbol}`);

    // If no data found, try to get the most recent available data
    if (aggregates.length === 0) {
      console.log(`No data found for ${symbol} up to ${endTime.toISOString()}`);

      // Query for the most recent available data without time restrictions
      const fallbackParams: QuestDBQueryParams = {
        order_by: 'timestamp',
        order_direction: 'DESC',
        limit: 1000, // Get some recent data to work with
      };

      const recentData = await questdbService.getStockAggregates(
        symbol.toUpperCase(),
        fallbackParams
      );

      if (recentData.length > 0) {
        const latestTimestamp = recentData[0].timestamp;
        console.log(`Found most recent data for ${symbol} at: ${latestTimestamp}`);

        // Use the most recent data as the end time
        const actualEndTime = new Date(latestTimestamp);
        console.log(`Using actual end time: ${actualEndTime.toISOString()}`);

        // Update chart params with actual end time
        chartParams.endTime = actualEndTime.toISOString();

        // Query again with just the end time
        const adjustedParams: QuestDBQueryParams = {
          end_time: actualEndTime.toISOString(),
          order_by: 'timestamp',
          order_direction: 'DESC',
        };

        aggregates = await questdbService.getStockAggregates(symbol.toUpperCase(), adjustedParams);
        console.log(`Found ${aggregates.length} records with actual end time`);
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
    const aggregatedData = aggregateDataWithIntervals(uniqueAggregates, chartParams);

    console.log(`🔍 DEBUG: Aggregated to ${aggregatedData.length} data points for ${symbol}`);

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
      data_points: dataPoints,
      bars,
      data_source: 'questdb',
      success: true,
      query_params: {
        end_time: chartParams.endTime,
        interval: chartParams.interval,
        requested_data_points: chartParams.dataPoints,
      },
      actual_data_range:
        aggregatedData.length > 0
          ? {
              earliest: aggregatedData[0]?.timestamp,
              latest: aggregatedData[aggregatedData.length - 1]?.timestamp,
            }
          : null,
    });
  } catch (error: any) {
    console.error('Error fetching chart data from QuestDB:', error);
    return res.status(500).json({
      error: `Failed to fetch chart data: ${error.message}`,
      data_source: 'questdb',
      success: false,
    });
  }
});

export { router as chartRoutes };

