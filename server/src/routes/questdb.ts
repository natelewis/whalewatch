import { Router, Request, Response } from 'express';
import { questdbService } from '../services/questdbService';
import { QuestDBQueryParams } from '../types/index';

const router = Router();

// Get option trades
router.get('/option-trades', async (req: Request, res: Response) => {
  try {
    const {
      ticker,
      underlying_ticker,
      start_time,
      end_time,
      limit = '1000',
      order_by = 'timestamp',
      order_direction = 'DESC',
    } = req.query;

    if (!ticker && !underlying_ticker) {
      return res.status(400).json({ error: 'Either ticker or underlying_ticker is required' });
    }

    const limitNum = parseInt(limit as string);
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 10000) {
      return res.status(400).json({ error: 'Limit must be between 1 and 10000' });
    }

    const params: QuestDBQueryParams = {
      start_time: start_time as string | undefined,
      end_time: end_time as string | undefined,
      limit: limitNum,
      order_by: order_by as string,
      order_direction: order_direction as 'ASC' | 'DESC',
    };

    const trades = await questdbService.getOptionTrades(
      ticker as string | undefined,
      underlying_ticker as string | undefined,
      params
    );

    return res.json({
      ticker: ticker as string | undefined,
      underlying_ticker: underlying_ticker as string | undefined,
      trades,
      count: trades.length,
      data_source: 'questdb',
      success: true,
    });
  } catch (error: unknown) {
    console.error('Error fetching option trades from QuestDB:', error);
    return res.status(500).json({
      error: `Failed to fetch option trades: ${error instanceof Error ? error.message : 'Unknown error'}`,
      data_source: 'questdb',
      success: false,
    });
  }
});

// Test QuestDB connection
router.get('/test-connection', async (_req: Request, res: Response) => {
  try {
    const isConnected = await questdbService.testConnection();
    const stats = await questdbService.getDatabaseStats();
    const config = questdbService.getConfig();

    if (isConnected) {
      return res.json({
        success: true,
        message: 'QuestDB connection successful',
        data_source: 'questdb',
        stats,
        config,
      });
    } else {
      return res.status(500).json({
        success: false,
        message: 'QuestDB connection failed',
        data_source: 'questdb',
      });
    }
  } catch (error: unknown) {
    console.error('QuestDB connection test failed:', error);
    return res.status(500).json({
      success: false,
      message: `QuestDB connection test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      data_source: 'questdb',
    });
  }
});

// Get database statistics
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const stats = await questdbService.getDatabaseStats();
    return res.json({
      success: true,
      stats,
      data_source: 'questdb',
    });
  } catch (error: unknown) {
    console.error('Error fetching QuestDB stats:', error);
    return res.status(500).json({
      success: false,
      error: `Failed to fetch database statistics: ${error instanceof Error ? error.message : 'Unknown error'}`,
      data_source: 'questdb',
    });
  }
});

export { router as questdbRoutes };
