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
    authToken = jwt.sign({ userId: '1', email: 'test@example.com' }, secret, { expiresIn: '1h' });
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
        vwap: 102.0,
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
        vwap: 104.5,
      },
    ];

    it('should return chart data with start_time and direction', async () => {
      mockQuestdbService.getStockAggregates.mockResolvedValue(mockAggregates as any);

      const response = await request(app)
        .get('/api/chart/AAPL?start_time=2024-01-01T10:00:00Z&direction=past')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('symbol', 'AAPL');
      expect(response.body).toHaveProperty('interval', '1h');
      expect(response.body).toHaveProperty('direction', 'past');
      expect(response.body).toHaveProperty('bars');
      expect(response.body).toHaveProperty('data_source', 'questdb');
      expect(response.body).toHaveProperty('success', true);
      // For 1h timeframe, we expect the bars from mock data
      expect(response.body.bars.length).toBeGreaterThan(0);
    });

    it('should use current time as default start_time when not provided', async () => {
      mockQuestdbService.getStockAggregates.mockResolvedValue(mockAggregates as any);

      const response = await request(app)
        .get('/api/chart/AAPL?direction=past')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('symbol', 'AAPL');
      expect(response.body).toHaveProperty('direction', 'past');
    });

    it('should validate direction parameter', async () => {
      const response = await request(app)
        .get('/api/chart/AAPL?start_time=2024-01-01T10:00:00Z&direction=invalid')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'direction must be either "past" or "future"');
    });

    it('should validate timestamp formats', async () => {
      // Test invalid start_time format
      const response = await request(app)
        .get('/api/chart/AAPL?start_time=invalid&direction=past')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'start_time must be a valid ISO timestamp');
    });

    it('should use calculated time range in QuestDB query based on direction', async () => {
      mockQuestdbService.getStockAggregates.mockResolvedValue(mockAggregates as any);

      await request(app)
        .get('/api/chart/AAPL?start_time=2024-01-01T10:00:00Z&direction=past&limit=100')
        .set('Authorization', `Bearer ${authToken}`);

      expect(mockQuestdbService.getStockAggregates).toHaveBeenCalledWith(
        'AAPL',
        expect.objectContaining({
          start_time: expect.any(String),
          end_time: '2024-01-01T10:00:00.000Z',
          order_by: 'timestamp',
          order_direction: 'ASC',
        })
      );
    });

    it('should handle different timeframes correctly', async () => {
      mockQuestdbService.getStockAggregates.mockResolvedValue(mockAggregates as any);

      // Test 1 hour timeframe
      await request(app)
        .get('/api/chart/AAPL?interval=1h&start_time=2024-01-01T10:00:00Z&direction=past')
        .set('Authorization', `Bearer ${authToken}`);

      expect(mockQuestdbService.getStockAggregates).toHaveBeenCalledWith(
        'AAPL',
        expect.objectContaining({
          start_time: expect.any(String),
          end_time: expect.any(String),
        })
      );

      // Test 1 week timeframe
      await request(app)
        .get('/api/chart/AAPL?interval=1w&start_time=2024-01-01T10:00:00Z&direction=future')
        .set('Authorization', `Bearer ${authToken}`);

      expect(mockQuestdbService.getStockAggregates).toHaveBeenCalledWith(
        'AAPL',
        expect.objectContaining({
          start_time: expect.any(String),
          end_time: expect.any(String),
        })
      );
    });

    it('should use provided start_time when available', async () => {
      mockQuestdbService.getStockAggregates.mockResolvedValue(mockAggregates as any);

      await request(app)
        .get('/api/chart/AAPL?interval=1d&start_time=2024-01-01T00:00:00Z&direction=past')
        .set('Authorization', `Bearer ${authToken}`);

      expect(mockQuestdbService.getStockAggregates).toHaveBeenCalledWith(
        'AAPL',
        expect.objectContaining({
          start_time: expect.any(String),
          end_time: '2024-01-01T00:00:00.000Z',
        })
      );
    });

    it('should return 500 on service error', async () => {
      mockQuestdbService.getStockAggregates.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/api/chart/AAPL?start_time=2024-01-01T10:00:00Z&direction=past')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('data_source', 'questdb');
      expect(response.body).toHaveProperty('success', false);
    });

    it('should convert QuestDB aggregates to Alpaca bar format', async () => {
      mockQuestdbService.getStockAggregates.mockResolvedValue(mockAggregates as any);

      const response = await request(app)
        .get('/api/chart/AAPL?start_time=2024-01-01T10:00:00Z&direction=past')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.bars).toHaveLength(1);
      expect(response.body.bars[0]).toEqual({
        t: '2024-01-01T10:00:00.000Z',
        o: 100.0,
        h: 105.0,
        l: 99.0,
        c: 104.0,
        v: 1000,
        n: 50,
        vw: 102.0,
      });
    });

    it('should aggregate data correctly for 1H timeframe', async () => {
      // Create test data with multiple 1-minute bars within 1 hour
      const minuteBars = [
        {
          symbol: 'AAPL',
          timestamp: '2024-01-01T10:00:00Z',
          open: 100.0,
          high: 101.0,
          low: 99.0,
          close: 100.5,
          volume: 100,
          transaction_count: 10,
          vwap: 100.2,
        },
        {
          symbol: 'AAPL',
          timestamp: '2024-01-01T10:01:00Z',
          open: 100.5,
          high: 102.0,
          low: 100.0,
          close: 101.5,
          volume: 200,
          transaction_count: 20,
          vwap: 101.0,
        },
        {
          symbol: 'AAPL',
          timestamp: '2024-01-01T10:02:00Z',
          open: 101.5,
          high: 103.0,
          low: 101.0,
          close: 102.5,
          volume: 150,
          transaction_count: 15,
          vwap: 102.0,
        },
      ];

      mockQuestdbService.getStockAggregates.mockResolvedValue(minuteBars as any);

      const response = await request(app)
        .get('/api/chart/AAPL?interval=1h&start_time=2024-01-01T10:00:00Z&direction=past')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      // With 1-minute aggregation, we expect 1 aggregated bar (data gets aggregated)
      expect(response.body.bars).toHaveLength(1);

      const firstBar = response.body.bars[0];
      expect(firstBar.o).toBe(100.0);
      expect(firstBar.h).toBe(103.0); // Aggregated high from all 3 bars
      expect(firstBar.l).toBe(99.0); // Aggregated low from all 3 bars
      expect(firstBar.c).toBe(102.5); // Last close value
      expect(firstBar.v).toBe(450); // Sum of all volumes
      expect(firstBar.n).toBe(45); // Sum of all transaction counts
    });

    it('should uppercase symbol parameter', async () => {
      mockQuestdbService.getStockAggregates.mockResolvedValue(mockAggregates as any);

      await request(app)
        .get('/api/chart/aapl?start_time=2024-01-01T10:00:00Z&direction=past')
        .set('Authorization', `Bearer ${authToken}`);

      expect(mockQuestdbService.getStockAggregates).toHaveBeenCalledWith(
        'AAPL',
        expect.any(Object)
      );
    });

    it('should support view-based loading parameters', async () => {
      mockQuestdbService.getStockAggregates.mockResolvedValue(mockAggregates as any);

      const response = await request(app)
        .get(
          '/api/chart/AAPL?start_time=2024-01-01T10:00:00Z&direction=past&interval=1h&limit=100&view_based_loading=true&view_size=50'
        )
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('view_based_loading', true);
      expect(response.body).toHaveProperty('view_size', 50);
      expect(response.body.query_params).toHaveProperty('view_based_loading', true);
      expect(response.body.query_params).toHaveProperty('view_size', 50);
    });

    it('should load 3 views worth of data when view-based loading is enabled', async () => {
      // Create more test data to simulate 3 views
      const extendedAggregates = Array.from({ length: 150 }, (_, i) => ({
        symbol: 'AAPL',
        timestamp: new Date(Date.now() - (150 - i) * 60 * 60 * 1000).toISOString(), // 1 hour intervals
        open: 100 + i * 0.1,
        high: 105 + i * 0.1,
        low: 99 + i * 0.1,
        close: 104 + i * 0.1,
        volume: 1000 + i * 10,
        transaction_count: 50 + i,
        vwap: 102 + i * 0.1,
      }));

      mockQuestdbService.getStockAggregates.mockResolvedValue(extendedAggregates as any);

      const response = await request(app)
        .get(
          '/api/chart/AAPL?start_time=2024-01-01T10:00:00Z&direction=past&interval=1h&limit=50&view_based_loading=true&view_size=50'
        )
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.bars).toHaveLength(150); // Mock data is generated when no real data is found
      expect(response.body.query_params.view_based_loading).toBe(true);
      expect(response.body.query_params.view_size).toBe(50);
    });

    it('should validate view_size parameter', async () => {
      const response = await request(app)
        .get(
          '/api/chart/AAPL?start_time=2024-01-01T10:00:00Z&direction=past&interval=1h&limit=100&view_based_loading=true&view_size=0'
        )
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'view_size must be a positive integer');
    });

    it('should default view_size to limit when not provided', async () => {
      mockQuestdbService.getStockAggregates.mockResolvedValue(mockAggregates as any);

      const response = await request(app)
        .get(
          '/api/chart/AAPL?start_time=2024-01-01T10:00:00Z&direction=past&interval=1h&limit=100&view_based_loading=true'
        )
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('view_size', 100);
    });

    it('should work with traditional loading when view_based_loading is false', async () => {
      mockQuestdbService.getStockAggregates.mockResolvedValue(mockAggregates as any);

      const response = await request(app)
        .get(
          '/api/chart/AAPL?start_time=2024-01-01T10:00:00Z&direction=past&interval=1h&limit=100&view_based_loading=false'
        )
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('view_based_loading', false);
      expect(response.body.bars).toHaveLength(1); // Only the mock data, no view-based expansion
    });
  });
});
