// Test utilities for database operations
import { db } from '../../db/connection';

export interface TestTableConfig {
  name: string;
  schema: string;
}

export const TEST_TABLES: TestTableConfig[] = [
  {
    name: 'test_stock_trades',
    schema: `
      CREATE TABLE IF NOT EXISTS test_stock_trades (
        symbol SYMBOL,
        timestamp TIMESTAMP,
        price DOUBLE,
        size DOUBLE,
        conditions STRING,
        exchange LONG,
        tape LONG,
        trade_id STRING
      ) TIMESTAMP(timestamp) PARTITION BY DAY
    `,
  },
  {
    name: 'test_stock_aggregates',
    schema: `
      CREATE TABLE IF NOT EXISTS test_stock_aggregates (
        symbol SYMBOL,
        timestamp TIMESTAMP,
        open DOUBLE,
        high DOUBLE,
        low DOUBLE,
        close DOUBLE,
        volume DOUBLE,
        vwap DOUBLE,
        transaction_count LONG
      ) TIMESTAMP(timestamp) PARTITION BY DAY
    `,
  },
  {
    name: 'test_option_contracts',
    schema: `
      CREATE TABLE IF NOT EXISTS test_option_contracts (
        ticker STRING,
        contract_type STRING,
        exercise_style STRING,
        expiration_date TIMESTAMP,
        shares_per_contract LONG,
        strike_price DOUBLE,
        underlying_ticker SYMBOL,
        as_of TIMESTAMP
      ) TIMESTAMP(as_of) PARTITION BY DAY
    `,
  },
  {
    name: 'test_option_trades',
    schema: `
      CREATE TABLE IF NOT EXISTS test_option_trades (
        ticker SYMBOL,
        underlying_ticker SYMBOL,
        timestamp TIMESTAMP,
        price DOUBLE,
        size DOUBLE,
        conditions STRING,
        exchange LONG,
        tape LONG,
        sequence_number LONG
      ) TIMESTAMP(timestamp) PARTITION BY DAY
    `,
  },
  {
    name: 'test_option_quotes',
    schema: `
      CREATE TABLE IF NOT EXISTS test_option_quotes (
        ticker SYMBOL,
        underlying_ticker SYMBOL,
        timestamp TIMESTAMP,
        bid_price DOUBLE,
        bid_size DOUBLE,
        ask_price DOUBLE,
        ask_size DOUBLE,
        bid_exchange LONG,
        ask_exchange LONG,
        sequence_number LONG
      ) TIMESTAMP(timestamp) PARTITION BY DAY
    `,
  },
  {
    name: 'test_sync_state',
    schema: `
      CREATE TABLE IF NOT EXISTS test_sync_state (
        ticker SYMBOL,
        last_aggregate_timestamp TIMESTAMP,
        last_sync TIMESTAMP,
        is_streaming BOOLEAN
      ) TIMESTAMP(last_sync) PARTITION BY DAY
    `,
  },
];

/**
 * Create all test tables
 */
export async function createTestTables(): Promise<void> {
  for (const table of TEST_TABLES) {
    try {
      await db.query(table.schema);
      console.log(`Created test table: ${table.name}`);
    } catch (error) {
      console.error(`Failed to create test table ${table.name}:`, error);
      throw error;
    }
  }
}

/**
 * Drop all test tables
 */
export async function dropTestTables(): Promise<void> {
  for (const table of TEST_TABLES) {
    try {
      await db.query(`DROP TABLE IF EXISTS ${table.name}`);
      console.log(`Dropped test table: ${table.name}`);
    } catch (error) {
      console.error(`Failed to drop test table ${table.name}:`, error);
    }
  }
}

/**
 * Truncate all test tables
 */
export async function truncateTestTables(): Promise<void> {
  for (const table of TEST_TABLES) {
    try {
      // Check if table exists first
      const tableExists = await db.query(`SELECT * FROM tables() WHERE table_name = '${table.name}'`);
      const result = tableExists as { dataset: unknown[][] };

      if (result.dataset && result.dataset.length > 0) {
        await db.query(`TRUNCATE TABLE ${table.name}`);
        console.log(`Truncated test table: ${table.name}`);
      }
    } catch (error) {
      console.log(`Table ${table.name} does not exist or could not be truncated:`, error);
    }
  }
}

/**
 * Check if a test table exists
 */
export async function testTableExists(tableName: string): Promise<boolean> {
  try {
    const result = await db.query(`SELECT * FROM tables() WHERE table_name = '${tableName}'`);
    const questResult = result as { dataset: unknown[][] };
    return questResult.dataset && questResult.dataset.length > 0;
  } catch (error) {
    return false;
  }
}

/**
 * Get row count for a test table
 */
export async function getTestTableRowCount(tableName: string): Promise<number> {
  try {
    const result = await db.query(`SELECT COUNT(*) as count FROM ${tableName}`);
    const questResult = result as { dataset: unknown[][] };
    return questResult.dataset && questResult.dataset.length > 0 ? Number(questResult.dataset[0][0]) : 0;
  } catch (error) {
    return 0;
  }
}

/**
 * Insert test data into a test table
 */
export async function insertTestData(tableName: string, data: Record<string, unknown>[]): Promise<void> {
  if (data.length === 0) return;

  const columns = Object.keys(data[0]);
  const values = data
    .map(
      row =>
        `(${columns
          .map(col => {
            const value = row[col];
            if (value === null || value === undefined) return 'NULL';
            if (typeof value === 'string') return `'${value.replace(/'/g, "''")}'`;
            if (value instanceof Date) return `'${value.toISOString()}'`;
            return String(value);
          })
          .join(', ')})`
    )
    .join(', ');

  const query = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES ${values}`;
  await db.query(query);
}

/**
 * Get all data from a test table
 */
export async function getTestTableData(tableName: string): Promise<unknown[]> {
  const result = await db.query(`SELECT * FROM ${tableName} ORDER BY timestamp DESC`);
  const questResult = result as {
    columns: { name: string; type: string }[];
    dataset: unknown[][];
  };

  if (!questResult.dataset) return [];

  return questResult.dataset.map(row => {
    const obj: Record<string, unknown> = {};
    questResult.columns.forEach((col, index) => {
      obj[col.name] = row[index];
    });
    return obj;
  });
}

/**
 * Setup test environment with all test tables
 */
export async function setupTestEnvironment(): Promise<void> {
  await createTestTables();
  await truncateTestTables();
}

/**
 * Cleanup test environment
 */
export async function cleanupTestEnvironment(): Promise<void> {
  await dropTestTables();
}
