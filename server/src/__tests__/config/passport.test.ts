import jwt from 'jsonwebtoken';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { generateToken, googleConfig } from '../../config/passport';
import { secretValidator } from '../../utils/secretValidator';
import { User } from '../../types';

// Mock dependencies
jest.mock('jsonwebtoken');
jest.mock('passport');
jest.mock('passport-google-oauth20');
jest.mock('../../utils/secretValidator');

const mockJwt = jwt as jest.Mocked<typeof jwt>;
const mockPassport = passport as jest.Mocked<typeof passport>;
const mockGoogleStrategy = GoogleStrategy as jest.MockedClass<typeof GoogleStrategy>;
const mockSecretValidator = secretValidator as jest.Mocked<typeof secretValidator>;

describe('Passport Configuration', () => {
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

  describe('Google OAuth Configuration', () => {
    it('should export googleConfig with expected structure', () => {
      expect(googleConfig).toHaveProperty('clientID');
      expect(googleConfig).toHaveProperty('clientSecret');
      expect(googleConfig).toHaveProperty('callbackURL');
    });

    it('should use secretValidator for configuration values', () => {
      // The googleConfig should be using secretValidator.getSecret calls
      // Since the module is imported at the top level, we can verify the structure
      expect(googleConfig.clientID).toBeDefined();
      expect(googleConfig.clientSecret).toBeDefined();
      expect(googleConfig.callbackURL).toBeDefined();
    });

    it('should have fallback values when secrets are not configured', () => {
      mockSecretValidator.getSecret.mockReturnValue(undefined);

      // Re-import to test fallback behavior
      jest.resetModules();
      const { googleConfig: newConfig } = require('../../config/passport');

      expect(newConfig.clientID).toBe('your_google_client_id_here');
      expect(newConfig.clientSecret).toBe('your_google_client_secret_here');
      expect(newConfig.callbackURL).toBe('http://localhost:3001/api/auth/google/callback');
    });
  });

  describe('generateToken Function', () => {
    beforeEach(() => {
      mockSecretValidator.getSecret.mockImplementation((name: string) => {
        if (name === 'JWT_SECRET') {
          return 'test-jwt-secret';
        }
        return undefined;
      });
    });

    it('should generate valid JWT token for user', () => {
      const mockUser: User = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        googleId: 'google-123',
      };

      const mockToken = 'mock-jwt-token';
      (mockJwt.sign as jest.Mock).mockReturnValue(mockToken);

      const result = generateToken(mockUser);

      expect(result).toBe(mockToken);
      expect(mockJwt.sign).toHaveBeenCalledWith(
        {
          userId: 'user-123',
          email: 'test@example.com',
          googleId: 'google-123',
        },
        'test-jwt-secret',
        { expiresIn: '24h' }
      );
    });

    it('should throw error when JWT_SECRET is not configured', () => {
      mockSecretValidator.getSecret.mockReturnValue(undefined);

      const mockUser: User = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        googleId: 'google-123',
      };

      expect(() => generateToken(mockUser)).toThrow('JWT_SECRET not configured');
    });

    it('should handle user without googleId', () => {
      const mockUser: User = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        // googleId is optional
      };

      const mockToken = 'mock-jwt-token';
      (mockJwt.sign as jest.Mock).mockReturnValue(mockToken);

      const result = generateToken(mockUser);

      expect(result).toBe(mockToken);
      expect(mockJwt.sign).toHaveBeenCalledWith(
        {
          userId: 'user-123',
          email: 'test@example.com',
          googleId: undefined,
        },
        'test-jwt-secret',
        { expiresIn: '24h' }
      );
    });

    it('should handle user with auth0Id', () => {
      const mockUser: User = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        auth0Id: 'auth0-123',
      };

      const mockToken = 'mock-jwt-token';
      (mockJwt.sign as jest.Mock).mockReturnValue(mockToken);

      const result = generateToken(mockUser);

      expect(result).toBe(mockToken);
      expect(mockJwt.sign).toHaveBeenCalledWith(
        {
          userId: 'user-123',
          email: 'test@example.com',
          googleId: undefined,
        },
        'test-jwt-secret',
        { expiresIn: '24h' }
      );
    });

    it('should handle user with picture', () => {
      const mockUser: User = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        googleId: 'google-123',
        picture: 'https://example.com/photo.jpg',
      };

      const mockToken = 'mock-jwt-token';
      (mockJwt.sign as jest.Mock).mockReturnValue(mockToken);

      const result = generateToken(mockUser);

      expect(result).toBe(mockToken);
      expect(mockJwt.sign).toHaveBeenCalledWith(
        {
          userId: 'user-123',
          email: 'test@example.com',
          googleId: 'google-123',
        },
        'test-jwt-secret',
        { expiresIn: '24h' }
      );
    });

    it('should handle JWT signing errors', () => {
      mockSecretValidator.getSecret.mockReturnValue('test-jwt-secret');
      mockJwt.sign.mockImplementation(() => {
        throw new Error('JWT signing failed');
      });

      const mockUser: User = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        googleId: 'google-123',
      };

      expect(() => generateToken(mockUser)).toThrow('JWT signing failed');
    });

    it('should handle empty JWT secret', () => {
      mockSecretValidator.getSecret.mockReturnValue('');

      const mockUser: User = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        googleId: 'google-123',
      };

      expect(() => generateToken(mockUser)).toThrow('JWT_SECRET not configured');
    });

    it('should handle null JWT secret', () => {
      mockSecretValidator.getSecret.mockReturnValue(undefined);

      const mockUser: User = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        googleId: 'google-123',
      };

      expect(() => generateToken(mockUser)).toThrow('JWT_SECRET not configured');
    });
  });

  describe('Configuration Validation', () => {
    it('should handle missing GOOGLE_CLIENT_ID', () => {
      mockSecretValidator.hasSecret.mockImplementation((name: string) => {
        return name === 'GOOGLE_CLIENT_SECRET';
      });

      // Re-import the module to trigger validation
      jest.resetModules();
      require('../../config/passport');

      expect(console.warn).toHaveBeenCalledWith(
        '⚠️  Google OAuth strategy not initialized due to missing configuration'
      );
    });

    it('should handle missing GOOGLE_CLIENT_SECRET', () => {
      mockSecretValidator.hasSecret.mockImplementation((name: string) => {
        return name === 'GOOGLE_CLIENT_ID';
      });

      // Re-import the module to trigger validation
      jest.resetModules();
      require('../../config/passport');

      expect(console.warn).toHaveBeenCalledWith(
        '⚠️  Google OAuth strategy not initialized due to missing configuration'
      );
    });

    it('should handle both secrets missing', () => {
      mockSecretValidator.hasSecret.mockReturnValue(false);

      // Re-import the module to trigger validation
      jest.resetModules();
      require('../../config/passport');

      expect(console.warn).toHaveBeenCalledWith(
        '⚠️  Google OAuth strategy not initialized due to missing configuration'
      );
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle malformed user data in generateToken', () => {
      mockSecretValidator.getSecret.mockReturnValue('test-jwt-secret');
      (mockJwt.sign as jest.Mock).mockReturnValue('mock-token');

      const malformedUser = {
        id: '',
        email: '',
        name: '',
      } as User;

      const result = generateToken(malformedUser);

      expect(result).toBe('mock-token');
      expect(mockJwt.sign).toHaveBeenCalledWith(
        {
          userId: '',
          email: '',
          googleId: undefined,
        },
        'test-jwt-secret',
        { expiresIn: '24h' }
      );
    });

    it('should handle user with all optional fields', () => {
      mockSecretValidator.getSecret.mockReturnValue('test-jwt-secret');
      (mockJwt.sign as jest.Mock).mockReturnValue('mock-token');

      const userWithAllFields: User = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        googleId: 'google-123',
        auth0Id: 'auth0-123',
        picture: 'https://example.com/photo.jpg',
      };

      const result = generateToken(userWithAllFields);

      expect(result).toBe('mock-token');
      expect(mockJwt.sign).toHaveBeenCalledWith(
        {
          userId: 'user-123',
          email: 'test@example.com',
          googleId: 'google-123',
        },
        'test-jwt-secret',
        { expiresIn: '24h' }
      );
    });
  });

  describe('Integration Tests', () => {
    it('should handle complete token generation flow', () => {
      // Mock successful configuration
      mockSecretValidator.getSecret.mockImplementation((name: string) => {
        const secrets: Record<string, string> = {
          JWT_SECRET: 'test-jwt-secret',
        };
        return secrets[name] || 'default-value';
      });

      (mockJwt.sign as jest.Mock).mockReturnValue('mock-jwt-token');

      const mockUser: User = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        googleId: 'google-123',
        picture: 'https://example.com/photo.jpg',
      };

      const token = generateToken(mockUser);

      expect(token).toBe('mock-jwt-token');
      expect(mockJwt.sign).toHaveBeenCalledWith(
        {
          userId: 'user-123',
          email: 'test@example.com',
          googleId: 'google-123',
        },
        'test-jwt-secret',
        { expiresIn: '24h' }
      );
    });
  });

  describe('Google OAuth Strategy Initialization', () => {
    beforeEach(() => {
      // Reset modules to test initialization
      jest.resetModules();
    });

    it('should initialize Google OAuth strategy when secrets are available', () => {
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
      require('../../config/passport');

      expect(console.log).toHaveBeenCalledWith('✅ Initializing Google OAuth strategy');
      expect(console.log).toHaveBeenCalledWith('  Config:', {
        clientID: 'test-client-id',
        clientSecret: '***',
        callbackURL: 'http://localhost:3001/api/auth/google/callback',
      });
      expect(mockGoogleStrategy).toHaveBeenCalledWith(
        {
          clientID: 'test-client-id',
          clientSecret: 'test-client-secret',
          callbackURL: 'http://localhost:3001/api/auth/google/callback',
        },
        expect.any(Function)
      );
      expect(mockPassport.use).toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith('✅ Google OAuth strategy initialized successfully');
    });

    it('should handle Google OAuth strategy initialization errors', () => {
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

      // Mock GoogleStrategy constructor to throw an error
      mockGoogleStrategy.mockImplementation(() => {
        throw new Error('Strategy initialization failed');
      });

      // Re-import to trigger initialization
      require('../../config/passport');

      expect(console.error).toHaveBeenCalledWith('❌ Error initializing Google OAuth strategy:', expect.any(Error));
    });

    it('should log config with masked secret when clientSecret is missing', () => {
      mockSecretValidator.hasSecret.mockImplementation((name: string) => {
        return name === 'GOOGLE_CLIENT_ID' || name === 'GOOGLE_CLIENT_SECRET';
      });
      mockSecretValidator.getSecret.mockImplementation((name: string) => {
        const secrets: Record<string, string> = {
          GOOGLE_CLIENT_ID: 'test-client-id',
          GOOGLE_CLIENT_SECRET: '', // Empty secret
          GOOGLE_CALLBACK_URL: 'http://localhost:3001/api/auth/google/callback',
        };
        return secrets[name];
      });

      // Re-import to trigger initialization
      require('../../config/passport');

      expect(console.log).toHaveBeenCalledWith('  Config:', {
        clientID: 'test-client-id',
        clientSecret: 'Missing',
        callbackURL: 'http://localhost:3001/api/auth/google/callback',
      });
    });
  });

  describe('Google OAuth Callback Function', () => {
    let mockCallback: jest.Mock;

    beforeEach(() => {
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

      // Capture the callback function passed to GoogleStrategy
      mockGoogleStrategy.mockImplementation((_config, callback) => {
        mockCallback = jest.fn(callback);
        return {} as unknown as GoogleStrategy;
      });

      // Reset modules and re-import to capture the callback
      jest.resetModules();
      require('../../config/passport');
    });

    it('should create new user when user does not exist', async () => {
      const mockProfile = {
        id: 'google-123',
        emails: [{ value: 'test@example.com' }],
        displayName: 'Test User',
        photos: [{ value: 'https://example.com/photo.jpg' }],
      };

      const mockDone = jest.fn();

      await mockCallback('access-token', 'refresh-token', mockProfile, mockDone);

      expect(console.log).toHaveBeenCalledWith('🔍 Google OAuth callback received:', 'google-123');
      expect(mockDone).toHaveBeenCalledWith(null, {
        id: expect.stringMatching(/^user_\d+$/),
        googleId: 'google-123',
        email: 'test@example.com',
        name: 'Test User',
        picture: 'https://example.com/photo.jpg',
      });
    });

    it('should update existing user when user already exists', async () => {
      // First, create a user
      const mockProfile1 = {
        id: 'google-123',
        emails: [{ value: 'test@example.com' }],
        displayName: 'Test User',
        photos: [{ value: 'https://example.com/photo1.jpg' }],
      };

      const mockDone1 = jest.fn();
      await mockCallback('access-token', 'refresh-token', mockProfile1, mockDone1);

      // Now test updating the same user
      const mockProfile2 = {
        id: 'google-123',
        emails: [{ value: 'updated@example.com' }],
        displayName: 'Updated User',
        photos: [{ value: 'https://example.com/photo2.jpg' }],
      };

      const mockDone2 = jest.fn();
      await mockCallback('access-token', 'refresh-token', mockProfile2, mockDone2);

      expect(mockDone2).toHaveBeenCalledWith(null, {
        id: expect.stringMatching(/^user_\d+$/),
        googleId: 'google-123',
        email: 'updated@example.com',
        name: 'Updated User',
        picture: 'https://example.com/photo2.jpg',
      });
    });

    it('should handle user without picture', async () => {
      const mockProfile = {
        id: 'google-123',
        emails: [{ value: 'test@example.com' }],
        displayName: 'Test User',
        photos: undefined,
      };

      const mockDone = jest.fn();

      await mockCallback('access-token', 'refresh-token', mockProfile, mockDone);

      expect(mockDone).toHaveBeenCalledWith(null, {
        id: expect.stringMatching(/^user_\d+$/),
        googleId: 'google-123',
        email: 'test@example.com',
        name: 'Test User',
      });
    });

    it('should handle user with empty picture array', async () => {
      const mockProfile = {
        id: 'google-123',
        emails: [{ value: 'test@example.com' }],
        displayName: 'Test User',
        photos: [],
      };

      const mockDone = jest.fn();

      await mockCallback('access-token', 'refresh-token', mockProfile, mockDone);

      expect(mockDone).toHaveBeenCalledWith(null, {
        id: expect.stringMatching(/^user_\d+$/),
        googleId: 'google-123',
        email: 'test@example.com',
        name: 'Test User',
      });
    });

    it('should return error when no email is found', async () => {
      const mockProfile = {
        id: 'google-123',
        emails: undefined,
        displayName: 'Test User',
        photos: [{ value: 'https://example.com/photo.jpg' }],
      };

      const mockDone = jest.fn();

      await mockCallback('access-token', 'refresh-token', mockProfile, mockDone);

      expect(mockDone).toHaveBeenCalledWith(new Error('No email found in Google profile'), undefined);
    });

    it('should return error when emails array is empty', async () => {
      const mockProfile = {
        id: 'google-123',
        emails: [],
        displayName: 'Test User',
        photos: [{ value: 'https://example.com/photo.jpg' }],
      };

      const mockDone = jest.fn();

      await mockCallback('access-token', 'refresh-token', mockProfile, mockDone);

      expect(mockDone).toHaveBeenCalledWith(new Error('No email found in Google profile'), undefined);
    });

    it('should handle callback function errors', async () => {
      const mockProfile = {
        id: 'google-123',
        emails: [{ value: 'test@example.com' }],
        displayName: 'Test User',
        photos: [{ value: 'https://example.com/photo.jpg' }],
      };

      // Mock an error in the callback
      const mockError = new Error('Database connection failed');
      jest.spyOn(Array.prototype, 'find').mockImplementation(() => {
        throw mockError;
      });

      const mockDone = jest.fn();

      await mockCallback('access-token', 'refresh-token', mockProfile, mockDone);

      expect(mockDone).toHaveBeenCalledWith(mockError, undefined);
    });
  });

  describe('Passport Serialization', () => {
    beforeEach(() => {
      jest.resetModules();
      require('../../config/passport');
    });

    it('should serialize user by id', () => {
      const mockUser: User = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        googleId: 'google-123',
      };

      const mockDone = jest.fn();

      // Get the serializeUser function that was registered
      const serializeUserCall = mockPassport.serializeUser.mock.calls[0];
      const serializeUser = serializeUserCall[0] as unknown as (
        user: User,
        done: (err: unknown, id?: string) => void
      ) => void;

      serializeUser(mockUser, mockDone);

      expect(mockDone).toHaveBeenCalledWith(null, 'user-123');
    });
  });

  describe('Passport Deserialization', () => {
    let mockCallback: jest.Mock;

    beforeEach(() => {
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

      // Capture the callback function passed to GoogleStrategy
      mockGoogleStrategy.mockImplementation((_config, callback) => {
        mockCallback = jest.fn(callback);
        return {} as unknown as GoogleStrategy;
      });

      // Reset modules and re-import to capture the callback
      jest.resetModules();
      require('../../config/passport');
    });

    it('should deserialize user when user exists', () => {
      // First create a user
      const mockProfile = {
        id: 'google-123',
        emails: [{ value: 'test@example.com' }],
        displayName: 'Test User',
        photos: [{ value: 'https://example.com/photo.jpg' }],
      };

      const mockDone1 = jest.fn();
      mockCallback('access-token', 'refresh-token', mockProfile, mockDone1);

      const createdUser = mockDone1.mock.calls[0][1];
      const userId = createdUser.id;

      // Now test deserialization
      const mockDone2 = jest.fn();

      // Get the deserializeUser function that was registered
      const deserializeUserCall = mockPassport.deserializeUser.mock.calls[0];
      const deserializeUser = deserializeUserCall[0] as unknown as (
        id: string,
        done: (err: unknown, user?: User | null) => void
      ) => void;

      deserializeUser(userId, mockDone2);

      expect(mockDone2).toHaveBeenCalledWith(null, createdUser);
    });

    it('should return null when user does not exist', () => {
      const mockDone = jest.fn();

      // Get the deserializeUser function that was registered
      const deserializeUserCall = mockPassport.deserializeUser.mock.calls[0];
      const deserializeUser = deserializeUserCall[0] as unknown as (
        id: string,
        done: (err: unknown, user?: User | null) => void
      ) => void;

      deserializeUser('non-existent-user-id', mockDone);

      expect(mockDone).toHaveBeenCalledWith(null, null);
    });
  });
});
