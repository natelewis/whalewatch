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
  QuestDBError
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
      max_connections: parseInt(process.env.QUESTDB_MAX_CONNECTIONS || '10')
    };

    const protocol = this.config.ssl ? 'https' : 'http';
    this.baseUrl = `${protocol}://${this.config.host}:${this.config.port}`;

    if (!this.config.host) {
      console.warn('QUESTDB_HOST not found in environment variables');
    }
  }

  /**
   * Execute a raw SQL query against QuestDB
   */
  private async executeQuery<T>(query: string): Promise<QuestDBResponse<T>> {
    try {
      const response: AxiosResponse<QuestDBResponse<T>> = await axios.get(
        `${this.baseUrl}/exec`,
        {
          params: { query },
          timeout: this.config.timeout || 30000,
          ...(this.config.username && this.config.password ? {
            auth: {
              username: this.config.username,
              password: this.config.password
            }
          } : {})
        }
      );

      if (response.data.query !== query) {
        throw new Error('Query execution failed - response query does not match request');
      }

      return response.data;
    } catch (error: any) {
      console.error('QuestDB query execution failed:', {
        query,
        error: error.message,
        status: error.response?.status,
        data: error.response?.data
      });

      if (error.response?.data?.error) {
        const questdbError: QuestDBError = error.response.data;
        throw new Error(`QuestDB error: ${questdbError.error} at position ${questdbError.position}`);
      }

      if (error.code === 'ECONNREFUSED') {
        throw new Error('QuestDB connection refused - check if QuestDB is running');
      }

      if (error.code === 'ENOTFOUND') {
        throw new Error('QuestDB host not found - check QUESTDB_HOST configuration');
      }

      throw new Error(`Failed to execute QuestDB query: ${error.message}`);
    }
  }

  /**
   * Get stock trades for a symbol within a time range
   */
  async getStockTrades(
    symbol: string,
    params: QuestDBQueryParams = {}
  ): Promise<QuestDBStockTrade[]> {
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
    return response.dataset;
  }

  /**
   * Get stock aggregates (bars) for a symbol within a time range
   */
  async getStockAggregates(
    symbol: string,
    params: QuestDBQueryParams = {}
  ): Promise<QuestDBStockAggregate[]> {
    const { start_time, end_time, limit = 1000, order_by = 'timestamp', order_direction = 'ASC' } = params;
    
    let query = `SELECT * FROM stock_aggregates WHERE symbol = '${symbol.toUpperCase()}'`;
    
    if (start_time) {
      query += ` AND timestamp >= '${start_time}'`;
    }
    
    if (end_time) {
      query += ` AND timestamp <= '${end_time}'`;
    }
    
    query += ` ORDER BY ${order_by} ${order_direction} LIMIT ${limit}`;

    const response = await this.executeQuery<QuestDBStockAggregate>(query);
    return response.dataset;
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
    return response.dataset;
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
    return response.dataset;
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
    return response.dataset;
  }

  /**
   * Get sync state for a ticker
   */
  async getSyncState(ticker: string): Promise<QuestDBSyncState | null> {
    const query = `SELECT * FROM sync_state WHERE ticker = '${ticker.toUpperCase()}' LIMIT 1`;
    
    const response = await this.executeQuery<QuestDBSyncState>(query);
    return response.dataset.length > 0 ? response.dataset[0] : null;
  }

  /**
   * Update sync state for a ticker
   */
  async updateSyncState(
    ticker: string,
    updates: Partial<Omit<QuestDBSyncState, 'ticker'>>
  ): Promise<void> {
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
    return response.dataset.length > 0 ? response.dataset[0].latest_timestamp : null;
  }

  /**
   * Get the latest aggregate timestamp for a symbol
   */
  async getLatestAggregateTimestamp(symbol: string): Promise<string | null> {
    const query = `SELECT MAX(timestamp) as latest_timestamp FROM stock_aggregates WHERE symbol = '${symbol.toUpperCase()}'`;
    
    const response = await this.executeQuery<{ latest_timestamp: string }>(query);
    return response.dataset.length > 0 ? response.dataset[0].latest_timestamp : null;
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
    } catch (error: any) {
      console.error('❌ QuestDB connection failed:', error.message);
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
      const [trades, aggregates, contracts, optionTrades, optionQuotes] = await Promise.all([
        this.executeQuery<{ count: number }>('SELECT COUNT(*) as count FROM stock_trades'),
        this.executeQuery<{ count: number }>('SELECT COUNT(*) as count FROM stock_aggregates'),
        this.executeQuery<{ count: number }>('SELECT COUNT(*) as count FROM option_contracts'),
        this.executeQuery<{ count: number }>('SELECT COUNT(*) as count FROM option_trades'),
        this.executeQuery<{ count: number }>('SELECT COUNT(*) as count FROM option_quotes')
      ]);

      return {
        stock_trades_count: trades.dataset[0]?.count || 0,
        stock_aggregates_count: aggregates.dataset[0]?.count || 0,
        option_contracts_count: contracts.dataset[0]?.count || 0,
        option_trades_count: optionTrades.dataset[0]?.count || 0,
        option_quotes_count: optionQuotes.dataset[0]?.count || 0
      };
    } catch (error: any) {
      console.error('Failed to get database stats:', error.message);
      throw new Error('Failed to retrieve database statistics');
    }
  }

  /**
   * Get configuration info (without sensitive data)
   */
  getConfig(): Omit<QuestDBConfig, 'username' | 'password'> {
    const { username, password, ...safeConfig } = this.config;
    return safeConfig;
  }
}

export const questdbService = new QuestDBService();
