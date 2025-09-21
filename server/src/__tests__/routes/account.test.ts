import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import { accountRoutes } from '../../routes/account';
import { alpacaService } from '../../services/alpacaService';
import { AlpacaActivity } from '../../types';

// Mock the alpaca service
jest.mock('../../services/alpacaService');

const app = express();
app.use(express.json());
app.use('/api/account', accountRoutes);

const mockAlpacaService = alpacaService as jest.Mocked<typeof alpacaService>;

describe('Account Routes', () => {
  let authToken: string;

  beforeAll(() => {
    // Set JWT_SECRET for testing
    process.env.JWT_SECRET = 'test-secret';

    // Create a test JWT token
    authToken = jwt.sign({ userId: '1', email: 'test@example.com' }, 'test-secret', {
      expiresIn: '1h',
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/account/info', () => {
    it('should return account info with valid token', async () => {
      const mockAccount = {
        id: 'test-account-id',
        account_number: '123456789',
        status: 'ACTIVE',
        currency: 'USD',
        buying_power: '10000.00',
        regt_buying_power: '10000.00',
        daytrading_buying_power: '10000.00',
        non_marginable_buying_power: '10000.00',
        cash: '10000.00',
        accrued_fees: '0.00',
        pending_transfer_out: '0.00',
        pending_transfer_in: '0.00',
        portfolio_value: '50000.00',
        pattern_day_trader: false,
        trading_blocked: false,
        transfers_blocked: false,
        account_blocked: false,
        created_at: '2024-01-01T00:00:00Z',
        trade_suspended_by_user: false,
        multiplier: '1.0',
        shorting_enabled: true,
        equity: '50000.00',
        last_equity: '50000.00',
        long_market_value: '50000.00',
        short_market_value: '0.00',
        initial_margin: '0.00',
        maintenance_margin: '0.00',
        last_maintenance_margin: '0.00',
        sma: '0.00',
        daytrade_count: 0,
      };

      mockAlpacaService.getAccount.mockResolvedValue(mockAccount);

      const response = await request(app)
        .get('/api/account/info')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('account');
      expect(response.body.account).toEqual(mockAccount);
    });

    it('should return 401 without token', async () => {
      const response = await request(app).get('/api/account/info');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Access token required');
    });

    it('should return 500 on service error', async () => {
      mockAlpacaService.getAccount.mockRejectedValue(new Error('Service error'));

      const response = await request(app)
        .get('/api/account/info')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error', 'Failed to fetch account information');
    });
  });

  describe('GET /api/account/positions', () => {
    it('should return positions with valid token', async () => {
      const mockPositions = [
        {
          asset_id: 'asset-1',
          symbol: 'AAPL',
          exchange: 'NASDAQ',
          asset_class: 'us_equity',
          qty: '10',
          side: 'long',
          market_value: '1500.00',
          cost_basis: '1450.00',
          unrealized_pl: '50.00',
          unrealized_plpc: '0.0345',
          unrealized_intraday_pl: '25.00',
          unrealized_intraday_plpc: '0.0172',
          current_price: '150.00',
          lastday_price: '147.50',
          change_today: '2.50',
        },
      ];

      mockAlpacaService.getPositions.mockResolvedValue(mockPositions);

      const response = await request(app)
        .get('/api/account/positions')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('positions');
      expect(response.body.positions).toEqual(mockPositions);
    });

    it('should return 401 without token', async () => {
      const response = await request(app).get('/api/account/positions');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Access token required');
    });
  });

  describe('GET /api/account/activity', () => {
    it('should return activities with valid token', async () => {
      const mockActivities = [
        {
          id: 'activity-1',
          account_id: 'test-account-id',
          activity_type: 'FILL',
          transaction_time: '2024-01-01T10:00:00Z',
          type: 'fill',
          qty: '10',
          side: 'buy',
          symbol: 'AAPL',
        },
      ];

      mockAlpacaService.getActivities.mockResolvedValue(mockActivities);

      const response = await request(app)
        .get('/api/account/activity')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('activities');
      expect(response.body.activities).toEqual(mockActivities);
    });

    it('should pass date filters to service', async () => {
      const mockActivities: AlpacaActivity[] = [];
      mockAlpacaService.getActivities.mockResolvedValue(mockActivities);

      await request(app)
        .get('/api/account/activity?start_date=2024-01-01&end_date=2024-01-31')
        .set('Authorization', `Bearer ${authToken}`);

      expect(mockAlpacaService.getActivities).toHaveBeenCalledWith('2024-01-01', '2024-01-31');
    });

    it('should return 401 without token', async () => {
      const response = await request(app).get('/api/account/activity');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Access token required');
    });
  });
});
