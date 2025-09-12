import { Router, Request, Response } from 'express';
import { alpacaService } from '../services/alpacaService';
import { polygonService } from '../services/polygonService';

const router = Router();

// Get recent options trades for a symbol
router.get('/:symbol/recent', async (req: Request, res: Response) => {
  try {
    const { symbol } = req.params;
    const { hours = 1, limit = 1000 } = req.query;

    if (!symbol) {
      return res.status(400).json({ error: 'Symbol is required' });
    }

    // Validate hours parameter
    const hoursNum = parseInt(hours as string);
    if (isNaN(hoursNum) || hoursNum < 1 || hoursNum > 168) {
      // Max 1 week
      return res.status(400).json({ error: 'Hours must be between 1 and 168' });
    }

    // Validate limit parameter
    const limitNum = parseInt(limit as string);
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 50000) {
      return res.status(400).json({ error: 'Limit must be between 1 and 50000' });
    }

    // Get Polygon trades and contracts
    const polygonTrades = await polygonService.getOptionsTrades(
      symbol.toUpperCase(),
      hoursNum,
      1000
    );
    const contracts = await polygonService.getOptionsContracts(symbol.toUpperCase(), 1000);

    // Convert Polygon trades to Alpaca format for frontend compatibility
    const trades = alpacaService.convertPolygonTradesToAlpaca(polygonTrades, contracts);

    // Check if no trades were found
    if (!trades || trades.length === 0) {
      return res.status(404).json({
        error: `No options trades found for ${symbol.toUpperCase()}. This could be due to insufficient API subscription level or no recent trading activity.`,
        data_source: 'none',
        success: false,
        details:
          'Check your Polygon API subscription level - options trades data requires a paid subscription.',
      });
    }

    return res.json({
      symbol: symbol.toUpperCase(),
      trades: trades.slice(0, limitNum), // Apply limit on the client side
      hours: hoursNum,
      total_trades: trades.length,
      data_source: 'polygon',
      success: true,
    });
  } catch (error: any) {
    console.error('Error fetching options trades:', error);

    // Provide more specific error messages
    if (
      error.message.includes('API key not configured') ||
      error.message.includes('Invalid API key')
    ) {
      return res.status(401).json({
        error:
          'Polygon API key not configured. Please configure POLYGON_API_KEY environment variable to access real options data.',
        data_source: 'none',
        success: false,
      });
    }

    if (error.message.includes('rate limit')) {
      return res.status(429).json({
        error: 'Polygon API rate limit exceeded. Please try again later.',
        data_source: 'none',
        success: false,
      });
    }

    if (
      error.message.includes('subscription') ||
      error.message.includes('forbidden') ||
      error.message.includes('403')
    ) {
      return res.status(403).json({
        error:
          'Insufficient Polygon API subscription level. Your current subscription does not include access to options trades data. Please upgrade to a higher tier subscription that includes options data access.',
        data_source: 'none',
        success: false,
        details:
          'Options trades data requires a paid Polygon subscription. Free tier does not include options data access.',
      });
    }

    if (error.message.includes('connection failed') || error.message.includes('ENOTFOUND')) {
      return res.status(503).json({
        error:
          'Unable to connect to Polygon API. Please check your network connection and try again.',
        data_source: 'none',
        success: false,
      });
    }

    if (error.message.includes('No options contracts found')) {
      return res.status(404).json({
        error: `No options contracts found for ${req.params.symbol.toUpperCase()}. This symbol may not have active options trading.`,
        data_source: 'none',
        success: false,
      });
    }

    // Check if the error is due to no trades found (which could be due to 403 errors)
    if (error.message.includes('No options trades found')) {
      return res.status(404).json({
        error: `No options trades found for ${req.params.symbol.toUpperCase()}. This could be due to insufficient API subscription level or no recent trading activity.`,
        data_source: 'none',
        success: false,
        details:
          'Check your Polygon API subscription level - options trades data requires a paid subscription.',
      });
    }

    return res.status(500).json({
      error: `Failed to fetch real options data: ${error.message}`,
      data_source: 'none',
      success: false,
    });
  }
});

// Test Polygon API connection
router.get('/test-connection', async (_req: Request, res: Response) => {
  try {
    await polygonService.testConnection();
    const isValid = await polygonService.validateApiKey();

    if (isValid) {
      return res.json({
        success: true,
        message: 'Polygon API connection successful',
        data_source: 'polygon',
      });
    } else {
      return res.status(401).json({
        success: false,
        message: 'Polygon API key is invalid or not configured',
        data_source: 'none',
      });
    }
  } catch (error: any) {
    console.error('Polygon API test failed:', error);
    return res.status(500).json({
      success: false,
      message: `Polygon API test failed: ${error.message}`,
      data_source: 'none',
    });
  }
});

export { router as optionsRoutes };
