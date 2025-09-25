// Test utility types for Jest mocks
import { Request, Response, NextFunction } from 'express';

export type MockRequest = Partial<Request>;
export type MockResponse = Partial<Response>;
export type MockNextFunction = NextFunction;

export type ExpressMiddleware = (req: Request, res: Response, next: NextFunction) => void;
export type MockExpressMiddleware = (req: MockRequest, res: MockResponse, next: MockNextFunction) => void;

export type JestMockFunction = jest.MockedFunction<ExpressMiddleware>;
export type JestMockMiddleware = jest.MockedFunction<MockExpressMiddleware>;
