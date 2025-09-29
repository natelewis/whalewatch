/**
 * Shared utility functions for getting min/max dates from QuestDB tables
 * Used across multiple services to avoid code duplication
 */

export interface DateQueryParams {
  ticker: string;
  tickerField: string;
  dateField: string;
  table: string;
}

export interface QuestDBResult {
  columns: { name: string; type: string }[];
  dataset: unknown[][];
}

export interface QuestDBServiceInterface {
  executeQuery(query: string): Promise<QuestDBResult>;
  convertArrayToObject<T>(dataset: unknown[][], columns: { name: string; type: string }[]): T[];
}

/**
 * Get table name with test prefix if in test environment
 */
function getTableName(tableName: string): string {
  if (process.env.NODE_ENV === 'test') {
    return `test_${tableName}`;
  }
  return tableName;
}

/**
 * Get the maximum (newest) date for a given ticker from a specified table and field
 * @param questdbService - QuestDBService instance
 * @param params - Query parameters including ticker, tickerField, dateField, and table
 * @returns Promise<Date | null> - The newest date or null if no data exists
 */
export async function getMaxDate(
  questdbService: QuestDBServiceInterface,
  params: DateQueryParams
): Promise<Date | null> {
  try {
    const { ticker, tickerField, dateField, table } = params;
    const testTableName = getTableName(table);

    const query = `SELECT MAX(${dateField}) as max_date FROM ${testTableName} WHERE ${tickerField} = '${ticker.toUpperCase()}'`;
    console.log('getMaxDate query:', query);

    const response = await questdbService.executeQuery(query);
    console.log('getMaxDate response:', response);

    const converted = questdbService.convertArrayToObject<{ max_date: string }>(response.dataset, response.columns);
    console.log('getMaxDate converted:', converted);

    if (converted.length > 0 && converted[0].max_date) {
      return new Date(converted[0].max_date);
    }
    return null;
  } catch (error) {
    console.error('Error getting max date:', error);
    return null;
  }
}

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

/**
 * Check if there's actual data in the database for a given ticker
 * @param questdbService - QuestDBService instance
 * @param params - Query parameters including ticker, tickerField, and table
 * @returns Promise<boolean> - True if data exists, false otherwise
 */
export async function hasData(
  questdbService: QuestDBServiceInterface,
  params: Omit<DateQueryParams, 'dateField'>
): Promise<boolean> {
  try {
    const { ticker, tickerField, table } = params;
    const testTableName = getTableName(table);

    const query = `SELECT COUNT(*) as count FROM ${testTableName} WHERE ${tickerField} = '${ticker.toUpperCase()}'`;

    const response = await questdbService.executeQuery(query);
    const converted = questdbService.convertArrayToObject<{ count: number }>(response.dataset, response.columns);

    if (converted.length > 0 && converted[0].count > 0) {
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error checking if data exists:', error);
    return false;
  }
}

/**
 * Get the minimum (oldest) date for a given ticker from a specified table and field
 * @param questdbService - QuestDBService instance
 * @param params - Query parameters including ticker, tickerField, dateField, and table
 * @returns Promise<Date> - The oldest date or today's date if no data exists
 */
export async function getMinDate(questdbService: QuestDBServiceInterface, params: DateQueryParams): Promise<Date> {
  try {
    const { ticker, tickerField, dateField, table } = params;
    const testTableName = getTableName(table);

    const query = `SELECT MIN(${dateField}) as min_date FROM ${testTableName} WHERE ${tickerField} = '${ticker.toUpperCase()}'`;

    const response = await questdbService.executeQuery(query);
    const converted = questdbService.convertArrayToObject<{ min_date: string }>(response.dataset, response.columns);

    if (converted.length > 0 && converted[0].min_date) {
      return new Date(converted[0].min_date);
    }
    // Return today's date as default when no data exists
    return new Date();
  } catch (error) {
    console.error('Error getting min date:', error);
    // Return today's date as default when there's an error
    return new Date();
  }
}
