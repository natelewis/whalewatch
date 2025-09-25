// Mock console methods
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation();
const mockConsoleWarn = jest.spyOn(console, 'warn').mockImplementation();
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation();

// Store original environment
const originalEnv = process.env;

describe('Logger Utility', () => {
  let logger: any;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Clear module cache to ensure fresh imports
    jest.resetModules();

    // Reset environment
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Clean up
    process.env = originalEnv;
  });

  afterAll(() => {
    // Restore all mocks
    mockConsoleLog.mockRestore();
    mockConsoleWarn.mockRestore();
    mockConsoleError.mockRestore();
  });

  describe('Development Environment', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'development';
      logger = require('../../utils/logger').logger;
    });

    describe('Basic Logging Methods', () => {
      it('should log info messages in development', () => {
        logger.info('Test info message', { data: 'test' });

        expect(mockConsoleLog).toHaveBeenCalledWith('Test info message', { data: 'test' });
      });

      it('should log warning messages in development', () => {
        logger.warn('Test warning message', { data: 'test' });

        expect(mockConsoleWarn).toHaveBeenCalledWith('Test warning message', { data: 'test' });
      });

      it('should log error messages in development', () => {
        logger.error('Test error message', { data: 'test' });

        expect(mockConsoleError).toHaveBeenCalledWith('Test error message', { data: 'test' });
      });

      it('should log debug messages in development', () => {
        logger.debug('Test debug message', { data: 'test' });

        expect(mockConsoleLog).toHaveBeenCalledWith('[DEBUG]', 'Test debug message', { data: 'test' });
      });

      it('should handle multiple arguments', () => {
        logger.info('Message 1', 'Message 2', { key: 'value' }, 123);

        expect(mockConsoleLog).toHaveBeenCalledWith('Message 1', 'Message 2', { key: 'value' }, 123);
      });

      it('should handle no arguments', () => {
        logger.info();

        expect(mockConsoleLog).toHaveBeenCalledWith();
      });
    });

    describe('Server-Specific Logging Methods', () => {
      it('should log startup messages in development', () => {
        logger.server.startup('Server starting up');

        expect(mockConsoleLog).toHaveBeenCalledWith('🚀', 'Server starting up');
      });

      it('should log auth messages in development', () => {
        logger.server.auth('User authenticated');

        expect(mockConsoleLog).toHaveBeenCalledWith('🔐', 'User authenticated');
      });

      it('should log API messages in development', () => {
        logger.server.api('API request received');

        expect(mockConsoleLog).toHaveBeenCalledWith('🌐', 'API request received');
      });

      it('should log websocket messages in development', () => {
        logger.server.websocket('WebSocket connection established');

        expect(mockConsoleLog).toHaveBeenCalledWith('🔌', 'WebSocket connection established');
      });

      it('should log database messages in development', () => {
        logger.server.database('Database query executed');

        expect(mockConsoleLog).toHaveBeenCalledWith('🗄️', 'Database query executed');
      });

      it('should log success messages in development', () => {
        logger.server.success('Operation completed successfully');

        expect(mockConsoleLog).toHaveBeenCalledWith('✅', 'Operation completed successfully');
      });

      it('should log warning messages in development', () => {
        logger.server.warning('Warning: Something might be wrong');

        expect(mockConsoleLog).toHaveBeenCalledWith('⚠️', 'Warning: Something might be wrong');
      });

      it('should log error messages in development', () => {
        logger.server.error('Error: Something went wrong');

        expect(mockConsoleLog).toHaveBeenCalledWith('❌', 'Error: Something went wrong');
      });

      it('should log loading messages in development', () => {
        logger.server.loading('Loading data...');

        expect(mockConsoleLog).toHaveBeenCalledWith('🔄', 'Loading data...');
      });

      it('should log cleanup messages in development', () => {
        logger.server.cleanup('Cleaning up resources');

        expect(mockConsoleLog).toHaveBeenCalledWith('🧹', 'Cleaning up resources');
      });

      it('should handle multiple arguments for server methods', () => {
        logger.server.startup('Server starting', 'on port', 3001);

        expect(mockConsoleLog).toHaveBeenCalledWith('🚀', 'Server starting', 'on port', 3001);
      });
    });
  });

  describe('Production Environment', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
      logger = require('../../utils/logger').logger;
    });

    describe('Basic Logging Methods', () => {
      it('should not log info messages in production', () => {
        logger.info('Test info message', { data: 'test' });

        expect(mockConsoleLog).not.toHaveBeenCalled();
      });

      it('should not log warning messages in production', () => {
        logger.warn('Test warning message', { data: 'test' });

        expect(mockConsoleWarn).not.toHaveBeenCalled();
      });

      it('should log error messages in production with simplified format', () => {
        logger.error('Test error message', { data: 'test' });

        expect(mockConsoleError).toHaveBeenCalledWith('[Server Error]', 'Test error message');
      });

      it('should not log debug messages in production', () => {
        logger.debug('Test debug message', { data: 'test' });

        expect(mockConsoleLog).not.toHaveBeenCalled();
      });

      it('should handle error logging with multiple arguments in production', () => {
        logger.error('Error occurred', 'Additional context', { error: 'details' });

        expect(mockConsoleError).toHaveBeenCalledWith('[Server Error]', 'Error occurred');
      });

      it('should handle error logging with no arguments in production', () => {
        logger.error();

        expect(mockConsoleError).toHaveBeenCalledWith('[Server Error]', undefined);
      });
    });

    describe('Server-Specific Logging Methods', () => {
      it('should not log startup messages in production', () => {
        logger.server.startup('Server starting up');

        expect(mockConsoleLog).not.toHaveBeenCalled();
      });

      it('should not log auth messages in production', () => {
        logger.server.auth('User authenticated');

        expect(mockConsoleLog).not.toHaveBeenCalled();
      });

      it('should not log API messages in production', () => {
        logger.server.api('API request received');

        expect(mockConsoleLog).not.toHaveBeenCalled();
      });

      it('should not log websocket messages in production', () => {
        logger.server.websocket('WebSocket connection established');

        expect(mockConsoleLog).not.toHaveBeenCalled();
      });

      it('should not log database messages in production', () => {
        logger.server.database('Database query executed');

        expect(mockConsoleLog).not.toHaveBeenCalled();
      });

      it('should not log success messages in production', () => {
        logger.server.success('Operation completed successfully');

        expect(mockConsoleLog).not.toHaveBeenCalled();
      });

      it('should not log warning messages in production', () => {
        logger.server.warning('Warning: Something might be wrong');

        expect(mockConsoleLog).not.toHaveBeenCalled();
      });

      it('should not log error messages in production', () => {
        logger.server.error('Error: Something went wrong');

        expect(mockConsoleLog).not.toHaveBeenCalled();
      });

      it('should not log loading messages in production', () => {
        logger.server.loading('Loading data...');

        expect(mockConsoleLog).not.toHaveBeenCalled();
      });

      it('should not log cleanup messages in production', () => {
        logger.server.cleanup('Cleaning up resources');

        expect(mockConsoleLog).not.toHaveBeenCalled();
      });
    });
  });

  describe('Test Environment', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'test';
      logger = require('../../utils/logger').logger;
    });

    describe('Basic Logging Methods', () => {
      it('should log info messages in test environment', () => {
        logger.info('Test info message');

        expect(mockConsoleLog).toHaveBeenCalledWith('Test info message');
      });

      it('should log error messages in test environment', () => {
        logger.error('Test error message');

        expect(mockConsoleError).toHaveBeenCalledWith('Test error message');
      });
    });

    describe('Server-Specific Logging Methods', () => {
      it('should log server messages in test environment', () => {
        logger.server.startup('Test startup message');

        expect(mockConsoleLog).toHaveBeenCalledWith('🚀', 'Test startup message');
      });
    });
  });

  describe('Edge Cases', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'development';
      logger = require('../../utils/logger').logger;
    });

    it('should handle undefined arguments', () => {
      logger.info(undefined, null, 'valid message');

      expect(mockConsoleLog).toHaveBeenCalledWith(undefined, null, 'valid message');
    });

    it('should handle empty string arguments', () => {
      logger.info('', '   ', 'valid message');

      expect(mockConsoleLog).toHaveBeenCalledWith('', '   ', 'valid message');
    });

    it('should handle complex object arguments', () => {
      const complexObject = {
        nested: {
          array: [1, 2, 3],
          func: () => 'test',
          date: new Date(),
        },
      };

      logger.info('Complex object:', complexObject);

      expect(mockConsoleLog).toHaveBeenCalledWith('Complex object:', complexObject);
    });

    it('should handle circular references gracefully', () => {
      const circular: any = { name: 'test' };
      circular.self = circular;

      logger.info('Circular reference:', circular);

      expect(mockConsoleLog).toHaveBeenCalledWith('Circular reference:', circular);
    });
  });

  describe('Environment Detection', () => {
    it('should detect development environment correctly', () => {
      process.env.NODE_ENV = 'development';
      logger = require('../../utils/logger').logger;

      logger.info('Development message');

      expect(mockConsoleLog).toHaveBeenCalledWith('Development message');
    });

    it('should detect production environment correctly', () => {
      process.env.NODE_ENV = 'production';
      logger = require('../../utils/logger').logger;

      logger.info('Production message');

      expect(mockConsoleLog).not.toHaveBeenCalled();
    });

    it('should treat undefined NODE_ENV as development', () => {
      delete process.env.NODE_ENV;
      logger = require('../../utils/logger').logger;

      logger.info('Undefined env message');

      expect(mockConsoleLog).toHaveBeenCalledWith('Undefined env message');
    });

    it('should treat empty NODE_ENV as development', () => {
      process.env.NODE_ENV = '';
      logger = require('../../utils/logger').logger;

      logger.info('Empty env message');

      expect(mockConsoleLog).toHaveBeenCalledWith('Empty env message');
    });
  });

  describe('Logger Object Structure', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'development';
      logger = require('../../utils/logger').logger;
    });

    it('should have all required methods', () => {
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.debug).toBe('function');
    });

    it('should have server object with all required methods', () => {
      expect(typeof logger.server.startup).toBe('function');
      expect(typeof logger.server.auth).toBe('function');
      expect(typeof logger.server.api).toBe('function');
      expect(typeof logger.server.websocket).toBe('function');
      expect(typeof logger.server.database).toBe('function');
      expect(typeof logger.server.success).toBe('function');
      expect(typeof logger.server.warning).toBe('function');
      expect(typeof logger.server.error).toBe('function');
      expect(typeof logger.server.loading).toBe('function');
      expect(typeof logger.server.cleanup).toBe('function');
    });

    it('should maintain consistent behavior across calls', () => {
      logger.info('First call');
      logger.info('Second call');

      expect(mockConsoleLog).toHaveBeenCalledTimes(2);
      expect(mockConsoleLog).toHaveBeenNthCalledWith(1, 'First call');
      expect(mockConsoleLog).toHaveBeenNthCalledWith(2, 'Second call');
    });
  });

  describe('Performance and Reliability', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'development';
      logger = require('../../utils/logger').logger;
    });

    it('should handle rapid successive calls', () => {
      for (let i = 0; i < 100; i++) {
        logger.info(`Message ${i}`);
      }

      expect(mockConsoleLog).toHaveBeenCalledTimes(100);
    });

    it('should handle large data objects', () => {
      const largeObject = {
        data: new Array(1000).fill(0).map((_, i) => ({ id: i, value: `item-${i}` })),
      };

      logger.info('Large object:', largeObject);

      expect(mockConsoleLog).toHaveBeenCalledWith('Large object:', largeObject);
    });

    it('should not throw errors with invalid arguments', () => {
      expect(() => {
        logger.info();
        logger.warn();
        logger.error();
        logger.debug();
        logger.server.startup();
      }).not.toThrow();
    });
  });
});
