import { Router, Request, Response } from 'express';
import { authenticateToken, requireAuth } from '../middleware/auth';
import { alpacaService } from '../services/alpacaService';
import { logger } from '../utils/logger';

const router = Router();

// Apply authentication to all account routes
router.use(authenticateToken);
router.use(requireAuth);

// Get account information
router.get('/info', async (_req: Request, res: Response) => {
  try {
    const account = await alpacaService.getAccount();
    return res.json({ account });
  } catch (error) {
    logger.server.error('Error fetching account info:', error);
    return res.status(500).json({ error: 'Failed to fetch account information' });
  }
});

// Get positions
router.get('/positions', async (_req: Request, res: Response) => {
  try {
    const positions = await alpacaService.getPositions();
    return res.json({ positions });
  } catch (error) {
    logger.server.error('Error fetching positions:', error);
    return res.status(500).json({ error: 'Failed to fetch positions' });
  }
});

// Get account activity
router.get('/activity', async (req: Request, res: Response) => {
  try {
    const { start_date, end_date } = req.query;

    const activities = await alpacaService.getActivities(start_date as string, end_date as string);

    return res.json({ activities });
  } catch (error) {
    logger.server.error('Error fetching activities:', error);
    return res.status(500).json({ error: 'Failed to fetch activities' });
  }
});

export { router as accountRoutes };
