import request from 'supertest';
import express from 'express';
import { questdbService } from '../../services/questdbService';
import { questdbRoutes } from '../../routes/questdb';
import { QuestDBOptionTrade } from '../../types';

// Mock the questdbService
jest.mock('../../services/questdbService');
const mockedQuestdbService = questdbService as jest.Mocked<typeof questdbService>;

const app = express();
app.use(express.json());
app.use('/api/questdb', questdbRoutes);

describe('QuestDB Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/questdb/option-trades', () => {
    it('should return option trades for a symbol', async () => {
      const mockTrades: QuestDBOptionTrade[] = [
        {
          timestamp: '2024-01-01T10:00:00.000Z',
          ticker: 'AAPL241220C00150000',
          underlying_ticker: 'AAPL',
          price: 5.5,
          size: 10,
          conditions: 'regular',
          exchange: 1,
        },
      ];

      mockedQuestdbService.getOptionTrades.mockResolvedValue(mockTrades);

      const response = await request(app).get('/api/questdb/option-trades?underlying_ticker=AAPL').expect(200);

      expect(response.body).toEqual({
        ticker: undefined,
        underlying_ticker: 'AAPL',
        trades: mockTrades,
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

    it('should handle service errors for option trades', async () => {
      mockedQuestdbService.getOptionTrades.mockRejectedValue(new Error('Database error'));

      const response = await request(app).get('/api/questdb/option-trades?underlying_ticker=AAPL').expect(500);

      expect(response.body).toEqual({
        error: 'Failed to fetch option trades: Database error',
        data_source: 'questdb',
        success: false,
      });
    });
  });
});
