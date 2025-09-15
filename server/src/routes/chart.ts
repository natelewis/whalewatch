import { Router, Request, Response } from 'express';
import { questdbService } from '../services/questdbService';
import { QuestDBQueryParams, QuestDBStockAggregate } from '../types/questdb';

const router = Router();

/**
 * Timeframe configuration with proper time ranges and aggregation intervals
 */
interface TimeframeConfig {
  timeRangeHours: number;
  aggregationIntervalMinutes: number;
  maxDataPoints: number;
}

function getTimeframeConfig(timeframe: string): TimeframeConfig {
  switch (timeframe) {
    case '1H':
      return { timeRangeHours: 1, aggregationIntervalMinutes: 1, maxDataPoints: 60 };
    case '4H':
      return { timeRangeHours: 4, aggregationIntervalMinutes: 5, maxDataPoints: 240 };
    case '1D':
      return { timeRangeHours: 24, aggregationIntervalMinutes: 5, maxDataPoints: 288 };
    case '1W':
      return { timeRangeHours: 24 * 7, aggregationIntervalMinutes: 60, maxDataPoints: 168 };
    case '1M':
      return { timeRangeHours: 24 * 30, aggregationIntervalMinutes: 60 * 12, maxDataPoints: 720 };
    case '6M':
      return {
        timeRangeHours: 24 * 30 * 6,
        aggregationIntervalMinutes: 24 * 60,
        maxDataPoints: 180,
      };
    case '1Y':
      return {
        timeRangeHours: 24 * 365,
        aggregationIntervalMinutes: 24 * 60 * 7,
        maxDataPoints: 52,
      };
    case '3Y':
      return {
        timeRangeHours: 24 * 365 * 3,
        aggregationIntervalMinutes: 24 * 60 * 30,
        maxDataPoints: 36,
      };
    case '5Y':
      return {
        timeRangeHours: 24 * 365 * 5,
        aggregationIntervalMinutes: 24 * 60 * 30,
        maxDataPoints: 60,
      };
    case 'ALL':
      return {
        timeRangeHours: 24 * 365 * 20,
        aggregationIntervalMinutes: 24 * 60 * 30,
        maxDataPoints: 240,
      };
    default:
      return { timeRangeHours: 24, aggregationIntervalMinutes: 1, maxDataPoints: 1440 };
  }
}

/**
 * Aggregate stock data based on timeframe configuration
 */
function aggregateDataByTimeframe(
  data: QuestDBStockAggregate[],
  timeframe: string
): QuestDBStockAggregate[] {
  if (data.length === 0) return data;

  const config = getTimeframeConfig(timeframe);

  // For timeframes that don't need aggregation, return as-is
  if (timeframe === 'ALL') {
    return data; // Return all data, no limits
  }

  // Sort data by timestamp to ensure proper aggregation
  const sortedData = [...data].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  // For 1-minute intervals (1H, 4H, 1D), no aggregation needed
  if (config.aggregationIntervalMinutes === 1) {
    return sortedData; // Return all data, no limits
  }

  // Use time-based bucketing for proper aggregation
  const intervalMs = config.aggregationIntervalMinutes * 60 * 1000;
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

  // Convert buckets to aggregated data
  const aggregatedData: QuestDBStockAggregate[] = [];
  const sortedBuckets = Array.from(buckets.entries()).sort(([a], [b]) => a - b);

  for (const [bucketTime, bucketData] of sortedBuckets) {
    if (bucketData.length > 0) {
      const aggregated = aggregateGroup(bucketData);
      // Use the bucket time as the timestamp for consistency
      aggregated.timestamp = new Date(bucketTime).toISOString();
      aggregatedData.push(aggregated);
    }
  }

  // Return all aggregated data - no artificial limits
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

// Get chart data for a symbol from QuestDB
router.get('/:symbol', async (req: Request, res: Response) => {
  try {
    const { symbol } = req.params;
    const { timeframe = '1D', start_time, end_time } = req.query;

    if (!symbol) {
      return res.status(400).json({ error: 'Symbol is required' });
    }

    // Remove limit restrictions - we want all available data
    // The limit parameter is ignored to ensure we get complete datasets

    // Calculate time range based on timeframe if not provided
    let calculatedStartTime = start_time as string | undefined;
    let calculatedEndTime = end_time as string | undefined;

    if (!start_time && !end_time) {
      const now = new Date();
      const config = getTimeframeConfig(timeframe as string);
      const startDate = new Date(now.getTime() - config.timeRangeHours * 60 * 60 * 1000);

      calculatedStartTime = startDate.toISOString();
      calculatedEndTime = now.toISOString();
    }

    // Get aggregates from QuestDB
    // const config = getTimeframeConfig(timeframe as string); // Not needed since we removed limits
    const params: QuestDBQueryParams = {
      start_time: calculatedStartTime,
      end_time: calculatedEndTime,
      // No limit - get all available data in the time range
      order_by: 'timestamp',
      order_direction: 'ASC',
    };

    let aggregates = await questdbService.getStockAggregates(symbol.toUpperCase(), params);
    console.log(
      `🔍 DEBUG: Retrieved ${aggregates.length} aggregates for ${symbol} in timeframe ${timeframe}`
    );

    // If no data found in the requested time range, try to get the most recent available data
    // to understand what time range actually has data
    if (aggregates.length === 0) {
      console.log(
        `No data found for ${symbol} in time range ${calculatedStartTime} to ${calculatedEndTime}`
      );

      // Query for the most recent available data to understand the data range
      const fallbackParams: QuestDBQueryParams = {
        // No limit - get the most recent data
        order_by: 'timestamp',
        order_direction: 'DESC',
      };

      const recentData = await questdbService.getStockAggregates(
        symbol.toUpperCase(),
        fallbackParams
      );

      if (recentData.length > 0) {
        const latestTimestamp = recentData[0].timestamp;
        console.log(`Found most recent data for ${symbol} at: ${latestTimestamp}`);

        // Calculate the actual time range based on the most recent data
        const latestDate = new Date(latestTimestamp);
        const config = getTimeframeConfig(timeframe as string);
        const actualStartDate = new Date(
          latestDate.getTime() - config.timeRangeHours * 60 * 60 * 1000
        );

        // Update the calculated times to be based on the actual data
        calculatedStartTime = actualStartDate.toISOString();
        calculatedEndTime = latestDate.toISOString();

        console.log(`Adjusted time range to: ${calculatedStartTime} to ${calculatedEndTime}`);

        // Query again with the adjusted time range
        const adjustedParams: QuestDBQueryParams = {
          start_time: calculatedStartTime,
          end_time: calculatedEndTime,
          // No limit - get all available data in the time range
          order_by: 'timestamp',
          order_direction: 'ASC',
        };

        aggregates = await questdbService.getStockAggregates(symbol.toUpperCase(), adjustedParams);
        console.log(`Found ${aggregates.length} records with adjusted time range`);
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

    // Aggregate data based on the requested timeframe
    const aggregatedData = aggregateDataByTimeframe(uniqueAggregates, timeframe as string);

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
      timeframe,
      bars,
      data_source: 'questdb',
      success: true,
      data_range: {
        earliest: calculatedStartTime,
        latest: calculatedEndTime,
      },
      available_data_range:
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

