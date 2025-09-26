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
function getTestTableName(tableName: string): string {
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
    const testTableName = getTestTableName(table);

    const query = `SELECT MAX(${dateField}) as max_date FROM ${testTableName} WHERE ${tickerField} = '${ticker.toUpperCase()}'`;

    const response = await questdbService.executeQuery(query);
    const converted = questdbService.convertArrayToObject<{ max_date: string }>(response.dataset, response.columns);

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
 * Get the minimum (oldest) date for a given ticker from a specified table and field
 * @param questdbService - QuestDBService instance
 * @param params - Query parameters including ticker, tickerField, dateField, and table
 * @returns Promise<Date | null> - The oldest date or null if no data exists
 */
export async function getMinDate(
  questdbService: QuestDBServiceInterface,
  params: DateQueryParams
): Promise<Date | null> {
  try {
    const { ticker, tickerField, dateField, table } = params;
    const testTableName = getTestTableName(table);

    const query = `SELECT MIN(${dateField}) as min_date FROM ${testTableName} WHERE ${tickerField} = '${ticker.toUpperCase()}'`;

    const response = await questdbService.executeQuery(query);
    const converted = questdbService.convertArrayToObject<{ min_date: string }>(response.dataset, response.columns);

    if (converted.length > 0 && converted[0].min_date) {
      return new Date(converted[0].min_date);
    }
    return null;
  } catch (error) {
    console.error('Error getting min date:', error);
    return null;
  }
}
