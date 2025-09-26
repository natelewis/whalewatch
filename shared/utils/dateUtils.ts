/**
 * Shared utility functions for getting min/max dates from database tables
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
 * Get the maximum (newest) date for a given ticker from a specified table and field
 * @param db - Database connection instance
 * @param params - Query parameters including ticker, tickerField, dateField, and table
 * @returns Promise<Date | null> - The newest date or null if no data exists
 */
export async function getMaxDate(
  db: { query: (text: string, params?: unknown[]) => Promise<unknown> },
  params: DateQueryParams
): Promise<Date | null> {
  try {
    const { ticker, tickerField, dateField, table } = params;

    const result = await db.query(
      `
      SELECT MAX(${dateField}) as max_date
      FROM ${table}
      WHERE ${tickerField} = $1
    `,
      [ticker]
    );

    // Handle QuestDB result format
    const questResult = result as QuestDBResult;

    if (questResult.dataset.length > 0 && questResult.dataset[0][0]) {
      const maxDate = new Date(questResult.dataset[0][0] as string);
      return maxDate;
    }
    return null;
  } catch (error) {
    console.error('Error getting max date:', error);
    return null;
  }
}

/**
 * Get the minimum (oldest) date for a given ticker from a specified table and field
 * @param db - Database connection instance
 * @param params - Query parameters including ticker, tickerField, dateField, and table
 * @returns Promise<Date | null> - The oldest date or null if no data exists
 */
export async function getMinDate(
  db: { query: (text: string, params?: unknown[]) => Promise<unknown> },
  params: DateQueryParams
): Promise<Date | null> {
  try {
    const { ticker, tickerField, dateField, table } = params;

    const result = await db.query(
      `
      SELECT MIN(${dateField}) as min_date
      FROM ${table}
      WHERE ${tickerField} = $1
    `,
      [ticker]
    );

    // Handle QuestDB result format
    const questResult = result as QuestDBResult;

    if (questResult.dataset.length > 0 && questResult.dataset[0][0]) {
      const minDate = new Date(questResult.dataset[0][0] as string);
      return minDate;
    }
    return null;
  } catch (error) {
    console.error('Error getting min date:', error);
    return null;
  }
}

/**
 * Get the maximum (newest) timestamp as string for QuestDBService
 * @param questdbService - QuestDBService instance
 * @param params - Query parameters including ticker, tickerField, dateField, and table
 * @returns Promise<string | null> - The newest timestamp string or null if no data exists
 */
export async function getMaxTimestampString(
  questdbService: QuestDBServiceInterface,
  params: DateQueryParams
): Promise<string | null> {
  try {
    const { ticker, tickerField, dateField, table } = params;

    const query = `SELECT MAX(${dateField}) as latest_timestamp FROM ${table} WHERE ${tickerField} = '${ticker.toUpperCase()}'`;

    const response = await questdbService.executeQuery(query);
    const converted = questdbService.convertArrayToObject<{ latest_timestamp: string }>(
      response.dataset,
      response.columns
    );
    return converted.length > 0 ? converted[0].latest_timestamp : null;
  } catch (error) {
    console.error('Error getting max timestamp string:', error);
    return null;
  }
}

/**
 * Get the minimum (oldest) timestamp as string for QuestDBService
 * @param questdbService - QuestDBService instance
 * @param params - Query parameters including ticker, tickerField, dateField, and table
 * @returns Promise<string | null> - The oldest timestamp string or null if no data exists
 */
export async function getMinTimestampString(
  questdbService: QuestDBServiceInterface,
  params: DateQueryParams
): Promise<string | null> {
  try {
    const { ticker, tickerField, dateField, table } = params;

    const query = `SELECT MIN(${dateField}) as earliest_timestamp FROM ${table} WHERE ${tickerField} = '${ticker.toUpperCase()}'`;

    const response = await questdbService.executeQuery(query);
    const converted = questdbService.convertArrayToObject<{ earliest_timestamp: string }>(
      response.dataset,
      response.columns
    );
    return converted.length > 0 ? converted[0].earliest_timestamp : null;
  } catch (error) {
    console.error('Error getting min timestamp string:', error);
    return null;
  }
}
