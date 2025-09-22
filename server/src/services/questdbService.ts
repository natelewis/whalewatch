import axios, { AxiosResponse } from 'axios';
import * as dotenv from 'dotenv';
import * as path from 'path';
import {
  QuestDBStockTrade,
  QuestDBStockAggregate,
  QuestDBOptionContract,
  QuestDBOptionTrade,
  QuestDBOptionQuote,
  QuestDBSyncState,
  QuestDBQueryParams,
  QuestDBResponse,
  QuestDBConfig,
  QuestDBError,
} from '../types/questdb';

// Load environment variables from the server directory
dotenv.config({ path: path.join(__dirname, '../../.env') });

export class QuestDBService {
  private config: QuestDBConfig;
  private baseUrl: string;

  constructor() {
    this.config = {
      host: process.env.QUESTDB_HOST || '127.0.0.1',
      port: parseInt(process.env.QUESTDB_PORT || '9000'),
      username: process.env.QUESTDB_USER || undefined,
      password: process.env.QUESTDB_PASSWORD || undefined,
      database: process.env.QUESTDB_DATABASE || 'qdb',
      ssl: process.env.QUESTDB_SSL === 'true',
      timeout: parseInt(process.env.QUESTDB_TIMEOUT || '30000'),
      max_connections: parseInt(process.env.QUESTDB_MAX_CONNECTIONS || '10'),
    };

    const protocol = this.config.ssl ? 'https' : 'http';
    this.baseUrl = `${protocol}://${this.config.host}:${this.config.port}`;

    console.log('🔧 QuestDB Service Configuration:', {
      baseUrl: this.baseUrl,
      username: this.config.username || 'none',
      password: this.config.password ? '***' : 'none',
      ssl: this.config.ssl,
      timeout: this.config.timeout,
    });

    if (!this.config.host) {
      console.warn('QUESTDB_HOST not found in environment variables');
    }
  }

  /**
   * Execute a raw SQL query against QuestDB
   */
  private async executeQuery<T>(query: string): Promise<QuestDBResponse<T>> {
    try {
      const response: AxiosResponse<QuestDBResponse<T>> = await axios.get(`${this.baseUrl}/exec`, {
        params: { query },
        timeout: this.config.timeout || 30000,
        ...(this.config.username && this.config.password
          ? {
              auth: {
                username: this.config.username,
                password: this.config.password,
              },
            }
          : {}),
      });

      if (response.data.query !== query) {
        throw new Error('Query execution failed - response query does not match request');
      }

      return response.data;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const isAxiosError = error && typeof error === 'object' && 'response' in error;
      const response = isAxiosError
        ? (
            error as {
              response?: { status?: number; data?: { error?: string } };
            }
          ).response
        : null;

      console.error('QuestDB query execution failed:', {
        query,
        error: errorMessage,
        status: response?.status,
        data: response?.data,
      });

      if (response?.data?.error) {
        const questdbError: QuestDBError = {
          error: response.data.error,
          position: 0,
          query: query,
          timestamp: new Date().toISOString(),
        };
        throw new Error(`QuestDB error: ${questdbError.error} at position ${questdbError.position}`);
      }

      if (error instanceof Error && 'code' in error) {
        const errorWithCode = error as Error & { code: string };
        if (errorWithCode.code === 'ECONNREFUSED') {
          throw new Error('QuestDB connection refused - check if QuestDB is running');
        }

        if (errorWithCode.code === 'ENOTFOUND') {
          throw new Error('QuestDB host not found - check QUESTDB_HOST configuration');
        }
      }

      throw new Error(`Failed to execute QuestDB query: ${errorMessage}`);
    }
  }

  /**
   * Convert QuestDB array data to object format
   */
  private convertArrayToObject<T>(data: unknown[], columns: Array<{ name: string; type: string }>): T[] {
    return data.map((row: unknown) => {
      if (!Array.isArray(row)) {
        throw new Error('Expected array data from QuestDB');
      }
      const obj: Record<string, string | number | boolean | null> = {};
      columns.forEach((column, index) => {
        const value = row[index];
        // Convert QuestDB values to appropriate TypeScript types
        if (value === null || value === undefined) {
          obj[column.name] = null;
        } else if (
          column.type === 'INT' ||
          column.type === 'LONG' ||
          column.type === 'FLOAT' ||
          column.type === 'DOUBLE'
        ) {
          obj[column.name] = Number(value);
        } else if (column.type === 'BOOLEAN') {
          obj[column.name] = Boolean(value);
        } else {
          obj[column.name] = String(value);
        }
      });
      return obj as T;
    });
  }

  /**
   * Get stock trades for a symbol within a time range
   */
  async getStockTrades(symbol: string, params: QuestDBQueryParams = {}): Promise<QuestDBStockTrade[]> {
    const { start_time, end_time, limit = 1000, order_by = 'timestamp', order_direction = 'DESC' } = params;

    let query = `SELECT * FROM stock_trades WHERE symbol = '${symbol.toUpperCase()}'`;

    if (start_time) {
      query += ` AND timestamp >= '${start_time}'`;
    }

    if (end_time) {
      query += ` AND timestamp <= '${end_time}'`;
    }

    query += ` ORDER BY ${order_by} ${order_direction} LIMIT ${limit}`;

    const response = await this.executeQuery<QuestDBStockTrade>(query);
    return this.convertArrayToObject<QuestDBStockTrade>(response.dataset, response.columns);
  }

  /**
   * Get stock aggregates (bars) for a symbol within a time range
   */
  async getStockAggregates(symbol: string, params: QuestDBQueryParams = {}): Promise<QuestDBStockAggregate[]> {
    const { start_time, end_time, limit, order_by = 'timestamp', order_direction = 'ASC' } = params;

    let query = `SELECT * FROM stock_aggregates WHERE symbol = '${symbol.toUpperCase()}'`;

    if (start_time) {
      // For past direction (DESC order), use <= to get data before start_time
      // For future direction (ASC order), use >= to get data from start_time onwards
      if (order_direction === 'DESC') {
        query += ` AND timestamp <= '${start_time}'`;
      } else {
        query += ` AND timestamp >= '${start_time}'`;
      }
    }

    if (end_time) {
      query += ` AND timestamp <= '${end_time}'`;
    }

    query += ` ORDER BY ${order_by} ${order_direction}`;

    // Only add LIMIT if explicitly provided
    if (limit) {
      query += ` LIMIT ${limit}`;
    }

    console.log(`🔍 DEBUG: QuestDB Query: ${query}`);
    const response = await this.executeQuery<QuestDBStockAggregate>(query);
    console.log(`🔍 DEBUG: QuestDB returned ${response.dataset.length} rows`);
    return this.convertArrayToObject<QuestDBStockAggregate>(response.dataset, response.columns);
  }

  /**
   * Get aggregated stock data using QuestDB's SAMPLE BY for time-based aggregation
   */
  async getAggregatedStockData(
    symbol: string,
    interval: string,
    params: QuestDBQueryParams = {}
  ): Promise<QuestDBStockAggregate[]> {
    const { start_time, end_time, limit, order_direction = 'ASC' } = params;

    // Convert interval to QuestDB SAMPLE BY format
    const sampleByInterval = this.convertIntervalToSampleBy(interval);

    // Build the aggregation query using QuestDB's SAMPLE BY
    let query = `
      SELECT 
        timestamp,
        first(open) as open,
        max(high) as high,
        min(low) as low,
        last(close) as close,
        sum(volume) as volume,
        sum(transaction_count) as transaction_count,
        sum(vwap * volume) / sum(volume) as vwap
      FROM stock_aggregates 
      WHERE symbol = '${symbol.toUpperCase()}'`;

    if (start_time) {
      if (order_direction === 'DESC') {
        query += ` AND timestamp <= '${start_time}'`;
      } else {
        query += ` AND timestamp >= '${start_time}'`;
      }
    }

    if (end_time) {
      query += ` AND timestamp <= '${end_time}'`;
    }

    query += ` SAMPLE BY ${sampleByInterval}`;
    query += ` ORDER BY timestamp ${order_direction}`;

    if (limit) {
      query += ` LIMIT ${limit}`;
    }

    console.log(`🔍 DEBUG: QuestDB Aggregation Query: ${query}`);
    const response = await this.executeQuery<QuestDBStockAggregate>(query);
    console.log(`🔍 DEBUG: QuestDB returned ${response.dataset.length} aggregated rows`);
    return this.convertArrayToObject<QuestDBStockAggregate>(response.dataset, response.columns);
  }

  /**
   * Convert interval format to QuestDB SAMPLE BY format
   */
  private convertIntervalToSampleBy(interval: string): string {
    const intervalMap: Record<string, string> = {
      '1m': '1m',
      '5m': '5m',
      '30m': '30m',
      '1h': '1h',
      '2h': '2h',
      '4h': '4h',
      '1d': '1d',
      '1w': '1w',
      '1M': '1M', // Monthly
    };

    return intervalMap[interval] || '1h';
  }

  /**
   * Get option contracts for an underlying symbol
   */
  async getOptionContracts(
    underlying_ticker: string,
    params: QuestDBQueryParams = {}
  ): Promise<QuestDBOptionContract[]> {
    const { limit = 1000, order_by = 'created_at', order_direction = 'DESC' } = params;

    const query = `SELECT * FROM option_contracts 
                   WHERE underlying_ticker = '${underlying_ticker.toUpperCase()}' 
                   ORDER BY ${order_by} ${order_direction} 
                   LIMIT ${limit}`;

    const response = await this.executeQuery<QuestDBOptionContract>(query);
    return this.convertArrayToObject<QuestDBOptionContract>(response.dataset, response.columns);
  }

  /**
   * Get option trades for a ticker or underlying symbol within a time range
   */
  async getOptionTrades(
    ticker?: string,
    underlying_ticker?: string,
    params: QuestDBQueryParams = {}
  ): Promise<QuestDBOptionTrade[]> {
    const { start_time, end_time, limit = 1000, order_by = 'timestamp', order_direction = 'DESC' } = params;

    let query = 'SELECT * FROM option_trades WHERE 1=1';

    if (ticker) {
      query += ` AND ticker = '${ticker.toUpperCase()}'`;
    }

    if (underlying_ticker) {
      query += ` AND underlying_ticker = '${underlying_ticker.toUpperCase()}'`;
    }

    if (start_time) {
      query += ` AND timestamp >= '${start_time}'`;
    }

    if (end_time) {
      query += ` AND timestamp <= '${end_time}'`;
    }

    query += ` ORDER BY ${order_by} ${order_direction} LIMIT ${limit}`;

    const response = await this.executeQuery<QuestDBOptionTrade>(query);
    return this.convertArrayToObject<QuestDBOptionTrade>(response.dataset, response.columns);
  }

  /**
   * Get option quotes for a ticker or underlying symbol within a time range
   */
  async getOptionQuotes(
    ticker?: string,
    underlying_ticker?: string,
    params: QuestDBQueryParams = {}
  ): Promise<QuestDBOptionQuote[]> {
    const { start_time, end_time, limit = 1000, order_by = 'timestamp', order_direction = 'DESC' } = params;

    let query = 'SELECT * FROM option_quotes WHERE 1=1';

    if (ticker) {
      query += ` AND ticker = '${ticker.toUpperCase()}'`;
    }

    if (underlying_ticker) {
      query += ` AND underlying_ticker = '${underlying_ticker.toUpperCase()}'`;
    }

    if (start_time) {
      query += ` AND timestamp >= '${start_time}'`;
    }

    if (end_time) {
      query += ` AND timestamp <= '${end_time}'`;
    }

    query += ` ORDER BY ${order_by} ${order_direction} LIMIT ${limit}`;

    const response = await this.executeQuery<QuestDBOptionQuote>(query);
    return this.convertArrayToObject<QuestDBOptionQuote>(response.dataset, response.columns);
  }

  /**
   * Get sync state for a ticker
   */
  async getSyncState(ticker: string): Promise<QuestDBSyncState | null> {
    const query = `SELECT * FROM sync_state WHERE ticker = '${ticker.toUpperCase()}' LIMIT 1`;

    const response = await this.executeQuery<QuestDBSyncState>(query);
    const converted = this.convertArrayToObject<QuestDBSyncState>(response.dataset, response.columns);
    return converted.length > 0 ? converted[0] : null;
  }

  /**
   * Update sync state for a ticker
   */
  async updateSyncState(ticker: string, updates: Partial<Omit<QuestDBSyncState, 'ticker'>>): Promise<void> {
    const setClause = Object.entries(updates)
      .filter(([_, value]) => value !== undefined)
      .map(([key, value]) => {
        if (typeof value === 'string') {
          return `${key} = '${value}'`;
        } else if (typeof value === 'boolean') {
          return `${key} = ${value}`;
        } else {
          return `${key} = ${value}`;
        }
      })
      .join(', ');

    const query = `UPDATE sync_state SET ${setClause} WHERE ticker = '${ticker.toUpperCase()}'`;

    await this.executeQuery(query);
  }

  /**
   * Get the latest trade timestamp for a symbol
   */
  async getLatestTradeTimestamp(symbol: string): Promise<string | null> {
    const query = `SELECT MAX(timestamp) as latest_timestamp FROM stock_trades WHERE symbol = '${symbol.toUpperCase()}'`;

    const response = await this.executeQuery<{ latest_timestamp: string }>(query);
    const converted = this.convertArrayToObject<{ latest_timestamp: string }>(response.dataset, response.columns);
    return converted.length > 0 ? converted[0].latest_timestamp : null;
  }

  /**
   * Get the latest aggregate timestamp for a symbol
   */
  async getLatestAggregateTimestamp(symbol: string): Promise<string | null> {
    const query = `SELECT MAX(timestamp) as latest_timestamp FROM stock_aggregates WHERE symbol = '${symbol.toUpperCase()}'`;

    const response = await this.executeQuery<{ latest_timestamp: string }>(query);
    const converted = this.convertArrayToObject<{ latest_timestamp: string }>(response.dataset, response.columns);
    return converted.length > 0 ? converted[0].latest_timestamp : null;
  }

  /**
   * Test the QuestDB connection
   */
  async testConnection(): Promise<boolean> {
    try {
      const query = 'SELECT 1 as test';
      await this.executeQuery(query);
      console.log('✅ QuestDB connection successful');
      return true;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ QuestDB connection failed:', errorMessage);
      return false;
    }
  }

  /**
   * Get database statistics
   */
  async getDatabaseStats(): Promise<{
    stock_trades_count: number;
    stock_aggregates_count: number;
    option_contracts_count: number;
    option_trades_count: number;
    option_quotes_count: number;
  }> {
    try {
      // Get all available tables first
      const tablesResponse = await this.executeQuery<{ table_name: string }>('SHOW TABLES');
      const availableTables = tablesResponse.dataset.map(row => (row as { table_name: string }).table_name);

      console.log('📊 Available tables:', availableTables);

      // Query each table if it exists
      const stats = {
        stock_trades_count: 0,
        stock_aggregates_count: 0,
        option_contracts_count: 0,
        option_trades_count: 0,
        option_quotes_count: 0,
      };

      const tableQueries = [
        { table: 'stock_trades', key: 'stock_trades_count' },
        { table: 'stock_aggregates', key: 'stock_aggregates_count' },
        { table: 'option_contracts', key: 'option_contracts_count' },
        { table: 'option_trades', key: 'option_trades_count' },
        { table: 'option_quotes', key: 'option_quotes_count' },
      ];

      for (const { table, key } of tableQueries) {
        if (availableTables.includes(table)) {
          try {
            const result = await this.executeQuery<{ count: number }>(`SELECT COUNT(*) as count FROM ${table}`);
            stats[key as keyof typeof stats] = result.dataset[0]?.count || 0;
            console.log(`✅ ${table}: ${stats[key as keyof typeof stats]} records`);
          } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.warn(`⚠️ Failed to count ${table}:`, errorMessage);
            stats[key as keyof typeof stats] = 0;
          }
        } else {
          console.log(`ℹ️ Table ${table} does not exist, setting count to 0`);
          stats[key as keyof typeof stats] = 0;
        }
      }

      return stats;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Failed to get database stats:', errorMessage);
      throw new Error('Failed to retrieve database statistics');
    }
  }

  /**
   * Get configuration info (without sensitive data)
   */
  getConfig(): Omit<QuestDBConfig, 'username' | 'password'> {
    const { ...safeConfig } = this.config;
    return safeConfig;
  }
}

export const questdbService = new QuestDBService();
