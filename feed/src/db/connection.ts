import axios from 'axios';
import { config } from '../config';

export class QuestDBConnection {
  private baseUrl: string;
  private isConnected = false;

  constructor() {
    this.baseUrl = `http://${config.questdb.host}:${config.questdb.port}`;
  }

  async connect(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    try {
      // Test connection with a simple query
      const response = await axios.get(`${this.baseUrl}/exec?query=SELECT 1`);
      if (response.status === 200) {
        this.isConnected = true;
        console.log('Connected to QuestDB');
      } else {
        throw new Error(`QuestDB connection failed with status: ${response.status}`);
      }
    } catch (error) {
      console.error('Failed to connect to QuestDB:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    this.isConnected = false;
    console.log('Disconnected from QuestDB');
  }

  async query(text: string, params?: unknown[]): Promise<unknown> {
    if (!this.isConnected) {
      throw new Error('Database not connected');
    }

    try {
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

      const response = await axios.get(`${this.baseUrl}/exec`, {
        params: { query },
        timeout: 30000, // 30 second timeout for regular queries
        headers: {
          Connection: 'keep-alive',
          'Keep-Alive': 'timeout=60, max=1000',
        },
      });

      if (response.data.error) {
        throw new Error(`QuestDB query error: ${response.data.error}`);
      }

      return response.data;
    } catch (error) {
      console.error('Database query error:', error);
      throw error;
    }
  }

  /**
   * Execute a bulk insert query with multiple VALUES
   * This method is optimized for bulk inserts and uses the same deduplication
   * behavior as individual inserts when DEDUP is enabled on tables
   */
  async bulkInsert(query: string): Promise<unknown> {
    if (!this.isConnected) {
      throw new Error('Database not connected');
    }

    try {
      const response = await axios.get(`${this.baseUrl}/exec`, {
        params: { query },
        timeout: 60000, // 60 second timeout for bulk inserts
        headers: {
          Connection: 'keep-alive',
          'Keep-Alive': 'timeout=60, max=1000',
        },
      });

      if (response.data.error) {
        throw new Error(`QuestDB bulk insert error: ${response.data.error}`);
      }

      return response.data;
    } catch (error) {
      console.error('Database bulk insert error:', error);
      throw error;
    }
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

  async resetAllData(): Promise<void> {
    const tables = ['stock_aggregates', 'option_contracts', 'option_trades', 'option_quotes', 'sync_state'];

    for (const table of tables) {
      try {
        // First, try to get all partitions to ensure complete cleanup
        const partitions = await this.query(`SELECT * FROM table_partitions('${table}')`);
        const questResult = partitions as {
          columns: { name: string; type: string }[];
          dataset: unknown[][];
        };

        if (questResult.dataset && questResult.dataset.length > 0) {
          console.log(`Found ${questResult.dataset.length} partitions in ${table}...`);

          // For tables with timestamp columns, we need to handle active partitions
          if (
            table === 'stock_aggregates' ||
            table === 'option_trades' ||
            table === 'option_quotes' ||
            table === 'sync_state'
          ) {
            // Insert a dummy record with future timestamp to make current partitions inactive
            const futureDate = new Date();
            futureDate.setDate(futureDate.getDate() + 1); // Tomorrow
            const futureTimestamp = futureDate.toISOString();

            try {
              if (table === 'stock_aggregates') {
                await this.query(
                  `INSERT INTO ${table} (symbol, timestamp, open, high, low, close, volume, vwap, transaction_count) VALUES ('DUMMY', '${futureTimestamp}', 0, 0, 0, 0, 0, 0, 0)`
                );
              } else if (table === 'option_trades') {
                await this.query(
                  `INSERT INTO ${table} (ticker, underlying_ticker, timestamp, price, size, conditions, exchange, tape, sequence_number) VALUES ('DUMMY', 'DUMMY', '${futureTimestamp}', 0, 0, '[]', 0, 0, 0)`
                );
              } else if (table === 'option_quotes') {
                await this.query(
                  `INSERT INTO ${table} (ticker, underlying_ticker, timestamp, bid_price, bid_size, ask_price, ask_size, bid_exchange, ask_exchange, sequence_number) VALUES ('DUMMY', 'DUMMY', '${futureTimestamp}', 0, 0, 0, 0, 0, 0, 0)`
                );
              } else if (table === 'sync_state') {
                await this.query(
                  `INSERT INTO ${table} (ticker, last_aggregate_timestamp, last_sync, is_streaming) VALUES ('DUMMY', '${futureTimestamp}', '${futureTimestamp}', false)`
                );
              }
              console.log(`Inserted dummy record with future timestamp to make partitions inactive`);
            } catch (error) {
              console.warn(`Failed to insert dummy record for ${table}:`, error);
            }
          }

          // Now try to drop each partition
          for (const partition of questResult.dataset) {
            const partitionName = partition[2] as string; // name column
            try {
              await this.query(`ALTER TABLE ${table} DROP PARTITION LIST '${partitionName}'`);
              console.log(`Dropped partition ${partitionName} from ${table}`);
            } catch (error) {
              console.warn(`Failed to drop partition ${partitionName} from ${table}:`, error);
            }
          }
        }
      } catch (error) {
        console.warn(`Failed to get partitions for ${table}:`, error);
      }

      // Drop the table completely
      await this.query(`DROP TABLE IF EXISTS ${table}`);
      console.log(`Dropped table ${table}`);
    }

    await this.executeSchema();
    console.log('All data reset and schema recreated');
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }
}

export const db = new QuestDBConnection();
