import { describe, it, expect, beforeEach } from 'vitest';
import * as d3 from 'd3';
import {
  memoizedCalculateYScaleDomain,
  memoizedCalculateChartState,
  memoizedGetPriceRange,
  memoizedGetVisibleData,
  memoizedFormatTime,
  clearCalculationCache,
  getCacheStats,
} from '../../utils/memoizedChartUtils';
import { CandlestickData, ChartDimensions } from '../../types';

// Mock data for testing
const mockCandlestickData: CandlestickData[] = [
  {
    timestamp: '2024-01-01T00:00:00Z',
    open: 100,
    high: 110,
    low: 95,
    close: 105,
    volume: 1000,
  },
  {
    timestamp: '2024-01-01T01:00:00Z',
    open: 105,
    high: 115,
    low: 100,
    close: 110,
    volume: 1200,
  },
  {
    timestamp: '2024-01-01T02:00:00Z',
    open: 110,
    high: 120,
    low: 105,
    close: 115,
    volume: 1100,
  },
];

const mockDimensions: ChartDimensions = {
  width: 800,
  height: 400,
  margin: { top: 20, right: 60, bottom: 40, left: 0 },
};

const mockTransform = d3.zoomIdentity;

describe('memoizedChartUtils', () => {
  beforeEach(() => {
    clearCalculationCache();
  });

  describe('memoizedCalculateYScaleDomain', () => {
    it('should calculate Y-scale domain correctly', () => {
      const result = memoizedCalculateYScaleDomain(mockCandlestickData);

      expect(result).toHaveLength(2);
      expect(result[0]).toBeLessThan(result[1]);
      expect(result[0]).toBeLessThan(95); // Should include padding
      expect(result[1]).toBeGreaterThan(120); // Should include padding
    });

    it('should return fixed domain when provided', () => {
      const fixedDomain: [number, number] = [50, 150];
      const result = memoizedCalculateYScaleDomain(mockCandlestickData, fixedDomain);

      expect(result).toEqual(fixedDomain);
    });

    it('should return fallback domain for empty data', () => {
      const result = memoizedCalculateYScaleDomain([]);

      expect(result).toEqual([0, 100]);
    });

    it('should use cache for repeated calls', () => {
      const stats1 = getCacheStats();

      // First call
      memoizedCalculateYScaleDomain(mockCandlestickData);
      const stats2 = getCacheStats();

      // Second call with same data
      memoizedCalculateYScaleDomain(mockCandlestickData);
      const stats3 = getCacheStats();

      expect(stats2.yScaleEntries).toBeGreaterThan(stats1.yScaleEntries);
      expect(stats3.yScaleEntries).toBe(stats2.yScaleEntries); // Should not increase
    });
  });

  describe('memoizedCalculateChartState', () => {
    it('should calculate chart state correctly', () => {
      const result = memoizedCalculateChartState({
        dimensions: mockDimensions,
        allChartData: mockCandlestickData,
        transform: mockTransform,
        fixedYScaleDomain: null,
      });

      expect(result).toHaveProperty('innerWidth');
      expect(result).toHaveProperty('innerHeight');
      expect(result).toHaveProperty('baseXScale');
      expect(result).toHaveProperty('baseYScale');
      expect(result).toHaveProperty('transformedXScale');
      expect(result).toHaveProperty('transformedYScale');
      expect(result).toHaveProperty('viewStart');
      expect(result).toHaveProperty('viewEnd');
      expect(result).toHaveProperty('visibleData');
      expect(result).toHaveProperty('allData');
      expect(result).toHaveProperty('transformString');
    });

    it('should use cache for repeated calls', () => {
      const stats1 = getCacheStats();

      // First call
      memoizedCalculateChartState({
        dimensions: mockDimensions,
        allChartData: mockCandlestickData,
        transform: mockTransform,
        fixedYScaleDomain: null,
      });
      const stats2 = getCacheStats();

      // Second call with same parameters
      memoizedCalculateChartState({
        dimensions: mockDimensions,
        allChartData: mockCandlestickData,
        transform: mockTransform,
        fixedYScaleDomain: null,
      });
      const stats3 = getCacheStats();

      expect(stats2.chartStateEntries).toBeGreaterThan(stats1.chartStateEntries);
      expect(stats3.chartStateEntries).toBe(stats2.chartStateEntries); // Should not increase
    });
  });

  describe('memoizedGetPriceRange', () => {
    it('should calculate price range correctly', () => {
      const result = memoizedGetPriceRange(mockCandlestickData);

      expect(result).toEqual({
        minPrice: 95, // Lowest low
        maxPrice: 120, // Highest high
      });
    });

    it('should return null for empty data', () => {
      const result = memoizedGetPriceRange([]);

      expect(result).toBeNull();
    });

    it('should use cache for repeated calls', () => {
      const stats1 = getCacheStats();

      // First call
      memoizedGetPriceRange(mockCandlestickData);
      const stats2 = getCacheStats();

      // Second call with same data
      memoizedGetPriceRange(mockCandlestickData);
      const stats3 = getCacheStats();

      expect(stats2.priceRangeEntries).toBeGreaterThan(stats1.priceRangeEntries);
      expect(stats3.priceRangeEntries).toBe(stats2.priceRangeEntries); // Should not increase
    });
  });

  describe('memoizedGetVisibleData', () => {
    it('should return visible data slice correctly', () => {
      const result = memoizedGetVisibleData(mockCandlestickData, 0, 1);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(mockCandlestickData[0]);
      expect(result[1]).toEqual(mockCandlestickData[1]);
    });

    it('should clamp indices correctly', () => {
      const result = memoizedGetVisibleData(mockCandlestickData, -1, 5);

      expect(result).toHaveLength(3); // Should return all data
      expect(result[0]).toEqual(mockCandlestickData[0]);
      expect(result[2]).toEqual(mockCandlestickData[2]);
    });

    it('should return empty array for invalid range', () => {
      const result = memoizedGetVisibleData(mockCandlestickData, 5, 2);

      expect(result).toEqual([]);
    });

    it('should use cache for repeated calls', () => {
      const stats1 = getCacheStats();

      // First call
      memoizedGetVisibleData(mockCandlestickData, 0, 1);
      const stats2 = getCacheStats();

      // Second call with same parameters
      memoizedGetVisibleData(mockCandlestickData, 0, 1);
      const stats3 = getCacheStats();

      expect(stats2.visibleDataEntries).toBeGreaterThan(stats1.visibleDataEntries);
      expect(stats3.visibleDataEntries).toBe(stats2.visibleDataEntries); // Should not increase
    });
  });

  describe('memoizedFormatTime', () => {
    const testDate = new Date('2024-01-15T14:30:00Z');

    it('should format time for 1m interval (time-only)', () => {
      const result = memoizedFormatTime(testDate, '1m');

      // Should show time only format (HH:MM AM/PM)
      expect(result).toMatch(/^\d{1,2}:\d{2} [AP]M$/);
      expect(result).toContain('09:30 AM');
    });

    it('should format time for 5m interval (date-time)', () => {
      const result = memoizedFormatTime(testDate, '5m');

      // Should show date-time format (MM-DD-YYYY HH:MM) in 24-hour format
      expect(result).toMatch(/^\d{2}-\d{2}-\d{4} \d{2}:\d{2}$/);
      expect(result).toContain('01-15-2024');
      expect(result).toContain('09:30');
    });

    it('should format time for 1d interval (date-only)', () => {
      const result = memoizedFormatTime(testDate, '1d');

      // Should show date only format (MMM DD, YYYY)
      expect(result).toMatch(/^[A-Za-z]{3} \d{1,2}, \d{4}$/);
      expect(result).toContain('Jan 15');
    });

    it('should format time for 1w interval (date-only)', () => {
      const result = memoizedFormatTime(testDate, '1w');

      // Should show date only format (MMM DD, YYYY)
      expect(result).toMatch(/^[A-Za-z]{3} \d{1,2}, \d{4}$/);
      expect(result).toContain('Jan 15');
    });

    it('should format time for 1M interval (date-only)', () => {
      const result = memoizedFormatTime(testDate, '1M');

      // Should show date only format (MMM DD, YYYY)
      expect(result).toMatch(/^[A-Za-z]{3} \d{1,2}, \d{4}$/);
      expect(result).toContain('Jan 15');
    });

    it('should fallback to 1m format for unknown interval', () => {
      const result = memoizedFormatTime(testDate, 'unknown');

      // Should fallback to time-only format
      expect(result).toMatch(/^\d{1,2}:\d{2} [AP]M$/);
      expect(result).toContain('09:30 AM');
    });

    it('should use default format when no interval provided', () => {
      const result = memoizedFormatTime(testDate);

      // Should use 1m format as default
      expect(result).toMatch(/^\d{1,2}:\d{2} [AP]M$/);
      expect(result).toContain('09:30 AM');
    });

    it('should use cache for repeated calls', () => {
      const stats1 = getCacheStats();

      // First call
      memoizedFormatTime(testDate, '1m');
      const stats2 = getCacheStats();

      // Second call with same parameters
      memoizedFormatTime(testDate, '1m');
      const stats3 = getCacheStats();

      expect(stats2.totalEntries).toBeGreaterThan(stats1.totalEntries);
      expect(stats3.totalEntries).toBe(stats2.totalEntries); // Should not increase
    });

    it('should handle different intervals with different cache keys', () => {
      const stats1 = getCacheStats();

      // Call with different intervals
      memoizedFormatTime(testDate, '1m');
      memoizedFormatTime(testDate, '5m');
      memoizedFormatTime(testDate, '1d');
      const stats2 = getCacheStats();

      // Should have 3 different cache entries
      expect(stats2.totalEntries).toBe(stats1.totalEntries + 3);
    });

    it('should include year for dates from different years', () => {
      const oldDate = new Date('2023-01-15T14:30:00Z');
      const result = memoizedFormatTime(oldDate, '5m');

      // Should include year for dates from different years
      expect(result).toContain('2023');
      expect(result).toMatch(/^\d{2}-\d{2}-2023 \d{2}:\d{2}$/);
    });
  });

  describe('cache management', () => {
    it('should clear cache correctly', () => {
      // Add some entries to cache
      memoizedCalculateYScaleDomain(mockCandlestickData);
      memoizedGetPriceRange(mockCandlestickData);

      const statsBefore = getCacheStats();
      expect(statsBefore.totalEntries).toBeGreaterThan(0);

      clearCalculationCache();

      const statsAfter = getCacheStats();
      expect(statsAfter.totalEntries).toBe(0);
    });

    it('should provide cache statistics', () => {
      const stats = getCacheStats();

      expect(stats).toHaveProperty('totalEntries');
      expect(stats).toHaveProperty('yScaleEntries');
      expect(stats).toHaveProperty('chartStateEntries');
      expect(stats).toHaveProperty('priceRangeEntries');
      expect(stats).toHaveProperty('visibleDataEntries');

      expect(typeof stats.totalEntries).toBe('number');
      expect(typeof stats.yScaleEntries).toBe('number');
      expect(typeof stats.chartStateEntries).toBe('number');
      expect(typeof stats.priceRangeEntries).toBe('number');
      expect(typeof stats.visibleDataEntries).toBe('number');
    });
  });
});
