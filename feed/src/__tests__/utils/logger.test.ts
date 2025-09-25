// Test file for logger utility
import { logger, Logger } from '../../utils/logger';

describe('Logger', () => {
  describe('logger instance', () => {
    it('should have all required methods', () => {
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.debug).toBe('function');
      expect(typeof logger.success).toBe('function');
    });

    it('should not throw when calling info', () => {
      expect(() => logger.info('Test message')).not.toThrow();
    });

    it('should not throw when calling error', () => {
      expect(() => logger.error('Test error')).not.toThrow();
    });

    it('should not throw when calling warn', () => {
      expect(() => logger.warn('Test warning')).not.toThrow();
    });

    it('should not throw when calling debug', () => {
      expect(() => logger.debug('Test debug')).not.toThrow();
    });

    it('should not throw when calling success', () => {
      expect(() => logger.success('Test success')).not.toThrow();
    });
  });

  describe('Logger class', () => {
    it('should create logger with different levels', () => {
      const debugLogger = new Logger('debug');
      const infoLogger = new Logger('info');
      const warnLogger = new Logger('warn');
      const errorLogger = new Logger('error');

      expect(debugLogger).toBeInstanceOf(Logger);
      expect(infoLogger).toBeInstanceOf(Logger);
      expect(warnLogger).toBeInstanceOf(Logger);
      expect(errorLogger).toBeInstanceOf(Logger);
    });

    it('should handle invalid log levels gracefully', () => {
      const invalidLogger = new Logger('invalid');
      expect(() => invalidLogger.info('Test')).not.toThrow();
    });
  });
});
