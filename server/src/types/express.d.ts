import { Request, Response, NextFunction } from 'express';
import { JWTPayload } from './index';

declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
    }
  }
}

export interface AuthenticatedRequest extends Request {
  user?: JWTPayload;
}
