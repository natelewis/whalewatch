// Test file for rate-limiter utility
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

describe('RateLimiter', () => {
  beforeEach(() => {
    // Reset environment variables before each test
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    // Restore original environment variables
    process.env = originalEnv;
  });

  describe('RateLimiter Constructor', () => {
    it('should create a RateLimiter instance with valid requests per second', () => {
      const rateLimiter = new RateLimiter(10);
      expect(rateLimiter).toBeInstanceOf(RateLimiter);
    });

    it('should handle zero requests per second', () => {
      const rateLimiter = new RateLimiter(0);
      expect(rateLimiter).toBeInstanceOf(RateLimiter);
    });

    it('should handle fractional requests per second', () => {
      const rateLimiter = new RateLimiter(0.5);
      expect(rateLimiter).toBeInstanceOf(RateLimiter);
    });

    it('should handle very high requests per second', () => {
      const rateLimiter = new RateLimiter(1000);
      expect(rateLimiter).toBeInstanceOf(RateLimiter);
    });

    it('should handle negative requests per second', () => {
      const rateLimiter = new RateLimiter(-5);
      expect(rateLimiter).toBeInstanceOf(RateLimiter);
    });
  });

  describe('RateLimiter Execute Method', () => {
    let rateLimiter: RateLimiter;

    beforeEach(() => {
      // Use a fast rate limit for testing to avoid long delays
      rateLimiter = new RateLimiter(100); // 100 requests per second
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
      const slowRateLimiter = new RateLimiter(1); // 1 request per second

      const mockFunction = jest.fn().mockResolvedValue('result');
      const startTime = Date.now();

      // Execute two functions
      await slowRateLimiter.execute(mockFunction);
      await slowRateLimiter.execute(mockFunction);

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should take at least 1 second due to rate limiting
      expect(duration).toBeGreaterThanOrEqual(1000);
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

  describe('Rate Limiting Behavior', () => {
    it('should enforce rate limiting with zero delay for high RPS', async () => {
      const highRateLimiter = new RateLimiter(1000); // Very high RPS
      const mockFunction = jest.fn().mockResolvedValue('result');

      const startTime = Date.now();
      await highRateLimiter.execute(mockFunction);
      const endTime = Date.now();

      // Should execute quickly with minimal delay (allowing for mock delay)
      expect(endTime - startTime).toBeLessThan(200);
      expect(mockFunction).toHaveBeenCalledTimes(1);
    });

    it('should enforce rate limiting with appropriate delay for low RPS', async () => {
      const lowRateLimiter = new RateLimiter(0.5); // 0.5 requests per second = 2 second delay
      const mockFunction = jest.fn().mockResolvedValue('result');

      const startTime = Date.now();
      await lowRateLimiter.execute(mockFunction);
      const endTime = Date.now();

      // Should have some delay
      expect(endTime - startTime).toBeGreaterThan(100);
      expect(mockFunction).toHaveBeenCalledTimes(1);
    });

    it('should handle concurrent execution properly', async () => {
      const testRateLimiter = new RateLimiter(100); // 100 requests per second
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

  describe('Edge Cases', () => {
    it('should handle functions that return promises', async () => {
      const testRateLimiter = new RateLimiter(100);
      const promiseFunction = jest.fn().mockResolvedValue(Promise.resolve('promise result'));

      const result = await testRateLimiter.execute(promiseFunction);

      expect(result).toBe('promise result');
      expect(promiseFunction).toHaveBeenCalledTimes(1);
    });

    it('should handle functions that return rejected promises', async () => {
      const testRateLimiter = new RateLimiter(100);
      const rejectedPromiseFunction = jest.fn().mockImplementation(async () => {
        throw new Error('Promise error');
      });

      await expect(testRateLimiter.execute(rejectedPromiseFunction)).rejects.toThrow('Promise error');
      expect(rejectedPromiseFunction).toHaveBeenCalledTimes(1);
    });

    it('should handle functions with complex return values', async () => {
      const testRateLimiter = new RateLimiter(100);
      const complexObject = {
        nested: {
          array: [1, 2, { deep: 'value' }],
          function: () => 'test',
        },
        date: new Date('2023-01-01'),
        regex: /test/gi,
      };

      const complexFunction = jest.fn().mockResolvedValue(complexObject);

      const result = await testRateLimiter.execute(complexFunction);

      expect(result).toEqual(complexObject);
      expect(complexFunction).toHaveBeenCalledTimes(1);
    });

    it('should handle functions that modify external state', async () => {
      const testRateLimiter = new RateLimiter(100);
      let externalState = 0;
      const stateModifyingFunction = jest.fn().mockImplementation(async () => {
        externalState += 1;
        return externalState;
      });

      const result = await testRateLimiter.execute(stateModifyingFunction);

      expect(result).toBe(1);
      expect(externalState).toBe(1);
      expect(stateModifyingFunction).toHaveBeenCalledTimes(1);
    });
  });
});
