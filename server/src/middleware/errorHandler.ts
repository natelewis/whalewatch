import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../types';

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  console.error('Error:', err);

  // Default error
  let error: ApiError = {
    message: 'Internal Server Error',
    status: 500
  };

  // Handle specific error types
  if (err.name === 'ValidationError') {
    error = {
      message: 'Validation Error',
      status: 400,
      code: 'VALIDATION_ERROR'
    };
  } else if (err.name === 'UnauthorizedError') {
    error = {
      message: 'Unauthorized',
      status: 401,
      code: 'UNAUTHORIZED'
    };
  } else if (err.name === 'ForbiddenError') {
    error = {
      message: 'Forbidden',
      status: 403,
      code: 'FORBIDDEN'
    };
  } else if (err.name === 'NotFoundError') {
    error = {
      message: 'Not Found',
      status: 404,
      code: 'NOT_FOUND'
    };
  } else if (err.name === 'AlpacaAPIError') {
    error = {
      message: 'Alpaca API Error',
      status: 502,
      code: 'ALPACA_API_ERROR'
    };
  }

  res.status(error.status).json({
    error: error.message,
    code: error.code,
    timestamp: new Date().toISOString(),
    path: req.path
  });
};
