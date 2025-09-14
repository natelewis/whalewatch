import { Router, Request, Response } from 'express';
import { questdbService } from '../services/questdbService';
import { QuestDBQueryParams } from '../types/questdb';

const router = Router();

// Get stock trades for a symbol
router.get('/stock-trades/:symbol', async (req: Request, res: Response) => {
  try {
    const { symbol } = req.params;
    const { 
      start_time, 
      end_time, 
      limit = '1000',
      order_by = 'timestamp',
      order_direction = 'DESC'
    } = req.query;

    if (!symbol) {
      return res.status(400).json({ error: 'Symbol is required' });
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
      order_direction: order_direction as 'ASC' | 'DESC'
    };

    const trades = await questdbService.getStockTrades(symbol.toUpperCase(), params);

    return res.json({
      symbol: symbol.toUpperCase(),
      trades,
      count: trades.length,
      data_source: 'questdb',
      success: true
    });
  } catch (error: any) {
    console.error('Error fetching stock trades from QuestDB:', error);
    res.status(500).json({ 
      error: `Failed to fetch stock trades: ${error.message}`,
      data_source: 'questdb',
      success: false
    });
  }
});

// Get stock aggregates (bars) for a symbol
router.get('/stock-aggregates/:symbol', async (req: Request, res: Response) => {
  try {
    const { symbol } = req.params;
    const { 
      start_time, 
      end_time, 
      limit = '1000',
      order_by = 'timestamp',
      order_direction = 'ASC'
    } = req.query;

    if (!symbol) {
      return res.status(400).json({ error: 'Symbol is required' });
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
      order_direction: order_direction as 'ASC' | 'DESC'
    };

    const aggregates = await questdbService.getStockAggregates(symbol.toUpperCase(), params);

    return res.json({
      symbol: symbol.toUpperCase(),
      aggregates,
      count: aggregates.length,
      data_source: 'questdb',
      success: true
    });
  } catch (error: any) {
    console.error('Error fetching stock aggregates from QuestDB:', error);
    res.status(500).json({ 
      error: `Failed to fetch stock aggregates: ${error.message}`,
      data_source: 'questdb',
      success: false
    });
  }
});

// Get option contracts for an underlying symbol
router.get('/option-contracts/:underlying_ticker', async (req: Request, res: Response) => {
  try {
    const { underlying_ticker } = req.params;
    const { 
      limit = '1000',
      order_by = 'created_at',
      order_direction = 'DESC'
    } = req.query;

    if (!underlying_ticker) {
      return res.status(400).json({ error: 'Underlying ticker is required' });
    }

    const limitNum = parseInt(limit as string);
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 10000) {
      return res.status(400).json({ error: 'Limit must be between 1 and 10000' });
    }

    const params: QuestDBQueryParams = {
      limit: limitNum,
      order_by: order_by as string,
      order_direction: order_direction as 'ASC' | 'DESC'
    };

    const contracts = await questdbService.getOptionContracts(underlying_ticker.toUpperCase(), params);

    return res.json({
      underlying_ticker: underlying_ticker.toUpperCase(),
      contracts,
      count: contracts.length,
      data_source: 'questdb',
      success: true
    });
  } catch (error: any) {
    console.error('Error fetching option contracts from QuestDB:', error);
    res.status(500).json({ 
      error: `Failed to fetch option contracts: ${error.message}`,
      data_source: 'questdb',
      success: false
    });
  }
});

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
      order_direction = 'DESC'
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
      order_direction: order_direction as 'ASC' | 'DESC'
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
      success: true
    });
  } catch (error: any) {
    console.error('Error fetching option trades from QuestDB:', error);
    res.status(500).json({ 
      error: `Failed to fetch option trades: ${error.message}`,
      data_source: 'questdb',
      success: false
    });
  }
});

// Get option quotes
router.get('/option-quotes', async (req: Request, res: Response) => {
  try {
    const { 
      ticker,
      underlying_ticker,
      start_time, 
      end_time, 
      limit = '1000',
      order_by = 'timestamp',
      order_direction = 'DESC'
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
      order_direction: order_direction as 'ASC' | 'DESC'
    };

    const quotes = await questdbService.getOptionQuotes(
      ticker as string | undefined,
      underlying_ticker as string | undefined,
      params
    );

    return res.json({
      ticker: ticker as string | undefined,
      underlying_ticker: underlying_ticker as string | undefined,
      quotes,
      count: quotes.length,
      data_source: 'questdb',
      success: true
    });
  } catch (error: any) {
    console.error('Error fetching option quotes from QuestDB:', error);
    res.status(500).json({ 
      error: `Failed to fetch option quotes: ${error.message}`,
      data_source: 'questdb',
      success: false
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
      res.json({
        success: true,
        message: 'QuestDB connection successful',
        data_source: 'questdb',
        stats,
        config
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'QuestDB connection failed',
        data_source: 'questdb'
      });
    }
  } catch (error: any) {
    console.error('QuestDB connection test failed:', error);
    res.status(500).json({
      success: false,
      message: `QuestDB connection test failed: ${error.message}`,
      data_source: 'questdb'
    });
  }
});

// Get database statistics
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const stats = await questdbService.getDatabaseStats();
    res.json({
      success: true,
      stats,
      data_source: 'questdb'
    });
  } catch (error: any) {
    console.error('Error fetching QuestDB stats:', error);
    res.status(500).json({
      success: false,
      error: `Failed to fetch database statistics: ${error.message}`,
      data_source: 'questdb'
    });
  }
});

export { router as questdbRoutes };
