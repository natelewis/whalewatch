/**
 * Moving Average Calculation Utilities
 */

import { CandlestickData } from '../types';

export interface MovingAverageData {
  timestamp: string;
  value: number;
  index: number;
}

export interface MovingAverageConfig {
  period: number;
  type: 'simple' | 'exponential';
  alpha?: number; // For exponential moving average
}

/**
 * Calculate Simple Moving Average (SMA)
 * @param data - Array of candlestick data
 * @param period - Number of periods to average
 * @param startIndex - Starting index for calculation
 * @returns Array of moving average data points
 */
export function calculateSimpleMovingAverage(
  data: CandlestickData[],
  period: number,
  startIndex: number = 0
): MovingAverageData[] {
  if (data.length < period) {
    return [];
  }

  const result: MovingAverageData[] = [];
  
  for (let i = startIndex + period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sum += data[j].close;
    }
    
    result.push({
      timestamp: data[i].timestamp,
      value: sum / period,
      index: i,
    });
  }
  
  return result;
}

/**
 * Calculate Exponential Moving Average (EMA)
 * @param data - Array of candlestick data
 * @param period - Number of periods for smoothing
 * @param alpha - Smoothing factor (optional, calculated from period if not provided)
 * @param startIndex - Starting index for calculation
 * @returns Array of moving average data points
 */
export function calculateExponentialMovingAverage(
  data: CandlestickData[],
  period: number,
  alpha?: number,
  startIndex: number = 0
): MovingAverageData[] {
  if (data.length < period) {
    return [];
  }

  const smoothingFactor = alpha ?? 2 / (period + 1);
  const result: MovingAverageData[] = [];
  
  // Calculate initial SMA for the first EMA value
  let sum = 0;
  for (let i = startIndex; i < startIndex + period; i++) {
    sum += data[i].close;
  }
  let ema = sum / period;
  
  result.push({
    timestamp: data[startIndex + period - 1].timestamp,
    value: ema,
    index: startIndex + period - 1,
  });
  
  // Calculate EMA for remaining data points
  for (let i = startIndex + period; i < data.length; i++) {
    ema = smoothingFactor * data[i].close + (1 - smoothingFactor) * ema;
    
    result.push({
      timestamp: data[i].timestamp,
      value: ema,
      index: i,
    });
  }
  
  return result;
}

/**
 * Calculate moving average based on configuration
 * @param data - Array of candlestick data
 * @param config - Moving average configuration
 * @param startIndex - Starting index for calculation
 * @returns Array of moving average data points
 */
export function calculateMovingAverage(
  data: CandlestickData[],
  config: MovingAverageConfig,
  startIndex: number = 0
): MovingAverageData[] {
  switch (config.type) {
    case 'simple':
      return calculateSimpleMovingAverage(data, config.period, startIndex);
    case 'exponential':
      return calculateExponentialMovingAverage(data, config.period, config.alpha, startIndex);
    default:
      throw new Error(`Unsupported moving average type: ${config.type}`);
  }
}

/**
 * Get default moving average configurations
 */
export const DEFAULT_MOVING_AVERAGE_CONFIGS: MovingAverageConfig[] = [
  { period: 20, type: 'simple' },
  { period: 50, type: 'simple' },
  { period: 200, type: 'simple' },
  { period: 12, type: 'exponential' },
  { period: 26, type: 'exponential' },
];

/**
 * Get a human-readable label for a moving average configuration
 */
export function getMovingAverageLabel(config: MovingAverageConfig): string {
  const typeLabel = config.type === 'simple' ? 'SMA' : 'EMA';
  return `${typeLabel}(${config.period})`;
}
