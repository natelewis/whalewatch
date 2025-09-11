import { Router, Request, Response } from 'express';
import { alpacaService } from '../services/alpacaService';
import { ChartTimeframe } from '../types';

const router = Router();

// Get chart data for a symbol
router.get('/:symbol', async (req: Request, res: Response) => {
  try {
    const { symbol } = req.params;
    const { timeframe = '1D', limit = 1000 } = req.query;

    if (!symbol) {
      return res.status(400).json({ error: 'Symbol is required' });
    }

    const bars = await alpacaService.getBars(
      symbol.toUpperCase(),
      timeframe as ChartTimeframe,
      parseInt(limit as string)
    );

    res.json({
      symbol: symbol.toUpperCase(),
      timeframe,
      bars
    });
  } catch (error) {
    console.error('Error fetching chart data:', error);
    res.status(500).json({ error: 'Failed to fetch chart data' });
  }
});

export { router as chartRoutes };
