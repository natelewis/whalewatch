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
      return { timeRangeHours: 4, aggregationIntervalMinutes: 1, maxDataPoints: 240 };
    case '1D':
      return { timeRangeHours: 24, aggregationIntervalMinutes: 1, maxDataPoints: 1440 };
    case '1W':
      return { timeRangeHours: 24 * 7, aggregationIntervalMinutes: 60, maxDataPoints: 168 };
    case '1M':
      return { timeRangeHours: 24 * 30, aggregationIntervalMinutes: 60, maxDataPoints: 720 };
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
    return data.slice(0, config.maxDataPoints);
  }

  // Sort data by timestamp to ensure proper aggregation
  const sortedData = [...data].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  // Group data by aggregation interval
  const aggregatedData: QuestDBStockAggregate[] = [];
  const intervalMs = config.aggregationIntervalMinutes * 60 * 1000; // Convert minutes to milliseconds

  let currentGroup: QuestDBStockAggregate[] = [];
  let groupStartTime: number | null = null;

  for (const item of sortedData) {
    const itemTime = new Date(item.timestamp).getTime();

    if (groupStartTime === null) {
      groupStartTime = itemTime;
      currentGroup = [item];
    } else if (itemTime - groupStartTime < intervalMs) {
      currentGroup.push(item);
    } else {
      // Time to create a new group, first aggregate the current group
      if (currentGroup.length > 0) {
        aggregatedData.push(aggregateGroup(currentGroup));
      }

      // Start new group
      groupStartTime = itemTime;
      currentGroup = [item];
    }
  }

  // Don't forget the last group
  if (currentGroup.length > 0) {
    aggregatedData.push(aggregateGroup(currentGroup));
  }

  // Limit to max data points for performance
  return aggregatedData.slice(0, config.maxDataPoints);
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
    const { timeframe = '1D', limit = '1000', start_time, end_time } = req.query;

    if (!symbol) {
      return res.status(400).json({ error: 'Symbol is required' });
    }

    const limitNum = parseInt(limit as string);
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 10000) {
      return res.status(400).json({ error: 'Limit must be between 1 and 10000' });
    }

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
    const config = getTimeframeConfig(timeframe as string);
    const params: QuestDBQueryParams = {
      start_time: calculatedStartTime,
      end_time: calculatedEndTime,
      limit: Math.min(limitNum, config.maxDataPoints * 10), // Allow more data for aggregation
      order_by: 'timestamp',
      order_direction: 'ASC',
    };

    let aggregates = await questdbService.getStockAggregates(symbol.toUpperCase(), params);

    // If no data found in the requested time range, try to get the most recent available data
    if (aggregates.length === 0 && !start_time && !end_time) {
      console.log(
        `No data found for ${symbol} in current time range, fetching most recent available data`
      );

      // Query for the most recent data without time constraints
      const fallbackParams: QuestDBQueryParams = {
        limit: limitNum,
        order_by: 'timestamp',
        order_direction: 'DESC',
      };

      aggregates = await questdbService.getStockAggregates(symbol.toUpperCase(), fallbackParams);

      // If we found data, get the time range of available data
      if (aggregates.length > 0) {
        const latestTimestamp = aggregates[0].timestamp;
        const earliestTimestamp = aggregates[aggregates.length - 1].timestamp;

        console.log(
          `Found ${aggregates.length} records for ${symbol} from ${earliestTimestamp} to ${latestTimestamp}`
        );

        // Reverse the order to maintain ASC order for the frontend
        aggregates.reverse();
      }
    }

    // Remove duplicates by timestamp to avoid chart rendering issues
    const uniqueAggregates = aggregates.reduce((acc, agg) => {
      const timestamp = agg.timestamp;
      if (!acc.find((a) => a.timestamp === timestamp)) {
        acc.push(agg);
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
      data_range:
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
