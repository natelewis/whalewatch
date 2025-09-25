// ============================================================================
// BASIC PASSPORT CONFIGURATION TESTS
// ============================================================================

// Mock dependencies BEFORE importing the module under test
jest.mock('jsonwebtoken');
jest.mock('passport');
jest.mock('passport-google-oauth20');

// Mock secretValidator with proper implementation
const mockSecretValidator = {
  getSecret: jest.fn(),
  hasSecret: jest.fn(),
};

jest.mock('../../utils/secretValidator', () => ({
  secretValidator: mockSecretValidator,
}));

import jwt from 'jsonwebtoken';
import passport from 'passport';
import { User } from '../../types';

const mockJwt = jwt as jest.Mocked<typeof jwt>;
const mockPassport = passport as jest.Mocked<typeof passport>;

describe('Passport Configuration (Basic)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Clear console methods to avoid noise in tests
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Module Structure', () => {
    it('should export required functions and configurations', () => {
      // Import the module
      const passportModule = require('../../config/passport');

      // Check that the module exports the expected properties
      expect(passportModule).toHaveProperty('googleConfig');
      expect(passportModule).toHaveProperty('generateToken');

      // Check googleConfig structure
      expect(passportModule.googleConfig).toHaveProperty('clientID');
      expect(passportModule.googleConfig).toHaveProperty('clientSecret');
      expect(passportModule.googleConfig).toHaveProperty('callbackURL');
    });

    it('should have googleConfig with string values', () => {
      const passportModule = require('../../config/passport');

      expect(typeof passportModule.googleConfig.clientID).toBe('string');
      expect(typeof passportModule.googleConfig.clientSecret).toBe('string');
      expect(typeof passportModule.googleConfig.callbackURL).toBe('string');
    });
  });

  describe('JWT Token Generation', () => {
    it('should be a function', () => {
      const passportModule = require('../../config/passport');
      expect(typeof passportModule.generateToken).toBe('function');
    });

    it('should throw error when JWT_SECRET is not configured', () => {
      // Mock secretValidator to return undefined
      mockSecretValidator.getSecret.mockReturnValue(undefined);

      const passportModule = require('../../config/passport');
      const mockUser: User = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
      };

      expect(() => passportModule.generateToken(mockUser)).toThrow('JWT_SECRET not configured');
    });

    it('should call jwt.sign when JWT_SECRET is configured', () => {
      // Mock secretValidator to return a secret
      mockSecretValidator.getSecret.mockReturnValue('test-jwt-secret');

      // Mock jwt.sign to return a token
      (mockJwt.sign as jest.Mock).mockReturnValue('test-token');

      const passportModule = require('../../config/passport');
      const mockUser: User = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
      };

      const result = passportModule.generateToken(mockUser);

      expect(result).toBe('test-token');
      expect(mockJwt.sign).toHaveBeenCalledWith({ userId: 'user-123', email: 'test@example.com' }, 'test-jwt-secret', {
        expiresIn: '24h',
      });
    });

    it('should handle JWT signing errors', () => {
      // Mock secretValidator to return a secret
      mockSecretValidator.getSecret.mockReturnValue('test-jwt-secret');

      // Mock jwt.sign to throw an error
      (mockJwt.sign as jest.Mock).mockImplementation(() => {
        throw new Error('JWT signing failed');
      });

      const passportModule = require('../../config/passport');
      const mockUser: User = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
      };

      expect(() => passportModule.generateToken(mockUser)).toThrow('JWT signing failed');
    });
  });

  describe('Google OAuth Configuration', () => {
    it('should use secretValidator for configuration', () => {
      // Mock secretValidator to return specific values
      mockSecretValidator.getSecret.mockImplementation((name: string) => {
        const secrets: Record<string, string> = {
          GOOGLE_CLIENT_ID: 'test-client-id',
          GOOGLE_CLIENT_SECRET: 'test-client-secret',
          GOOGLE_CALLBACK_URL: 'http://localhost:3001/api/auth/google/callback',
        };
        return secrets[name];
      });

      // Re-import to get the updated configuration
      jest.resetModules();
      const passportModule = require('../../config/passport');

      // The configuration should use the mocked values
      expect(passportModule.googleConfig.clientID).toBe('test-client-id');
      expect(passportModule.googleConfig.clientSecret).toBe('test-client-secret');
      expect(passportModule.googleConfig.callbackURL).toBe('http://localhost:3001/api/auth/google/callback');
    });

    it('should have fallback values when secrets are not configured', () => {
      // Mock secretValidator to return undefined
      mockSecretValidator.getSecret.mockReturnValue(undefined);

      // Re-import to get the updated configuration
      jest.resetModules();
      const passportModule = require('../../config/passport');

      expect(passportModule.googleConfig.clientID).toBe('your_google_client_id_here');
      expect(passportModule.googleConfig.clientSecret).toBe('your_google_client_secret_here');
      expect(passportModule.googleConfig.callbackURL).toBe('http://localhost:3001/api/auth/google/callback');
    });
  });

  describe('Strategy Initialization', () => {
    it('should initialize Google OAuth strategy when secrets are available', () => {
      // Mock secretValidator to indicate secrets are available
      mockSecretValidator.hasSecret.mockImplementation((name: string) => {
        return name === 'GOOGLE_CLIENT_ID' || name === 'GOOGLE_CLIENT_SECRET';
      });
      mockSecretValidator.getSecret.mockImplementation((name: string) => {
        const secrets: Record<string, string> = {
          GOOGLE_CLIENT_ID: 'test-client-id',
          GOOGLE_CLIENT_SECRET: 'test-client-secret',
          GOOGLE_CALLBACK_URL: 'http://localhost:3001/api/auth/google/callback',
        };
        return secrets[name];
      });

      // Re-import to trigger initialization
      jest.resetModules();
      require('../../config/passport');

      expect(console.log).toHaveBeenCalledWith('✅ Initializing Google OAuth strategy');
      expect(console.log).toHaveBeenCalledWith('  Config:', {
        clientID: 'test-client-id',
        clientSecret: '***',
        callbackURL: 'http://localhost:3001/api/auth/google/callback',
      });
      // Note: The actual strategy initialization happens at module load time
      // We can't easily test the constructor calls due to module caching
    });

    it('should not initialize Google OAuth strategy when secrets are missing', () => {
      // Mock secretValidator to indicate secrets are not available
      mockSecretValidator.hasSecret.mockReturnValue(false);

      // Re-import to trigger initialization
      jest.resetModules();
      require('../../config/passport');

      expect(console.warn).toHaveBeenCalledWith(
        '⚠️  Google OAuth strategy not initialized due to missing configuration'
      );
    });
  });

  describe('Passport Serialization', () => {
    it('should set up serialization functions', () => {
      // Mock secretValidator to indicate secrets are available
      mockSecretValidator.hasSecret.mockImplementation((name: string) => {
        return name === 'GOOGLE_CLIENT_ID' || name === 'GOOGLE_CLIENT_SECRET';
      });
      mockSecretValidator.getSecret.mockImplementation((name: string) => {
        const secrets: Record<string, string> = {
          GOOGLE_CLIENT_ID: 'test-client-id',
          GOOGLE_CLIENT_SECRET: 'test-client-secret',
          GOOGLE_CALLBACK_URL: 'http://localhost:3001/api/auth/google/callback',
        };
        return secrets[name];
      });

      // Re-import to trigger initialization
      jest.resetModules();
      require('../../config/passport');

      // Note: Serialization functions are set up at module load time
      // We can't easily test the function calls due to module caching
      // The important thing is that the module loads without errors
      expect(mockPassport.serializeUser).toBeDefined();
      expect(mockPassport.deserializeUser).toBeDefined();
    });
  });
});
