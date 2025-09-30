import request from 'supertest';
import express from 'express';
import { questdbService } from '../../services/questdbService';
import { questdbRoutes } from '../../routes/questdb';
import {
  QuestDBStockTrade,
  QuestDBStockAggregate,
  QuestDBOptionTrade,
  QuestDBOptionQuote,
  QuestDBOptionContract,
} from '../../types';

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

  describe('GET /api/questdb/stock-trades/:symbol', () => {
    it('should return stock trades for a symbol', async () => {
      const mockTrades: QuestDBStockTrade[] = [
        {
          timestamp: '2024-01-01T10:00:00.000Z',
          symbol: 'AAPL',
          price: 150.5,
          size: 100,
          conditions: 'regular',
          exchange: 1,
          trade_id: 'trade-1',
        },
        {
          timestamp: '2024-01-01T10:01:00.000Z',
          symbol: 'AAPL',
          price: 150.75,
          size: 200,
          conditions: 'regular',
          exchange: 1,
          trade_id: 'trade-2',
        },
      ];

      mockedQuestdbService.getStockTrades.mockResolvedValue(mockTrades);

      const response = await request(app).get('/api/questdb/stock-trades/AAPL').expect(200);

      expect(response.body).toEqual({
        symbol: 'AAPL',
        trades: mockTrades,
        count: 2,
        data_source: 'questdb',
        success: true,
      });

      expect(mockedQuestdbService.getStockTrades).toHaveBeenCalledWith('AAPL', {
        start_time: undefined,
        end_time: undefined,
        limit: 1000,
        order_by: 'timestamp',
        order_direction: 'DESC',
      });
    });

    it('should return 400 if symbol is missing', async () => {
      await request(app).get('/api/questdb/stock-trades/').expect(404); // Express will return 404 for missing route parameter
    });

    it('should return 400 if limit is invalid', async () => {
      const response = await request(app).get('/api/questdb/stock-trades/AAPL?limit=invalid').expect(400);

      expect(response.body).toEqual({
        error: 'Limit must be between 1 and 10000',
      });
    });

    it('should return 400 if limit is out of range', async () => {
      const response = await request(app).get('/api/questdb/stock-trades/AAPL?limit=20000').expect(400);

      expect(response.body).toEqual({
        error: 'Limit must be between 1 and 10000',
      });
    });

    it('should handle custom query parameters', async () => {
      const mockTrades: QuestDBStockTrade[] = [];
      mockedQuestdbService.getStockTrades.mockResolvedValue(mockTrades);

      await request(app)
        .get(
          '/api/questdb/stock-trades/AAPL?start_time=2024-01-01&end_time=2024-01-02&limit=500&order_by=price&order_direction=ASC'
        )
        .expect(200);

      expect(mockedQuestdbService.getStockTrades).toHaveBeenCalledWith('AAPL', {
        start_time: '2024-01-01',
        end_time: '2024-01-02',
        limit: 500,
        order_by: 'price',
        order_direction: 'ASC',
      });
    });

    it('should handle service errors', async () => {
      mockedQuestdbService.getStockTrades.mockRejectedValue(new Error('Database error'));

      const response = await request(app).get('/api/questdb/stock-trades/AAPL').expect(500);

      expect(response.body).toEqual({
        error: 'Failed to fetch stock trades: Database error',
        data_source: 'questdb',
        success: false,
      });
    });

    it('should convert symbol to uppercase', async () => {
      const mockTrades: QuestDBStockTrade[] = [];
      mockedQuestdbService.getStockTrades.mockResolvedValue(mockTrades);

      await request(app).get('/api/questdb/stock-trades/aapl').expect(200);

      expect(mockedQuestdbService.getStockTrades).toHaveBeenCalledWith('AAPL', expect.any(Object));
    });
  });

  describe('GET /api/questdb/stock-aggregates/:symbol', () => {
    it('should return stock aggregates for a symbol', async () => {
      const mockAggregates: QuestDBStockAggregate[] = [
        {
          timestamp: '2024-01-01T10:00:00.000Z',
          symbol: 'AAPL',
          open: 150.0,
          high: 151.0,
          low: 149.5,
          close: 150.5,
          volume: 1000,
          vwap: 150.25,
          transaction_count: 100,
        },
      ];

      mockedQuestdbService.getStockAggregates.mockResolvedValue(mockAggregates);

      const response = await request(app).get('/api/questdb/stock-aggregates/AAPL').expect(200);

      expect(response.body).toEqual({
        symbol: 'AAPL',
        aggregates: mockAggregates,
        count: 1,
        data_source: 'questdb',
        success: true,
      });

      expect(mockedQuestdbService.getStockAggregates).toHaveBeenCalledWith('AAPL', {
        start_time: undefined,
        end_time: undefined,
        limit: 1000,
        order_by: 'timestamp',
        order_direction: 'ASC',
      });
    });

    it('should handle service errors for aggregates', async () => {
      mockedQuestdbService.getStockAggregates.mockRejectedValue(new Error('Database error'));

      const response = await request(app).get('/api/questdb/stock-aggregates/AAPL').expect(500);

      expect(response.body).toEqual({
        error: 'Failed to fetch stock aggregates: Database error',
        data_source: 'questdb',
        success: false,
      });
    });
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

  describe('GET /api/questdb/option-quotes', () => {
    it('should return option quotes for a symbol', async () => {
      const mockQuotes: QuestDBOptionQuote[] = [
        {
          timestamp: '2024-01-01T10:00:00.000Z',
          ticker: 'AAPL241220C00150000',
          underlying_ticker: 'AAPL',
          bid_price: 5.25,
          bid_size: 100,
          ask_price: 5.75,
          ask_size: 100,
          bid_exchange: 1,
          ask_exchange: 1,
          sequence_number: 1,
        },
      ];

      mockedQuestdbService.getOptionQuotes.mockResolvedValue(mockQuotes);

      const response = await request(app).get('/api/questdb/option-quotes?underlying_ticker=AAPL').expect(200);

      expect(response.body).toEqual({
        ticker: undefined,
        underlying_ticker: 'AAPL',
        quotes: mockQuotes,
        count: 1,
        data_source: 'questdb',
        success: true,
      });

      expect(mockedQuestdbService.getOptionQuotes).toHaveBeenCalledWith(undefined, 'AAPL', {
        start_time: undefined,
        end_time: undefined,
        limit: 1000,
        order_by: 'timestamp',
        order_direction: 'DESC',
      });
    });

    it('should handle service errors for option quotes', async () => {
      mockedQuestdbService.getOptionQuotes.mockRejectedValue(new Error('Database error'));

      const response = await request(app).get('/api/questdb/option-quotes?underlying_ticker=AAPL').expect(500);

      expect(response.body).toEqual({
        error: 'Failed to fetch option quotes: Database error',
        data_source: 'questdb',
        success: false,
      });
    });
  });

  describe('GET /api/questdb/option-contracts/:underlying_ticker', () => {
    it('should return option contracts for a symbol', async () => {
      const mockContracts: QuestDBOptionContract[] = [
        {
          ticker: 'AAPL241220C00150000',
          underlying_ticker: 'AAPL',
          strike_price: 150,
          expiration_date: '2024-12-20',
          contract_type: 'call',
          exercise_style: 'american',
          shares_per_contract: 100,
          as_of: '2024-01-01T10:00:00.000Z',
        },
      ];

      mockedQuestdbService.getOptionContracts.mockResolvedValue(mockContracts);

      const response = await request(app).get('/api/questdb/option-contracts/AAPL').expect(200);

      expect(response.body).toEqual({
        underlying_ticker: 'AAPL',
        contracts: mockContracts,
        count: 1,
        data_source: 'questdb',
        success: true,
      });

      expect(mockedQuestdbService.getOptionContracts).toHaveBeenCalledWith('AAPL', {
        limit: 1000,
        order_by: 'expiration_date',
        order_direction: 'ASC',
      });
    });

    it('should handle service errors for option contracts', async () => {
      mockedQuestdbService.getOptionContracts.mockRejectedValue(new Error('Database error'));

      const response = await request(app).get('/api/questdb/option-contracts/AAPL').expect(500);

      expect(response.body).toEqual({
        error: 'Failed to fetch option contracts: Database error',
        data_source: 'questdb',
        success: false,
      });
    });
  });
});
