import { describe, it, expect, beforeEach } from 'vitest';

describe('memoizedGenerateTimeBasedTicks - Date Anchoring', () => {
  let memoizedGenerateTimeBasedTicks: any;
  // Mock data spanning multiple days
  const mockChartData = [
    { timestamp: '2025-09-01T09:30:00Z' }, // Monday
    { timestamp: '2025-09-02T09:30:00Z' }, // Tuesday
    { timestamp: '2025-09-03T09:30:00Z' }, // Wednesday
    { timestamp: '2025-09-04T09:30:00Z' }, // Thursday
    { timestamp: '2025-09-05T09:30:00Z' }, // Friday
    { timestamp: '2025-09-08T09:30:00Z' }, // Monday
    { timestamp: '2025-09-09T09:30:00Z' }, // Tuesday
    { timestamp: '2025-09-10T09:30:00Z' }, // Wednesday
    { timestamp: '2025-09-11T09:30:00Z' }, // Thursday
    { timestamp: '2025-09-12T09:30:00Z' }, // Friday
    { timestamp: '2025-09-15T09:30:00Z' }, // Monday
    { timestamp: '2025-09-16T09:30:00Z' }, // Tuesday
    { timestamp: '2025-09-17T09:30:00Z' }, // Wednesday
    { timestamp: '2025-09-18T09:30:00Z' }, // Thursday
    { timestamp: '2025-09-19T09:30:00Z' }, // Friday
  ];

  beforeEach(async () => {
    // Import the function dynamically
    const module = await import('../../utils/memoizedChartUtils');
    memoizedGenerateTimeBasedTicks = module.memoizedGenerateTimeBasedTicks;

    // Clear cache before each test
    const { calculationCache } = require('../../utils/memoizedChartUtils');
    calculationCache.clear();
  });

  describe('2-day interval anchoring', () => {
    it('should anchor 2-day intervals to consistent boundaries', () => {
      const markerIntervalMinutes = 60 * 24 * 2; // 2 days
      const ticks = memoizedGenerateTimeBasedTicks(mockChartData, markerIntervalMinutes);

      // Should get ticks at consistent 2-day intervals
      expect(ticks).toHaveLength(8); // Every 2 days from 9/1 to 9/19

      // Verify the dates are consistent
      const tickDates = ticks.map(tick => tick.toISOString().split('T')[0]);
      expect(tickDates).toEqual([
        '2025-09-01', // Day 0
        '2025-09-03', // Day 2
        '2025-09-05', // Day 4
        '2025-09-08', // Day 7 (next week)
        '2025-09-10', // Day 9
        '2025-09-12', // Day 11
        '2025-09-15', // Day 14 (next week)
        '2025-09-17', // Day 16
      ]);
    });

    it('should maintain consistent anchoring when data starts mid-week', () => {
      const midWeekData = [
        { timestamp: '2025-09-03T09:30:00Z' }, // Wednesday
        { timestamp: '2025-09-04T09:30:00Z' }, // Thursday
        { timestamp: '2025-09-05T09:30:00Z' }, // Friday
        { timestamp: '2025-09-08T09:30:00Z' }, // Monday
        { timestamp: '2025-09-09T09:30:00Z' }, // Tuesday
        { timestamp: '2025-09-10T09:30:00Z' }, // Wednesday
        { timestamp: '2025-09-11T09:30:00Z' }, // Thursday
        { timestamp: '2025-09-12T09:30:00Z' }, // Friday
      ];

      const markerIntervalMinutes = 60 * 24 * 2; // 2 days
      const ticks = memoizedGenerateTimeBasedTicks(midWeekData, markerIntervalMinutes);

      // Should still maintain 2-day intervals from the start
      const tickDates = ticks.map(tick => tick.toISOString().split('T')[0]);
      expect(tickDates).toEqual([
        '2025-09-03', // Day 0
        '2025-09-05', // Day 2
        '2025-09-08', // Day 5 (next week)
        '2025-09-10', // Day 7
        '2025-09-12', // Day 9
      ]);
    });
  });

  describe('1-day interval anchoring', () => {
    it('should show every trading day for 1-day interval', () => {
      const markerIntervalMinutes = 60 * 24 * 1; // 1 day
      const ticks = memoizedGenerateTimeBasedTicks(mockChartData, markerIntervalMinutes);

      // Should get every trading day
      expect(ticks).toHaveLength(15); // All 15 trading days

      const tickDates = ticks.map(tick => tick.toISOString().split('T')[0]);
      expect(tickDates).toEqual([
        '2025-09-01',
        '2025-09-02',
        '2025-09-03',
        '2025-09-04',
        '2025-09-05',
        '2025-09-08',
        '2025-09-09',
        '2025-09-10',
        '2025-09-11',
        '2025-09-12',
        '2025-09-15',
        '2025-09-16',
        '2025-09-17',
        '2025-09-18',
        '2025-09-19',
      ]);
    });
  });

  describe('4-day interval anchoring', () => {
    it('should anchor 4-day intervals consistently', () => {
      const markerIntervalMinutes = 60 * 24 * 4; // 4 days
      const ticks = memoizedGenerateTimeBasedTicks(mockChartData, markerIntervalMinutes);

      // Should get ticks at 4-day intervals
      expect(ticks).toHaveLength(4); // Every 4 days

      const tickDates = ticks.map(tick => tick.toISOString().split('T')[0]);
      expect(tickDates).toEqual([
        '2025-09-01', // Day 0
        '2025-09-05', // Day 4
        '2025-09-09', // Day 8
        '2025-09-15', // Day 14 (next week)
      ]);
    });
  });

  describe('Week boundary anchoring', () => {
    it('should anchor to Monday for week-based intervals', () => {
      const markerIntervalMinutes = 60 * 24 * 14; // 2 weeks
      const ticks = memoizedGenerateTimeBasedTicks(mockChartData, markerIntervalMinutes);

      // Should get ticks aligned to week boundaries
      const tickDates = ticks.map(tick => tick.toISOString().split('T')[0]);

      // Should start with Monday (9/1) and then every 2 weeks
      expect(tickDates[0]).toBe('2025-09-01'); // Monday
      expect(tickDates[1]).toBe('2025-09-15'); // Monday + 2 weeks
    });
  });

  describe('Month boundary anchoring', () => {
    it('should anchor to 1st of month for month-based intervals', () => {
      const longData = [
        { timestamp: '2025-08-15T09:30:00Z' },
        { timestamp: '2025-08-16T09:30:00Z' },
        { timestamp: '2025-08-19T09:30:00Z' },
        { timestamp: '2025-09-01T09:30:00Z' },
        { timestamp: '2025-09-02T09:30:00Z' },
        { timestamp: '2025-09-03T09:30:00Z' },
        { timestamp: '2025-10-01T09:30:00Z' },
        { timestamp: '2025-10-02T09:30:00Z' },
        { timestamp: '2025-10-03T09:30:00Z' },
      ];

      const markerIntervalMinutes = 60 * 24 * 60; // 2 months
      const ticks = memoizedGenerateTimeBasedTicks(longData, markerIntervalMinutes);

      // Should get ticks aligned to month boundaries
      const tickDates = ticks.map(tick => tick.toISOString().split('T')[0]);

      // Should start with first trading day of August, then every 2 months
      expect(tickDates[0]).toBe('2025-08-15'); // First trading day of August
      expect(tickDates[1]).toBe('2025-10-01'); // First trading day of October (2 months later)
    });
  });
});
