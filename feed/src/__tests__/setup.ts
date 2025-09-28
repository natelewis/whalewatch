// Test setup file for Jest
// This file runs before each test file

import { dropAllTestTables, createTestTables } from './test-utils/database';
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
  // Create test tables if they don't exist
  await createTestTables();
  // Don't truncate tables - just ensure they exist
  // await truncateTestTables();
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
export { cleanupTestTables };
