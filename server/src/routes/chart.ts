import { Router, Request, Response } from 'express';
import { questdbService } from '../services/questdbService';
import { QuestDBQueryParams } from '../types/questdb';

const router = Router();

/**
 * Convert timeframe string to hours for time range calculation
 */
function getTimeframeHours(timeframe: string): number {
  switch (timeframe) {
    case '1m':
      return 1 / 60; // 1 minute = 1/60 hours
    case '5m':
      return 5 / 60; // 5 minutes = 5/60 hours
    case '15m':
      return 15 / 60; // 15 minutes = 15/60 hours
    case '1H':
      return 1; // 1 hour
    case '4H':
      return 4; // 4 hours
    case '1D':
      return 24; // 1 day = 24 hours
    case '1W':
      return 24 * 7; // 1 week = 168 hours
    default:
      return 24; // Default to 1 day
  }
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
      const timeframeHours = getTimeframeHours(timeframe as string);
      const startDate = new Date(now.getTime() - timeframeHours * 60 * 60 * 1000);

      calculatedStartTime = startDate.toISOString();
      calculatedEndTime = now.toISOString();
    }

    // Get aggregates from QuestDB
    const params: QuestDBQueryParams = {
      start_time: calculatedStartTime,
      end_time: calculatedEndTime,
      limit: limitNum,
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

    // Convert QuestDB aggregates to Alpaca bar format for frontend compatibility
    // Remove duplicates by timestamp to avoid chart rendering issues
    const uniqueAggregates = aggregates.reduce((acc, agg) => {
      const timestamp = agg.timestamp;
      if (!acc.find((a) => a.timestamp === timestamp)) {
        acc.push(agg);
      }
      return acc;
    }, [] as typeof aggregates);

    const bars = uniqueAggregates.map((agg) => ({
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
        uniqueAggregates.length > 0
          ? {
              earliest: uniqueAggregates[0]?.timestamp,
              latest: uniqueAggregates[uniqueAggregates.length - 1]?.timestamp,
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
