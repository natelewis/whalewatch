import { Router, Request, Response } from 'express';
import { questdbService } from '../services/questdbService';
import { QuestDBQueryParams } from '../types/index';
import { parseOptionTicker, FrontendOptionTrade } from '@whalewatch/shared';

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
      order_by: 'expiration_date',
      order_direction: 'ASC',
    };

    // Get QuestDB options contracts
    const contracts = await questdbService.getOptionContracts(symbol.toUpperCase(), params);

    // Convert QuestDB contracts to Alpaca format for frontend compatibility
    const alpacaContracts = contracts.map(contract => {
      // Convert string contract type to proper ContractType
      const contractType: 'call' | 'put' =
        contract.contract_type?.toLowerCase() === 'call'
          ? 'call'
          : contract.contract_type?.toLowerCase() === 'put'
          ? 'put'
          : 'call'; // Default to 'call' if unknown

      return {
        cfi: contractType,
        contract_type: contractType,
        exercise_style: contract.exercise_style || 'american',
        expiration_date: contract.expiration_date || '',
        primary_exchange: 'UNKNOWN', // QuestDB doesn't store this
        shares_per_contract: contract.shares_per_contract || 100,
        strike_price: contract.strike_price || 0,
        ticker: contract.ticker || '',
        underlying_ticker: contract.underlying_ticker || '',
      };
    });

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
    const {
      start_time,
      end_time,
      limit = '1000',
      order_by = 'timestamp',
      order_direction = 'DESC',
      max_price: maxPrice,
    } = req.query;

    if (!symbol) {
      return res.status(400).json({ error: 'Symbol is required' });
    }

    const limitNum = parseInt(limit as string);
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 10000) {
      return res.status(400).json({ error: 'Limit must be between 1 and 10000' });
    }

    // Validate max_price parameter
    let maxPriceNum: number | undefined;
    if (maxPrice !== undefined) {
      maxPriceNum = parseFloat(maxPrice as string);
      if (isNaN(maxPriceNum) || maxPriceNum < 0) {
        return res.status(400).json({ error: 'Max price must be a positive number' });
      }
    }

    const params: QuestDBQueryParams = {
      start_time: start_time as string | undefined,
      end_time: end_time as string | undefined,
      limit: limitNum,
      order_by: order_by as string,
      order_direction: order_direction as 'ASC' | 'DESC',
    };

    const trades = await questdbService.getOptionTrades(undefined, symbol.toUpperCase(), params);

    // Convert QuestDB trades to frontend-optimized format and group by contract
    const tradeMap = new Map<
      string,
      {
        ticker: string;
        underlying_ticker: string;
        timestamp: string;
        price: number;
        size: number;
        conditions: string;
        tape: string;
        sequence_number: number;
        option_type: 'call' | 'put';
        strike_price: number;
        expiration_date: string;
        repeat_count: number;
        volume: number;
      }
    >();

    trades.forEach(trade => {
      // Parse the ticker to extract option details
      const parsedTicker = parseOptionTicker(trade.ticker);

      // Create a unique key for grouping: ticker + strike_price (same contract)
      const groupKey = `${trade.ticker}-${parsedTicker?.strikePrice || 0}`;

      if (tradeMap.has(groupKey)) {
        // Increment repeat count and add to volume
        const existing = tradeMap.get(groupKey)!;
        existing.repeat_count += 1;
        existing.volume += trade.size;
        // Keep the most recent timestamp
        if (new Date(trade.timestamp) > new Date(existing.timestamp)) {
          existing.timestamp = trade.timestamp;
          existing.price = trade.price;
          existing.conditions = trade.conditions;
          existing.tape = trade.tape.toString();
          existing.sequence_number = trade.sequence_number;
        }
      } else {
        // First occurrence of this contract
        tradeMap.set(groupKey, {
          ticker: trade.ticker,
          underlying_ticker: trade.underlying_ticker,
          timestamp: trade.timestamp,
          price: trade.price,
          size: trade.size,
          conditions: trade.conditions,
          tape: trade.tape.toString(),
          sequence_number: trade.sequence_number,
          option_type: parsedTicker?.optionType || 'call',
          strike_price: parsedTicker?.strikePrice || 0,
          expiration_date: parsedTicker?.expirationDate || '',
          repeat_count: 1,
          volume: trade.size,
        });
      }
    });

    // Convert map to array
    let frontendTrades: FrontendOptionTrade[] = Array.from(tradeMap.values());

    // Apply max price filter if specified
    if (maxPriceNum !== undefined) {
      frontendTrades = frontendTrades.filter(trade => trade.price <= maxPriceNum);
    }

    return res.json({
      symbol: symbol.toUpperCase(),
      trades: frontendTrades,
      count: frontendTrades.length,
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
