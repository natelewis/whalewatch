// Test setup file for Jest
// This file runs before each test file

import { db } from '../db/connection';

// Set test environment variables
process.env.NODE_ENV = 'test';

// Mock console methods to reduce noise during tests
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

beforeAll(async () => {
  // Suppress console output during tests unless explicitly enabled
  if (!process.env.DEBUG_TESTS) {
    console.log = jest.fn();
    console.warn = jest.fn();
    console.error = jest.fn();
  }

  // Connect to test database
  try {
    await db.connect();
    console.log('Connected to test database');
  } catch (error) {
    console.error('Failed to connect to test database:', error);
    throw error;
  }
});

beforeEach(async () => {
  // Truncate all test tables before each test
  await truncateTestTables();
});

afterAll(async () => {
  // Restore console methods
  console.log = originalConsoleLog;
  console.warn = originalConsoleWarn;
  console.error = originalConsoleError;

  // Disconnect from database
  try {
    await db.disconnect();
    console.log('Disconnected from test database');
  } catch (error) {
    console.error('Error disconnecting from test database:', error);
  }
});

/**
 * Truncate all test tables (tables prefixed with 'test_')
 */
async function truncateTestTables(): Promise<void> {
  const testTables = [
    'test_stock_trades',
    'test_stock_aggregates',
    'test_option_contracts',
    'test_option_trades',
    'test_option_quotes',
    'test_sync_state',
  ];

  for (const table of testTables) {
    try {
      // Check if table exists first
      const tableExists = await db.query(`SELECT * FROM tables() WHERE table_name = '${table}'`);
      const result = tableExists as { dataset: unknown[][] };

      if (result.dataset && result.dataset.length > 0) {
        // Table exists, truncate it
        await db.query(`TRUNCATE TABLE ${table}`);
        console.log(`Truncated test table: ${table}`);
      }
    } catch (error) {
      // Table might not exist, which is fine
      console.log(`Table ${table} does not exist or could not be truncated:`, error);
    }
  }
}

// Export test utilities
export { truncateTestTables };
