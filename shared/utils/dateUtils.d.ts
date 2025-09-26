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
    columns: {
        name: string;
        type: string;
    }[];
    dataset: unknown[][];
}
export interface QuestDBServiceInterface {
    executeQuery(query: string): Promise<QuestDBResult>;
    convertArrayToObject<T>(dataset: unknown[][], columns: {
        name: string;
        type: string;
    }[]): T[];
}
/**
 * Get the maximum (newest) date for a given ticker from a specified table and field
 * @param questdbService - QuestDBService instance
 * @param params - Query parameters including ticker, tickerField, dateField, and table
 * @returns Promise<Date | null> - The newest date or null if no data exists
 */
export declare function getMaxDate(questdbService: QuestDBServiceInterface, params: DateQueryParams): Promise<Date | null>;
/**
 * Get the minimum (oldest) date for a given ticker from a specified table and field
 * @param questdbService - QuestDBService instance
 * @param params - Query parameters including ticker, tickerField, dateField, and table
 * @returns Promise<Date | null> - The oldest date or null if no data exists
 */
export declare function getMinDate(questdbService: QuestDBServiceInterface, params: DateQueryParams): Promise<Date | null>;
//# sourceMappingURL=dateUtils.d.ts.map