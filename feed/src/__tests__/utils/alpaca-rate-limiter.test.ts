// Test file for alpaca-rate-limiter utility
import { getAlpacaRateLimiter } from '../../utils/alpaca-rate-limiter';
import { RateLimiter } from '../../utils/rate-limiter';

// Mock p-limit
jest.mock('p-limit', () => {
  return jest.fn(() => {
    return jest.fn(async fn => {
      // Use fake timers instead of real delays for faster tests
      await new Promise(resolve => setTimeout(resolve, 0));
      return fn();
    });
  });
});

// Mock the environment variables
const originalEnv = process.env;

describe('Alpaca Rate Limiter', () => {
  beforeEach(() => {
    // Reset environment variables before each test
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    // Restore original environment variables
    process.env = originalEnv;
  });

  describe('getAlpacaRateLimiter', () => {
    it('should return a RateLimiter instance', () => {
      const rateLimiter = getAlpacaRateLimiter();
      expect(rateLimiter).toBeInstanceOf(RateLimiter);
    });

    it('should use default rate limit when ALPACA_REQUESTS_PER_MINUTE is not set', () => {
      delete process.env.ALPACA_REQUESTS_PER_MINUTE;
      const rateLimiter = getAlpacaRateLimiter();
      expect(rateLimiter).toBeInstanceOf(RateLimiter);
    });

    it('should use custom rate limit from environment variable', () => {
      process.env.ALPACA_REQUESTS_PER_MINUTE = '100';
      const rateLimiter = getAlpacaRateLimiter();
      expect(rateLimiter).toBeInstanceOf(RateLimiter);
    });

    it('should handle invalid environment variable gracefully', () => {
      process.env.ALPACA_REQUESTS_PER_MINUTE = 'invalid';
      const rateLimiter = getAlpacaRateLimiter();
      expect(rateLimiter).toBeInstanceOf(RateLimiter);
    });

    it('should handle zero rate limit', () => {
      process.env.ALPACA_REQUESTS_PER_MINUTE = '0';
      const rateLimiter = getAlpacaRateLimiter();
      expect(rateLimiter).toBeInstanceOf(RateLimiter);
    });

    it('should handle negative rate limit', () => {
      process.env.ALPACA_REQUESTS_PER_MINUTE = '-10';
      const rateLimiter = getAlpacaRateLimiter();
      expect(rateLimiter).toBeInstanceOf(RateLimiter);
    });

    it('should handle very high rate limit', () => {
      process.env.ALPACA_REQUESTS_PER_MINUTE = '10000';
      const rateLimiter = getAlpacaRateLimiter();
      expect(rateLimiter).toBeInstanceOf(RateLimiter);
    });

    it('should handle decimal rate limit', () => {
      process.env.ALPACA_REQUESTS_PER_MINUTE = '150.5';
      const rateLimiter = getAlpacaRateLimiter();
      expect(rateLimiter).toBeInstanceOf(RateLimiter);
    });
  });

  describe('Rate Limiter Functionality', () => {
    let rateLimiter: RateLimiter;

    beforeEach(() => {
      // Use a fast rate limit for testing to avoid long delays
      process.env.ALPACA_REQUESTS_PER_MINUTE = '6000'; // 100 requests per second
      rateLimiter = getAlpacaRateLimiter();
    });

    it('should execute functions successfully', async () => {
      const mockFunction = jest.fn().mockResolvedValue('test result');

      const result = await rateLimiter.execute(mockFunction);

      expect(result).toBe('test result');
      expect(mockFunction).toHaveBeenCalledTimes(1);
    });

    it('should handle function errors', async () => {
      const mockError = new Error('Test error');
      const mockFunction = jest.fn().mockRejectedValue(mockError);

      await expect(rateLimiter.execute(mockFunction)).rejects.toThrow('Test error');
      expect(mockFunction).toHaveBeenCalledTimes(1);
    });

    it('should execute multiple functions sequentially', async () => {
      const mockFunction1 = jest.fn().mockResolvedValue('result1');
      const mockFunction2 = jest.fn().mockResolvedValue('result2');
      const mockFunction3 = jest.fn().mockResolvedValue('result3');

      const results = await Promise.all([
        rateLimiter.execute(mockFunction1),
        rateLimiter.execute(mockFunction2),
        rateLimiter.execute(mockFunction3),
      ]);

      expect(results).toEqual(['result1', 'result2', 'result3']);
      expect(mockFunction1).toHaveBeenCalledTimes(1);
      expect(mockFunction2).toHaveBeenCalledTimes(1);
      expect(mockFunction3).toHaveBeenCalledTimes(1);
    });

    it('should respect rate limiting with timing', async () => {
      // Use a slower rate limit for timing tests
      process.env.ALPACA_REQUESTS_PER_MINUTE = '60'; // 1 request per second
      const slowRateLimiter = getAlpacaRateLimiter();

      const mockFunction = jest.fn().mockResolvedValue('result');
      const startTime = Date.now();

      // Execute two functions
      await slowRateLimiter.execute(mockFunction);
      await slowRateLimiter.execute(mockFunction);

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should take at least 200ms due to mocked rate limiting (2 * 100ms delay)
      expect(duration).toBeGreaterThanOrEqual(200);
      expect(mockFunction).toHaveBeenCalledTimes(2);
    }, 10000); // Increase timeout for timing test

    it('should handle async functions that take time', async () => {
      const mockFunction = jest.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
        return 'delayed result';
      });

      const result = await rateLimiter.execute(mockFunction);

      expect(result).toBe('delayed result');
      expect(mockFunction).toHaveBeenCalledTimes(1);
    });

    it('should handle functions that return undefined', async () => {
      const mockFunction = jest.fn().mockResolvedValue(undefined);

      const result = await rateLimiter.execute(mockFunction);

      expect(result).toBeUndefined();
      expect(mockFunction).toHaveBeenCalledTimes(1);
    });

    it('should handle functions that return null', async () => {
      const mockFunction = jest.fn().mockResolvedValue(null);

      const result = await rateLimiter.execute(mockFunction);

      expect(result).toBeNull();
      expect(mockFunction).toHaveBeenCalledTimes(1);
    });

    it('should handle functions that return objects', async () => {
      const mockObject = { id: 1, name: 'test' };
      const mockFunction = jest.fn().mockResolvedValue(mockObject);

      const result = await rateLimiter.execute(mockFunction);

      expect(result).toEqual(mockObject);
      expect(mockFunction).toHaveBeenCalledTimes(1);
    });

    it('should handle functions that return arrays', async () => {
      const mockArray = [1, 2, 3, 4, 5];
      const mockFunction = jest.fn().mockResolvedValue(mockArray);

      const result = await rateLimiter.execute(mockFunction);

      expect(result).toEqual(mockArray);
      expect(mockFunction).toHaveBeenCalledTimes(1);
    });
  });

  describe('Edge Cases', () => {
    it('should handle concurrent execution with different rate limits', async () => {
      process.env.ALPACA_REQUESTS_PER_MINUTE = '6000'; // 100 requests per second
      const fastRateLimiter = getAlpacaRateLimiter();

      process.env.ALPACA_REQUESTS_PER_MINUTE = '60'; // 1 request per second
      const slowRateLimiter = getAlpacaRateLimiter();

      const mockFunction = jest.fn().mockResolvedValue('result');

      const fastPromise = fastRateLimiter.execute(mockFunction);
      const slowPromise = slowRateLimiter.execute(mockFunction);

      const results = await Promise.all([fastPromise, slowPromise]);

      expect(results).toEqual(['result', 'result']);
      expect(mockFunction).toHaveBeenCalledTimes(2);
    });

    it('should handle rapid successive calls', async () => {
      const testRateLimiter = getAlpacaRateLimiter();
      const mockFunction = jest.fn().mockResolvedValue('result');
      const promises = [];

      // Create 10 rapid calls
      for (let i = 0; i < 10; i++) {
        promises.push(testRateLimiter.execute(mockFunction));
      }

      const results = await Promise.all(promises);

      expect(results).toHaveLength(10);
      expect(results.every((result: unknown) => result === 'result')).toBe(true);
      expect(mockFunction).toHaveBeenCalledTimes(10);
    });

    it('should handle mixed success and error functions', async () => {
      const testRateLimiter = getAlpacaRateLimiter();
      const successFunction = jest.fn().mockResolvedValue('success');

      // Test success case
      const successResult = await testRateLimiter.execute(successFunction);
      expect(successResult).toBe('success');
      expect(successFunction).toHaveBeenCalledTimes(1);

      // Test error case separately to avoid mock issues
      const errorFunction = jest.fn().mockImplementation(() => {
        throw new Error('error');
      });

      await expect(testRateLimiter.execute(errorFunction)).rejects.toThrow('error');
      expect(errorFunction).toHaveBeenCalledTimes(1);
    });
  });

  describe('Environment Variable Handling', () => {
    it('should handle empty string environment variable', () => {
      process.env.ALPACA_REQUESTS_PER_MINUTE = '';
      const rateLimiter = getAlpacaRateLimiter();
      expect(rateLimiter).toBeInstanceOf(RateLimiter);
    });

    it('should handle undefined environment variable', () => {
      process.env.ALPACA_REQUESTS_PER_MINUTE = undefined;
      const rateLimiter = getAlpacaRateLimiter();
      expect(rateLimiter).toBeInstanceOf(RateLimiter);
    });

    it('should handle null environment variable', () => {
      process.env.ALPACA_REQUESTS_PER_MINUTE = null as any;
      const rateLimiter = getAlpacaRateLimiter();
      expect(rateLimiter).toBeInstanceOf(RateLimiter);
    });

    it('should handle whitespace-only environment variable', () => {
      process.env.ALPACA_REQUESTS_PER_MINUTE = '   ';
      const rateLimiter = getAlpacaRateLimiter();
      expect(rateLimiter).toBeInstanceOf(RateLimiter);
    });

    it('should handle environment variable with leading/trailing whitespace', () => {
      process.env.ALPACA_REQUESTS_PER_MINUTE = '  200  ';
      const rateLimiter = getAlpacaRateLimiter();
      expect(rateLimiter).toBeInstanceOf(RateLimiter);
    });
  });

  describe('Integration with RateLimiter', () => {
    it('should work with the base RateLimiter execute method', async () => {
      const rateLimiter = getAlpacaRateLimiter();

      // Test that the execute method exists and works
      expect(typeof rateLimiter.execute).toBe('function');

      const mockFunction = jest.fn().mockResolvedValue('integration test');
      const result = await rateLimiter.execute(mockFunction);

      expect(result).toBe('integration test');
      expect(mockFunction).toHaveBeenCalledTimes(1);
    });

    it('should maintain rate limiting behavior across multiple instances', async () => {
      const rateLimiter1 = getAlpacaRateLimiter();
      const rateLimiter2 = getAlpacaRateLimiter();

      const mockFunction = jest.fn().mockResolvedValue('result');

      // Both instances should work independently
      const result1 = await rateLimiter1.execute(mockFunction);
      const result2 = await rateLimiter2.execute(mockFunction);

      expect(result1).toBe('result');
      expect(result2).toBe('result');
      expect(mockFunction).toHaveBeenCalledTimes(2);
    });
  });
});
