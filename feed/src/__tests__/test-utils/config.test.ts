// Test file for test configuration utilities
import { getTableName, testDataGenerators } from './config';

describe('Test Configuration Utilities', () => {
  describe('getTableName', () => {
    it('should add test prefix in test environment', () => {
      process.env.NODE_ENV = 'test';
      expect(getTableName('stock_trades')).toBe('test_stock_trades');
      expect(getTableName('option_contracts')).toBe('test_option_contracts');
    });

    it('should not add prefix in non-test environment', () => {
      process.env.NODE_ENV = 'production';
      expect(getTableName('stock_trades')).toBe('stock_trades');
      expect(getTableName('option_contracts')).toBe('option_contracts');
    });

    it('should be resilient to double prefixes', () => {
      process.env.NODE_ENV = 'test';
      // Test that already prefixed names are not double-prefixed
      expect(getTableName('test_stock_trades')).toBe('test_stock_trades');
      expect(getTableName('test_option_contracts')).toBe('test_option_contracts');

      // Test that calling getTableName multiple times doesn't add more prefixes
      const once = getTableName('stock_trades');
      const twice = getTableName(once);
      const thrice = getTableName(twice);

      expect(once).toBe('test_stock_trades');
      expect(twice).toBe('test_stock_trades');
      expect(thrice).toBe('test_stock_trades');
    });

    it('should handle edge cases', () => {
      process.env.NODE_ENV = 'test';
      // Test with empty string
      expect(getTableName('')).toBe('test_');

      // Test with string that starts with test_ but is not exactly test_
      expect(getTableName('test_something')).toBe('test_something');

      // Test with string that contains test_ but doesn't start with it
      expect(getTableName('my_test_table')).toBe('test_my_test_table');
    });
  });

  describe('testDataGenerators', () => {
    describe('generateStockTrade', () => {
      it('should generate stock trade with default values', () => {
        const trade = testDataGenerators.generateStockTrade();

        expect(trade).toMatchObject({
          symbol: 'AAPL',
          price: 150.0,
          size: 100,
          conditions: 'regular',
          exchange: 1,
          tape: 1,
          trade_id: 'test-trade-1',
        });
        expect(trade.timestamp).toBeInstanceOf(Date);
      });

      it('should generate stock trade with overrides', () => {
        const trade = testDataGenerators.generateStockTrade({
          symbol: 'GOOGL',
          price: 2500.0,
          size: 50,
        });

        expect(trade).toMatchObject({
          symbol: 'GOOGL',
          price: 2500.0,
          size: 50,
          conditions: 'regular',
          exchange: 1,
          tape: 1,
          trade_id: 'test-trade-1',
        });
      });
    });

    describe('generateStockAggregate', () => {
      it('should generate stock aggregate with default values', () => {
        const aggregate = testDataGenerators.generateStockAggregate();

        expect(aggregate).toMatchObject({
          symbol: 'AAPL',
          open: 150.0,
          high: 151.0,
          low: 149.0,
          close: 150.5,
          volume: 1000,
          vwap: 150.25,
          transaction_count: 50,
        });
        expect(aggregate.timestamp).toBeInstanceOf(Date);
      });

      it('should generate stock aggregate with overrides', () => {
        const aggregate = testDataGenerators.generateStockAggregate({
          symbol: 'TSLA',
          open: 200.0,
          high: 210.0,
          low: 195.0,
          close: 205.0,
        });

        expect(aggregate).toMatchObject({
          symbol: 'TSLA',
          open: 200.0,
          high: 210.0,
          low: 195.0,
          close: 205.0,
          volume: 1000,
          vwap: 150.25,
          transaction_count: 50,
        });
      });
    });

    describe('generateOptionContract', () => {
      it('should generate option contract with default values', () => {
        const contract = testDataGenerators.generateOptionContract();

        expect(contract).toMatchObject({
          ticker: 'AAPL240315C00150000',
          contract_type: 'call',
          exercise_style: 'american',
          shares_per_contract: 100,
          strike_price: 150.0,
          underlying_ticker: 'AAPL',
        });
        expect(contract.expiration_date).toBeInstanceOf(Date);
        expect(contract.as_of).toBeInstanceOf(Date);
      });

      it('should generate option contract with overrides', () => {
        const contract = testDataGenerators.generateOptionContract({
          ticker: 'GOOGL240315P00250000',
          contract_type: 'put',
          strike_price: 2500.0,
          underlying_ticker: 'GOOGL',
        });

        expect(contract).toMatchObject({
          ticker: 'GOOGL240315P00250000',
          contract_type: 'put',
          exercise_style: 'american',
          shares_per_contract: 100,
          strike_price: 2500.0,
          underlying_ticker: 'GOOGL',
        });
      });
    });

    describe('generateOptionTrade', () => {
      it('should generate option trade with default values', () => {
        const trade = testDataGenerators.generateOptionTrade();

        expect(trade).toMatchObject({
          ticker: 'AAPL240315C00150000',
          underlying_ticker: 'AAPL',
          price: 5.0,
          size: 10,
          conditions: 'regular',
          exchange: 1,
        });
        expect(trade.timestamp).toBeInstanceOf(Date);
      });
    });

    describe('generateOptionQuote', () => {
      it('should generate option quote with default values', () => {
        const quote = testDataGenerators.generateOptionQuote();

        expect(quote).toMatchObject({
          ticker: 'AAPL240315C00150000',
          underlying_ticker: 'AAPL',
          bid_price: 4.8,
          bid_size: 5,
          ask_price: 5.2,
          ask_size: 5,
          bid_exchange: 1,
          ask_exchange: 1,
          sequence_number: 12345,
        });
        expect(quote.timestamp).toBeInstanceOf(Date);
      });
    });
  });
});
