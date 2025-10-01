// Test file for logger utility
import { Logger, websocketLogger } from '../../utils/logger';

describe('Logger', () => {
  describe('logger instance', () => {
    it('should have all required methods', () => {
      expect(typeof websocketLogger.info).toBe('function');
      expect(typeof websocketLogger.error).toBe('function');
      expect(typeof websocketLogger.warn).toBe('function');
      expect(typeof websocketLogger.debug).toBe('function');
    });

    it('should not throw when calling info', () => {
      expect(() => websocketLogger.info('Test message')).not.toThrow();
    });

    it('should not throw when calling error', () => {
      expect(() => websocketLogger.error('Test error')).not.toThrow();
    });

    it('should not throw when calling warn', () => {
      expect(() => websocketLogger.warn('Test warning')).not.toThrow();
    });

    it('should not throw when calling debug', () => {
      expect(() => websocketLogger.debug('Test debug')).not.toThrow();
    });
  });

  describe('Logger class', () => {
    it('should create logger with different levels', () => {
      const debugLogger = new Logger('debug', 'DEBUG');
      const infoLogger = new Logger('info', 'INFO');
      const warnLogger = new Logger('warn', 'WARN');
      const errorLogger = new Logger('error', 'ERROR');

      expect(debugLogger).toBeInstanceOf(Logger);
      expect(infoLogger).toBeInstanceOf(Logger);
      expect(warnLogger).toBeInstanceOf(Logger);
      expect(errorLogger).toBeInstanceOf(Logger);
    });

    it('should handle invalid log levels gracefully', () => {
      const invalidLogger = new Logger('invalid', 'INFO');
      expect(() => invalidLogger.info('Test')).not.toThrow();
    });
  });
});
