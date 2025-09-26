import pLimit from 'p-limit';

export class RateLimiter {
  private limit: ReturnType<typeof pLimit>;
  private delayMs: number;

  constructor(requestsPerSecond: number) {
    // Create a concurrency limiter that allows only 1 request at a time
    this.limit = pLimit(1);
    // Calculate delay between requests to achieve the desired RPS
    this.delayMs = 1000 / requestsPerSecond;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    return this.limit(async () => {
      const result = await fn();
      // Add delay to respect rate limits
      if (this.delayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, this.delayMs));
      }
      return result;
    });
  }
}
