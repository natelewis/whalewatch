import { RateLimiter } from './rate-limiter';

// Alpaca has a limit of 200 API calls per minute
const ALPACA_REQUESTS_PER_MINUTE = parseInt(process.env.ALPACA_REQUESTS_PER_MINUTE || '200');
const ALPACA_REQUESTS_PER_SECOND = ALPACA_REQUESTS_PER_MINUTE / 60; // ~3.33 requests per second

export const getAlpacaRateLimiter = (): RateLimiter => {
  return new RateLimiter(ALPACA_REQUESTS_PER_SECOND);
};
