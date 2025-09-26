import { RateLimiter } from './rate-limiter';

export const getPolygonRateLimiter = (): RateLimiter => {
  // Read from environment variables with more aggressive defaults for backfilling
  const requestsPerSecond = parseFloat(process.env.POLYGON_REQUESTS_PER_SECOND || '5.0');
  const requestsPerMinute = parseFloat(process.env.POLYGON_REQUESTS_PER_MINUTE || '300');

  // Handle invalid values by falling back to defaults
  const validRequestsPerSecond = isNaN(requestsPerSecond) ? 5.0 : requestsPerSecond;
  const validRequestsPerMinute = isNaN(requestsPerMinute) ? 300 : requestsPerMinute;

  // Use the more restrictive limit between per-second and per-minute
  const effectiveRPS = Math.min(validRequestsPerSecond, validRequestsPerMinute / 60);

  console.log(`Rate limiting Polygon.io requests to ${effectiveRPS.toFixed(2)} requests per second`);

  return new RateLimiter(effectiveRPS);
};
