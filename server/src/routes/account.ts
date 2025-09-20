import { Router, Response } from 'express';
import { authenticateToken, requireAuth } from '../middleware/auth';
import { alpacaService } from '../services/alpacaService';
import { AuthenticatedRequest } from '../types';

const router = Router();

// Apply authentication to all account routes
router.use(authenticateToken);
router.use(requireAuth);

// Get account information
router.get('/info', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const account = await alpacaService.getAccount();
    return res.json({ account });
  } catch (error) {
    console.error('Error fetching account info:', error);
    return res.status(500).json({ error: 'Failed to fetch account information' });
  }
});

// Get positions
router.get('/positions', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const positions = await alpacaService.getPositions();
    return res.json({ positions });
  } catch (error) {
    console.error('Error fetching positions:', error);
    return res.status(500).json({ error: 'Failed to fetch positions' });
  }
});

// Get account activity
router.get('/activity', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { start_date, end_date } = req.query;

    const activities = await alpacaService.getActivities(start_date as string, end_date as string);

    return res.json({ activities });
  } catch (error) {
    console.error('Error fetching activities:', error);
    return res.status(500).json({ error: 'Failed to fetch activities' });
  }
});

export { router as accountRoutes };
