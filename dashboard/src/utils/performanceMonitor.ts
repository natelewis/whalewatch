/**
 * Performance monitoring utilities for chart operations
 * Helps track cache hits and performance improvements
 */

interface PerformanceMetrics {
  cacheHits: number;
  cacheMisses: number;
  totalCalls: number;
  averageTime: number;
  lastCallTime: number;
}

const metrics: Record<string, PerformanceMetrics> = {};

/**
 * Track performance of a memoized function
 */
export const trackPerformance = (
  functionName: string,
  isCacheHit: boolean,
  executionTime: number
) => {
  if (!metrics[functionName]) {
    metrics[functionName] = {
      cacheHits: 0,
      cacheMisses: 0,
      totalCalls: 0,
      averageTime: 0,
      lastCallTime: 0,
    };
  }

  const metric = metrics[functionName];
  metric.totalCalls++;
  metric.lastCallTime = executionTime;

  if (isCacheHit) {
    metric.cacheHits++;
  } else {
    metric.cacheMisses++;
  }

  // Update average time
  metric.averageTime =
    (metric.averageTime * (metric.totalCalls - 1) + executionTime) / metric.totalCalls;
};

/**
 * Get performance metrics for a function
 */
export const getPerformanceMetrics = (functionName: string): PerformanceMetrics | null => {
  return metrics[functionName] || null;
};

/**
 * Get all performance metrics
 */
export const getAllPerformanceMetrics = (): Record<string, PerformanceMetrics> => {
  return { ...metrics };
};

/**
 * Clear all performance metrics
 */
export const clearPerformanceMetrics = (): void => {
  Object.keys(metrics).forEach((key) => delete metrics[key]);
};

/**
 * Log performance summary
 */
export const logPerformanceSummary = (): void => {
  console.group('🚀 Chart Performance Metrics');

  Object.entries(metrics).forEach(([functionName, metric]) => {
    const hitRate = (metric.cacheHits / metric.totalCalls) * 100;
    const timeSaved = metric.cacheHits * metric.averageTime;

    console.log(`${functionName}:`, {
      'Cache Hit Rate': `${hitRate.toFixed(1)}%`,
      'Total Calls': metric.totalCalls,
      'Cache Hits': metric.cacheHits,
      'Cache Misses': metric.cacheMisses,
      'Avg Time (ms)': metric.averageTime.toFixed(3),
      'Time Saved (ms)': timeSaved.toFixed(3),
    });
  });

  console.groupEnd();
};

/**
 * Performance decorator for functions
 */
export const withPerformanceTracking = <T extends (...args: any[]) => any>(
  functionName: string,
  fn: T
): T => {
  return ((...args: Parameters<T>) => {
    const startTime = performance.now();
    const result = fn(...args);
    const endTime = performance.now();
    const executionTime = endTime - startTime;

    // Note: This is a simplified version - in practice, you'd need to know if it was a cache hit
    // For now, we'll assume all calls are cache misses unless proven otherwise
    trackPerformance(functionName, false, executionTime);

    return result;
  }) as T;
};
