import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import { accountRoutes } from '../../routes/account';
import { alpacaService } from '../../services/alpacaService';

// Mock the alpaca service
jest.mock('../../services/alpacaService');

const app = express();
app.use(express.json());
app.use('/api/account', accountRoutes);

const mockAlpacaService = alpacaService as jest.Mocked<typeof alpacaService>;

describe('Account Routes', () => {
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

  describe('GET /api/account/info', () => {
    it('should return account info with valid token', async () => {
      const mockAccount = {
        id: 'test-account-id',
        account_number: '123456789',
        status: 'ACTIVE',
        currency: 'USD',
        buying_power: '10000.00',
        portfolio_value: '50000.00'
      };

      mockAlpacaService.getAccount.mockResolvedValue(mockAccount as any);

      const response = await request(app)
        .get('/api/account/info')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('account');
      expect(response.body.account).toEqual(mockAccount);
    });

    it('should return 401 without token', async () => {
      const response = await request(app)
        .get('/api/account/info');

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
          qty: '10',
          side: 'long',
          market_value: '1500.00',
          unrealized_pl: '50.00'
        }
      ];

      mockAlpacaService.getPositions.mockResolvedValue(mockPositions as any);

      const response = await request(app)
        .get('/api/account/positions')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('positions');
      expect(response.body.positions).toEqual(mockPositions);
    });

    it('should return 401 without token', async () => {
      const response = await request(app)
        .get('/api/account/positions');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Access token required');
    });
  });

  describe('GET /api/account/activity', () => {
    it('should return activities with valid token', async () => {
      const mockActivities = [
        {
          id: 'activity-1',
          activity_type: 'FILL',
          transaction_time: '2024-01-01T10:00:00Z',
          symbol: 'AAPL',
          qty: '10',
          side: 'buy'
        }
      ];

      mockAlpacaService.getActivities.mockResolvedValue(mockActivities as any);

      const response = await request(app)
        .get('/api/account/activity')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('activities');
      expect(response.body.activities).toEqual(mockActivities);
    });

    it('should pass date filters to service', async () => {
      const mockActivities: any[] = [];
      mockAlpacaService.getActivities.mockResolvedValue(mockActivities);

      await request(app)
        .get('/api/account/activity?start_date=2024-01-01&end_date=2024-01-31')
        .set('Authorization', `Bearer ${authToken}`);

      expect(mockAlpacaService.getActivities).toHaveBeenCalledWith(
        '2024-01-01',
        '2024-01-31'
      );
    });

    it('should return 401 without token', async () => {
      const response = await request(app)
        .get('/api/account/activity');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Access token required');
    });
  });
});
