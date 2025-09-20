import request from 'supertest';
import express from 'express';
import { authRoutes } from '../../routes/auth';

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);

describe('Auth Routes', () => {
  describe('GET /api/auth/test-env', () => {
    it('should return environment variable status', async () => {
      const response = await request(app).get('/api/auth/test-env');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('GOOGLE_CLIENT_ID');
      expect(response.body).toHaveProperty('GOOGLE_CLIENT_SECRET');
      expect(response.body).toHaveProperty('GOOGLE_CALLBACK_URL');
    });
  });

  describe('GET /api/auth/test-strategy', () => {
    it('should return strategy information', async () => {
      const response = await request(app).get('/api/auth/test-strategy');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('registeredStrategies');
      expect(response.body).toHaveProperty('hasGoogleStrategy');
    });
  });

  describe('GET /api/auth/google', () => {
    it('should redirect to Google OAuth', async () => {
      const response = await request(app).get('/api/auth/google');

      expect(response.status).toBe(302);
      expect(response.headers.location).toContain('accounts.google.com');
      expect(response.headers.location).toContain('scope=profile%20email');
    });
  });

  describe('GET /api/auth/verify', () => {
    it('should verify valid token', async () => {
      // Mock JWT verification
      const mockJwt = require('jsonwebtoken');
      const originalVerify = mockJwt.verify;
      mockJwt.verify = jest.fn().mockReturnValue({
        userId: 'test-user-id',
        email: 'test@example.com',
        googleId: 'google-123456789',
      });

      const response = await request(app)
        .get('/api/auth/verify')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(response.body.user.id).toBe('test-user-id');
      expect(response.body.user.email).toBe('test@example.com');
      expect(response.body.user.googleId).toBe('google-123456789');

      // Restore original function
      mockJwt.verify = originalVerify;
    });

    it('should reject invalid token', async () => {
      const response = await request(app)
        .get('/api/auth/verify')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Invalid token');
    });

    it('should reject request without token', async () => {
      const response = await request(app).get('/api/auth/verify');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'No token provided');
    });
  });
});
