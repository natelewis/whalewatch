// Test configuration utilities
import { config } from '../../config';

/**
 * Get table name with test prefix if in test environment
 * Resilient to double prefixes - if already prefixed, returns as-is
 */
export function getTableName(originalTableName: string): string {
  if (process.env.NODE_ENV === 'test') {
    // Check if already has test prefix to avoid double prefixes
    if (originalTableName.startsWith('test_')) {
      return originalTableName;
    }
    return `test_${originalTableName}`;
  }
  return originalTableName;
}

/**
 * Test configuration that uses test table prefixes
 */
export const testConfig = {
  ...config,
  // Override table names to use test prefixes
  tables: {
    stockTrades: getTableName('stock_trades'),
    stockAggregates: getTableName('stock_aggregates'),
    optionContracts: getTableName('option_contracts'),
    optionTrades: getTableName('option_trades'),
    optionQuotes: getTableName('option_quotes'),
  },
};

/**
 * Mock the config module for tests
 */
export function mockConfigForTests(): void {
  // This will be used to mock the config import in test files
  jest.doMock('../../config', () => ({
    config: testConfig,
  }));
}

/**
 * Test data generators
 */
export const testDataGenerators = {
  generateStockTrade: (
    overrides: Partial<{
      symbol: string;
      timestamp: Date;
      price: number;
      size: number;
      conditions: string;
      exchange: number;
      tape: number;
      trade_id: string;
    }> = {}
  ) => ({
    symbol: 'AAPL',
    timestamp: new Date('2024-01-01T10:00:00Z'),
    price: 150.0,
    size: 100,
    conditions: 'regular',
    exchange: 1,
    tape: 1,
    trade_id: 'test-trade-1',
    ...overrides,
  }),

  generateStockAggregate: (
    overrides: Partial<{
      symbol: string;
      timestamp: Date;
      open: number;
      high: number;
      low: number;
      close: number;
      volume: number;
      vwap: number;
      transaction_count: number;
    }> = {}
  ) => ({
    symbol: 'AAPL',
    timestamp: new Date('2024-01-01T10:00:00Z'),
    open: 150.0,
    high: 151.0,
    low: 149.0,
    close: 150.5,
    volume: 1000,
    vwap: 150.25,
    transaction_count: 50,
    ...overrides,
  }),

  generateOptionContract: (
    overrides: Partial<{
      ticker: string;
      contract_type: string;
      exercise_style: string;
      expiration_date: Date;
      shares_per_contract: number;
      strike_price: number;
      underlying_ticker: string;
      as_of: Date;
    }> = {}
  ) => ({
    ticker: 'AAPL240315C00150000',
    contract_type: 'call',
    exercise_style: 'american',
    expiration_date: new Date('2024-03-15T00:00:00Z'),
    shares_per_contract: 100,
    strike_price: 150.0,
    underlying_ticker: 'AAPL',
    as_of: new Date('2024-01-01T10:00:00Z'),
    ...overrides,
  }),

  generateOptionTrade: (
    overrides: Partial<{
      ticker: string;
      underlying_ticker: string;
      timestamp: Date;
      price: number;
      size: number;
      conditions: string;
      exchange: number;
      tape: number;
      sequence_number: number;
    }> = {}
  ) => ({
    ticker: 'AAPL240315C00150000',
    underlying_ticker: 'AAPL',
    timestamp: new Date('2024-01-01T10:00:00Z'),
    price: 5.0,
    size: 10,
    conditions: 'regular',
    exchange: 1,
    tape: 1,
    sequence_number: 12345,
    ...overrides,
  }),

  generateOptionQuote: (
    overrides: Partial<{
      ticker: string;
      underlying_ticker: string;
      timestamp: Date;
      bid_price: number;
      bid_size: number;
      ask_price: number;
      ask_size: number;
      bid_exchange: number;
      ask_exchange: number;
      sequence_number: number;
    }> = {}
  ) => ({
    ticker: 'AAPL240315C00150000',
    underlying_ticker: 'AAPL',
    timestamp: new Date('2024-01-01T10:00:00Z'),
    bid_price: 4.8,
    bid_size: 5,
    ask_price: 5.2,
    ask_size: 5,
    bid_exchange: 1,
    ask_exchange: 1,
    sequence_number: 12345,
    ...overrides,
  }),
};
