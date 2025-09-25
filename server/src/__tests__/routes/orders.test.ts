import request from 'supertest';
import express from 'express';
import { alpacaService } from '../../services/alpacaService';
import { orderRoutes } from '../../routes/orders';
import { CreateOrderResponse } from '../../types';

// Mock the alpacaService
jest.mock('../../services/alpacaService');
const mockedAlpacaService = alpacaService as jest.Mocked<typeof alpacaService>;

// Mock auth middleware
jest.mock('../../middleware/auth', () => ({
  authenticateToken: (req: any, _res: any, next: any) => {
    req.user = { id: 'test-user' };
    next();
  },
  requireAuth: (_req: any, _res: any, next: any) => {
    next();
  },
}));

const app = express();
app.use(express.json());
app.use('/api/orders', orderRoutes);

describe('Orders Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/orders/sell', () => {
    it('should create a sell order successfully', async () => {
      const mockOrder: CreateOrderResponse = {
        id: 'order-123',
        client_order_id: 'client-123',
        created_at: '2024-01-01T10:00:00.000Z',
        updated_at: '2024-01-01T10:00:00.000Z',
        submitted_at: '2024-01-01T10:00:00.000Z',
        asset_id: 'asset-123',
        symbol: 'AAPL',
        asset_class: 'us_equity',
        qty: '10',
        filled_qty: '0',
        order_class: 'simple',
        order_type: 'limit',
        type: 'limit',
        side: 'sell',
        time_in_force: 'day',
        limit_price: '150.50',
        status: 'new',
        extended_hours: false,
      };

      mockedAlpacaService.createOrder.mockResolvedValue(mockOrder);

      const orderData = {
        symbol: 'AAPL',
        quantity: 10,
        limit_price: 150.5,
        time_in_force: 'day',
      };

      const response = await request(app).post('/api/orders/sell').send(orderData).expect(201);

      expect(response.body).toEqual({
        message: 'Order created successfully',
        order: mockOrder,
      });

      expect(mockedAlpacaService.createOrder).toHaveBeenCalledWith({
        symbol: 'AAPL',
        qty: 10,
        side: 'sell',
        type: 'limit',
        time_in_force: 'day',
        limit_price: 150.5,
      });
    });

    it('should use default time_in_force when not provided', async () => {
      const mockOrder: CreateOrderResponse = {
        id: 'order-123',
        client_order_id: 'client-123',
        created_at: '2024-01-01T10:00:00.000Z',
        updated_at: '2024-01-01T10:00:00.000Z',
        submitted_at: '2024-01-01T10:00:00.000Z',
        asset_id: 'asset-123',
        symbol: 'AAPL',
        asset_class: 'us_equity',
        qty: '10',
        filled_qty: '0',
        order_class: 'simple',
        order_type: 'limit',
        type: 'limit',
        side: 'sell',
        time_in_force: 'day',
        limit_price: '150.50',
        status: 'new',
        extended_hours: false,
      };

      mockedAlpacaService.createOrder.mockResolvedValue(mockOrder);

      const orderData = {
        symbol: 'AAPL',
        quantity: 10,
        limit_price: 150.5,
      };

      await request(app).post('/api/orders/sell').send(orderData).expect(201);

      expect(mockedAlpacaService.createOrder).toHaveBeenCalledWith({
        symbol: 'AAPL',
        qty: 10,
        side: 'sell',
        type: 'limit',
        time_in_force: 'day',
        limit_price: 150.5,
      });
    });

    it('should return 400 for validation errors', async () => {
      const invalidOrderData = {
        symbol: '', // Invalid: empty string
        quantity: -1, // Invalid: negative
        limit_price: 0, // Invalid: zero
      };

      const response = await request(app).post('/api/orders/sell').send(invalidOrderData).expect(400);

      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details).toBeDefined();
    });

    it('should return 400 for invalid time_in_force', async () => {
      const invalidOrderData = {
        symbol: 'AAPL',
        quantity: 10,
        limit_price: 150.5,
        time_in_force: 'invalid',
      };

      const response = await request(app).post('/api/orders/sell').send(invalidOrderData).expect(400);

      expect(response.body.error).toBe('Validation failed');
    });

    it('should handle service errors', async () => {
      mockedAlpacaService.createOrder.mockRejectedValue(new Error('Service error'));

      const orderData = {
        symbol: 'AAPL',
        quantity: 10,
        limit_price: 150.5,
      };

      const response = await request(app).post('/api/orders/sell').send(orderData).expect(500);

      expect(response.body).toEqual({
        error: 'Failed to create order',
      });
    });

    it('should convert symbol to uppercase', async () => {
      const mockOrder: CreateOrderResponse = {
        id: 'order-123',
        client_order_id: 'client-123',
        created_at: '2024-01-01T10:00:00.000Z',
        updated_at: '2024-01-01T10:00:00.000Z',
        submitted_at: '2024-01-01T10:00:00.000Z',
        asset_id: 'asset-123',
        symbol: 'AAPL',
        asset_class: 'us_equity',
        qty: '10',
        filled_qty: '0',
        order_class: 'simple',
        order_type: 'limit',
        type: 'limit',
        side: 'sell',
        time_in_force: 'day',
        limit_price: '150.50',
        status: 'new',
        extended_hours: false,
      };

      mockedAlpacaService.createOrder.mockResolvedValue(mockOrder);

      const orderData = {
        symbol: 'aapl', // lowercase
        quantity: 10,
        limit_price: 150.5,
      };

      await request(app).post('/api/orders/sell').send(orderData).expect(201);

      expect(mockedAlpacaService.createOrder).toHaveBeenCalledWith({
        symbol: 'AAPL', // Should be uppercase
        qty: 10,
        side: 'sell',
        type: 'limit',
        time_in_force: 'day',
        limit_price: 150.5,
      });
    });
  });

  describe('POST /api/orders/buy', () => {
    it('should create a buy order successfully', async () => {
      const mockOrder: CreateOrderResponse = {
        id: 'order-123',
        client_order_id: 'client-123',
        created_at: '2024-01-01T10:00:00.000Z',
        updated_at: '2024-01-01T10:00:00.000Z',
        submitted_at: '2024-01-01T10:00:00.000Z',
        asset_id: 'asset-123',
        symbol: 'AAPL',
        asset_class: 'us_equity',
        qty: '10',
        filled_qty: '0',
        order_class: 'simple',
        order_type: 'limit',
        type: 'limit',
        side: 'buy',
        time_in_force: 'day',
        limit_price: '150.50',
        status: 'new',
        extended_hours: false,
      };

      mockedAlpacaService.createOrder.mockResolvedValue(mockOrder);

      const orderData = {
        symbol: 'AAPL',
        quantity: 10,
        type: 'limit',
        limit_price: 150.5,
        time_in_force: 'day',
      };

      const response = await request(app).post('/api/orders/buy').send(orderData).expect(201);

      expect(response.body).toEqual({
        message: 'Order created successfully',
        order: mockOrder,
      });

      expect(mockedAlpacaService.createOrder).toHaveBeenCalledWith({
        symbol: 'AAPL',
        qty: 10,
        side: 'buy',
        type: 'limit',
        time_in_force: 'day',
        limit_price: 150.5,
      });
    });

    it('should handle service errors for buy orders', async () => {
      mockedAlpacaService.createOrder.mockRejectedValue(new Error('Service error'));

      const orderData = {
        symbol: 'AAPL',
        quantity: 10,
        limit_price: 150.5,
      };

      const response = await request(app).post('/api/orders/buy').send(orderData).expect(500);

      expect(response.body).toEqual({
        error: 'Failed to create order',
      });
    });
  });
});
