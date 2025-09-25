import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import { authRoutes } from '../../routes/auth';

// Mock passport module
jest.mock('passport', () => ({
  authenticate: jest.fn().mockImplementation(() => {
    return (_req: any, res: any, _next: any) => {
      // Default behavior - redirect to Google OAuth
      res.redirect(
        'https://accounts.google.com/o/oauth2/v2/auth?response_type=code&redirect_uri=http%3A%2F%2Flocalhost%3A3001%2Fapi%2Fauth%2Fgoogle%2Fcallback&client_id=704418770769-ojselo8u2i20m2erlctqthq6hapglohu.apps.googleusercontent.com&scope=profile%20email'
      );
    };
  }),
  use: jest.fn(),
  serializeUser: jest.fn(),
  deserializeUser: jest.fn(),
  strategies: {
    google: true,
  },
}));

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);

describe('Auth Routes', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('GET /api/auth/test-env', () => {
    it('should return environment variable status when all are set', async () => {
      process.env.GOOGLE_CLIENT_ID = 'test-client-id';
      process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
      process.env.GOOGLE_CALLBACK_URL = 'http://localhost:3001/callback';

      const response = await request(app).get('/api/auth/test-env');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        GOOGLE_CLIENT_ID: 'Set',
        GOOGLE_CLIENT_SECRET: 'Set',
        GOOGLE_CALLBACK_URL: 'http://localhost:3001/callback',
      });
    });

    it('should return environment variable status when some are missing', async () => {
      delete process.env.GOOGLE_CLIENT_ID;
      delete process.env.GOOGLE_CLIENT_SECRET;
      process.env.GOOGLE_CALLBACK_URL = 'http://localhost:3001/callback';

      const response = await request(app).get('/api/auth/test-env');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        GOOGLE_CLIENT_ID: 'Missing',
        GOOGLE_CLIENT_SECRET: 'Missing',
        GOOGLE_CALLBACK_URL: 'http://localhost:3001/callback',
      });
    });

    it('should return default callback URL when not set', async () => {
      delete process.env.GOOGLE_CALLBACK_URL;

      const response = await request(app).get('/api/auth/test-env');

      expect(response.status).toBe(200);
      expect(response.body.GOOGLE_CALLBACK_URL).toBe('Using default');
    });
  });

  describe('GET /api/auth/test-strategy', () => {
    it('should return strategy information', async () => {
      const response = await request(app).get('/api/auth/test-strategy');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('registeredStrategies');
      expect(response.body).toHaveProperty('hasGoogleStrategy');
      expect(Array.isArray(response.body.registeredStrategies)).toBe(true);
      expect(typeof response.body.hasGoogleStrategy).toBe('boolean');
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

  describe('GET /api/auth/google/callback', () => {
    it('should redirect to Google OAuth (default behavior)', async () => {
      const response = await request(app).get('/api/auth/google/callback');

      expect(response.status).toBe(302);
      expect(response.headers.location).toContain('accounts.google.com');
    });
  });

  describe('GET /api/auth/verify', () => {
    beforeEach(() => {
      process.env.JWT_SECRET = 'test-secret';
    });

    it('should verify valid token', async () => {
      const mockPayload = {
        userId: 'test-user-id',
        email: 'test@example.com',
        googleId: 'google-123456789',
      };

      const token = jwt.sign(mockPayload, 'test-secret', { expiresIn: '1h' });

      const response = await request(app).get('/api/auth/verify').set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        user: {
          id: 'test-user-id',
          email: 'test@example.com',
          googleId: 'google-123456789',
        },
      });
    });

    it('should reject request without authorization header', async () => {
      const response = await request(app).get('/api/auth/verify');

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'No token provided' });
    });

    it('should reject request with malformed authorization header', async () => {
      const response = await request(app).get('/api/auth/verify').set('Authorization', 'InvalidFormat token');

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'No token provided' });
    });

    it('should reject request with empty authorization header', async () => {
      const response = await request(app).get('/api/auth/verify').set('Authorization', '');

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'No token provided' });
    });

    it('should reject invalid token', async () => {
      const response = await request(app).get('/api/auth/verify').set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Invalid token' });
    });

    it('should reject expired token', async () => {
      const expiredPayload = {
        userId: 'test-user-id',
        email: 'test@example.com',
        googleId: 'google-123456789',
      };

      const expiredToken = jwt.sign(expiredPayload, 'test-secret', { expiresIn: '-1h' });

      const response = await request(app).get('/api/auth/verify').set('Authorization', `Bearer ${expiredToken}`);

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Invalid token' });
    });

    it('should reject token signed with wrong secret', async () => {
      const payload = {
        userId: 'test-user-id',
        email: 'test@example.com',
        googleId: 'google-123456789',
      };

      const wrongSecretToken = jwt.sign(payload, 'wrong-secret', { expiresIn: '1h' });

      const response = await request(app).get('/api/auth/verify').set('Authorization', `Bearer ${wrongSecretToken}`);

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Invalid token' });
    });

    it('should handle missing JWT_SECRET', async () => {
      delete process.env.JWT_SECRET;

      const response = await request(app).get('/api/auth/verify').set('Authorization', 'Bearer some-token');

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Invalid token' });
    });

    it('should handle malformed Bearer token', async () => {
      const response = await request(app).get('/api/auth/verify').set('Authorization', 'Bearer ');

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'No token provided' });
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should return success message', async () => {
      const response = await request(app).post('/api/auth/logout');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ message: 'Logged out successfully' });
    });
  });

  describe('Integration Tests', () => {
    describe('Basic OAuth Flow', () => {
      it('should handle OAuth initiation and callback redirect', async () => {
        // Step 1: Initiate OAuth
        const oauthResponse = await request(app).get('/api/auth/google');
        expect(oauthResponse.status).toBe(302);
        expect(oauthResponse.headers.location).toContain('accounts.google.com');

        // Step 2: Callback redirects to Google OAuth
        const callbackResponse = await request(app).get('/api/auth/google/callback');
        expect(callbackResponse.status).toBe(302);
        expect(callbackResponse.headers.location).toContain('accounts.google.com');

        // Step 3: Verify token works independently
        process.env.JWT_SECRET = 'test-secret';
        const mockPayload = {
          userId: 'integration-user',
          email: 'integration@example.com',
          googleId: 'google-integration-123',
        };
        const token = jwt.sign(mockPayload, 'test-secret', { expiresIn: '1h' });

        const verifyResponse = await request(app).get('/api/auth/verify').set('Authorization', `Bearer ${token}`);

        expect(verifyResponse.status).toBe(200);
        expect(verifyResponse.body.user).toBeDefined();

        // Step 4: Logout
        const logoutResponse = await request(app).post('/api/auth/logout');
        expect(logoutResponse.status).toBe(200);
        expect(logoutResponse.body.message).toBe('Logged out successfully');
      });
    });

    describe('JWT Token Edge Cases', () => {
      it('should handle token with missing required fields', async () => {
        process.env.JWT_SECRET = 'test-secret';

        // Create token with missing googleId
        const incompletePayload = {
          userId: 'incomplete-user',
          email: 'incomplete@example.com',
          // googleId is missing
        };

        const token = jwt.sign(incompletePayload, 'test-secret', { expiresIn: '1h' });

        const response = await request(app).get('/api/auth/verify').set('Authorization', `Bearer ${token}`);

        expect(response.status).toBe(200);
        expect(response.body.user.id).toBe('incomplete-user');
        expect(response.body.user.email).toBe('incomplete@example.com');
        expect(response.body.user.googleId).toBeUndefined();
      });

      it('should handle token with extra fields', async () => {
        process.env.JWT_SECRET = 'test-secret';

        const payloadWithExtra = {
          userId: 'extra-user',
          email: 'extra@example.com',
          googleId: 'google-extra-123',
          extraField: 'should-be-ignored',
          anotherField: 12345,
        };

        const token = jwt.sign(payloadWithExtra, 'test-secret', { expiresIn: '1h' });

        const response = await request(app).get('/api/auth/verify').set('Authorization', `Bearer ${token}`);

        expect(response.status).toBe(200);
        expect(response.body.user).toEqual({
          id: 'extra-user',
          email: 'extra@example.com',
          googleId: 'google-extra-123',
        });
      });
    });

    describe('Authorization Header Edge Cases', () => {
      it('should handle authorization header with extra spaces', async () => {
        process.env.JWT_SECRET = 'test-secret';

        const payload = {
          userId: 'space-user',
          email: 'space@example.com',
          googleId: 'google-space-123',
        };

        const token = jwt.sign(payload, 'test-secret', { expiresIn: '1h' });

        const response = await request(app).get('/api/auth/verify').set('Authorization', `  Bearer   ${token}  `);

        expect(response.status).toBe(401);
        expect(response.body).toEqual({ error: 'Invalid token' });
      });

      it('should handle authorization header with case variations', async () => {
        process.env.JWT_SECRET = 'test-secret';

        const payload = {
          userId: 'case-user',
          email: 'case@example.com',
          googleId: 'google-case-123',
        };

        const token = jwt.sign(payload, 'test-secret', { expiresIn: '1h' });

        const response = await request(app).get('/api/auth/verify').set('Authorization', `bearer ${token}`);

        expect(response.status).toBe(401);
        expect(response.body).toEqual({ error: 'No token provided' });
      });
    });
  });
});
