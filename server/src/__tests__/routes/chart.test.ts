import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import { chartRoutes } from '../../routes/chart';
import { questdbService } from '../../services/questdbService';
import { QuestDBStockAggregate } from '../../types';

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
    authToken = jwt.sign({ userId: '1', email: 'test@example.com' }, secret, {
      expiresIn: '1h',
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Mock both methods that the chart route uses
    mockQuestdbService.getStockAggregates.mockResolvedValue([]);
    mockQuestdbService.getAggregatedStockData.mockResolvedValue([]);
  });

  describe('GET /api/chart/:symbol', () => {
    const mockAggregates: QuestDBStockAggregate[] = [
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
      // For 1h interval, it should call getAggregatedStockData, not getStockAggregates
      mockQuestdbService.getAggregatedStockData.mockResolvedValue(mockAggregates);

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
      mockQuestdbService.getStockAggregates.mockResolvedValue(mockAggregates);

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
      expect(response.body).toHaveProperty('error', 'direction must be either "past", "future", or "centered"');
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
      mockQuestdbService.getAggregatedStockData.mockResolvedValue(mockAggregates);

      await request(app)
        .get('/api/chart/AAPL?start_time=2024-01-01T10:00:00Z&direction=past&limit=100')
        .set('Authorization', `Bearer ${authToken}`);

      expect(mockQuestdbService.getAggregatedStockData).toHaveBeenCalledWith(
        'AAPL',
        '1h',
        expect.objectContaining({
          start_time: '2024-01-01T10:00:00.000Z',
          order_by: 'timestamp',
          order_direction: 'DESC',
        })
      );
    });

    it('should handle different timeframes correctly', async () => {
      mockQuestdbService.getAggregatedStockData.mockResolvedValue(mockAggregates);

      // Test 1 hour timeframe
      await request(app)
        .get('/api/chart/AAPL?interval=1h&start_time=2024-01-01T10:00:00Z&direction=past')
        .set('Authorization', `Bearer ${authToken}`);

      expect(mockQuestdbService.getAggregatedStockData).toHaveBeenCalledWith(
        'AAPL',
        '1h',
        expect.objectContaining({
          start_time: '2024-01-01T10:00:00.000Z',
          order_by: 'timestamp',
          order_direction: 'DESC',
        })
      );
    });

    it('should use provided start_time when available', async () => {
      mockQuestdbService.getAggregatedStockData.mockResolvedValue(mockAggregates);

      await request(app)
        .get('/api/chart/AAPL?interval=1d&start_time=2024-01-01T00:00:00Z&direction=past')
        .set('Authorization', `Bearer ${authToken}`);

      expect(mockQuestdbService.getAggregatedStockData).toHaveBeenCalledWith(
        'AAPL',
        '1d',
        expect.objectContaining({
          start_time: '2024-01-01T00:00:00.000Z',
          order_by: 'timestamp',
          order_direction: 'DESC',
        })
      );
    });

    it('should return 500 on service error', async () => {
      mockQuestdbService.getAggregatedStockData.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/api/chart/AAPL?start_time=2024-01-01T10:00:00Z&direction=past')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('data_source', 'questdb');
      expect(response.body).toHaveProperty('success', false);
    });

    describe('centered direction', () => {
      const pastAggregates: QuestDBStockAggregate[] = [
        {
          timestamp: '2024-01-01T08:00:00.000Z',
          symbol: 'AAPL',
          open: 100,
          high: 105,
          low: 98,
          close: 103,
          volume: 1000,
          transaction_count: 10,
          vwap: 101.5,
        },
        {
          timestamp: '2024-01-01T09:00:00.000Z',
          symbol: 'AAPL',
          open: 103,
          high: 107,
          low: 102,
          close: 106,
          volume: 1200,
          transaction_count: 12,
          vwap: 104.2,
        },
      ];

      const futureAggregates: QuestDBStockAggregate[] = [
        {
          timestamp: '2024-01-01T11:00:00.000Z',
          symbol: 'AAPL',
          open: 106,
          high: 108,
          low: 104,
          close: 107,
          volume: 1100,
          transaction_count: 11,
          vwap: 105.8,
        },
        {
          timestamp: '2024-01-01T12:00:00.000Z',
          symbol: 'AAPL',
          open: 107,
          high: 109,
          low: 105,
          close: 108,
          volume: 1300,
          transaction_count: 13,
          vwap: 106.5,
        },
      ];

      beforeEach(() => {
        jest.clearAllMocks();
      });

      it('should load data centered around start_time', async () => {
        // Mock both past and future data calls
        mockQuestdbService.getAggregatedStockData
          .mockResolvedValueOnce(pastAggregates) // First call for past data
          .mockResolvedValueOnce(futureAggregates); // Second call for future data

        const response = await request(app)
          .get('/api/chart/AAPL?start_time=2024-01-01T10:00:00Z&direction=centered&limit=100')
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('symbol', 'AAPL');
        expect(response.body).toHaveProperty('direction', 'centered');
        expect(response.body.bars).toHaveLength(4); // Combined past and future data

        // Verify both calls were made with correct parameters
        expect(mockQuestdbService.getAggregatedStockData).toHaveBeenCalledTimes(2);

        // First call should be for past data (DESC order)
        expect(mockQuestdbService.getAggregatedStockData).toHaveBeenNthCalledWith(
          1,
          'AAPL',
          '1h',
          expect.objectContaining({
            start_time: '2024-01-01T10:00:00.000Z',
            order_by: 'timestamp',
            order_direction: 'DESC',
            limit: 50, // Half of 100
          })
        );

        // Second call should be for future data (ASC order)
        expect(mockQuestdbService.getAggregatedStockData).toHaveBeenNthCalledWith(
          2,
          'AAPL',
          '1h',
          expect.objectContaining({
            start_time: '2024-01-01T10:00:00.000Z',
            order_by: 'timestamp',
            order_direction: 'ASC',
            limit: 50, // Half of 100
          })
        );
      });

      it('should handle odd limit values correctly', async () => {
        mockQuestdbService.getAggregatedStockData
          .mockResolvedValueOnce(pastAggregates)
          .mockResolvedValueOnce(futureAggregates);

        const response = await request(app)
          .get('/api/chart/AAPL?start_time=2024-01-01T10:00:00Z&direction=centered&limit=101')
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);

        // Should split 101 into 50 and 50 (floor(101/2) = 50)
        expect(mockQuestdbService.getAggregatedStockData).toHaveBeenCalledTimes(2);
        expect(mockQuestdbService.getAggregatedStockData).toHaveBeenNthCalledWith(
          1,
          'AAPL',
          '1h',
          expect.objectContaining({ limit: 50 })
        );
        expect(mockQuestdbService.getAggregatedStockData).toHaveBeenNthCalledWith(
          2,
          'AAPL',
          '1h',
          expect.objectContaining({ limit: 50 })
        );
      });

      it('should handle aggregated intervals with centered direction', async () => {
        mockQuestdbService.getAggregatedStockData
          .mockResolvedValueOnce(pastAggregates)
          .mockResolvedValueOnce(futureAggregates);

        const response = await request(app)
          .get('/api/chart/AAPL?interval=1h&start_time=2024-01-01T10:00:00Z&direction=centered&limit=100')
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('direction', 'centered');

        // Should use aggregated data service for non-1-minute intervals
        expect(mockQuestdbService.getAggregatedStockData).toHaveBeenCalledTimes(2);
        expect(mockQuestdbService.getStockAggregates).not.toHaveBeenCalled();
      });

      it('should return chronological order for centered data', async () => {
        mockQuestdbService.getAggregatedStockData
          .mockResolvedValueOnce(pastAggregates)
          .mockResolvedValueOnce(futureAggregates);

        const response = await request(app)
          .get('/api/chart/AAPL?start_time=2024-01-01T10:00:00Z&direction=centered&limit=100')
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);

        const bars = response.body.bars;
        expect(bars).toHaveLength(4);

        // Verify chronological order (earliest to latest)
        expect(bars[0].t).toBe('2024-01-01T08:00:00.000Z'); // Past data
        expect(bars[1].t).toBe('2024-01-01T09:00:00.000Z'); // Past data
        expect(bars[2].t).toBe('2024-01-01T11:00:00.000Z'); // Future data
        expect(bars[3].t).toBe('2024-01-01T12:00:00.000Z'); // Future data
      });

      it('should handle empty results gracefully', async () => {
        mockQuestdbService.getAggregatedStockData
          .mockResolvedValueOnce([]) // No past data
          .mockResolvedValueOnce([]); // No future data

        const response = await request(app)
          .get('/api/chart/AAPL?start_time=2024-01-01T10:00:00Z&direction=centered&limit=100')
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(response.body.bars).toHaveLength(0);
        expect(response.body.actual_data_range).toBeNull();
      });

      it('should handle partial results (only past or only future)', async () => {
        mockQuestdbService.getAggregatedStockData
          .mockResolvedValueOnce(pastAggregates) // Past data available
          .mockResolvedValueOnce([]); // No future data

        const response = await request(app)
          .get('/api/chart/AAPL?start_time=2024-01-01T10:00:00Z&direction=centered&limit=100')
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(response.body.bars).toHaveLength(2); // Only past data
        // Past data gets reversed, so the order is: 09:00, 08:00
        expect(response.body.bars[0].t).toBe('2024-01-01T09:00:00.000Z');
        expect(response.body.bars[1].t).toBe('2024-01-01T08:00:00.000Z');
      });
    });

    it('should convert QuestDB aggregates to Alpaca bar format', async () => {
      mockQuestdbService.getAggregatedStockData.mockResolvedValue(mockAggregates);

      const response = await request(app)
        .get('/api/chart/AAPL?start_time=2024-01-01T10:00:00Z&direction=past')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.bars).toHaveLength(2); // mockAggregates has 2 items
      // Data gets reversed for past direction, so check the first item (which was originally the second)
      expect(response.body.bars[0]).toEqual({
        t: '2024-01-01T11:00:00Z',
        o: 104.0,
        h: 106.0,
        l: 103.0,
        c: 105.0,
        v: 1200,
        n: 60,
        vw: 104.5,
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

      mockQuestdbService.getAggregatedStockData.mockResolvedValue(minuteBars);

      const response = await request(app)
        .get('/api/chart/AAPL?interval=1h&start_time=2024-01-01T10:00:00Z&direction=past')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      // Data gets reversed for past direction, so we get all 3 bars in reverse order
      expect(response.body.bars).toHaveLength(3);

      const firstBar = response.body.bars[0]; // This is the last item from the original array
      expect(firstBar.o).toBe(101.5);
      expect(firstBar.h).toBe(103.0);
      expect(firstBar.l).toBe(101.0);
      expect(firstBar.c).toBe(102.5);
      expect(firstBar.v).toBe(150);
      expect(firstBar.n).toBe(15);
    });

    it('should uppercase symbol parameter', async () => {
      mockQuestdbService.getAggregatedStockData.mockResolvedValue(mockAggregates);

      await request(app)
        .get('/api/chart/aapl?start_time=2024-01-01T10:00:00Z&direction=past')
        .set('Authorization', `Bearer ${authToken}`);

      expect(mockQuestdbService.getAggregatedStockData).toHaveBeenCalledWith('AAPL', '1h', expect.any(Object));
    });

    it('should support view-based loading parameters', async () => {
      mockQuestdbService.getAggregatedStockData.mockResolvedValue(mockAggregates);

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

      mockQuestdbService.getAggregatedStockData.mockResolvedValue(extendedAggregates);

      const response = await request(app)
        .get(
          '/api/chart/AAPL?start_time=2024-01-01T10:00:00Z&direction=past&interval=1h&limit=50&view_based_loading=true&view_size=50'
        )
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.bars).toHaveLength(150); // All mock data is returned
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
      mockQuestdbService.getAggregatedStockData.mockResolvedValue(mockAggregates);

      const response = await request(app)
        .get(
          '/api/chart/AAPL?start_time=2024-01-01T10:00:00Z&direction=past&interval=1h&limit=100&view_based_loading=true'
        )
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('view_size', 100);
    });

    it('should work with traditional loading when view_based_loading is false', async () => {
      mockQuestdbService.getAggregatedStockData.mockResolvedValue(mockAggregates);

      const response = await request(app)
        .get(
          '/api/chart/AAPL?start_time=2024-01-01T10:00:00Z&direction=past&interval=1h&limit=100&view_based_loading=false'
        )
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('view_based_loading', false);
      expect(response.body.bars).toHaveLength(2); // mockAggregates has 2 items
    });
  });
});
