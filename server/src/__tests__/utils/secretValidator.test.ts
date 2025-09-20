import { SecretValidator } from '../../utils/secretValidator';

// Mock console methods to avoid cluttering test output
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

describe('SecretValidator', () => {
  let secretValidator: SecretValidator;
  let originalEnv: Record<string, string | undefined>;

  // Helper function to create a new validator instance
  const createValidator = () => new SecretValidator();

  beforeEach(() => {
    // Store original environment
    originalEnv = { ...process.env };

    // Clear all environment variables
    Object.keys(process.env).forEach((key) => {
      if (
        key.startsWith('ALPACA_') ||
        key.startsWith('JWT_') ||
        key.startsWith('GOOGLE_') ||
        key.startsWith('SESSION_') ||
        key.startsWith('PORT') ||
        key.startsWith('NODE_ENV') ||
        key.startsWith('CORS_') ||
        key.startsWith('TEST_')
      ) {
        delete process.env[key];
      }
    });

    // Mock console methods
    console.log = jest.fn();
    console.error = jest.fn();
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;

    // Restore console methods
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
  });

  describe('constructor and initialization', () => {
    it('should initialize with all required secrets', () => {
      secretValidator = createValidator();
      expect(secretValidator).toBeDefined();
    });

    it('should have all expected secrets configured', () => {
      secretValidator = createValidator();
      const authSecrets = secretValidator.getSecretsByCategory('auth');
      const tradingSecrets = secretValidator.getSecretsByCategory('trading');
      const serverSecrets = secretValidator.getSecretsByCategory('server');
      const testSecrets = secretValidator.getSecretsByCategory('test');

      expect(authSecrets.length).toBeGreaterThan(0);
      expect(tradingSecrets.length).toBeGreaterThan(0);
      expect(serverSecrets.length).toBeGreaterThan(0);
      expect(testSecrets.length).toBeGreaterThan(0);
    });
  });

  describe('validateSecrets', () => {
    it('should return invalid when required secrets are missing', () => {
      secretValidator = createValidator();
      const result = secretValidator.validateSecrets();

      expect(result.isValid).toBe(false);
      expect(result.missingSecrets.length).toBeGreaterThan(0);
      expect(result.summary.missing).toBeGreaterThan(0);
      expect(result.summary.present).toBe(0);
    });

    it('should return valid when all required secrets are present', () => {
      // Set all required secrets
      process.env.ALPACA_API_KEY = 'test-api-key';
      process.env.ALPACA_SECRET_KEY = 'test-secret-key';
      process.env.JWT_SECRET = 'test-jwt-secret';
      process.env.GOOGLE_CLIENT_ID = 'test-google-client-id';
      process.env.GOOGLE_CLIENT_SECRET = 'test-google-client-secret';
      process.env.SESSION_SECRET = 'test-session-secret';

      secretValidator = createValidator();
      const result = secretValidator.validateSecrets();

      expect(result.isValid).toBe(true);
      expect(result.missingSecrets).toHaveLength(0);
      expect(result.summary.missing).toBe(0);
    });

    it('should include warnings for optional secrets', () => {
      // Set only required secrets
      process.env.ALPACA_API_KEY = 'test-api-key';
      process.env.ALPACA_SECRET_KEY = 'test-secret-key';
      process.env.JWT_SECRET = 'test-jwt-secret';
      process.env.GOOGLE_CLIENT_ID = 'test-google-client-id';
      process.env.GOOGLE_CLIENT_SECRET = 'test-google-client-secret';
      process.env.SESSION_SECRET = 'test-session-secret';

      secretValidator = createValidator();
      const result = secretValidator.validateSecrets();

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some((warning) => warning.includes('optional'))).toBe(true);
    });

    it('should handle empty string values as missing', () => {
      process.env.ALPACA_API_KEY = '';
      process.env.ALPACA_SECRET_KEY = '   '; // whitespace only
      process.env.JWT_SECRET = 'test-jwt-secret';
      process.env.GOOGLE_CLIENT_ID = 'test-google-client-id';
      process.env.GOOGLE_CLIENT_SECRET = 'test-google-client-secret';
      process.env.SESSION_SECRET = 'test-session-secret';

      secretValidator = createValidator();
      const result = secretValidator.validateSecrets();

      expect(result.isValid).toBe(false);
      expect(result.missingSecrets).toContain('ALPACA_API_KEY');
      expect(result.missingSecrets).toContain('ALPACA_SECRET_KEY');
    });

    it('should provide correct summary statistics', () => {
      // Set some secrets
      process.env.ALPACA_API_KEY = 'test-api-key';
      process.env.JWT_SECRET = 'test-jwt-secret';
      process.env.PORT = '3001';

      secretValidator = createValidator();
      const result = secretValidator.validateSecrets();

      expect(result.summary.total).toBeGreaterThan(0);
      expect(result.summary.required).toBeGreaterThan(0);
      expect(result.summary.present).toBe(3); // ALPACA_API_KEY, JWT_SECRET, and PORT
      expect(result.summary.missing).toBeGreaterThan(0);
    });

    it('should log validation results to console', () => {
      secretValidator = createValidator();
      secretValidator.validateSecrets();

      expect(console.log).toHaveBeenCalledWith('🔍 Environment Configuration Check:');
      expect(console.log).toHaveBeenCalledWith('=====================================');
    });
  });

  describe('getSecret', () => {
    it('should return secret value when present', () => {
      process.env.ALPACA_API_KEY = 'test-api-key';
      secretValidator = createValidator();

      const value = secretValidator.getSecret('ALPACA_API_KEY');

      expect(value).toBe('test-api-key');
    });

    it('should return undefined when secret is not present', () => {
      secretValidator = createValidator();
      const value = secretValidator.getSecret('ALPACA_API_KEY');

      expect(value).toBeUndefined();
    });

    it('should return undefined for non-existent secret', () => {
      secretValidator = createValidator();
      const value = secretValidator.getSecret('NON_EXISTENT_SECRET');

      expect(value).toBeUndefined();
    });
  });

  describe('hasSecret', () => {
    it('should return true when secret is present and not empty', () => {
      process.env.ALPACA_API_KEY = 'test-api-key';
      secretValidator = createValidator();

      const hasSecret = secretValidator.hasSecret('ALPACA_API_KEY');

      expect(hasSecret).toBe(true);
    });

    it('should return false when secret is not present', () => {
      secretValidator = createValidator();
      const hasSecret = secretValidator.hasSecret('ALPACA_API_KEY');

      expect(hasSecret).toBe(false);
    });

    it('should return false when secret is empty string', () => {
      process.env.ALPACA_API_KEY = '';
      secretValidator = createValidator();

      const hasSecret = secretValidator.hasSecret('ALPACA_API_KEY');

      expect(hasSecret).toBe(false);
    });

    it('should return false when secret is whitespace only', () => {
      process.env.ALPACA_API_KEY = '   ';
      secretValidator = createValidator();

      const hasSecret = secretValidator.hasSecret('ALPACA_API_KEY');

      expect(hasSecret).toBe(false);
    });
  });

  describe('getSecretsByCategory', () => {
    it('should return auth secrets', () => {
      secretValidator = createValidator();
      const authSecrets = secretValidator.getSecretsByCategory('auth');

      expect(authSecrets.length).toBeGreaterThan(0);
      expect(
        authSecrets.every((secret) =>
          [
            'JWT_SECRET',
            'JWT_EXPIRES_IN',
            'GOOGLE_CLIENT_ID',
            'GOOGLE_CLIENT_SECRET',
            'GOOGLE_CALLBACK_URL',
            'SESSION_SECRET',
          ].includes(secret.name)
        )
      ).toBe(true);
    });

    it('should return trading secrets', () => {
      secretValidator = createValidator();
      const tradingSecrets = secretValidator.getSecretsByCategory('trading');

      expect(tradingSecrets.length).toBeGreaterThan(0);
      expect(
        tradingSecrets.every((secret) =>
          ['ALPACA_API_KEY', 'ALPACA_SECRET_KEY', 'ALPACA_BASE_URL', 'ALPACA_DATA_URL'].includes(
            secret.name
          )
        )
      ).toBe(true);
    });

    it('should return server secrets', () => {
      secretValidator = createValidator();
      const serverSecrets = secretValidator.getSecretsByCategory('server');

      expect(serverSecrets.length).toBeGreaterThan(0);
      expect(
        serverSecrets.every((secret) => ['PORT', 'NODE_ENV', 'CORS_ORIGIN'].includes(secret.name))
      ).toBe(true);
    });

    it('should return test secrets', () => {
      secretValidator = createValidator();
      const testSecrets = secretValidator.getSecretsByCategory('test');

      expect(testSecrets.length).toBeGreaterThan(0);
      expect(
        testSecrets.every((secret) =>
          ['TEST_ALPACA_API_KEY', 'TEST_ALPACA_SECRET_KEY'].includes(secret.name)
        )
      ).toBe(true);
    });
  });

  describe('test environment specific behavior', () => {
    it('should require test secrets when NODE_ENV is test', () => {
      process.env.NODE_ENV = 'test';

      // Create new instance to pick up NODE_ENV
      const testValidator = createValidator();
      const result = testValidator.validateSecrets();

      expect(result.missingSecrets).toContain('TEST_ALPACA_API_KEY');
      expect(result.missingSecrets).toContain('TEST_ALPACA_SECRET_KEY');
    });

    it('should not require test secrets when NODE_ENV is not test', () => {
      process.env.NODE_ENV = 'development';

      // Create new instance to pick up NODE_ENV
      const devValidator = createValidator();
      const result = devValidator.validateSecrets();

      expect(result.missingSecrets).not.toContain('TEST_ALPACA_API_KEY');
      expect(result.missingSecrets).not.toContain('TEST_ALPACA_SECRET_KEY');
    });
  });

  describe('secret configuration properties', () => {
    it('should have correct properties for each secret', () => {
      secretValidator = createValidator();
      const authSecrets = secretValidator.getSecretsByCategory('auth');

      authSecrets.forEach((secret) => {
        expect(secret).toHaveProperty('name');
        expect(secret).toHaveProperty('value');
        expect(secret).toHaveProperty('required');
        expect(secret).toHaveProperty('description');
        expect(typeof secret.name).toBe('string');
        expect(typeof secret.required).toBe('boolean');
        expect(typeof secret.description).toBe('string');
      });
    });

    it('should have maskValue property for sensitive secrets', () => {
      secretValidator = createValidator();
      const tradingSecrets = secretValidator.getSecretsByCategory('trading');

      const sensitiveSecrets = tradingSecrets.filter(
        (secret) => secret.name.includes('KEY') || secret.name.includes('SECRET')
      );

      sensitiveSecrets.forEach((secret) => {
        expect(secret.maskValue).toBe(true);
      });
    });
  });

  describe('helper methods', () => {
    describe('getMissingSecrets', () => {
      it('should return only required secrets that are missing', () => {
        process.env.JWT_SECRET = 'test-jwt-secret';
        secretValidator = createValidator();

        const missingSecrets = secretValidator.getMissingSecrets();

        expect(missingSecrets.length).toBeGreaterThan(0);
        expect(missingSecrets.every((secret) => secret.required)).toBe(true);
        expect(missingSecrets.some((secret) => secret.name === 'ALPACA_API_KEY')).toBe(true);
        expect(missingSecrets.some((secret) => secret.name === 'JWT_SECRET')).toBe(false);
      });
    });

    describe('getPresentSecrets', () => {
      it('should return only secrets that are present', () => {
        process.env.ALPACA_API_KEY = 'test-api-key';
        process.env.JWT_SECRET = 'test-jwt-secret';
        secretValidator = createValidator();

        const presentSecrets = secretValidator.getPresentSecrets();

        expect(presentSecrets.length).toBe(2);
        expect(presentSecrets.some((secret) => secret.name === 'ALPACA_API_KEY')).toBe(true);
        expect(presentSecrets.some((secret) => secret.name === 'JWT_SECRET')).toBe(true);
      });
    });

    describe('getMissingOptionalSecrets', () => {
      it('should return only optional secrets that are missing', () => {
        secretValidator = createValidator();
        const missingOptional = secretValidator.getMissingOptionalSecrets();

        expect(missingOptional.length).toBeGreaterThan(0);
        expect(missingOptional.every((secret) => !secret.required)).toBe(true);
        expect(missingOptional.some((secret) => secret.name === 'PORT')).toBe(true);
        expect(missingOptional.some((secret) => secret.name === 'ALPACA_BASE_URL')).toBe(true);
      });
    });

    describe('validateSecret', () => {
      it('should validate present required secret', () => {
        process.env.ALPACA_API_KEY = 'test-api-key';
        secretValidator = createValidator();

        const result = secretValidator.validateSecret('ALPACA_API_KEY');

        expect(result.isValid).toBe(true);
        expect(result.message).toContain('is present');
      });

      it('should validate missing required secret', () => {
        secretValidator = createValidator();
        const result = secretValidator.validateSecret('ALPACA_API_KEY');

        expect(result.isValid).toBe(false);
        expect(result.message).toContain('is missing');
      });

      it('should validate missing optional secret', () => {
        secretValidator = createValidator();
        const result = secretValidator.validateSecret('PORT');

        expect(result.isValid).toBe(true);
        expect(result.message).toContain('not set');
      });

      it('should handle non-existent secret', () => {
        secretValidator = createValidator();
        const result = secretValidator.validateSecret('NON_EXISTENT_SECRET');

        expect(result.isValid).toBe(false);
        expect(result.message).toContain('not found');
      });
    });

    describe('getValidationSummary', () => {
      it('should return summary without console output', () => {
        process.env.ALPACA_API_KEY = 'test-api-key';
        process.env.JWT_SECRET = 'test-jwt-secret';
        secretValidator = createValidator();

        const summary = secretValidator.getValidationSummary();

        expect(summary).toHaveProperty('isValid');
        expect(summary).toHaveProperty('missingSecrets');
        expect(summary).toHaveProperty('warnings');
        expect(summary).toHaveProperty('summary');
        expect(summary.summary.present).toBe(2);
        expect(summary.summary.missing).toBeGreaterThan(0);
      });

      it('should match validateSecrets results', () => {
        process.env.ALPACA_API_KEY = 'test-api-key';
        secretValidator = createValidator();

        const validationResult = secretValidator.validateSecrets();
        const summary = secretValidator.getValidationSummary();

        expect(summary.isValid).toBe(validationResult.isValid);
        expect(summary.missingSecrets).toEqual(validationResult.missingSecrets);
        expect(summary.warnings).toEqual(validationResult.warnings);
        expect(summary.summary).toEqual(validationResult.summary);
      });
    });
  });

  describe('edge cases', () => {
    it('should handle undefined environment variables', () => {
      // Ensure environment variable is undefined
      delete process.env.ALPACA_API_KEY;
      secretValidator = createValidator();

      const result = secretValidator.validateSecrets();

      expect(result.missingSecrets).toContain('ALPACA_API_KEY');
    });

    it('should handle null values gracefully', () => {
      // @ts-ignore - testing edge case
      process.env.ALPACA_API_KEY = null;
      secretValidator = createValidator();

      const result = secretValidator.validateSecrets();

      expect(result.missingSecrets).toContain('ALPACA_API_KEY');
    });

    it('should handle very long secret values', () => {
      const longSecret = 'a'.repeat(1000);
      process.env.ALPACA_API_KEY = longSecret;
      secretValidator = createValidator();

      const hasSecret = secretValidator.hasSecret('ALPACA_API_KEY');

      expect(hasSecret).toBe(true);
    });
  });
});
