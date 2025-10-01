import axios from 'axios';
import { config } from '../config';
import { databaseCircuitBreaker } from '../utils/circuit-breaker';

interface ConnectionHealth {
  isConnected: boolean;
  lastSuccessfulQuery: Date | null;
  totalQueries: number;
  totalErrors: number;
  connectionAttempts: number;
  uptime: number;
}

export class QuestDBConnection {
  private baseUrl: string;
  private isConnected = false;
  private lastSuccessfulQuery: Date | null = null;
  private totalQueries = 0;
  private totalErrors = 0;
  private connectionAttempts = 0;
  private startTime = Date.now();
  private healthCheckInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.baseUrl = `http://${config.questdb.host}:${config.questdb.port}`;
  }

  async connect(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    const maxRetries = 5;
    let retryCount = 0;
    let success = false;

    while (retryCount < maxRetries && !success) {
      this.connectionAttempts++;
      try {
        console.log(`Attempting to connect to QuestDB (attempt ${retryCount + 1}/${maxRetries})...`);

        // Test connection with a simple query
        const response = await axios.get(`${this.baseUrl}/exec?query=SELECT 1`, {
          timeout: 10000, // 10 second timeout for connection test
        });

        if (response.status === 200) {
          this.isConnected = true;
          this.lastSuccessfulQuery = new Date();
          console.log('Connected to QuestDB');
          this.startHealthMonitoring();
          success = true;
        } else {
          throw new Error(`QuestDB connection failed with status: ${response.status}`);
        }
      } catch (error) {
        retryCount++;
        this.totalErrors++;

        if (retryCount < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, retryCount - 1), 10000); // Exponential backoff, max 10s
          console.warn(
            `Failed to connect to QuestDB (attempt ${retryCount}/${maxRetries}), retrying in ${delay}ms:`,
            error
          );
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          console.error('Failed to connect to QuestDB after all retry attempts:', error);
          throw error;
        }
      }
    }
  }

  async disconnect(): Promise<void> {
    this.isConnected = false;
    this.stopHealthMonitoring();
    console.log('Disconnected from QuestDB');
  }

  private isRetryableError(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return (
        message.includes('timeout') ||
        message.includes('econnreset') ||
        message.includes('socket hang up') ||
        message.includes('etimedout') ||
        message.includes('network') ||
        message.includes('connection') ||
        message.includes('econnrefused')
      );
    }
    return false;
  }

  private startHealthMonitoring(): void {
    // Health check every 60 seconds
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, 60000);
  }

  private stopHealthMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  private async performHealthCheck(): Promise<void> {
    try {
      // Perform a simple health check query
      await this.query('SELECT 1');
      console.log('Database health check passed');
    } catch (error) {
      console.error('Database health check failed:', error);
      // Mark connection as potentially unhealthy
      this.isConnected = false;

      // Attempt to reconnect
      try {
        await this.connect();
      } catch (reconnectError) {
        console.error('Failed to reconnect during health check:', reconnectError);
      }
    }
  }

  public getHealthStatus(): ConnectionHealth {
    return {
      isConnected: this.isConnected,
      lastSuccessfulQuery: this.lastSuccessfulQuery,
      totalQueries: this.totalQueries,
      totalErrors: this.totalErrors,
      connectionAttempts: this.connectionAttempts,
      uptime: Date.now() - this.startTime,
    };
  }

  async query(text: string, params?: unknown[]): Promise<unknown> {
    if (!this.isConnected) {
      throw new Error('Database not connected');
    }

    return databaseCircuitBreaker.execute(async () => {
      const maxRetries = 3;
      let retryCount = 0;
      let success = false;

      while (retryCount < maxRetries && !success) {
        try {
          this.totalQueries++;

          // Replace parameter placeholders ($1, $2, etc.) with actual values
          let query = text;
          if (params && params.length > 0) {
            params.forEach((param, index) => {
              const value =
                typeof param === 'string'
                  ? `'${param.replace(/'/g, "''")}'`
                  : param === null
                  ? 'NULL'
                  : param instanceof Date
                  ? `'${param.toISOString()}'`
                  : String(param);
              // Use a more specific regex to avoid partial matches
              query = query.replace(new RegExp(`\\$${index + 1}\\b`, 'g'), value);
            });
          }

          console.log(`Executing query: ${query}`);

          const response = await axios.get(`${this.baseUrl}/exec`, {
            params: { query },
            timeout: 30000, // 30 second timeout for regular queries
            headers: {
              Connection: 'keep-alive',
              'Keep-Alive': 'timeout=60, max=1000',
            },
          });

          console.log(`Query response status: ${response.status}`);
          console.log(`Query response data:`, response.data);

          if (response.data.error) {
            throw new Error(`QuestDB query error: ${response.data.error}`);
          }

          this.lastSuccessfulQuery = new Date();
          success = true;
          return response.data;
        } catch (error) {
          retryCount++;
          this.totalErrors++;

          const isRetryableError = this.isRetryableError(error);

          if (isRetryableError && retryCount < maxRetries) {
            const delay = Math.min(1000 * Math.pow(2, retryCount - 1), 5000); // Exponential backoff, max 5s
            console.warn(`Database query error on attempt ${retryCount}/${maxRetries}, retrying in ${delay}ms:`, error);
            await new Promise(resolve => setTimeout(resolve, delay));
          } else {
            console.error('Database query error:', error);
            console.error('Query that failed:', text);
            console.error('Parameters:', params);
            throw error;
          }
        }
      }
    });
  }

  async executeSchema(): Promise<void> {
    const fs = await import('fs/promises');
    const path = await import('path');

    try {
      const schemaPath = path.join(__dirname, 'schema.sql');
      const schema = await fs.readFile(schemaPath, 'utf-8');

      // Split by semicolon and execute each statement
      const statements = schema.split(';').filter(stmt => stmt.trim());

      for (const statement of statements) {
        if (statement.trim()) {
          await this.query(statement);
        }
      }

      console.log('Database schema initialized');
    } catch (error) {
      console.error('Error executing schema:', error);
      throw error;
    }
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }
}

export const db = new QuestDBConnection();
