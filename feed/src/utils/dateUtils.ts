q;
/**
 * Normalize a date to midnight (00:00:00.000) for consistent timestamp storage
 * This ensures that all timestamps for the same date are identical
 * @param date - The date to normalize
 * @returns Date normalized to midnight
 */
export function normalizeToMidnight(date: Date): Date {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
}
