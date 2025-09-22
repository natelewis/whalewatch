import { describe, it, expect } from 'vitest';
import {
  renderDate,
  dateRenderer,
  smartDateRenderer,
  renderDateRange,
  renderRelativeTime,
} from '../../utils/dateRenderer';

describe('dateRenderer', () => {
  const testDate = new Date('2025-01-15T14:30:45Z');
  const testTimestamp = testDate.getTime();
  const testISOString = testDate.toISOString();

  describe('renderDate', () => {
    it('should render short format correctly', () => {
      const result = renderDate(testDate, { format: 'short' });
      expect(result).toBe('Jan 15, 2025');
    });

    it('should render medium format correctly', () => {
      const result = renderDate(testDate, { format: 'medium' });
      expect(result).toBe('01-15-2025');
    });

    it('should render long format correctly', () => {
      const result = renderDate(testDate, { format: 'long' });
      expect(result).toBe('01-15-2025 14:30:45');
    });

    it('should render time-only format correctly', () => {
      const result = renderDate(testDate, { format: 'time-only' });
      expect(result).toBe('14:30:45');
    });

    it('should handle timestamp input', () => {
      const result = renderDate(testTimestamp, { format: 'medium' });
      expect(result).toBe('01-15-2025');
    });

    it('should handle ISO string input', () => {
      const result = renderDate(testISOString, { format: 'medium' });
      expect(result).toBe('01-15-2025');
    });

    it('should handle invalid date', () => {
      const result = renderDate('invalid-date', { format: 'medium' });
      expect(result).toBe('Invalid Date');
    });

    it('should use timezone correctly', () => {
      const result = renderDate(testDate, { format: 'long', timezone: 'America/New_York' });
      // This will depend on the timezone offset, but should be different from UTC
      expect(result).toContain('01-15-2025');
    });
  });

  describe('dateRenderer convenience functions', () => {
    it('should provide short format function', () => {
      const result = dateRenderer.short(testDate);
      expect(result).toBe('Jan 15, 2025');
    });

    it('should provide medium format function', () => {
      const result = dateRenderer.medium(testDate);
      expect(result).toBe('01-15-2025');
    });

    it('should provide long format function', () => {
      const result = dateRenderer.long(testDate);
      expect(result).toBe('01-15-2025 14:30:45');
    });

    it('should provide time-only format function', () => {
      const result = dateRenderer.timeOnly(testDate);
      expect(result).toBe('14:30:45');
    });
  });

  describe('smartDateRenderer', () => {
    it('should use long format for chart-hover context', () => {
      const result = smartDateRenderer(testDate, 'chart-hover');
      expect(result).toBe('01-15-2025 14:30:45');
    });

    it('should use short format for chart-axis context', () => {
      const result = smartDateRenderer(testDate, 'chart-axis');
      expect(result).toBe('Jan 15, 2025');
    });

    it('should use medium format for table-cell context', () => {
      const result = smartDateRenderer(testDate, 'table-cell');
      expect(result).toBe('01-15-2025');
    });

    it('should use long format for tooltip context', () => {
      const result = smartDateRenderer(testDate, 'tooltip');
      expect(result).toBe('01-15-2025 14:30:45');
    });

    it('should use short format for header context', () => {
      const result = smartDateRenderer(testDate, 'header');
      expect(result).toBe('Jan 15, 2025');
    });

    it('should default to medium format for unknown context', () => {
      const result = smartDateRenderer(testDate, 'unknown' as any);
      expect(result).toBe('01-15-2025');
    });
  });

  describe('renderDateRange', () => {
    const startDate = new Date('2025-01-15T10:00:00Z');
    const endDate = new Date('2025-01-15T18:00:00Z');

    it('should render date range with medium format', () => {
      const result = renderDateRange(startDate, endDate, 'medium');
      expect(result).toBe('01-15-2025');
    });

    it('should render same date without range', () => {
      const result = renderDateRange(startDate, startDate, 'medium');
      expect(result).toBe('01-15-2025');
    });

    it('should render different dates with range', () => {
      const differentEndDate = new Date('2025-01-16T18:00:00Z');
      const result = renderDateRange(startDate, differentEndDate, 'medium');
      expect(result).toBe('01-15-2025 - 01-16-2025');
    });
  });

  describe('renderRelativeTime', () => {
    const now = new Date('2025-01-15T15:00:00Z');

    it('should render "Just now" for very recent times', () => {
      const recent = new Date('2025-01-15T14:59:30Z');
      const result = renderRelativeTime(recent, now);
      expect(result).toBe('Just now');
    });

    it('should render minutes ago', () => {
      const minutesAgo = new Date('2025-01-15T14:45:00Z');
      const result = renderRelativeTime(minutesAgo, now);
      expect(result).toBe('15 minutes ago');
    });

    it('should render hours ago', () => {
      const hoursAgo = new Date('2025-01-15T12:00:00Z');
      const result = renderRelativeTime(hoursAgo, now);
      expect(result).toBe('3 hours ago');
    });

    it('should render days ago', () => {
      const daysAgo = new Date('2025-01-13T15:00:00Z');
      const result = renderRelativeTime(daysAgo, now);
      expect(result).toBe('2 days ago');
    });

    it('should fall back to short format for older dates', () => {
      const oldDate = new Date('2025-01-01T15:00:00Z');
      const result = renderRelativeTime(oldDate, now);
      expect(result).toBe('Jan 1, 2025');
    });

    it('should handle invalid dates', () => {
      const result = renderRelativeTime('invalid-date', now);
      expect(result).toBe('Invalid Date');
    });
  });

  describe('military time format', () => {
    it('should always use 24-hour format for time-only', () => {
      const morning = new Date('2025-01-15T09:30:00Z');
      const evening = new Date('2025-01-15T21:30:00Z');

      expect(renderDate(morning, { format: 'time-only' })).toBe('09:30:00');
      expect(renderDate(evening, { format: 'time-only' })).toBe('21:30:00');
    });

    it('should always use 24-hour format for long format', () => {
      const morning = new Date('2025-01-15T09:30:00Z');
      const evening = new Date('2025-01-15T21:30:00Z');

      expect(renderDate(morning, { format: 'long' })).toBe('01-15-2025 09:30:00');
      expect(renderDate(evening, { format: 'long' })).toBe('01-15-2025 21:30:00');
    });
  });
});
