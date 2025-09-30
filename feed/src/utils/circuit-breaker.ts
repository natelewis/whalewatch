interface CircuitBreakerState {
  CLOSED: 'CLOSED';
  OPEN: 'OPEN';
  HALF_OPEN: 'HALF_OPEN';
}

interface CircuitBreakerOptions {
  failureThreshold: number;
  resetTimeout: number;
  monitoringPeriod: number;
}

interface CircuitBreakerMetrics {
  failures: number;
  successes: number;
  lastFailureTime: number | null;
  state: keyof CircuitBreakerState;
  totalRequests: number;
}

export class CircuitBreaker {
  private state: keyof CircuitBreakerState = 'CLOSED';
  private failures = 0;
  private successes = 0;
  private lastFailureTime: number | null = null;
  private totalRequests = 0;
  private readonly options: CircuitBreakerOptions;

  constructor(options: Partial<CircuitBreakerOptions> = {}) {
    this.options = {
      failureThreshold: options.failureThreshold || 5,
      resetTimeout: options.resetTimeout || 60000, // 1 minute
      monitoringPeriod: options.monitoringPeriod || 300000, // 5 minutes
    };
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    this.totalRequests++;

    if (this.state === 'OPEN') {
      if (this.shouldAttemptReset()) {
        this.state = 'HALF_OPEN';
        console.log('Circuit breaker entering HALF_OPEN state');
      } else {
        throw new Error('Circuit breaker is OPEN - operation blocked');
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.successes++;

    if (this.state === 'HALF_OPEN') {
      this.state = 'CLOSED';
      this.failures = 0;
      console.log('Circuit breaker reset to CLOSED state');
    }
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.state === 'CLOSED' && this.failures >= this.options.failureThreshold) {
      this.state = 'OPEN';
      console.log(`Circuit breaker opened after ${this.failures} failures`);
    }
  }

  private shouldAttemptReset(): boolean {
    if (!this.lastFailureTime) {
      return true;
    }

    return Date.now() - this.lastFailureTime >= this.options.resetTimeout;
  }

  public getMetrics(): CircuitBreakerMetrics {
    return {
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime,
      state: this.state,
      totalRequests: this.totalRequests,
    };
  }

  public getState(): keyof CircuitBreakerState {
    return this.state;
  }

  public reset(): void {
    this.state = 'CLOSED';
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = null;
    console.log('Circuit breaker manually reset');
  }

  public isOpen(): boolean {
    return this.state === 'OPEN';
  }

  public isClosed(): boolean {
    return this.state === 'CLOSED';
  }

  public isHalfOpen(): boolean {
    return this.state === 'HALF_OPEN';
  }
}

// Global circuit breaker instances for different operations
export const databaseCircuitBreaker = new CircuitBreaker({
  failureThreshold: 5,
  resetTimeout: 30000, // 30 seconds
});

export const websocketCircuitBreaker = new CircuitBreaker({
  failureThreshold: 3,
  resetTimeout: 60000, // 1 minute
});
