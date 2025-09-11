import request from 'supertest';
import express from 'express';
import { authRoutes } from '../../routes/auth';

// Mock the auth0 config
jest.mock('../../config/auth0', () => ({
  auth0Config: {
    domain: 'test-tenant.auth0.com',
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
    audience: 'https://test-tenant.auth0.com/api/v2/',
    issuer: 'https://test-tenant.auth0.com/'
  },
  verifyAuth0Token: jest.fn(),
  createOrUpdateUser: jest.fn(),
  generateToken: jest.fn()
}));

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);

describe('Auth Routes', () => {
  describe('GET /api/auth/login', () => {
    it('should redirect to Auth0 login', async () => {
      const response = await request(app)
        .get('/api/auth/login');

      expect(response.status).toBe(302);
      expect(response.headers.location).toContain('test-tenant.auth0.com');
      expect(response.headers.location).toContain('response_type=code');
      expect(response.headers.location).toContain('client_id=test-client-id');
    });
  });

  describe('POST /api/auth/callback', () => {
    it('should handle successful Auth0 callback', async () => {
      const { verifyAuth0Token, createOrUpdateUser, generateToken } = require('../../config/auth0');
      
      const mockAuth0User = {
        sub: 'auth0|123456789',
        email: 'test@example.com',
        name: 'Test User',
        picture: 'https://example.com/photo.jpg'
      };
      
      const mockUser = {
        id: 'user-123',
        auth0Id: 'auth0|123456789',
        email: 'test@example.com',
        name: 'Test User',
        picture: 'https://example.com/photo.jpg'
      };

      verifyAuth0Token.mockResolvedValue(mockAuth0User);
      createOrUpdateUser.mockResolvedValue(mockUser);
      generateToken.mockReturnValue('jwt-token');

      const response = await request(app)
        .post('/api/auth/callback')
        .send({ code: 'auth-code' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('token', 'jwt-token');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe('test@example.com');
      expect(response.body.user.auth0Id).toBe('auth0|123456789');
    });

    it('should reject missing authorization code', async () => {
      const response = await request(app)
        .post('/api/auth/callback')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Authorization code required');
    });

    it('should handle Auth0 token exchange failure', async () => {
      // Mock fetch to return error
      global.fetch = jest.fn().mockResolvedValue({
        json: () => Promise.resolve({ error: 'invalid_grant' })
      });

      const response = await request(app)
        .post('/api/auth/callback')
        .send({ code: 'invalid-code' });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Failed to get access token');
    });
  });

  describe('GET /api/auth/verify', () => {
    it('should verify valid token', async () => {
      const mockDecoded = {
        userId: 'test-user-id',
        email: 'test@example.com',
        auth0Id: 'auth0|123456789'
      };

      const jwt = require('jsonwebtoken');
      jest.spyOn(jwt, 'verify').mockReturnValue(mockDecoded);

      const response = await request(app)
        .get('/api/auth/verify')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.id).toBe('test-user-id');
      expect(response.body.user.email).toBe('test@example.com');
      expect(response.body.user.auth0Id).toBe('auth0|123456789');
    });

    it('should reject invalid token', async () => {
      const response = await request(app)
        .get('/api/auth/verify')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Invalid token');
    });

    it('should reject missing token', async () => {
      const response = await request(app)
        .get('/api/auth/verify');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'No token provided');
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should logout successfully', async () => {
      const response = await request(app)
        .post('/api/auth/logout');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message', 'Logged out successfully');
    });
  });
});
