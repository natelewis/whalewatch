import { Router, Request, Response } from 'express';
import { questdbService } from '../services/questdbService';
import { QuestDBQueryParams, QuestDBStockAggregate } from '../types/questdb';

const router = Router();

/**
 * Supported aggregation intervals in minutes
 */
export const AGGREGATION_INTERVALS = {
  '1m': 1,
  '15m': 15,
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
        error: `Invalid interval. Supported intervals: ${Object.keys(AGGREGATION_INTERVALS).join(', ')}`,
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

    // Calculate data limit based on interval type
    const intervalMinutes = getIntervalMinutes(intervalKey);
    let dataLimit: number;

    if (intervalMinutes === 1) {
      // For 1-minute intervals, we need exactly the requested limit
      dataLimit = limitValue;
    } else {
      // For aggregated intervals, QuestDB will handle the aggregation
      // We can request the exact number of bars we need
      dataLimit = limitValue;
    }

    console.log(
      `🔍 DEBUG: Interval: ${intervalMinutes}min, Requested: ${limitValue} bars, Fetching: ${dataLimit} records`
    );

    // For past direction: get records <= startTime, ordered DESC (most recent first),
    // limit to calculated data count
    // For future direction: get records >= startTime, ordered ASC (earliest first),
    // limit to calculated data count
    const params: QuestDBQueryParams = {
      order_by: 'timestamp',
      order_direction: direction === 'past' ? 'DESC' : 'ASC',
      limit: dataLimit,
    };

    // Only set start_time for both directions
    params.start_time = startTime.toISOString();

    console.log(`🔍 DEBUG: Query params:`, params);

    // Use QuestDB aggregation for better performance
    let aggregates: QuestDBStockAggregate[];

    if (intervalMinutes === 1) {
      // For 1-minute intervals, use raw data without aggregation
      aggregates = await questdbService.getStockAggregates(symbol.toUpperCase(), params);
      console.log(`🔍 DEBUG: Retrieved ${aggregates.length} raw aggregates for ${symbol}`);
    } else {
      // For all other intervals, use QuestDB's SAMPLE BY aggregation
      aggregates = await questdbService.getAggregatedStockData(symbol.toUpperCase(), intervalKey, params);
      console.log(`🔍 DEBUG: Retrieved ${aggregates.length} aggregated bars for ${symbol}`);
    }

    if (aggregates.length > 0) {
      console.log(`🔍 DEBUG: Data range: ${aggregates[0].timestamp} to ${aggregates[aggregates.length - 1].timestamp}`);
      console.log(
        `🔍 DEBUG: First few records:`,
        aggregates.slice(0, 3).map(agg => ({ timestamp: agg.timestamp, close: agg.close }))
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
      console.log(`No data found for ${symbol} in ${direction} direction from ${startTime.toISOString()}`);
    }

    // For 1-minute intervals, we still need to handle duplicates
    let aggregatedData: QuestDBStockAggregate[];

    if (intervalMinutes === 1) {
      // Remove duplicates by timestamp and aggregate them properly
      const uniqueAggregates = aggregates.reduce((acc, agg) => {
        const timestamp = agg.timestamp;
        const existing = acc.find(a => a.timestamp === timestamp);

        if (!existing) {
          acc.push(agg);
        } else {
          // If duplicate found, aggregate the data properly
          existing.high = Math.max(existing.high, agg.high);
          existing.low = Math.min(existing.low, agg.low);
          existing.close = agg.close; // Use the latest close price
          existing.volume += agg.volume;
          existing.transaction_count += agg.transaction_count;
          existing.vwap = (existing.vwap * existing.volume + agg.vwap * agg.volume) / (existing.volume + agg.volume);
        }
        return acc;
      }, [] as typeof aggregates);

      aggregatedData = uniqueAggregates;
    } else {
      // For aggregated data from QuestDB, no additional processing needed
      aggregatedData = aggregates;
    }

    console.log(`🔍 DEBUG: Aggregated to ${aggregatedData.length} data points for ${symbol}`);

    // If no data is available, return empty result
    if (aggregatedData.length === 0) {
      console.log('🔍 DEBUG: No data found, returning empty result');
    }

    // Convert QuestDB aggregates to Alpaca bar format for frontend compatibility
    const bars = aggregatedData.map(agg => ({
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
