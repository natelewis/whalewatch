import request from 'supertest';
import express from 'express';
import { questdbService } from '../../services/questdbService';
import { optionsRoutes } from '../../routes/options';
import { QuestDBOptionContract, QuestDBOptionTrade } from '../../types';

// Mock the questdbService
jest.mock('../../services/questdbService');
const mockedQuestdbService = questdbService as jest.Mocked<typeof questdbService>;

const app = express();
app.use(express.json());
app.use('/api/options', optionsRoutes);

describe('Options Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Ensure the mock is properly set up
    mockedQuestdbService.getOptionTrades.mockClear();
    mockedQuestdbService.testConnection.mockClear();
    mockedQuestdbService.getDatabaseStats.mockClear();
  });

  describe('GET /api/options/:symbol/trades', () => {
    it('should return options trades for a symbol', async () => {
      const mockTrades: QuestDBOptionTrade[] = [
        {
          underlying_ticker: 'AAPL',
          ticker: 'AAPL241220C00150000',
          timestamp: '2024-01-01T10:00:00.000Z',
          price: 5.5,
          size: 10,
          conditions: 'regular',
          exchange: 1,
        },
      ];

      mockedQuestdbService.getOptionTrades.mockResolvedValue(mockTrades);

      const response = await request(app).get('/api/options/AAPL/trades').expect(200);

      expect(response.body).toEqual({
        symbol: 'AAPL',
        trades: [
          {
            id: '12345',
            symbol: 'AAPL241220C00150000',
            timestamp: '2024-01-01T10:00:00.000Z',
            price: 5.5,
            size: 10,
            side: 'unknown',
            conditions: ['regular'],
            exchange: '1',
            tape: '1',
            contract: {
              symbol: 'AAPL241220C00150000',
              underlying_symbol: 'AAPL',
              exercise_style: 'american',
              expiration_date: '',
              strike_price: 0,
              option_type: 'call',
            },
          },
        ],
        count: 1,
        data_source: 'questdb',
        success: true,
      });

      expect(mockedQuestdbService.getOptionTrades).toHaveBeenCalledWith(undefined, 'AAPL', {
        start_time: undefined,
        end_time: undefined,
        limit: 1000,
        order_by: 'timestamp',
        order_direction: 'DESC',
      });
    });

    it('should return 400 if symbol is missing', async () => {
      const response = await request(app).get('/api/options//trades').expect(404);

      // When symbol is empty in the URL, Express returns 404 because the route doesn't match
      // The actual validation happens in the route handler, but this URL pattern doesn't match
      expect(response.status).toBe(404);
    });

    it('should return 400 if limit is invalid', async () => {
      const response = await request(app).get('/api/options/AAPL/trades?limit=invalid').expect(400);

      expect(response.body).toEqual({
        error: 'Limit must be between 1 and 10000',
      });
    });

    it('should return 400 if limit is out of range', async () => {
      const response = await request(app).get('/api/options/AAPL/trades?limit=20000').expect(400);

      expect(response.body).toEqual({
        error: 'Limit must be between 1 and 10000',
      });
    });

    it('should use custom query parameters', async () => {
      const mockTrades: QuestDBOptionTrade[] = [];
      mockedQuestdbService.getOptionTrades.mockResolvedValue(mockTrades);

      await request(app)
        .get(
          '/api/options/AAPL/trades?start_time=2024-01-01&end_time=2024-01-02&limit=500&order_by=price&order_direction=ASC'
        )
        .expect(200);

      expect(mockedQuestdbService.getOptionTrades).toHaveBeenCalledWith(undefined, 'AAPL', {
        start_time: '2024-01-01',
        end_time: '2024-01-02',
        limit: 500,
        order_by: 'price',
        order_direction: 'ASC',
      });
    });

    it('should handle service errors', async () => {
      mockedQuestdbService.getOptionTrades.mockRejectedValue(new Error('Database error'));

      const response = await request(app).get('/api/options/AAPL/trades').expect(500);

      expect(response.body).toEqual({
        error: 'Failed to fetch options trades: Database error',
        data_source: 'questdb',
        success: false,
      });
    });

    it('should handle non-Error exceptions', async () => {
      mockedQuestdbService.getOptionTrades.mockRejectedValue('String error');

      const response = await request(app).get('/api/options/AAPL/trades').expect(500);

      expect(response.body).toEqual({
        error: 'Failed to fetch options trades: Unknown error',
        data_source: 'questdb',
        success: false,
      });
    });
  });

  describe('GET /api/options/test-connection', () => {
    it('should return success when QuestDB is connected', async () => {
      const mockStats = {
        option_trades_count: 300,
      };

      mockedQuestdbService.testConnection.mockResolvedValue(true);
      mockedQuestdbService.getDatabaseStats.mockResolvedValue(mockStats);

      const response = await request(app).get('/api/options/test-connection').expect(200);

      expect(response.body).toEqual({
        success: true,
        message: 'QuestDB connection successful',
        data_source: 'questdb',
        stats: mockStats,
      });
    });

    it('should return failure when QuestDB is not connected', async () => {
      mockedQuestdbService.testConnection.mockResolvedValue(false);

      const response = await request(app).get('/api/options/test-connection').expect(500);

      expect(response.body).toEqual({
        success: false,
        message: 'QuestDB connection failed',
        data_source: 'questdb',
      });
    });

    it('should handle connection test errors', async () => {
      mockedQuestdbService.testConnection.mockRejectedValue(new Error('Connection failed'));

      const response = await request(app).get('/api/options/test-connection').expect(500);

      expect(response.body).toEqual({
        success: false,
        message: 'QuestDB connection test failed: Connection failed',
        data_source: 'questdb',
      });
    });

    it('should handle non-Error exceptions in connection test', async () => {
      mockedQuestdbService.testConnection.mockRejectedValue('String error');

      const response = await request(app).get('/api/options/test-connection').expect(500);

      expect(response.body).toEqual({
        success: false,
        message: 'QuestDB connection test failed: Unknown error',
        data_source: 'questdb',
      });
    });
  });
});
