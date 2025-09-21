import { Router, Request, Response } from 'express';
import { questdbService } from '../services/questdbService';
import { QuestDBQueryParams } from '../types/questdb';

const router = Router();

// Get options contracts for a symbol from QuestDB
router.get('/:symbol/recent', async (req: Request, res: Response) => {
  try {
    const { symbol } = req.params;
    const { limit = '1000' } = req.query;

    if (!symbol) {
      return res.status(400).json({ error: 'Symbol is required' });
    }

    // Validate limit parameter
    const limitNum = parseInt(limit as string);
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 10000) {
      return res.status(400).json({ error: 'Limit must be between 1 and 10000' });
    }

    const params: QuestDBQueryParams = {
      limit: limitNum,
      order_by: 'created_at',
      order_direction: 'DESC',
    };

    // Get QuestDB options contracts
    const contracts = await questdbService.getOptionContracts(symbol.toUpperCase(), params);

    // Convert QuestDB contracts to Alpaca format for frontend compatibility
    const alpacaContracts = contracts.map(contract => ({
      cfi: contract.contract_type || 'unknown',
      contract_type: contract.contract_type || 'unknown',
      exercise_style: contract.exercise_style || 'american',
      expiration_date: contract.expiration_date || '',
      primary_exchange: 'UNKNOWN', // QuestDB doesn't store this
      shares_per_contract: contract.shares_per_contract || 100,
      strike_price: contract.strike_price || 0,
      ticker: contract.ticker || '',
      underlying_ticker: contract.underlying_ticker || '',
    }));

    // Check if no contracts were found
    if (!contracts || contracts.length === 0) {
      return res.status(404).json({
        error: `No options contracts found for ${symbol.toUpperCase()}. This symbol may not have active options trading.`,
        data_source: 'questdb',
        success: false,
        details: 'This symbol may not have active options trading or may not be supported.',
      });
    }

    return res.json({
      symbol: symbol.toUpperCase(),
      contracts: alpacaContracts.slice(0, limitNum), // Apply limit on the client side
      total_contracts: contracts.length,
      data_source: 'questdb',
      success: true,
    });
  } catch (error: unknown) {
    console.error('Error fetching options contracts from QuestDB:', error);

    if (
      error instanceof Error &&
      (error.message.includes('connection refused') || error.message.includes('ENOTFOUND'))
    ) {
      return res.status(503).json({
        error: 'Unable to connect to QuestDB. Please check if QuestDB is running.',
        data_source: 'questdb',
        success: false,
      });
    }

    if (error instanceof Error && error.message.includes('No options contracts found')) {
      return res.status(404).json({
        error: `No options contracts found for ${req.params.symbol.toUpperCase()}. This symbol may not have active options trading.`,
        data_source: 'questdb',
        success: false,
      });
    }

    return res.status(500).json({
      error: `Failed to fetch options contracts data: ${error instanceof Error ? error.message : 'Unknown error'}`,
      data_source: 'questdb',
      success: false,
    });
  }
});

// Get options trades for a symbol
router.get('/:symbol/trades', async (req: Request, res: Response) => {
  try {
    const { symbol } = req.params;
    const { start_time, end_time, limit = '1000', order_by = 'timestamp', order_direction = 'DESC' } = req.query;

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
      order_direction: order_direction as 'ASC' | 'DESC',
    };

    const trades = await questdbService.getOptionTrades(undefined, symbol.toUpperCase(), params);

    // Convert QuestDB trades to Alpaca format for frontend compatibility
    const alpacaTrades = trades.map(trade => ({
      id: trade.sequence_number.toString(),
      symbol: trade.ticker,
      timestamp: trade.timestamp,
      price: trade.price,
      size: trade.size,
      side: 'unknown' as 'buy' | 'sell' | 'unknown', // QuestDB doesn't store trade side
      conditions: [trade.conditions],
      exchange: trade.exchange.toString(),
      tape: trade.tape.toString(),
      contract: {
        symbol: trade.ticker,
        underlying_symbol: trade.underlying_ticker,
        exercise_style: 'american', // Default assumption
        expiration_date: '', // Would need to join with contracts table
        strike_price: 0, // Would need to join with contracts table
        option_type: 'call' as 'call' | 'put', // Would need to join with contracts table
      },
    }));

    return res.json({
      symbol: symbol.toUpperCase(),
      trades: alpacaTrades,
      count: trades.length,
      data_source: 'questdb',
      success: true,
    });
  } catch (error: unknown) {
    console.error('Error fetching options trades from QuestDB:', error);
    return res.status(500).json({
      error: `Failed to fetch options trades: ${error instanceof Error ? error.message : 'Unknown error'}`,
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

    if (isConnected) {
      return res.json({
        success: true,
        message: 'QuestDB connection successful',
        data_source: 'questdb',
        stats,
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

export { router as optionsRoutes };
