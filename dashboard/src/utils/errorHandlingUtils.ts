import { useState, useCallback, useRef } from 'react';
import { logger } from './logger';

export interface ErrorState {
  error: string | null;
  hasError: boolean;
  errorCount: number;
  lastError: string | null;
  lastErrorTime: number | null;
}

export interface ErrorHandlingOptions {
  maxRetries?: number;
  retryDelay?: number;
  onError?: (error: Error) => void;
  onRetry?: (attempt: number) => void;
  onSuccess?: () => void;
}

/**
 * Hook for managing error state
 */
export const useErrorState = (initialError: string | null = null) => {
  const [errorState, setErrorState] = useState<ErrorState>({
    error: initialError,
    hasError: !!initialError,
    errorCount: initialError ? 1 : 0,
    lastError: initialError,
    lastErrorTime: initialError ? Date.now() : null,
  });

  const setError = useCallback((error: string | null) => {
    setErrorState(prev => ({
      error,
      hasError: !!error,
      errorCount: error ? prev.errorCount + 1 : prev.errorCount,
      lastError: error || prev.lastError,
      lastErrorTime: error ? Date.now() : prev.lastErrorTime,
    }));

    if (error) {
      logger.error('Error state updated:', error);
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const resetErrorState = useCallback(() => {
    setErrorState({
      error: null,
      hasError: false,
      errorCount: 0,
      lastError: null,
      lastErrorTime: null,
    });
  }, []);

  return {
    ...errorState,
    setError,
    clearError,
    resetErrorState,
  };
};

/**
 * Hook for managing retry logic
 */
export const useRetry = (options: ErrorHandlingOptions = {}) => {
  const { maxRetries = 3, retryDelay = 1000, onError, onRetry, onSuccess } = options;

  const [retryCount, setRetryCount] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  const retry = useCallback(
    async <T>(operation: () => Promise<T>, customMaxRetries?: number): Promise<T> => {
      const maxAttempts = customMaxRetries ?? maxRetries;
      let attempt = 0;

      while (attempt <= maxAttempts) {
        try {
          setIsRetrying(attempt > 0);
          setRetryCount(attempt);

          if (attempt > 0) {
            onRetry?.(attempt);
            logger.chart.data(`Retry attempt ${attempt}/${maxAttempts}`);
          }

          const result = await operation();

          if (attempt > 0) {
            logger.chart.success(`Operation succeeded on attempt ${attempt + 1}`);
          }

          onSuccess?.();
          setIsRetrying(false);
          setRetryCount(0);

          return result;
        } catch (error) {
          attempt++;

          if (attempt <= maxAttempts) {
            logger.chart.data(`Operation failed, retrying in ${retryDelay}ms (attempt ${attempt}/${maxAttempts})`);

            await new Promise(resolve => {
              timeoutRef.current = window.setTimeout(resolve, retryDelay);
            });
          } else {
            logger.error(`Operation failed after ${maxAttempts} retries:`, error);
            onError?.(error as Error);
            setIsRetrying(false);
            throw error;
          }
        }
      }

      throw new Error('Retry logic failed');
    },
    [maxRetries, retryDelay, onError, onRetry, onSuccess]
  );

  const cancelRetry = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsRetrying(false);
  }, []);

  return {
    retry,
    retryCount,
    isRetrying,
    cancelRetry,
  };
};

/**
 * Hook for managing async operations with error handling
 */
export const useAsyncOperation = <T>(operation: () => Promise<T>, options: ErrorHandlingOptions = {}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [data, setData] = useState<T | null>(null);
  const { setError, clearError, hasError, error } = useErrorState();
  const { retry, isRetrying } = useRetry(options);

  const execute = useCallback(async () => {
    try {
      setIsLoading(true);
      clearError();

      const result = await retry(operation);
      setData(result);

      return result;
    } catch (caughtError) {
      const errorMessage = caughtError instanceof Error ? caughtError.message : 'Unknown error';
      setError(errorMessage);
      throw caughtError;
    } finally {
      setIsLoading(false);
    }
  }, [operation, retry, setError, clearError]);

  const reset = useCallback(() => {
    setData(null);
    clearError();
    setIsLoading(false);
  }, [clearError]);

  return {
    execute,
    reset,
    data,
    isLoading: isLoading || isRetrying,
    hasError,
    error,
  };
};

/**
 * Utility for creating error boundaries
 */
export const createErrorBoundary = (componentName: string) => {
  return (error: Error, errorInfo: React.ErrorInfo) => {
    logger.error(`Error boundary caught error in ${componentName}:`, {
      error: error.message,
      stack: error.stack,
      errorInfo,
    });
  };
};

/**
 * Utility for handling promise rejections
 */
export const handlePromiseRejection = <T>(promise: Promise<T>, context: string): Promise<T> => {
  return promise.catch(error => {
    logger.error(`Promise rejection in ${context}:`, error);
    throw error;
  });
};

/**
 * Utility for creating safe async functions
 */
export const createSafeAsyncFunction = <T extends unknown[], R>(fn: (...args: T) => Promise<R>, context: string) => {
  return async (...args: T): Promise<R> => {
    try {
      return await fn(...args);
    } catch (error) {
      logger.error(`Error in ${context}:`, error);
      throw error;
    }
  };
};

/**
 * Utility for creating safe sync functions
 */
export const createSafeSyncFunction = <T extends unknown[], R>(fn: (...args: T) => R, context: string) => {
  return (...args: T): R => {
    try {
      return fn(...args);
    } catch (error) {
      logger.error(`Error in ${context}:`, error);
      throw error;
    }
  };
};

/**
 * Utility for handling WebSocket errors
 */
export const handleWebSocketError = (error: Event | Error, context: string) => {
  const errorMessage = error instanceof Error ? error.message : `WebSocket error: ${error.type}`;

  logger.error(`WebSocket error in ${context}:`, {
    message: errorMessage,
    type: error instanceof Event ? error.type : 'Error',
  });

  return errorMessage;
};

/**
 * Utility for handling API errors
 */
export const handleApiError = (error: unknown, context: string): string => {
  let errorMessage = 'Unknown API error';

  if (error instanceof Error) {
    errorMessage = error.message;
  } else if (typeof error === 'string') {
    errorMessage = error;
  } else if (error && typeof error === 'object' && 'message' in error) {
    errorMessage = (error as { message: string }).message;
  } else if (error && typeof error === 'object' && 'response' in error) {
    const errorWithResponse = error as { response: { data?: { message?: string }; statusText?: string } };
    if (errorWithResponse.response.data?.message) {
      errorMessage = errorWithResponse.response.data.message;
    } else if (errorWithResponse.response.statusText) {
      errorMessage = errorWithResponse.response.statusText;
    }
  }

  logger.error(`API error in ${context}:`, {
    message: errorMessage,
    status:
      error && typeof error === 'object' && 'response' in error
        ? (error as { response: { status?: number } }).response.status
        : undefined,
    data:
      error && typeof error === 'object' && 'response' in error
        ? (error as { response: { data?: unknown } }).response.data
        : undefined,
  });

  return errorMessage;
};

/**
 * Utility for creating error messages
 */
export const createErrorMessage = (operation: string, details?: string): string => {
  const baseMessage = `Failed to ${operation}`;
  return details ? `${baseMessage}: ${details}` : baseMessage;
};

/**
 * Utility for logging errors with context
 */
export const logError = (error: Error | string, context: string, additionalInfo?: Record<string, unknown>) => {
  const errorMessage = error instanceof Error ? error.message : error;

  logger.error(`Error in ${context}:`, {
    message: errorMessage,
    stack: error instanceof Error ? error.stack : undefined,
    ...additionalInfo,
  });
};
