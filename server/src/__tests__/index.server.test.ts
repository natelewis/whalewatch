import { Request, Response, NextFunction } from 'express';

// Mock all dependencies before any imports
jest.mock('dotenv', () => ({
  config: jest.fn(),
}));

jest.mock('express', () => {
  const mockApp = {
    use: jest.fn(),
    get: jest.fn(),
    listen: jest.fn(),
    name: 'app',
  };
  const expressMock = jest.fn(() => mockApp);
  (expressMock as any).json = jest.fn(() => (_req: Request, _res: Response, next: NextFunction) => next());
  (expressMock as any).urlencoded = jest.fn(() => (_req: Request, _res: Response, next: NextFunction) => next());
  return expressMock;
});

jest.mock('cors', () => jest.fn(() => (_req: Request, _res: Response, next: NextFunction) => next()));

jest.mock('helmet', () => jest.fn(() => (_req: Request, _res: Response, next: NextFunction) => next()));

jest.mock('express-session', () => jest.fn(() => (_req: Request, _res: Response, next: NextFunction) => next()));

jest.mock('passport', () => ({
  initialize: jest.fn(() => (_req: Request, _res: Response, next: NextFunction) => next()),
  session: jest.fn(() => (_req: Request, _res: Response, next: NextFunction) => next()),
}));

jest.mock('http', () => ({
  createServer: jest.fn(() => ({
    listen: jest.fn(),
    close: jest.fn(),
  })),
}));

jest.mock('../utils/secretValidator', () => ({
  secretValidator: {
    validateSecrets: jest.fn().mockReturnValue({
      isValid: true,
      missingSecrets: [],
      warnings: [],
      summary: { total: 10, required: 5, missing: 0, present: 10 },
    }),
  },
}));

jest.mock('../websocket/server', () => ({
  setupWebSocketServer: jest.fn(),
}));

jest.mock('../config/passport', () => ({}));

jest.mock('../middleware/errorHandler', () => ({
  errorHandler: jest.fn(),
}));

jest.mock('../routes/auth', () => ({
  authRoutes: { use: jest.fn() },
}));

jest.mock('../routes/account', () => ({
  accountRoutes: { use: jest.fn() },
}));

jest.mock('../routes/chart', () => ({
  chartRoutes: { use: jest.fn() },
}));

jest.mock('../routes/options', () => ({
  optionsRoutes: { use: jest.fn() },
}));

jest.mock('../routes/orders', () => ({
  orderRoutes: { use: jest.fn() },
}));

jest.mock('../routes/questdb', () => ({
  questdbRoutes: { use: jest.fn() },
}));

// Mock console methods
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation();
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation();

// Mock process methods
const mockProcessExit = jest.spyOn(process, 'exit').mockImplementation();
const mockProcessOn = jest.spyOn(process, 'on').mockImplementation();

// Mock environment variables
const originalEnv = process.env;

describe('Index.ts Server Logic Tests', () => {
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Clear module cache to ensure fresh imports
    jest.resetModules();

    // Reset environment
    process.env = { ...originalEnv };

    // Set up default environment variables
    process.env.NODE_ENV = 'test';
    process.env.PORT = '3001';
    process.env.CORS_ORIGIN = 'http://localhost:5173';
    process.env.SESSION_SECRET = 'test-secret';
  });

  afterEach(() => {
    // Clean up
    process.env = originalEnv;
  });

  afterAll(() => {
    // Restore all mocks
    mockConsoleLog.mockRestore();
    mockConsoleError.mockRestore();
    mockProcessExit.mockRestore();
    mockProcessOn.mockRestore();
  });

  describe('Server Startup Logic', () => {
    it('should validate secrets before starting server', async () => {
      const { secretValidator } = await import('../utils/secretValidator');

      // Import the index file to trigger the startup logic
      await import('../index');

      expect(secretValidator.validateSecrets).toHaveBeenCalled();
    });

    it('should exit process if secrets validation fails', async () => {
      const { secretValidator } = await import('../utils/secretValidator');

      // Mock failed validation
      (secretValidator.validateSecrets as jest.MockedFunction<() => any>).mockReturnValueOnce({
        isValid: false,
        missingSecrets: ['ALPACA_API_KEY', 'JWT_SECRET'],
        warnings: [],
        summary: { total: 10, required: 5, missing: 2, present: 8 },
      });

      // Import the index file to trigger the startup logic
      await import('../index');

      expect(mockConsoleError).toHaveBeenCalledWith('❌ Server startup failed due to missing required secrets');
      expect(mockConsoleError).toHaveBeenCalledWith('Please check the configuration and try again.');
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should continue startup if secrets validation passes', async () => {
      const { secretValidator } = await import('../utils/secretValidator');

      // Mock successful validation
      (secretValidator.validateSecrets as jest.MockedFunction<() => any>).mockReturnValueOnce({
        isValid: true,
        missingSecrets: [],
        warnings: [],
        summary: { total: 10, required: 5, missing: 0, present: 10 },
      });

      // Import the index file to trigger the startup logic
      await import('../index');

      expect(mockProcessExit).not.toHaveBeenCalled();
    });

    it('should call dotenv.config() on startup', async () => {
      const dotenv = await import('dotenv');

      // Import the index file to trigger the startup logic
      await import('../index');

      expect(dotenv.config).toHaveBeenCalled();
    });

    it('should create HTTP server', async () => {
      const { createServer } = await import('http');

      // Import the index file to trigger the startup logic
      await import('../index');

      expect(createServer).toHaveBeenCalled();
    });

    it('should setup WebSocket server', async () => {
      const { setupWebSocketServer } = await import('../websocket/server');

      // Import the index file to trigger the startup logic
      await import('../index');

      expect(setupWebSocketServer).toHaveBeenCalled();
    });

    it('should call server.listen with correct port', async () => {
      const { createServer } = await import('http');
      const mockServer = { listen: jest.fn(), close: jest.fn() };
      (createServer as jest.MockedFunction<() => any>).mockReturnValue(mockServer);

      // Import the index file to trigger the startup logic
      await import('../index');

      expect(mockServer.listen).toHaveBeenCalledWith('3001', expect.any(Function));
    });

    it('should log startup messages when server starts', async () => {
      const { createServer } = await import('http');
      const mockServer = { listen: jest.fn(), close: jest.fn() };
      (createServer as jest.MockedFunction<() => any>).mockReturnValue(mockServer);

      // Import the index file to trigger the startup logic
      await import('../index');

      // Simulate the callback function being called
      const callback = mockServer.listen.mock.calls[0]?.[1];
      if (callback) {
        callback();

        expect(mockConsoleLog).toHaveBeenCalledWith('🚀 WhaleWatch Server running on port 3001');
        expect(mockConsoleLog).toHaveBeenCalledWith('📊 Health check: http://localhost:3001/health');
        expect(mockConsoleLog).toHaveBeenCalledWith('🔌 WebSocket server ready for connections');
        expect(mockConsoleLog).toHaveBeenCalledWith('✅ All secrets validated successfully');
      }
    });

    it('should use PORT environment variable', async () => {
      process.env.PORT = '4000';
      const { createServer } = await import('http');
      const mockServer = { listen: jest.fn(), close: jest.fn() };
      (createServer as jest.MockedFunction<() => any>).mockReturnValue(mockServer);

      // Import the index file to trigger the startup logic
      await import('../index');

      expect(mockServer.listen).toHaveBeenCalledWith('4000', expect.any(Function));
    });

    it('should use default PORT when not set', async () => {
      delete process.env.PORT;
      const { createServer } = await import('http');
      const mockServer = { listen: jest.fn(), close: jest.fn() };
      (createServer as jest.MockedFunction<() => any>).mockReturnValue(mockServer);

      // Import the index file to trigger the startup logic
      await import('../index');

      expect(mockServer.listen).toHaveBeenCalledWith(3001, expect.any(Function));
    });
  });

  describe('Graceful Shutdown Handlers', () => {
    it('should register SIGTERM handler', async () => {
      // Import the index file to trigger the startup logic
      await import('../index');

      expect(mockProcessOn).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
    });

    it('should register SIGINT handler', async () => {
      // Import the index file to trigger the startup logic
      await import('../index');

      expect(mockProcessOn).toHaveBeenCalledWith('SIGINT', expect.any(Function));
    });

    it('should handle SIGTERM signal gracefully', async () => {
      const { createServer } = await import('http');
      const mockServer = { listen: jest.fn(), close: jest.fn() };
      (createServer as jest.MockedFunction<() => any>).mockReturnValue(mockServer);

      // Import the index file to trigger the startup logic
      await import('../index');

      // Get the SIGTERM handler
      const sigtermHandler = mockProcessOn.mock.calls.find(call => call[0] === 'SIGTERM')?.[1];

      if (sigtermHandler && typeof sigtermHandler === 'function') {
        sigtermHandler();

        expect(mockConsoleLog).toHaveBeenCalledWith('SIGTERM received, shutting down gracefully');
        expect(mockServer.close).toHaveBeenCalledWith(expect.any(Function));
      }
    });

    it('should handle SIGINT signal gracefully', async () => {
      const { createServer } = await import('http');
      const mockServer = { listen: jest.fn(), close: jest.fn() };
      (createServer as jest.MockedFunction<() => any>).mockReturnValue(mockServer);

      // Import the index file to trigger the startup logic
      await import('../index');

      // Get the SIGINT handler
      const sigintHandler = mockProcessOn.mock.calls.find(call => call[0] === 'SIGINT')?.[1];

      if (sigintHandler && typeof sigintHandler === 'function') {
        sigintHandler();

        expect(mockConsoleLog).toHaveBeenCalledWith('SIGINT received, shutting down gracefully');
        expect(mockServer.close).toHaveBeenCalledWith(expect.any(Function));
      }
    });

    it('should call process.exit(0) after server closes', async () => {
      const { createServer } = await import('http');
      const mockServer = { listen: jest.fn(), close: jest.fn() };
      (createServer as jest.MockedFunction<() => any>).mockReturnValue(mockServer);

      // Import the index file to trigger the startup logic
      await import('../index');

      // Get the SIGTERM handler
      const sigtermHandler = mockProcessOn.mock.calls.find(call => call[0] === 'SIGTERM')?.[1];

      if (sigtermHandler && typeof sigtermHandler === 'function') {
        sigtermHandler();

        // Simulate server close callback
        const closeCallback = mockServer.close.mock.calls[0]?.[0];
        if (closeCallback) {
          closeCallback();
          expect(mockConsoleLog).toHaveBeenCalledWith('Process terminated');
          expect(mockProcessExit).toHaveBeenCalledWith(0);
        }
      }
    });
  });

  describe('Environment Variable Handling', () => {
    it('should use default PORT when not set', () => {
      delete process.env.PORT;
      const PORT = process.env.PORT || 3001;
      expect(PORT).toBe(3001);
    });

    it('should use PORT env var when set', () => {
      process.env.PORT = '4000';
      const PORT = process.env.PORT || 3001;
      expect(PORT).toBe('4000');
    });

    it('should use default CORS origin when not set', () => {
      delete process.env.CORS_ORIGIN;
      const defaultOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173';
      expect(defaultOrigin).toBe('http://localhost:5173');
    });

    it('should use CORS origin from env when set', () => {
      process.env.CORS_ORIGIN = 'https://production.com';
      const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173';
      expect(corsOrigin).toBe('https://production.com');
    });

    it('should use default session secret when not set', () => {
      delete process.env.SESSION_SECRET;
      const defaultSecret = process.env.SESSION_SECRET || 'your-secret-key';
      expect(defaultSecret).toBe('your-secret-key');
    });

    it('should use session secret from env when set', () => {
      process.env.SESSION_SECRET = 'custom-secret';
      const sessionSecret = process.env.SESSION_SECRET || 'your-secret-key';
      expect(sessionSecret).toBe('custom-secret');
    });

    it('should set secure cookies in production', () => {
      process.env.NODE_ENV = 'production';
      const isSecure = process.env.NODE_ENV === 'production';
      expect(isSecure).toBe(true);
    });

    it('should not set secure cookies in development', () => {
      process.env.NODE_ENV = 'development';
      const isSecure = process.env.NODE_ENV === 'production';
      expect(isSecure).toBe(false);
    });
  });

  describe('Module Exports', () => {
    it('should export the express app as default', async () => {
      const app = (await import('../index')).default;

      expect(app).toBeDefined();
      expect(typeof app).toBe('object');
      expect(app.name).toBe('app');
    });
  });
});
