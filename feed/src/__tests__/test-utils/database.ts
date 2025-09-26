// Test utilities for database operations
import { db } from '../../db/connection';
import { getAllTestTableSchemas } from './schema-helper';

export interface TestTableConfig {
  name: string;
  schema: string;
}

// Get test table definitions from schema.sql
const testTableSchemas = getAllTestTableSchemas();

// Convert to the format expected by the existing functions
export const TEST_TABLES: TestTableConfig[] = Object.entries(testTableSchemas).map(([name, schema]) => ({
  name,
  schema,
}));

/**
 * Create all test tables
 */
export async function createTestTables(): Promise<void> {
  console.log('Database connection status:', (db as any).isConnected);

  for (const table of TEST_TABLES) {
    try {
      console.log(`Creating table ${table.name} with schema: ${table.schema}`);
      const result = await db.query(table.schema);
      console.log(`Table creation result for ${table.name}:`, result);
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
  } catch (_error) {
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
  } catch (_error) {
    return 0;
  }
}

/**
 * Insert test data into a test table
 */
export async function insertTestData(tableName: string, data: Record<string, unknown>[]): Promise<void> {
  if (data.length === 0) {
    return;
  }

  const columns = Object.keys(data[0]);
  const values = data
    .map(
      row =>
        `(${columns
          .map(col => {
            const value = row[col];
            if (value === null || value === undefined) {
              return 'NULL';
            }
            if (typeof value === 'string') {
              return `'${value.replace(/'/g, "''")}'`;
            }
            if (value instanceof Date) {
              return `'${value.toISOString()}'`;
            }
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

  if (!questResult.dataset) {
    return [];
  }

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
