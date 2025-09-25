import { Request, Response } from 'express';
import { errorHandler } from '../../middleware/errorHandler';

describe('Error Handler Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockStatus: jest.Mock;
  let mockJson: jest.Mock;
  let mockConsoleError: jest.SpyInstance;

  beforeEach(() => {
    mockRequest = {
      path: '/api/test',
    };

    mockJson = jest.fn().mockReturnThis();
    mockStatus = jest.fn().mockReturnValue({
      json: mockJson,
    });

    mockResponse = {
      status: mockStatus,
      json: mockJson,
    };

    // Mock console.error for each test
    mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Default Error Handling', () => {
    it('should handle generic errors with default response', () => {
      const genericError = new Error('Something went wrong');

      errorHandler(genericError, mockRequest as Request, mockResponse as Response);

      expect(mockConsoleError).toHaveBeenCalledWith('Error:', genericError);
      expect(mockStatus).toHaveBeenCalledWith(500);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Internal Server Error',
        code: undefined,
        timestamp: expect.any(String),
        path: '/api/test',
      });
    });

    it('should handle errors without name property', () => {
      const errorWithoutName = { message: 'Custom error' } as Error;

      errorHandler(errorWithoutName, mockRequest as Request, mockResponse as Response);

      expect(mockConsoleError).toHaveBeenCalledWith('Error:', errorWithoutName);
      expect(mockStatus).toHaveBeenCalledWith(500);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Internal Server Error',
        code: undefined,
        timestamp: expect.any(String),
        path: '/api/test',
      });
    });

    it('should handle null/undefined errors gracefully', () => {
      const nullError = null as unknown as Error;

      errorHandler(nullError, mockRequest as Request, mockResponse as Response);

      expect(mockConsoleError).toHaveBeenCalledWith('Error:', nullError);
      expect(mockStatus).toHaveBeenCalledWith(500);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Internal Server Error',
        code: undefined,
        timestamp: expect.any(String),
        path: '/api/test',
      });
    });
  });

  describe('Specific Error Type Handling', () => {
    it('should handle ValidationError correctly', () => {
      const validationError = new Error('Invalid input');
      validationError.name = 'ValidationError';

      errorHandler(validationError, mockRequest as Request, mockResponse as Response);

      expect(mockConsoleError).toHaveBeenCalledWith('Error:', validationError);
      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Validation Error',
        code: 'VALIDATION_ERROR',
        timestamp: expect.any(String),
        path: '/api/test',
      });
    });

    it('should handle UnauthorizedError correctly', () => {
      const unauthorizedError = new Error('Access denied');
      unauthorizedError.name = 'UnauthorizedError';

      errorHandler(unauthorizedError, mockRequest as Request, mockResponse as Response);

      expect(mockConsoleError).toHaveBeenCalledWith('Error:', unauthorizedError);
      expect(mockStatus).toHaveBeenCalledWith(401);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Unauthorized',
        code: 'UNAUTHORIZED',
        timestamp: expect.any(String),
        path: '/api/test',
      });
    });

    it('should handle ForbiddenError correctly', () => {
      const forbiddenError = new Error('Permission denied');
      forbiddenError.name = 'ForbiddenError';

      errorHandler(forbiddenError, mockRequest as Request, mockResponse as Response);

      expect(mockConsoleError).toHaveBeenCalledWith('Error:', forbiddenError);
      expect(mockStatus).toHaveBeenCalledWith(403);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Forbidden',
        code: 'FORBIDDEN',
        timestamp: expect.any(String),
        path: '/api/test',
      });
    });

    it('should handle NotFoundError correctly', () => {
      const notFoundError = new Error('Resource not found');
      notFoundError.name = 'NotFoundError';

      errorHandler(notFoundError, mockRequest as Request, mockResponse as Response);

      expect(mockConsoleError).toHaveBeenCalledWith('Error:', notFoundError);
      expect(mockStatus).toHaveBeenCalledWith(404);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Not Found',
        code: 'NOT_FOUND',
        timestamp: expect.any(String),
        path: '/api/test',
      });
    });

    it('should handle AlpacaAPIError correctly', () => {
      const alpacaError = new Error('Alpaca service unavailable');
      alpacaError.name = 'AlpacaAPIError';

      errorHandler(alpacaError, mockRequest as Request, mockResponse as Response);

      expect(mockConsoleError).toHaveBeenCalledWith('Error:', alpacaError);
      expect(mockStatus).toHaveBeenCalledWith(502);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Alpaca API Error',
        code: 'ALPACA_API_ERROR',
        timestamp: expect.any(String),
        path: '/api/test',
      });
    });
  });

  describe('Error Response Structure', () => {
    it('should include all required fields in error response', () => {
      const testError = new Error('Test error');
      testError.name = 'ValidationError';

      errorHandler(testError, mockRequest as Request, mockResponse as Response);

      const responseCall = mockJson.mock.calls[0][0];

      expect(responseCall).toHaveProperty('error');
      expect(responseCall).toHaveProperty('code');
      expect(responseCall).toHaveProperty('timestamp');
      expect(responseCall).toHaveProperty('path');

      expect(typeof responseCall.error).toBe('string');
      expect(typeof responseCall.code).toBe('string');
      expect(typeof responseCall.timestamp).toBe('string');
      expect(typeof responseCall.path).toBe('string');
    });

    it('should generate valid ISO timestamp', () => {
      const testError = new Error('Test error');
      const beforeTime = new Date().toISOString();

      errorHandler(testError, mockRequest as Request, mockResponse as Response);

      const afterTime = new Date().toISOString();
      const responseCall = mockJson.mock.calls[0][0];

      expect(responseCall.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

      const timestamp = new Date(responseCall.timestamp);
      const before = new Date(beforeTime);
      const after = new Date(afterTime);

      expect(timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should include request path in error response', () => {
      const testError = new Error('Test error');
      const customRequest = { path: '/api/custom/endpoint' } as Request;

      errorHandler(testError, customRequest, mockResponse as Response);

      const responseCall = mockJson.mock.calls[0][0];
      expect(responseCall.path).toBe('/api/custom/endpoint');
    });

    it('should handle empty request path', () => {
      const testError = new Error('Test error');
      const emptyPathRequest = { path: '' } as Request;

      errorHandler(testError, emptyPathRequest, mockResponse as Response);

      const responseCall = mockJson.mock.calls[0][0];
      expect(responseCall.path).toBe('');
    });

    it('should handle undefined request path', () => {
      const testError = new Error('Test error');
      const noPathRequest = {} as Request;

      errorHandler(testError, noPathRequest, mockResponse as Response);

      const responseCall = mockJson.mock.calls[0][0];
      expect(responseCall.path).toBeUndefined();
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle errors with custom properties', () => {
      const customError = new Error('Custom error');
      customError.name = 'CustomErrorType';
      (customError as any).customProperty = 'custom value';

      errorHandler(customError, mockRequest as Request, mockResponse as Response);

      expect(mockConsoleError).toHaveBeenCalledWith('Error:', customError);
      expect(mockStatus).toHaveBeenCalledWith(500); // Should fall back to default
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Internal Server Error',
        code: undefined,
        timestamp: expect.any(String),
        path: '/api/test',
      });
    });

    it('should handle errors with empty name', () => {
      const emptyNameError = new Error('Error with empty name');
      emptyNameError.name = '';

      errorHandler(emptyNameError, mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(500);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Internal Server Error',
        code: undefined,
        timestamp: expect.any(String),
        path: '/api/test',
      });
    });

    it('should handle errors with whitespace-only name', () => {
      const whitespaceNameError = new Error('Error with whitespace name');
      whitespaceNameError.name = '   ';

      errorHandler(whitespaceNameError, mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(500);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Internal Server Error',
        code: undefined,
        timestamp: expect.any(String),
        path: '/api/test',
      });
    });

    it('should handle case-sensitive error names', () => {
      const caseSensitiveError = new Error('Case sensitive error');
      caseSensitiveError.name = 'validationerror'; // lowercase

      errorHandler(caseSensitiveError, mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(500); // Should not match 'ValidationError'
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Internal Server Error',
        code: undefined,
        timestamp: expect.any(String),
        path: '/api/test',
      });
    });

    it('should handle errors with special characters in name', () => {
      const specialCharError = new Error('Special character error');
      specialCharError.name = 'ValidationError@#$%';

      errorHandler(specialCharError, mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(500);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Internal Server Error',
        code: undefined,
        timestamp: expect.any(String),
        path: '/api/test',
      });
    });
  });

  describe('Console Logging', () => {
    it('should log all errors to console.error', () => {
      const testError = new Error('Test error');
      testError.name = 'ValidationError';

      errorHandler(testError, mockRequest as Request, mockResponse as Response);

      expect(mockConsoleError).toHaveBeenCalledTimes(1);
      expect(mockConsoleError).toHaveBeenCalledWith('Error:', testError);
    });

    it('should log errors even when response fails', () => {
      const testError = new Error('Test error');
      const failingResponse = {
        status: jest.fn().mockImplementation(() => {
          throw new Error('Response failed');
        }),
      } as unknown as Response;

      // Should not throw, should handle gracefully
      expect(() => {
        errorHandler(testError, mockRequest as Request, failingResponse);
      }).not.toThrow();

      expect(mockConsoleError).toHaveBeenCalledWith('Error:', testError);
    });
  });

  describe('Status Code Validation', () => {
    it('should return correct status codes for all error types', () => {
      const errorTypes = [
        { name: 'ValidationError', expectedStatus: 400 },
        { name: 'UnauthorizedError', expectedStatus: 401 },
        { name: 'ForbiddenError', expectedStatus: 403 },
        { name: 'NotFoundError', expectedStatus: 404 },
        { name: 'AlpacaAPIError', expectedStatus: 502 },
      ];

      errorTypes.forEach(({ name, expectedStatus }) => {
        const error = new Error(`Test ${name}`);
        error.name = name;

        // Clear previous calls
        mockStatus.mockClear();
        mockJson.mockClear();

        errorHandler(error, mockRequest as Request, mockResponse as Response);

        expect(mockStatus).toHaveBeenCalledWith(expectedStatus);
      });
    });

    it('should return 500 for unknown error types', () => {
      const unknownError = new Error('Unknown error');
      unknownError.name = 'UnknownErrorType';

      errorHandler(unknownError, mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(500);
    });
  });

  describe('Response Method Chaining', () => {
    it('should properly chain status and json methods', () => {
      const testError = new Error('Test error');
      testError.name = 'ValidationError';

      errorHandler(testError, mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith(expect.any(Object));

      // Verify that both methods were called
      expect(mockStatus).toHaveBeenCalled();
      expect(mockJson).toHaveBeenCalled();
    });

    it('should handle response object without proper chaining', () => {
      const testError = new Error('Test error');
      const brokenResponse = {
        status: jest.fn().mockReturnValue({}), // Returns empty object instead of chained response
        json: jest.fn(),
      } as unknown as Response;

      // Should not throw, should handle gracefully
      expect(() => {
        errorHandler(testError, mockRequest as Request, brokenResponse);
      }).not.toThrow();

      expect(mockConsoleError).toHaveBeenCalledWith('Error:', testError);
    });
  });

  describe('Integration Tests', () => {
    it('should handle complete error flow with all components', () => {
      const comprehensiveError = new Error('Comprehensive test error');
      comprehensiveError.name = 'NotFoundError';
      comprehensiveError.stack = 'Error stack trace';

      const comprehensiveRequest = {
        path: '/api/comprehensive/test',
        method: 'GET',
        headers: { 'user-agent': 'test-agent' },
      } as Request;

      errorHandler(comprehensiveError, comprehensiveRequest, mockResponse as Response);

      // Verify console logging
      expect(mockConsoleError).toHaveBeenCalledWith('Error:', comprehensiveError);

      // Verify status code
      expect(mockStatus).toHaveBeenCalledWith(404);

      // Verify response structure
      const responseCall = mockJson.mock.calls[0][0];
      expect(responseCall).toEqual({
        error: 'Not Found',
        code: 'NOT_FOUND',
        timestamp: expect.any(String),
        path: '/api/comprehensive/test',
      });
    });

    it('should handle multiple consecutive errors', () => {
      const errors = [
        { error: new Error('Error 1'), name: 'ValidationError', expectedStatus: 400 },
        { error: new Error('Error 2'), name: 'UnauthorizedError', expectedStatus: 401 },
        { error: new Error('Error 3'), name: 'NotFoundError', expectedStatus: 404 },
      ];

      errors.forEach(({ error, name, expectedStatus }) => {
        error.name = name;

        // Clear previous calls
        mockStatus.mockClear();
        mockJson.mockClear();
        mockConsoleError.mockClear();

        errorHandler(error, mockRequest as Request, mockResponse as Response);

        expect(mockConsoleError).toHaveBeenCalledWith('Error:', error);
        expect(mockStatus).toHaveBeenCalledWith(expectedStatus);
        expect(mockJson).toHaveBeenCalledWith(
          expect.objectContaining({
            error: expect.any(String),
            code: expect.any(String),
            timestamp: expect.any(String),
            path: '/api/test',
          })
        );
      });
    });
  });
});
