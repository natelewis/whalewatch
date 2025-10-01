// Test setup file for Jest
// This file runs before each test file

import { dropAllTestTables, createTestTables } from './test-utils/database';
import { db } from '../db/connection';
import { getTableName } from './test-utils/config';
import { databaseCircuitBreaker } from '../utils/circuit-breaker';

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
  // Reset circuit breaker before each test to prevent OPEN state from previous tests
  databaseCircuitBreaker.reset();
  
  // Create test tables if they don't exist
  await createTestTables();
  // Don't clean up data - tables are dropped after each test anyway
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
 * Clean up test data without truncating tables
 * This avoids QuestDB eventual consistency issues
 */
async function cleanupTestData(): Promise<void> {
  try {
    // Delete test data from all test tables
    const testTables = [getTableName('option_trades')];

    for (const table of testTables) {
      try {
        // QuestDB doesn't support DELETE FROM table without WHERE clause
        // Instead, we'll drop and recreate the table
        await db.query(`DROP TABLE IF EXISTS ${table}`);
        console.log(`Dropped table ${table} for cleanup`);
      } catch (_error) {
        // Table might not exist, ignore error
        console.log(`Table ${table} doesn't exist or couldn't be cleaned`);
      }
    }

    console.log('Cleaned up test data');
  } catch (error) {
    console.error('Error cleaning up test data:', error);
  }
}

/**
 * Clean up all test tables before each test
 */
async function cleanupTestTables(): Promise<void> {
  try {
    await dropAllTestTables();
    console.log('Cleaned up all test tables');
  } catch (error) {
    console.error('Error cleaning up test tables:', error);
  }
}

// Export test utilities
export { cleanupTestTables, cleanupTestData };
