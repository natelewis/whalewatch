import { Router, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticateToken, requireAuth } from '../middleware/auth';
import { alpacaService } from '../services/alpacaService';
import { AuthenticatedRequest } from '../types';

const router = Router();

// Apply authentication to all order routes
router.use(authenticateToken);
router.use(requireAuth);

// Create a sell order
router.post(
  '/sell',
  [
    body('symbol').isString().isLength({ min: 1, max: 10 }),
    body('quantity').isNumeric().isFloat({ min: 0.01 }),
    body('limit_price').isNumeric().isFloat({ min: 0.01 }),
    body('time_in_force').optional().isIn(['day', 'gtc', 'ioc', 'fok']),
  ],
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          details: errors.array(),
        });
      }

      const { symbol, quantity, limit_price, time_in_force = 'day' } = req.body;

      const orderData = {
        symbol: symbol.toUpperCase(),
        qty: parseFloat(quantity),
        side: 'sell' as const,
        type: 'limit' as const,
        time_in_force: time_in_force as 'day' | 'gtc' | 'ioc' | 'fok',
        limit_price: parseFloat(limit_price),
      };

      const order = await alpacaService.createOrder(orderData);

      return res.status(201).json({
        message: 'Order created successfully',
        order,
      });
    } catch (error) {
      console.error('Error creating sell order:', error);
      return res.status(500).json({ error: 'Failed to create order' });
    }
  }
);

// Create a buy order
router.post(
  '/buy',
  [
    body('symbol').isString().isLength({ min: 1, max: 10 }),
    body('quantity').isNumeric().isFloat({ min: 0.01 }),
    body('limit_price').optional().isNumeric().isFloat({ min: 0.01 }),
    body('type').optional().isIn(['market', 'limit', 'stop', 'stop_limit']),
    body('time_in_force').optional().isIn(['day', 'gtc', 'ioc', 'fok']),
  ],
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          details: errors.array(),
        });
      }

      const { symbol, quantity, limit_price, type = 'market', time_in_force = 'day' } = req.body;

      const orderData = {
        symbol: symbol.toUpperCase(),
        qty: parseFloat(quantity),
        side: 'buy' as const,
        type: type as 'market' | 'limit' | 'stop' | 'stop_limit',
        time_in_force: time_in_force as 'day' | 'gtc' | 'ioc' | 'fok',
        ...(limit_price && { limit_price: parseFloat(limit_price) }),
      };

      const order = await alpacaService.createOrder(orderData);

      return res.status(201).json({
        message: 'Order created successfully',
        order,
      });
    } catch (error) {
      console.error('Error creating buy order:', error);
      return res.status(500).json({ error: 'Failed to create order' });
    }
  }
);

export { router as orderRoutes };
