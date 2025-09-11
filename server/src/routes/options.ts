import { Router, Request, Response } from 'express';
import { alpacaService } from '../services/alpacaService';

const router = Router();

// Get recent options trades for a symbol
router.get('/:symbol/recent', async (req: Request, res: Response) => {
  try {
    const { symbol } = req.params;
    const { hours = 1 } = req.query;

    if (!symbol) {
      return res.status(400).json({ error: 'Symbol is required' });
    }

    const trades = await alpacaService.getOptionsTrades(
      symbol.toUpperCase(),
      parseInt(hours as string)
    );

    res.json({
      symbol: symbol.toUpperCase(),
      trades,
      hours: parseInt(hours as string)
    });
  } catch (error) {
    console.error('Error fetching options trades:', error);
    res.status(500).json({ error: 'Failed to fetch options trades' });
  }
});

export { router as optionsRoutes };
