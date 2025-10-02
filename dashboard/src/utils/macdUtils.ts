/**
 * MACD (Moving Average Convergence Divergence) Calculation Utilities
 * Provides MACD line, signal line, and histogram calculations
 */

import { CandlestickData } from '../types';

export interface MACDData {
  index: number;
  macd: number;
  signal: number;
  histogram: number;
}

export interface MACDConfig {
  fastPeriod: number; // Default: 12
  slowPeriod: number; // Default: 26
  signalPeriod: number; // Default: 9
}

export const DEFAULT_MACD_CONFIG: MACDConfig = {
  fastPeriod: 12,
  slowPeriod: 26,
  signalPeriod: 9,
};

/**
 * Calculate MACD (Moving Average Convergence Divergence)
 * @param data - Array of candlestick data
 * @param config - MACD configuration
 * @returns Array of MACD data points
 */
export function calculateMACD(data: CandlestickData[], config: MACDConfig = DEFAULT_MACD_CONFIG): MACDData[] {
  if (data.length < config.slowPeriod) {
    return [];
  }

  const { fastPeriod, slowPeriod, signalPeriod } = config;

  // Calculate EMAs for fast and slow periods
  const fastEMA = calculateEMA(data, fastPeriod);
  const slowEMA = calculateEMA(data, slowPeriod);

  // Calculate MACD line (fast EMA - slow EMA)
  const macdLine: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (fastEMA[i] !== null && slowEMA[i] !== null) {
      macdLine[i] = fastEMA[i]! - slowEMA[i]!;
    } else {
      macdLine[i] = null as any;
    }
  }

  // Calculate signal line (EMA of MACD line)
  const signalLine = calculateEMAFromValues(macdLine, signalPeriod);

  // Calculate histogram (MACD - Signal)
  const histogram: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (macdLine[i] !== null && signalLine[i] !== null) {
      histogram[i] = macdLine[i]! - signalLine[i]!;
    } else {
      histogram[i] = null as any;
    }
  }

  // Convert to MACDData format
  const result: MACDData[] = [];
  for (let i = 0; i < data.length; i++) {
    if (macdLine[i] !== null && signalLine[i] !== null && histogram[i] !== null) {
      result.push({
        index: i,
        macd: macdLine[i]!,
        signal: signalLine[i]!,
        histogram: histogram[i]!,
      });
    }
  }

  return result;
}

/**
 * Calculate Exponential Moving Average (EMA)
 * @param data - Array of candlestick data
 * @param period - EMA period
 * @returns Array of EMA values
 */
function calculateEMA(data: CandlestickData[], period: number): (number | null)[] {
  if (data.length < period) {
    return new Array(data.length).fill(null);
  }

  const result: (number | null)[] = new Array(data.length).fill(null);
  const multiplier = 2 / (period + 1);

  // Calculate SMA for the first value
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += data[i].close;
  }
  result[period - 1] = sum / period;

  // Calculate EMA for subsequent values
  for (let i = period; i < data.length; i++) {
    result[i] = (data[i].close - (result[i - 1] as number)) * multiplier + (result[i - 1] as number);
  }

  return result;
}

/**
 * Calculate EMA from an array of values
 * @param values - Array of values (can contain nulls)
 * @param period - EMA period
 * @returns Array of EMA values
 */
function calculateEMAFromValues(values: (number | null)[], period: number): (number | null)[] {
  if (values.length < period) {
    return new Array(values.length).fill(null);
  }

  const result: (number | null)[] = new Array(values.length).fill(null);
  const multiplier = 2 / (period + 1);

  // Find first valid value
  let firstValidIndex = -1;
  for (let i = 0; i < values.length; i++) {
    if (values[i] !== null) {
      firstValidIndex = i;
      break;
    }
  }

  if (firstValidIndex === -1) {
    return result;
  }

  // Calculate SMA for the first valid value
  let sum = 0;
  let count = 0;
  for (let i = firstValidIndex; i < Math.min(firstValidIndex + period, values.length); i++) {
    if (values[i] !== null) {
      sum += values[i]!;
      count++;
    }
  }

  if (count > 0) {
    result[firstValidIndex + count - 1] = sum / count;

    // Calculate EMA for subsequent values
    for (let i = firstValidIndex + count; i < values.length; i++) {
      if (values[i] !== null && result[i - 1] !== null) {
        result[i] = (values[i]! - result[i - 1]!) * multiplier + result[i - 1]!;
      }
    }
  }

  return result;
}

/**
 * Get MACD label for display
 * @param config - MACD configuration
 * @returns Formatted label string
 */
export function getMACDLabel(config: MACDConfig): string {
  return `MACD (${config.fastPeriod},${config.slowPeriod},${config.signalPeriod})`;
}

/**
 * Get predefined MACD configurations
 * @returns Array of common MACD configurations
 */
export function getMACDPresets(): MACDConfig[] {
  return [
    { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 }, // Standard MACD
    { fastPeriod: 5, slowPeriod: 35, signalPeriod: 5 }, // Fast MACD
    { fastPeriod: 19, slowPeriod: 39, signalPeriod: 9 }, // Slow MACD
  ];
}
