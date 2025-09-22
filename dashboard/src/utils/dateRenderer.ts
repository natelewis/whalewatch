/**
 * Centralized date renderer utility for the entire dashboard
 * Provides consistent date formatting across all components
 */

export type DateFormat = 'short' | 'medium' | 'long' | 'time-only';

export interface DateRendererOptions {
  format: DateFormat;
  timezone?: string;
}

/**
 * Renders a date in the specified format
 * All times are displayed in 24-hour (military) format
 *
 * @param date - Date object, timestamp, or ISO string
 * @param options - Formatting options
 * @returns Formatted date string
 */
export function renderDate(date: Date | number | string, options: DateRendererOptions = { format: 'medium' }): string {
  const dateObj = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;

  if (isNaN(dateObj.getTime())) {
    return 'Invalid Date';
  }

  const { format, timezone = Intl.DateTimeFormat().resolvedOptions().timeZone } = options;

  switch (format) {
    case 'short':
      // Format: Jan, 1 2025
      return dateObj.toLocaleDateString('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });

    case 'medium':
      // Format: 1-1-2025 (friendly format without leading zeros)
      const month = dateObj.toLocaleDateString('en-US', {
        timeZone: timezone,
        month: 'numeric',
      });
      const day = dateObj.toLocaleDateString('en-US', {
        timeZone: timezone,
        day: 'numeric',
      });
      const year = dateObj.toLocaleDateString('en-US', {
        timeZone: timezone,
        year: 'numeric',
      });
      return `${month}-${day}-${year}`;

    case 'long':
      // Format: 1-1-2025 23:10:12 (friendly format without leading zeros)
      const longMonth = dateObj.toLocaleDateString('en-US', {
        timeZone: timezone,
        month: 'numeric',
      });
      const longDay = dateObj.toLocaleDateString('en-US', {
        timeZone: timezone,
        day: 'numeric',
      });
      const longYear = dateObj.toLocaleDateString('en-US', {
        timeZone: timezone,
        year: 'numeric',
      });

      const timeStr = dateObj.toLocaleTimeString('en-US', {
        timeZone: timezone,
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });

      return `${longMonth}-${longDay}-${longYear} ${timeStr}`;

    case 'time-only':
      // Format: 23:10:10
      return dateObj.toLocaleTimeString('en-US', {
        timeZone: timezone,
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });

    default:
      return dateObj.toISOString();
  }
}

/**
 * Convenience functions for common date formats
 */
export const dateRenderer = {
  /**
   * Short format: Jan, 1 2025
   */
  short: (date: Date | number | string, timezone?: string) =>
    renderDate(date, { format: 'short', ...(timezone && { timezone }) }),

  /**
   * Medium format: 01-01-2025
   */
  medium: (date: Date | number | string, timezone?: string) =>
    renderDate(date, { format: 'medium', ...(timezone && { timezone }) }),

  /**
   * Long format: 01-01-2025 23:10:12
   */
  long: (date: Date | number | string, timezone?: string) =>
    renderDate(date, { format: 'long', ...(timezone && { timezone }) }),

  /**
   * Time only format: 23:10:10
   */
  timeOnly: (date: Date | number | string, timezone?: string) =>
    renderDate(date, { format: 'time-only', ...(timezone && { timezone }) }),
};

/**
 * Smart date renderer that automatically chooses format based on context
 *
 * @param date - Date object, timestamp, or ISO string
 * @param context - Context hint for automatic format selection
 * @returns Formatted date string
 */
export function smartDateRenderer(
  date: Date | number | string,
  context: 'chart-hover' | 'chart-axis' | 'table-cell' | 'tooltip' | 'header' = 'chart-hover'
): string {
  // Use local timezone for all contexts
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  switch (context) {
    case 'chart-hover':
      // For chart hover, show medium format with time
      return renderDate(date, { format: 'long', timezone });

    case 'chart-axis':
      // For chart axis, show short format
      return renderDate(date, { format: 'short', timezone });

    case 'table-cell':
      // For table cells, show medium format
      return renderDate(date, { format: 'medium', timezone });

    case 'tooltip':
      // For tooltips, show long format
      return renderDate(date, { format: 'long', timezone });

    case 'header':
      // For headers, show short format
      return renderDate(date, { format: 'short', timezone });

    default:
      return renderDate(date, { format: 'medium', timezone });
  }
}

/**
 * Format a date range with consistent formatting
 *
 * @param startDate - Start date
 * @param endDate - End date
 * @param format - Date format to use
 * @returns Formatted date range string
 */
export function renderDateRange(
  startDate: Date | number | string,
  endDate: Date | number | string,
  format: DateFormat = 'medium'
): string {
  const start = renderDate(startDate, { format });
  const end = renderDate(endDate, { format });

  if (start === end) {
    return start;
  }

  return `${start} - ${end}`;
}

/**
 * Get relative time (e.g., "2 hours ago", "3 days ago")
 *
 * @param date - Date to compare
 * @param now - Current date (defaults to now)
 * @returns Relative time string
 */
export function renderRelativeTime(date: Date | number | string, now: Date = new Date()): string {
  const dateObj = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;

  if (isNaN(dateObj.getTime())) {
    return 'Invalid Date';
  }

  const diffMs = now.getTime() - dateObj.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) {
    return 'Just now';
  } else if (diffMinutes < 60) {
    return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
  } else if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  } else if (diffDays < 7) {
    return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
  } else {
    return renderDate(dateObj, { format: 'short' });
  }
}
