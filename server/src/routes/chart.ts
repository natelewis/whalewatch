import { Router, Request, Response } from 'express';
import { questdbService } from '../services/questdbService';
import { QuestDBQueryParams } from '../types/questdb';

const router = Router();

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

    // Get aggregates from QuestDB
    const params: QuestDBQueryParams = {
      start_time: start_time as string | undefined,
      end_time: end_time as string | undefined,
      limit: limitNum,
      order_by: 'timestamp',
      order_direction: 'ASC',
    };

    const aggregates = await questdbService.getStockAggregates(symbol.toUpperCase(), params);

    // Convert QuestDB aggregates to Alpaca bar format for frontend compatibility
    const bars = aggregates.map((agg) => ({
      t: agg.timestamp,
      o: agg.open,
      h: agg.high,
      l: agg.low,
      c: agg.close,
      v: agg.volume,
      n: agg.transaction_count,
      vw: agg.vwap,
    }));

    res.json({
      symbol: symbol.toUpperCase(),
      timeframe,
      bars,
      data_source: 'questdb',
      success: true,
    });
  } catch (error: any) {
    console.error('Error fetching chart data from QuestDB:', error);
    res.status(500).json({
      error: `Failed to fetch chart data: ${error.message}`,
      data_source: 'questdb',
      success: false,
    });
  }
});

export { router as chartRoutes };
