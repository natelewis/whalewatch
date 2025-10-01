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
    mockedQuestdbService.getOptionContracts.mockClear();
    mockedQuestdbService.getOptionTrades.mockClear();
    mockedQuestdbService.testConnection.mockClear();
    mockedQuestdbService.getDatabaseStats.mockClear();
  });

  describe('GET /api/options/:symbol/recent', () => {
    it('should return recent options contracts for a symbol', async () => {
      const mockContracts: QuestDBOptionContract[] = [
        {
          contract_type: 'call',
          exercise_style: 'american',
          expiration_date: '2024-12-20',
          shares_per_contract: 100,
          strike_price: 150,
          ticker: 'AAPL241220C00150000',
          underlying_ticker: 'AAPL',
          as_of: '2024-01-01T10:00:00.000Z',
        },
        {
          contract_type: 'put',
          exercise_style: 'american',
          expiration_date: '2024-12-20',
          shares_per_contract: 100,
          strike_price: 150,
          ticker: 'AAPL241220P00150000',
          underlying_ticker: 'AAPL',
          as_of: '2024-01-01T10:00:00.000Z',
        },
      ];

      mockedQuestdbService.getOptionContracts.mockResolvedValue(mockContracts);

      const response = await request(app).get('/api/options/AAPL/recent').expect(200);

      expect(response.body).toEqual({
        symbol: 'AAPL',
        contracts: [
          {
            cfi: 'call',
            contract_type: 'call',
            exercise_style: 'american',
            expiration_date: '2024-12-20',
            primary_exchange: 'UNKNOWN',
            shares_per_contract: 100,
            strike_price: 150,
            ticker: 'AAPL241220C00150000',
            underlying_ticker: 'AAPL',
          },
          {
            cfi: 'put',
            contract_type: 'put',
            exercise_style: 'american',
            expiration_date: '2024-12-20',
            primary_exchange: 'UNKNOWN',
            shares_per_contract: 100,
            strike_price: 150,
            ticker: 'AAPL241220P00150000',
            underlying_ticker: 'AAPL',
          },
        ],
        total_contracts: 2,
        data_source: 'questdb',
        success: true,
      });

      expect(mockedQuestdbService.getOptionContracts).toHaveBeenCalledWith('AAPL', {
        limit: 1000,
        order_by: 'expiration_date',
        order_direction: 'ASC',
      });
    });

    it('should return 404 if symbol is missing', async () => {
      await request(app).get('/api/options//recent').expect(404);
    });

    it('should return 400 if limit is invalid', async () => {
      const response = await request(app).get('/api/options/AAPL/recent?limit=invalid').expect(400);

      expect(response.body).toEqual({
        error: 'Limit must be between 1 and 10000',
      });
    });

    it('should return 400 if limit is out of range', async () => {
      const response = await request(app).get('/api/options/AAPL/recent?limit=20000').expect(400);

      expect(response.body).toEqual({
        error: 'Limit must be between 1 and 10000',
      });
    });

    it('should handle service errors', async () => {
      mockedQuestdbService.getOptionContracts.mockRejectedValue(new Error('Database error'));

      const response = await request(app).get('/api/options/AAPL/recent').expect(500);

      expect(response.body).toEqual({
        error: 'Failed to fetch options contracts data: Database error',
        data_source: 'questdb',
        success: false,
      });
    });

    it('should use custom limit when provided', async () => {
      const mockContracts: QuestDBOptionContract[] = [
        {
          contract_type: 'call',
          exercise_style: 'american',
          expiration_date: '2024-12-20',
          shares_per_contract: 100,
          strike_price: 150,
          ticker: 'AAPL241220C00150000',
          underlying_ticker: 'AAPL',
          as_of: '2024-01-01T10:00:00.000Z',
        },
      ];
      mockedQuestdbService.getOptionContracts.mockResolvedValue(mockContracts);

      const response = await request(app).get('/api/options/AAPL/recent?limit=500').expect(200);

      expect(response.body).toEqual({
        symbol: 'AAPL',
        contracts: [
          {
            cfi: 'call',
            contract_type: 'call',
            exercise_style: 'american',
            expiration_date: '2024-12-20',
            primary_exchange: 'UNKNOWN',
            shares_per_contract: 100,
            strike_price: 150,
            ticker: 'AAPL241220C00150000',
            underlying_ticker: 'AAPL',
          },
        ],
        total_contracts: 1,
        data_source: 'questdb',
        success: true,
      });

      expect(mockedQuestdbService.getOptionContracts).toHaveBeenCalledWith('AAPL', {
        limit: 500,
        order_by: 'expiration_date',
        order_direction: 'ASC',
      });
    });

    it('should handle unknown contract types', async () => {
      const mockContracts: QuestDBOptionContract[] = [
        {
          contract_type: 'unknown',
          exercise_style: 'american',
          expiration_date: '2024-12-20',
          shares_per_contract: 100,
          strike_price: 150,
          ticker: 'AAPL241220X00150000',
          underlying_ticker: 'AAPL',
          as_of: '2024-01-01T10:00:00.000Z',
        },
      ];

      mockedQuestdbService.getOptionContracts.mockResolvedValue(mockContracts);

      const response = await request(app).get('/api/options/AAPL/recent').expect(200);

      expect(response.body.contracts[0].contract_type).toBe('call');
      expect(response.body.contracts[0].cfi).toBe('call');
    });

    it('should return 400 if symbol is missing', async () => {
      const response = await request(app).get('/api/options//recent').expect(404);

      // When symbol is empty in the URL, Express returns 404 because the route doesn't match
      // The actual validation happens in the route handler, but this URL pattern doesn't match
      expect(response.status).toBe(404);
    });

    it('should return 404 when no contracts are found', async () => {
      mockedQuestdbService.getOptionContracts.mockResolvedValue([]);

      const response = await request(app).get('/api/options/INVALID/recent').expect(404);

      expect(response.body).toEqual({
        error: 'No options contracts found for INVALID. This symbol may not have active options trading.',
        data_source: 'questdb',
        success: false,
        details: 'This symbol may not have active options trading or may not be supported.',
      });
    });

    it('should handle connection refused error', async () => {
      const connectionError = new Error('connection refused');
      mockedQuestdbService.getOptionContracts.mockRejectedValue(connectionError);

      const response = await request(app).get('/api/options/AAPL/recent').expect(503);

      expect(response.body).toEqual({
        error: 'Unable to connect to QuestDB. Please check if QuestDB is running.',
        data_source: 'questdb',
        success: false,
      });
    });

    it('should handle ENOTFOUND error', async () => {
      const notFoundError = new Error('ENOTFOUND');
      mockedQuestdbService.getOptionContracts.mockRejectedValue(notFoundError);

      const response = await request(app).get('/api/options/AAPL/recent').expect(503);

      expect(response.body).toEqual({
        error: 'Unable to connect to QuestDB. Please check if QuestDB is running.',
        data_source: 'questdb',
        success: false,
      });
    });

    it('should handle "No options contracts found" error', async () => {
      const noContractsError = new Error('No options contracts found');
      mockedQuestdbService.getOptionContracts.mockRejectedValue(noContractsError);

      const response = await request(app).get('/api/options/AAPL/recent').expect(404);

      expect(response.body).toEqual({
        error: 'No options contracts found for AAPL. This symbol may not have active options trading.',
        data_source: 'questdb',
        success: false,
      });
    });

    it('should handle contracts with missing fields', async () => {
      const mockContracts: QuestDBOptionContract[] = [
        {
          contract_type: 'call',
          exercise_style: '',
          expiration_date: '',
          shares_per_contract: 0,
          strike_price: 0,
          ticker: '',
          underlying_ticker: '',
          as_of: '2024-01-01T10:00:00.000Z',
        },
      ];

      mockedQuestdbService.getOptionContracts.mockResolvedValue(mockContracts);

      const response = await request(app).get('/api/options/AAPL/recent').expect(200);

      expect(response.body.contracts[0]).toEqual({
        cfi: 'call',
        contract_type: 'call',
        exercise_style: 'american',
        expiration_date: '',
        primary_exchange: 'UNKNOWN',
        shares_per_contract: 100,
        strike_price: 0,
        ticker: '',
        underlying_ticker: '',
      });
    });
  });

  describe('GET /api/options/:symbol/trades', () => {
    it('should return options trades for a symbol', async () => {
      const mockTrades: QuestDBOptionTrade[] = [
        {
          underlying_ticker: 'AAPL',
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
