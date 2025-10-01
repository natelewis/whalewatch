import { Router, Request, Response } from 'express';
import { ChartQueryParams, AGGREGATION_INTERVALS, AggregationInterval } from '../types/index';
import { logger } from '../utils/logger';
import { alpacaService } from '../services/alpacaService';

const router = Router();

/**
 * Get the interval in minutes for a given aggregation interval
 */
export function getIntervalMinutes(interval: AggregationInterval): number {
  return AGGREGATION_INTERVALS[interval];
}

/**
 * Map our interval format to Alpaca's timeframe format
 */
function mapIntervalToAlpacaTimeframe(interval: AggregationInterval): string {
  const mapping: Record<AggregationInterval, string> = {
    '1m': '1Min',
    '15m': '15Min',
    '30m': '30Min',
    '1h': '1Hour',
    '1d': '1Day',
  };
  return mapping[interval];
}

// Get chart data for a symbol from Alpaca API with flexible parameters
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
    if (direction !== 'past' && direction !== 'future' && direction !== 'centered') {
      return res.status(400).json({ error: 'direction must be either "past", "future", or "centered"' });
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
      direction: direction as 'past' | 'future' | 'centered',
      interval: intervalKey,
      limit: limitValue,
      viewBasedLoading: viewBasedLoading,
      viewSize: viewSize,
    };

    // Map to Alpaca's timeframe format
    const alpacaTimeframe = mapIntervalToAlpacaTimeframe(intervalKey);

    // Fetch bars using the directional approach (like the database did)
    // This ensures we get exactly the number of bars requested
    const bars = await alpacaService.getHistoricalBarsDirectional(
      symbol.toUpperCase(),
      startTime,
      alpacaTimeframe,
      limitValue,
      direction
    );

    // If no data found, log for debugging
    if (!bars || bars.length === 0) {
      logger.debug(`No data found for ${symbol} in ${direction} direction from ${startTime.toISOString()}`);
    }

    return res.json({
      symbol: symbol.toUpperCase(),
      interval: intervalKey,
      limit: limitValue,
      direction: chartParams.direction,
      view_based_loading: viewBasedLoading,
      view_size: viewSize,
      bars,
      data_source: 'alpaca',
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
        bars && bars.length > 0
          ? {
              earliest: bars[0]?.t,
              latest: bars[bars.length - 1]?.t,
            }
          : null,
    });
  } catch (error: unknown) {
    logger.server.error('Error fetching chart data from Alpaca:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return res.status(500).json({
      error: `Failed to fetch chart data: ${errorMessage}`,
      data_source: 'alpaca',
      success: false,
    });
  }
});

export { router as chartRoutes };
