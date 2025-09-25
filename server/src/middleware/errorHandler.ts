import { Request, Response } from 'express';
import { ApiError } from '../types';

export const errorHandler = (err: Error, req: Request, res: Response): void => {
  console.error('Error:', err);

  // Default error
  let error: ApiError = {
    message: 'Internal Server Error',
    status: 500,
  };

  // Handle specific error types (only if err and err.name exist)
  if (err && err.name === 'ValidationError') {
    error = {
      message: 'Validation Error',
      status: 400,
      code: 'VALIDATION_ERROR',
    };
  } else if (err && err.name === 'UnauthorizedError') {
    error = {
      message: 'Unauthorized',
      status: 401,
      code: 'UNAUTHORIZED',
    };
  } else if (err && err.name === 'ForbiddenError') {
    error = {
      message: 'Forbidden',
      status: 403,
      code: 'FORBIDDEN',
    };
  } else if (err && err.name === 'NotFoundError') {
    error = {
      message: 'Not Found',
      status: 404,
      code: 'NOT_FOUND',
    };
  } else if (err && err.name === 'AlpacaAPIError') {
    error = {
      message: 'Alpaca API Error',
      status: 502,
      code: 'ALPACA_API_ERROR',
    };
  }

  try {
    res.status(error.status).json({
      error: error.message,
      code: error.code,
      timestamp: new Date().toISOString(),
      path: req.path,
    });
  } catch {
    // If response fails, try to send basic error response
    try {
      res.status(error.status).send({
        error: error.message,
        code: error.code,
        timestamp: new Date().toISOString(),
        path: req.path,
      });
    } catch (fallbackError) {
      // If even basic response fails, just log the error
      console.error('Failed to send error response:', fallbackError);
    }
  }
};
