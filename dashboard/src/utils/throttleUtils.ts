import { logger } from './logger';

/**
 * Throttling utility for performance optimization
 * Ensures a function is called at most once per specified time interval
 * while preserving the most recent arguments
 */
export class ThrottleManager {
  private timeoutId: number | null = null;
  private lastArgs: unknown[] | null = null;
  private readonly throttleDelay: number;
  private readonly functionToThrottle: (...args: unknown[]) => void;

  constructor(
    func: (...args: unknown[]) => void,
    delay: number = 16 // Default to ~60fps
  ) {
    this.functionToThrottle = func;
    this.throttleDelay = delay;
  }

  /**
   * Execute the throttled function
   * If throttling is active, it will store the latest arguments
   * and execute them when the throttle delay expires
   */
  execute(...args: unknown[]): void {
    this.lastArgs = [...args];

    if (this.timeoutId === null) {
      // Execute immediately if not currently throttling
      this.functionToThrottle(...args);

      // Set up the throttle timeout
      this.timeoutId = window.setTimeout(() => {
        this.flushThrottle();
      }, this.throttleDelay);
    }
    // If already throttling, just update the args (no immediate execution)
  }

  /**
   * Execute the latest arguments if they exist
   */
  private flushThrottle(): void {
    this.timeoutId = null;

    if (this.lastArgs !== null) {
      this.functionToThrottle(...this.lastArgs);
    }
  }

  /**
   * Force immediate execution of any pending throttled calls
   * Useful for ensuring final state updates
   */
  flush(): void {
    if (this.timeoutId !== null) {
      this.cancel();
      this.flushThrottle();
    }
  }

  /**
   * Cancel any pending throttled execution
   */
  cancel(): void {
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    this.lastArgs = null;
  }

  /**
   * Reset the throttle manager state
   */
  reset(): void {
    this.cancel();
  }
}

/**
 * Create a throttled version of a function optimized for panning operations
 * Balances performance with responsiveness for chart interactions
 */
export function createThrottledPanningHandler<T extends unknown[]>(
  handler: (...args: T) => void,
  _delay: number = 8 // Default to ~120fps for smoother panning feel
): (...args: T) => void {
  return function (...args: T): void {
    // Use requestAnimationFrame for smooth 60fps updates
    requestAnimationFrame(() => {
      handler(...args);
    });
  };
}

/**
 * Optimized throttled handler specifically for chart panning
 * Uses RAF with condition checking to avoid unnecessary updates
 * Returns an object with execute and flush methods
 */
export function createChartPanningThrottle(
  handler: (newStart: number, newEnd: number) => void,
  delay: number = 8 // ~120fps for responsive panning
) {
  let lastExecution = 0;
  let animationFrameId: number | null = null;
  let pendingArgs: [number, number] | null = null;

  const execute = (newStart: number, newEnd: number): void => {
    const now = performance.now();
    pendingArgs = [newStart, newEnd];

    // Execute immediately if enough time has passed since last execution
    if (now - lastExecution >= delay) {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }

      handler(newStart, newEnd);
      lastExecution = now;
      pendingArgs = null;
    } else if (animationFrameId === null) {
      // Schedule execution for the next animation frame
      animationFrameId = requestAnimationFrame(() => {
        animationFrameId = null;

        if (pendingArgs !== null) {
          handler(...pendingArgs);
          lastExecution = performance.now();
          pendingArgs = null;
        }
      });
    }
  };

  const flush = (): void => {
    if (pendingArgs !== null) {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
      handler(...pendingArgs);
      lastExecution = performance.now();
      pendingArgs = null;
    }
  };

  const cancel = (): void => {
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    pendingArgs = null;
  };

  return { execute, flush, cancel };
}

/**
 * Performance timer utility for measuring throttling effectiveness
 */
export function createPerformanceTimer(name: string) {
  let startTime: number | null = null;
  let callCount = 0;

  const start = () => {
    startTime = performance.now();
  };

  const end = () => {
    if (startTime !== null) {
      const duration = performance.now() - startTime;
      callCount++;

      logger.chart.performance(`${name} executed`, {
        duration: `${duration.toFixed(2)}ms`,
        callCount,
        fps: callCount > 0 ? Math.round(1000 / (duration / callCount)) : 0,
      });

      startTime = null;
    }
  };

  return { start, end };
}
