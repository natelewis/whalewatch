// ============================================================================
// ERROR HANDLING UTILITIES - Using neverthrow for robust error handling
// ============================================================================

import { Result, Ok, Err, ResultAsync } from 'neverthrow';
import { AxiosError } from 'axios';

// ============================================================================
// ERROR TYPES
// ============================================================================

export interface AppError {
  message: string;
  type: string;
  status?: number;
  code?: string;
  isRetryable?: boolean;
  isUserFriendly?: boolean;
}

export type ErrorType =
  | 'NETWORK_ERROR'
  | 'VALIDATION_ERROR'
  | 'AUTHENTICATION_ERROR'
  | 'AUTHORIZATION_ERROR'
  | 'NOT_FOUND_ERROR'
  | 'RATE_LIMIT_ERROR'
  | 'SERVER_ERROR'
  | 'CLIENT_ERROR'
  | 'UNKNOWN_ERROR'
  | 'ALPACA_API_ERROR'
  | 'QUESTDB_ERROR'
  | 'WEBSOCKET_ERROR'
  | 'STORAGE_ERROR';

// ============================================================================
// ERROR PARSING UTILITIES
// ============================================================================

/**
 * Parse any error into a structured AppError
 */
export function parseError(error: unknown): AppError {
  // Handle Axios errors
  if (isAxiosError(error)) {
    return parseAxiosError(error);
  }

  // Handle regular Error instances
  if (error instanceof Error) {
    return {
      message: error.message,
      type: 'UNKNOWN_ERROR',
      isRetryable: false,
      isUserFriendly: true,
    };
  }

  // Handle string errors
  if (typeof error === 'string') {
    return {
      message: error,
      type: 'UNKNOWN_ERROR',
      isRetryable: false,
      isUserFriendly: true,
    };
  }

  // Handle unknown errors
  return {
    message: 'An unknown error occurred',
    type: 'UNKNOWN_ERROR',
    isRetryable: false,
    isUserFriendly: false,
  };
}

/**
 * Type guard for Axios errors
 */
function isAxiosError(error: unknown): error is AxiosError {
  return error !== null && typeof error === 'object' && 'isAxiosError' in error && error.isAxiosError === true;
}

/**
 * Parse Axios errors into structured format
 */
function parseAxiosError(error: AxiosError): AppError {
  const response = error.response;
  const status = response?.status;
  const data = response?.data;

  // Extract error message
  let message = 'Network request failed';
  let type: ErrorType = 'NETWORK_ERROR';
  let code: string | undefined;

  if (data && typeof data === 'object') {
    const dataObj = data as { error?: string; message?: string; code?: string };
    message = dataObj.error || dataObj.message || message;
    code = dataObj.code;
  }

  // Determine error type based on status
  if (status) {
    switch (status) {
      case 400:
        type = 'VALIDATION_ERROR';
        break;
      case 401:
        type = 'AUTHENTICATION_ERROR';
        break;
      case 403:
        type = 'AUTHORIZATION_ERROR';
        break;
      case 404:
        type = 'NOT_FOUND_ERROR';
        break;
      case 429:
        type = 'RATE_LIMIT_ERROR';
        break;
      case 500:
      case 502:
      case 503:
      case 504:
        type = 'SERVER_ERROR';
        break;
      default:
        if (status >= 400 && status < 500) {
          type = 'CLIENT_ERROR';
        } else if (status >= 500) {
          type = 'SERVER_ERROR';
        }
    }
  }

  // Check for specific API errors
  if (message.toLowerCase().includes('alpaca')) {
    type = 'ALPACA_API_ERROR';
  }

  return {
    message,
    type,
    status,
    code,
    isRetryable: type === 'RATE_LIMIT_ERROR' || status === 503,
    isUserFriendly: true,
  };
}

// ============================================================================
// NEVERTHROW UTILITIES
// ============================================================================

/**
 * Wrap a function that might throw into a Result
 */
export function safeCall<T>(fn: () => T): Result<T, AppError> {
  try {
    const result = fn();
    return new Ok(result);
  } catch (error) {
    return new Err(parseError(error));
  }
}

/**
 * Wrap an async function that might throw into a ResultAsync
 */
export function safeCallAsync<T>(fn: () => Promise<T>): ResultAsync<T, AppError> {
  return ResultAsync.fromPromise(fn(), error => parseError(error));
}

/**
 * Convert a Promise that might reject into a ResultAsync
 */
export function safePromise<T>(promise: Promise<T>): ResultAsync<T, AppError> {
  return ResultAsync.fromPromise(promise, error => parseError(error));
}

/**
 * Create a user-friendly error message
 */
export function createUserFriendlyMessage(error: AppError): string {
  if (error.isUserFriendly) {
    return error.message;
  }

  // Convert technical errors to user-friendly messages
  switch (error.type) {
    case 'NETWORK_ERROR':
      return 'Unable to connect to the server. Please check your internet connection and try again.';
    case 'VALIDATION_ERROR':
      return 'Please check your input and try again.';
    case 'AUTHENTICATION_ERROR':
      return 'Please log in to continue.';
    case 'AUTHORIZATION_ERROR':
      return 'You do not have permission to perform this action.';
    case 'NOT_FOUND_ERROR':
      return 'The requested resource was not found.';
    case 'RATE_LIMIT_ERROR':
      return 'Too many requests. Please wait a moment and try again.';
    case 'SERVER_ERROR':
      return 'Something went wrong on our end. Please try again later.';
    case 'ALPACA_API_ERROR':
      return 'There was an issue with the market data service. Please try again later.';
    case 'QUESTDB_ERROR':
      return 'There was an issue with the database. Please try again later.';
    default:
      return 'An unexpected error occurred. Please try again.';
  }
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Create a React error handler that uses setState
 */
export function createReactErrorHandler(setError: (error: string) => void) {
  return (error: unknown) => {
    const parsedError = parseError(error);
    const userMessage = createUserFriendlyMessage(parsedError);
    setError(userMessage);
  };
}

/**
 * Create an Express error handler
 */
export function createExpressErrorHandler(res: { status: (code: number) => { json: (data: unknown) => void } }) {
  return (error: unknown) => {
    const parsedError = parseError(error);
    const userMessage = createUserFriendlyMessage(parsedError);

    res.status(parsedError.status || 500).json({
      error: userMessage,
      code: parsedError.code,
      type: parsedError.type,
      timestamp: new Date().toISOString(),
    });
  };
}

// ============================================================================
// RE-EXPORT NEVERTHROW TYPES AND UTILITIES
// ============================================================================

export { Result, Ok, Err, ResultAsync } from 'neverthrow';
export type { Result as ResultType } from 'neverthrow';
