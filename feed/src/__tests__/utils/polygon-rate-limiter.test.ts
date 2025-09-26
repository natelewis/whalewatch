// Test file for polygon-rate-limiter utility
import { getPolygonRateLimiter } from '../../utils/polygon-rate-limiter';
import { RateLimiter } from '../../utils/rate-limiter';

// Mock p-limit
jest.mock('p-limit', () => {
  return jest.fn(() => {
    return jest.fn(async fn => {
      // Use fake timers instead of real delays for faster tests
      await new Promise(resolve => setTimeout(resolve, 0));
      return await fn();
    });
  });
});

// Mock console.log to avoid noise during tests
const originalConsoleLog = console.log;
beforeAll(() => {
  console.log = jest.fn();
});

afterAll(() => {
  console.log = originalConsoleLog;
});

// Mock the environment variables
const originalEnv = process.env;

describe('Polygon Rate Limiter', () => {
  beforeEach(() => {
    // Reset environment variables before each test
    process.env = { ...originalEnv };
    // Clear console.log mock calls
    (console.log as jest.Mock).mockClear();
  });

  afterAll(() => {
    // Restore original environment variables
    process.env = originalEnv;
  });

  describe('getPolygonRateLimiter', () => {
    it('should return a RateLimiter instance', () => {
      const rateLimiter = getPolygonRateLimiter();
      expect(rateLimiter).toBeInstanceOf(RateLimiter);
    });

    it('should use default rate limits when environment variables are not set', () => {
      delete process.env.POLYGON_REQUESTS_PER_SECOND;
      delete process.env.POLYGON_REQUESTS_PER_MINUTE;

      const rateLimiter = getPolygonRateLimiter();
      expect(rateLimiter).toBeInstanceOf(RateLimiter);
      expect(console.log).toHaveBeenCalledWith('Rate limiting Polygon.io requests to 5.00 requests per second');
    });

    it('should use custom rate limits from environment variables', () => {
      process.env.POLYGON_REQUESTS_PER_SECOND = '10';
      process.env.POLYGON_REQUESTS_PER_MINUTE = '600';

      const rateLimiter = getPolygonRateLimiter();
      expect(rateLimiter).toBeInstanceOf(RateLimiter);
      expect(console.log).toHaveBeenCalledWith('Rate limiting Polygon.io requests to 10.00 requests per second');
    });

    it('should use the more restrictive limit between per-second and per-minute', () => {
      process.env.POLYGON_REQUESTS_PER_SECOND = '20'; // 20 per second
      process.env.POLYGON_REQUESTS_PER_MINUTE = '600'; // 10 per second (600/60)

      const rateLimiter = getPolygonRateLimiter();
      expect(rateLimiter).toBeInstanceOf(RateLimiter);
      expect(console.log).toHaveBeenCalledWith('Rate limiting Polygon.io requests to 10.00 requests per second');
    });

    it('should handle invalid environment variables gracefully', () => {
      process.env.POLYGON_REQUESTS_PER_SECOND = 'invalid';
      process.env.POLYGON_REQUESTS_PER_MINUTE = 'also invalid';

      const rateLimiter = getPolygonRateLimiter();
      expect(rateLimiter).toBeInstanceOf(RateLimiter);
      expect(console.log).toHaveBeenCalledWith('Rate limiting Polygon.io requests to 5.00 requests per second');
    });

    it('should handle zero rate limits', () => {
      process.env.POLYGON_REQUESTS_PER_SECOND = '0';
      process.env.POLYGON_REQUESTS_PER_MINUTE = '0';

      const rateLimiter = getPolygonRateLimiter();
      expect(rateLimiter).toBeInstanceOf(RateLimiter);
      expect(console.log).toHaveBeenCalledWith('Rate limiting Polygon.io requests to 0.00 requests per second');
    });

    it('should handle negative rate limits', () => {
      process.env.POLYGON_REQUESTS_PER_SECOND = '-5';
      process.env.POLYGON_REQUESTS_PER_MINUTE = '-100';

      const rateLimiter = getPolygonRateLimiter();
      expect(rateLimiter).toBeInstanceOf(RateLimiter);
      expect(console.log).toHaveBeenCalledWith('Rate limiting Polygon.io requests to -5.00 requests per second');
    });

    it('should handle decimal rate limits', () => {
      process.env.POLYGON_REQUESTS_PER_SECOND = '5.5';
      process.env.POLYGON_REQUESTS_PER_MINUTE = '330.5';

      const rateLimiter = getPolygonRateLimiter();
      expect(rateLimiter).toBeInstanceOf(RateLimiter);
      expect(console.log).toHaveBeenCalledWith('Rate limiting Polygon.io requests to 5.50 requests per second');
    });

    it('should work with the returned RateLimiter', async () => {
      const rateLimiter = getPolygonRateLimiter();
      const mockFunction = jest.fn().mockResolvedValue('polygon result');

      const result = await rateLimiter.execute(mockFunction);

      expect(result).toBe('polygon result');
      expect(mockFunction).toHaveBeenCalledTimes(1);
    });

    it('should handle concurrent execution properly', async () => {
      const testRateLimiter = getPolygonRateLimiter();
      const mockFunction = jest.fn().mockResolvedValue('result');
      const promises = [];

      // Create 5 concurrent calls
      for (let i = 0; i < 5; i++) {
        promises.push(testRateLimiter.execute(mockFunction));
      }

      const results = await Promise.all(promises);

      expect(results).toHaveLength(5);
      expect(results.every((result: unknown) => result === 'result')).toBe(true);
      expect(mockFunction).toHaveBeenCalledTimes(5);
    });
  });

  describe('Rate Limiter Functionality', () => {
    let rateLimiter: RateLimiter;

    beforeEach(() => {
      // Use a fast rate limit for testing to avoid long delays
      process.env.POLYGON_REQUESTS_PER_SECOND = '100';
      process.env.POLYGON_REQUESTS_PER_MINUTE = '6000';
      rateLimiter = getPolygonRateLimiter();
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
      process.env.POLYGON_REQUESTS_PER_SECOND = '1';
      process.env.POLYGON_REQUESTS_PER_MINUTE = '60';
      const slowRateLimiter = getPolygonRateLimiter();

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

    it('should handle functions that return different types', async () => {
      const stringFunction = jest.fn().mockResolvedValue('string');
      const numberFunction = jest.fn().mockResolvedValue(42);
      const booleanFunction = jest.fn().mockResolvedValue(true);
      const objectFunction = jest.fn().mockResolvedValue({ key: 'value' });
      const arrayFunction = jest.fn().mockResolvedValue([1, 2, 3]);
      const nullFunction = jest.fn().mockResolvedValue(null);
      const undefinedFunction = jest.fn().mockResolvedValue(undefined);

      const results = await Promise.all([
        rateLimiter.execute(stringFunction),
        rateLimiter.execute(numberFunction),
        rateLimiter.execute(booleanFunction),
        rateLimiter.execute(objectFunction),
        rateLimiter.execute(arrayFunction),
        rateLimiter.execute(nullFunction),
        rateLimiter.execute(undefinedFunction),
      ]);

      expect(results).toEqual(['string', 42, true, { key: 'value' }, [1, 2, 3], null, undefined]);
    });

    it('should handle functions that throw synchronous errors', async () => {
      const mockFunction = jest.fn().mockImplementation(() => {
        throw new Error('Synchronous error');
      });

      await expect(rateLimiter.execute(mockFunction)).rejects.toThrow('Synchronous error');
      expect(mockFunction).toHaveBeenCalledTimes(1);
    });

    it('should handle functions that throw asynchronous errors', async () => {
      const mockFunction = jest.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
        throw new Error('Asynchronous error');
      });

      await expect(rateLimiter.execute(mockFunction)).rejects.toThrow('Asynchronous error');
      expect(mockFunction).toHaveBeenCalledTimes(1);
    });
  });

  describe('Environment Variable Handling', () => {
    it('should handle empty string environment variables', () => {
      process.env.POLYGON_REQUESTS_PER_SECOND = '';
      process.env.POLYGON_REQUESTS_PER_MINUTE = '';

      const rateLimiter = getPolygonRateLimiter();
      expect(rateLimiter).toBeInstanceOf(RateLimiter);
      expect(console.log).toHaveBeenCalledWith('Rate limiting Polygon.io requests to 5.00 requests per second');
    });

    it('should handle undefined environment variables', () => {
      process.env.POLYGON_REQUESTS_PER_SECOND = undefined;
      process.env.POLYGON_REQUESTS_PER_MINUTE = undefined;

      const rateLimiter = getPolygonRateLimiter();
      expect(rateLimiter).toBeInstanceOf(RateLimiter);
      expect(console.log).toHaveBeenCalledWith('Rate limiting Polygon.io requests to 5.00 requests per second');
    });

    it('should handle null environment variables', () => {
      process.env.POLYGON_REQUESTS_PER_SECOND = null as any;
      process.env.POLYGON_REQUESTS_PER_MINUTE = null as any;

      const rateLimiter = getPolygonRateLimiter();
      expect(rateLimiter).toBeInstanceOf(RateLimiter);
      expect(console.log).toHaveBeenCalledWith('Rate limiting Polygon.io requests to 5.00 requests per second');
    });

    it('should handle whitespace-only environment variables', () => {
      process.env.POLYGON_REQUESTS_PER_SECOND = '   ';
      process.env.POLYGON_REQUESTS_PER_MINUTE = '   ';

      const rateLimiter = getPolygonRateLimiter();
      expect(rateLimiter).toBeInstanceOf(RateLimiter);
      expect(console.log).toHaveBeenCalledWith('Rate limiting Polygon.io requests to 5.00 requests per second');
    });

    it('should handle environment variables with leading/trailing whitespace', () => {
      process.env.POLYGON_REQUESTS_PER_SECOND = '  10  ';
      process.env.POLYGON_REQUESTS_PER_MINUTE = '  600  ';

      const rateLimiter = getPolygonRateLimiter();
      expect(rateLimiter).toBeInstanceOf(RateLimiter);
      expect(console.log).toHaveBeenCalledWith('Rate limiting Polygon.io requests to 10.00 requests per second');
    });

    it('should handle very high rate limits', () => {
      process.env.POLYGON_REQUESTS_PER_SECOND = '1000';
      process.env.POLYGON_REQUESTS_PER_MINUTE = '60000';

      const rateLimiter = getPolygonRateLimiter();
      expect(rateLimiter).toBeInstanceOf(RateLimiter);
      expect(console.log).toHaveBeenCalledWith('Rate limiting Polygon.io requests to 1000.00 requests per second');
    });

    it('should handle very low rate limits', () => {
      process.env.POLYGON_REQUESTS_PER_SECOND = '0.1';
      process.env.POLYGON_REQUESTS_PER_MINUTE = '6';

      const rateLimiter = getPolygonRateLimiter();
      expect(rateLimiter).toBeInstanceOf(RateLimiter);
      expect(console.log).toHaveBeenCalledWith('Rate limiting Polygon.io requests to 0.10 requests per second');
    });
  });

  describe('Rate Limit Calculation Logic', () => {
    it('should prefer per-second limit when it is more restrictive', () => {
      process.env.POLYGON_REQUESTS_PER_SECOND = '2';
      process.env.POLYGON_REQUESTS_PER_MINUTE = '300'; // 5 per second

      const rateLimiter = getPolygonRateLimiter();
      expect(rateLimiter).toBeInstanceOf(RateLimiter);
      expect(console.log).toHaveBeenCalledWith('Rate limiting Polygon.io requests to 2.00 requests per second');
    });

    it('should prefer per-minute limit when it is more restrictive', () => {
      process.env.POLYGON_REQUESTS_PER_SECOND = '10';
      process.env.POLYGON_REQUESTS_PER_MINUTE = '120'; // 2 per second

      const rateLimiter = getPolygonRateLimiter();
      expect(rateLimiter).toBeInstanceOf(RateLimiter);
      expect(console.log).toHaveBeenCalledWith('Rate limiting Polygon.io requests to 2.00 requests per second');
    });

    it('should handle equal limits', () => {
      process.env.POLYGON_REQUESTS_PER_SECOND = '5';
      process.env.POLYGON_REQUESTS_PER_MINUTE = '300'; // 5 per second

      const rateLimiter = getPolygonRateLimiter();
      expect(rateLimiter).toBeInstanceOf(RateLimiter);
      expect(console.log).toHaveBeenCalledWith('Rate limiting Polygon.io requests to 5.00 requests per second');
    });

    it('should handle mixed valid and invalid environment variables', () => {
      process.env.POLYGON_REQUESTS_PER_SECOND = '10';
      process.env.POLYGON_REQUESTS_PER_MINUTE = 'invalid';

      const rateLimiter = getPolygonRateLimiter();
      expect(rateLimiter).toBeInstanceOf(RateLimiter);
      expect(console.log).toHaveBeenCalledWith('Rate limiting Polygon.io requests to 5.00 requests per second');
    });

    it('should handle one valid and one missing environment variable', () => {
      process.env.POLYGON_REQUESTS_PER_SECOND = '8';
      delete process.env.POLYGON_REQUESTS_PER_MINUTE;

      const rateLimiter = getPolygonRateLimiter();
      expect(rateLimiter).toBeInstanceOf(RateLimiter);
      expect(console.log).toHaveBeenCalledWith('Rate limiting Polygon.io requests to 5.00 requests per second');
    });
  });

  describe('Integration with RateLimiter', () => {
    it('should work with the base RateLimiter execute method', async () => {
      const rateLimiter = getPolygonRateLimiter();

      // Test that the execute method exists and works
      expect(typeof rateLimiter.execute).toBe('function');

      const mockFunction = jest.fn().mockResolvedValue('integration test');
      const result = await rateLimiter.execute(mockFunction);

      expect(result).toBe('integration test');
      expect(mockFunction).toHaveBeenCalledTimes(1);
    });

    it('should maintain rate limiting behavior across multiple instances', async () => {
      const rateLimiter1 = getPolygonRateLimiter();
      const rateLimiter2 = getPolygonRateLimiter();

      const mockFunction = jest.fn().mockResolvedValue('result');

      // Both instances should work independently
      const result1 = await rateLimiter1.execute(mockFunction);
      const result2 = await rateLimiter2.execute(mockFunction);

      expect(result1).toBe('result');
      expect(result2).toBe('result');
      expect(mockFunction).toHaveBeenCalledTimes(2);
    });

    it('should handle rapid successive calls', async () => {
      const testRateLimiter = getPolygonRateLimiter();
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
      const testRateLimiter = getPolygonRateLimiter();
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
});
