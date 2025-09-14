import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import { chartRoutes } from '../../routes/chart';
import { questdbService } from '../../services/questdbService';

// Mock the questdb service
jest.mock('../../services/questdbService');

const app = express();
app.use(express.json());
app.use('/api/chart', chartRoutes);

const mockQuestdbService = questdbService as jest.Mocked<typeof questdbService>;

describe('Chart Routes', () => {
  let authToken: string;

  beforeAll(() => {
    // Create a test JWT token
    const secret = process.env.JWT_SECRET || 'test-secret';
    authToken = jwt.sign(
      { userId: '1', email: 'test@example.com' },
      secret,
      { expiresIn: '1h' }
    );
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/chart/:symbol', () => {
    const mockAggregates = [
      {
        symbol: 'AAPL',
        timestamp: '2024-01-01T10:00:00Z',
        open: 100.0,
        high: 105.0,
        low: 99.0,
        close: 104.0,
        volume: 1000,
        transaction_count: 50,
        vwap: 102.0
      },
      {
        symbol: 'AAPL',
        timestamp: '2024-01-01T11:00:00Z',
        open: 104.0,
        high: 106.0,
        low: 103.0,
        close: 105.0,
        volume: 1200,
        transaction_count: 60,
        vwap: 104.5
      }
    ];

    it('should return chart data with default timeframe', async () => {
      mockQuestdbService.getStockAggregates.mockResolvedValue(mockAggregates as any);

      const response = await request(app)
        .get('/api/chart/AAPL')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('symbol', 'AAPL');
      expect(response.body).toHaveProperty('timeframe', '1D');
      expect(response.body).toHaveProperty('bars');
      expect(response.body).toHaveProperty('data_source', 'questdb');
      expect(response.body).toHaveProperty('success', true);
      expect(response.body.bars).toHaveLength(2);
    });

    it('should calculate time range based on timeframe', async () => {
      mockQuestdbService.getStockAggregates.mockResolvedValue(mockAggregates as any);

      await request(app)
        .get('/api/chart/AAPL?timeframe=1H')
        .set('Authorization', `Bearer ${authToken}`);

      expect(mockQuestdbService.getStockAggregates).toHaveBeenCalledWith(
        'AAPL',
        expect.objectContaining({
          start_time: expect.any(String),
          end_time: expect.any(String),
          limit: 1000,
          order_by: 'timestamp',
          order_direction: 'ASC'
        })
      );
    });

    it('should handle different timeframes correctly', async () => {
      mockQuestdbService.getStockAggregates.mockResolvedValue(mockAggregates as any);

      // Test 1 minute timeframe
      await request(app)
        .get('/api/chart/AAPL?timeframe=1m')
        .set('Authorization', `Bearer ${authToken}`);

      expect(mockQuestdbService.getStockAggregates).toHaveBeenCalledWith(
        'AAPL',
        expect.objectContaining({
          start_time: expect.any(String),
          end_time: expect.any(String)
        })
      );

      // Test 1 week timeframe
      await request(app)
        .get('/api/chart/AAPL?timeframe=1W')
        .set('Authorization', `Bearer ${authToken}`);

      expect(mockQuestdbService.getStockAggregates).toHaveBeenCalledWith(
        'AAPL',
        expect.objectContaining({
          start_time: expect.any(String),
          end_time: expect.any(String)
        })
      );
    });

    it('should use provided start_time and end_time when available', async () => {
      mockQuestdbService.getStockAggregates.mockResolvedValue(mockAggregates as any);

      await request(app)
        .get('/api/chart/AAPL?timeframe=1D&start_time=2024-01-01T00:00:00Z&end_time=2024-01-01T23:59:59Z')
        .set('Authorization', `Bearer ${authToken}`);

      expect(mockQuestdbService.getStockAggregates).toHaveBeenCalledWith(
        'AAPL',
        expect.objectContaining({
          start_time: '2024-01-01T00:00:00Z',
          end_time: '2024-01-01T23:59:59Z'
        })
      );
    });

    it('should handle custom limit parameter', async () => {
      mockQuestdbService.getStockAggregates.mockResolvedValue(mockAggregates as any);

      await request(app)
        .get('/api/chart/AAPL?timeframe=1D&limit=500')
        .set('Authorization', `Bearer ${authToken}`);

      expect(mockQuestdbService.getStockAggregates).toHaveBeenCalledWith(
        'AAPL',
        expect.objectContaining({
          limit: 500
        })
      );
    });

    it('should return 400 for invalid limit', async () => {
      const response = await request(app)
        .get('/api/chart/AAPL?limit=0')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Limit must be between 1 and 10000');
    });

    it('should return 400 for limit exceeding maximum', async () => {
      const response = await request(app)
        .get('/api/chart/AAPL?limit=20000')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Limit must be between 1 and 10000');
    });

    it('should return 500 on service error', async () => {
      mockQuestdbService.getStockAggregates.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/api/chart/AAPL')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('data_source', 'questdb');
      expect(response.body).toHaveProperty('success', false);
    });

    it('should convert QuestDB aggregates to Alpaca bar format', async () => {
      mockQuestdbService.getStockAggregates.mockResolvedValue(mockAggregates as any);

      const response = await request(app)
        .get('/api/chart/AAPL')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.body.bars[0]).toEqual({
        t: '2024-01-01T10:00:00Z',
        o: 100.0,
        h: 105.0,
        l: 99.0,
        c: 104.0,
        v: 1000,
        n: 50,
        vw: 102.0
      });
    });

    it('should uppercase symbol parameter', async () => {
      mockQuestdbService.getStockAggregates.mockResolvedValue(mockAggregates as any);

      await request(app)
        .get('/api/chart/aapl')
        .set('Authorization', `Bearer ${authToken}`);

      expect(mockQuestdbService.getStockAggregates).toHaveBeenCalledWith(
        'AAPL',
        expect.any(Object)
      );
    });
  });
});
