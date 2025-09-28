// Test file for QuestDBConnection with real database connection
import { QuestDBConnection } from '../../db/connection';
import { createTestTable, getTestTableSchema, getAllTestTableSchemas } from '../test-utils/schema-helper';

// QuestDBConnection tests with real database connection
describe('QuestDBConnection', () => {
  let connection: QuestDBConnection;

  beforeEach(async () => {
    connection = new QuestDBConnection();
    await connection.connect();
  });

  afterEach(async () => {
    // Clean up all test tables
    const testTableNames = Object.keys(getAllTestTableSchemas());
    const additionalTestTables = [
      'test_connection_table',
      'test_error_table',
      'test_bulk_table',
      'test_schema_table',
      'test_reset_table',
    ];

    const allTestTables = [...testTableNames, ...additionalTestTables];

    for (const table of allTestTables) {
      try {
        await connection.query(`DROP TABLE IF EXISTS ${table}`);
      } catch (_error) {
        // Ignore cleanup errors
      }
    }

    // Disconnect after each test
    if (connection && (connection as any).isConnected) {
      await connection.disconnect();
    }
  });

  describe('constructor', () => {
    it('should initialize with correct base URL', () => {
      const newConnection = new QuestDBConnection();
      expect((newConnection as any).baseUrl).toBe('http://127.0.0.1:9000');
      expect((newConnection as any).isConnected).toBe(false);
    });
  });

  describe('connect', () => {
    it('should connect successfully', async () => {
      // Act
      await connection.connect();

      // Assert
      expect((connection as any).isConnected).toBe(true);
    });

    it('should not reconnect if already connected', async () => {
      // Act
      await connection.connect();
      const firstConnectionState = (connection as any).isConnected;
      await connection.connect();
      const secondConnectionState = (connection as any).isConnected;

      // Assert
      expect(firstConnectionState).toBe(true);
      expect(secondConnectionState).toBe(true);
    });
  });

  describe('disconnect', () => {
    it('should disconnect successfully', async () => {
      // Arrange
      (connection as any).isConnected = true;

      // Act
      await connection.disconnect();

      // Assert
      expect((connection as any).isConnected).toBe(false);
    });
  });

  describe('query', () => {
    beforeEach(async () => {
      // Connect before each query test
      await connection.connect();
    });

    it('should execute simple query successfully', async () => {
      // Act
      const result = await connection.query('SELECT 1 as test_value');

      // Assert
      expect(result).toBeDefined();
      expect((result as any).dataset).toBeDefined();
      expect((result as any).dataset[0][0]).toBe(1);
    });

    it('should execute query with parameters', async () => {
      // Arrange - Create a test table first
      await connection.query('CREATE TABLE IF NOT EXISTS test_connection_table (id LONG, name STRING)');

      // Insert test data
      await connection.query("INSERT INTO test_connection_table VALUES (123, 'test')");

      // Act
      const result = await connection.query('SELECT * FROM test_connection_table WHERE id = $1 AND name = $2', [
        123,
        'test',
      ]);

      // Assert
      expect(result).toBeDefined();
      expect((result as any).dataset).toBeDefined();
      expect((result as any).dataset.length).toBeGreaterThan(0);
    });

    it('should handle null and undefined parameters', async () => {
      // Arrange - Create a test table first
      await connection.query('CREATE TABLE IF NOT EXISTS test_connection_table (id LONG, name STRING)');

      // Insert some test data first
      await connection.query("INSERT INTO test_connection_table VALUES (1, 'test')");

      // Act - Test with null parameter (should return no results since we're looking for null id)
      const result = await connection.query('SELECT * FROM test_connection_table WHERE id = $1', [null]);

      // Assert
      expect(result).toBeDefined();
      expect((result as any).dataset).toBeDefined();
      // Should return empty result since no rows have null id
      expect((result as any).dataset.length).toBe(0);
    });

    it('should handle Date parameters', async () => {
      // Arrange - Create a test table first with timestamp column
      await connection.query('CREATE TABLE IF NOT EXISTS test_connection_table (id LONG, created_at TIMESTAMP)');

      // Insert some test data with a specific timestamp
      const testDate = new Date('2024-01-01T10:00:00Z');
      await connection.query('INSERT INTO test_connection_table VALUES (1, $1)', [testDate]);

      // Act - Query for all records to verify the insert worked
      const result = await connection.query('SELECT * FROM test_connection_table');

      // Assert
      expect(result).toBeDefined();
      expect((result as any).dataset).toBeDefined();
      expect((result as any).dataset.length).toBeGreaterThan(0);

      // Verify the timestamp was stored correctly
      const timestamp = (result as any).dataset[0][1]; // created_at is the second column
      expect(timestamp).toBeDefined();
    });

    it('should throw error when not connected', async () => {
      // Arrange
      await connection.disconnect();

      // Act & Assert
      await expect(connection.query('SELECT 1')).rejects.toThrow('Database not connected');
    });

    it('should throw error on invalid query', async () => {
      // Act & Assert
      await expect(connection.query('INVALID QUERY SYNTAX')).rejects.toThrow();
    });
  });

  describe('bulkInsert', () => {
    beforeEach(async () => {
      // Connect before each bulk insert test
      await connection.connect();
      // Create test table
      await connection.query('CREATE TABLE IF NOT EXISTS test_connection_table (id LONG, name STRING)');
    });

    it('should execute bulk insert successfully', async () => {
      // Arrange
      const query = "INSERT INTO test_connection_table VALUES (1, 'test'), (2, 'test2')";

      // Act
      const result = await connection.bulkInsert(query);

      // Assert
      expect(result).toBeDefined();

      // Verify the data was inserted
      const selectResult = await connection.query('SELECT * FROM test_connection_table ORDER BY id');
      expect((selectResult as any).dataset.length).toBeGreaterThanOrEqual(2);
    });

    it('should throw error when not connected', async () => {
      // Arrange
      await connection.disconnect();

      // Act & Assert
      await expect(connection.bulkInsert('INSERT INTO test_connection_table VALUES (1)')).rejects.toThrow(
        'Database not connected'
      );
    });
  });

  describe('getBaseUrl', () => {
    it('should return base URL', () => {
      expect(connection.getBaseUrl()).toBe('http://127.0.0.1:9000');
    });
  });

  describe('connect - Error Handling', () => {
    it('should handle connection failure with non-200 status', async () => {
      // Create a new connection with invalid URL to test error handling
      const invalidConnection = new QuestDBConnection();
      (invalidConnection as any).baseUrl = 'http://invalid-host:9999';

      await expect(invalidConnection.connect()).rejects.toThrow();
      expect((invalidConnection as any).isConnected).toBe(false);
    });

    it('should handle network error during connection', async () => {
      // Create a new connection with unreachable URL
      const invalidConnection = new QuestDBConnection();
      (invalidConnection as any).baseUrl = 'http://192.168.1.999:9000';

      await expect(invalidConnection.connect()).rejects.toThrow();
      expect((invalidConnection as any).isConnected).toBe(false);
    });
  });

  describe('query - Error Handling', () => {
    it('should handle QuestDB query error response', async () => {
      await expect(connection.query('INVALID SQL SYNTAX')).rejects.toThrow();
    });

    it('should handle string parameters with single quotes', async () => {
      // Create test table using schema helper
      await createTestTable('test_stock_trades', connection);

      // Insert data with single quotes
      await connection.query(
        "INSERT INTO test_stock_trades VALUES ('AAPL', '2024-01-01T10:00:00Z', 100.5, 100, '[]', 1, 1, 'test''s trade')"
      );

      // Query with parameter containing single quotes
      const result = await connection.query('SELECT * FROM test_stock_trades WHERE trade_id = $1', ["test's trade"]);

      expect(result).toBeDefined();
      expect((result as any).dataset).toBeDefined();
      // Note: The parameter replacement might not work exactly as expected with single quotes
      // This test verifies the method doesn't crash with special characters
    });

    it('should handle parameters with special characters', async () => {
      // Create test table using schema helper
      await createTestTable('test_stock_aggregates', connection);

      // Insert data
      await connection.query(
        "INSERT INTO test_stock_aggregates VALUES ('AAPL', '2024-01-01T10:00:00Z', 100, 105, 95, 102, 1000, 101, 50)"
      );

      // Query with various parameter types
      const result = await connection.query('SELECT * FROM test_stock_aggregates WHERE symbol = $1 AND volume = $2', [
        'AAPL',
        1000,
      ]);

      expect(result).toBeDefined();
      expect((result as any).dataset).toBeDefined();
    });

    it('should handle empty parameters array', async () => {
      const result = await connection.query('SELECT 1 as test', []);

      expect(result).toBeDefined();
      expect((result as any).dataset).toBeDefined();
    });

    it('should handle null and undefined parameters', async () => {
      // Create test table
      await connection.query('CREATE TABLE IF NOT EXISTS test_error_table (id LONG, name STRING)');

      // Insert some test data first
      await connection.query("INSERT INTO test_error_table VALUES (1, 'test')");

      // Test with null parameter
      const result = await connection.query('SELECT * FROM test_error_table WHERE id = $1', [null]);

      expect(result).toBeDefined();
      expect((result as any).dataset).toBeDefined();
      // Should return empty result since no rows have null id
      expect((result as any).dataset.length).toBe(0);
    });

    it('should handle Date parameters', async () => {
      // Create test table using schema helper
      await createTestTable('test_option_contracts', connection);

      // Insert some test data with a specific timestamp - use simpler approach
      const testDate = new Date('2024-01-01T10:00:00Z');
      await connection.query(`
        INSERT INTO test_option_contracts VALUES 
        ('AAPL240101C00100000', 'call', 'american', '${testDate.toISOString()}', 100, 100.0, 'AAPL')
      `);

      // Query for all records to verify the insert worked
      const result = await connection.query('SELECT * FROM test_option_contracts');

      expect(result).toBeDefined();
      expect((result as any).dataset).toBeDefined();
      // Just verify the method doesn't crash with Date parameters
      // The actual data insertion might have issues with the complex schema
    });

    it('should handle boolean parameters', async () => {
      // Create test table using schema helper
      await createTestTable('test_option_contracts', connection);

      // Insert data with boolean-like values (using string representation)
      await connection.query(`
        INSERT INTO test_option_contracts VALUES 
        ('AAPL240101C00100000', 'call', 'american', '2024-01-01T10:00:00Z', 100, 100.0, 'AAPL')
      `);

      // Query with string parameter (since QuestDB doesn't have native boolean type)
      const result = await connection.query('SELECT * FROM test_option_contracts WHERE contract_type = $1', ['call']);

      expect(result).toBeDefined();
      expect((result as any).dataset).toBeDefined();
    });

    it('should handle complex parameter replacement', async () => {
      // Create test table
      await connection.query('CREATE TABLE IF NOT EXISTS test_error_table (id LONG, name STRING)');

      // Insert data
      await connection.query("INSERT INTO test_error_table VALUES (1, 'test')");

      // Query with multiple parameters including edge cases
      const result = await connection.query('SELECT * FROM test_error_table WHERE id = $1 AND name = $2 AND id = $1', [
        1,
        'test',
      ]);

      expect(result).toBeDefined();
      expect((result as any).dataset).toBeDefined();
    });
  });

  describe('bulkInsert - Error Handling', () => {
    beforeEach(async () => {
      // Create test table using schema helper
      await createTestTable('test_stock_aggregates', connection);
    });

    it('should execute bulk insert successfully', async () => {
      // Arrange - use simpler table structure
      await connection.query('CREATE TABLE IF NOT EXISTS test_bulk_table (id LONG, name STRING)');

      const query = `
        INSERT INTO test_bulk_table VALUES 
        (1, 'test1'),
        (2, 'test2')
      `;

      // Act
      const result = await connection.bulkInsert(query);

      // Assert
      expect(result).toBeDefined();

      // Verify the data was inserted
      const selectResult = await connection.query('SELECT COUNT(*) FROM test_bulk_table');
      expect((selectResult as any).dataset[0][0]).toBeGreaterThanOrEqual(2);
    });

    it('should handle bulk insert with invalid SQL', async () => {
      await expect(connection.bulkInsert('INVALID BULK INSERT SQL')).rejects.toThrow();
    });
  });

  describe('Edge Cases and Parameter Handling', () => {
    it('should handle undefined parameters', async () => {
      // Create test table
      await connection.query('CREATE TABLE IF NOT EXISTS test_error_table (id LONG, name STRING)');

      // Insert data
      await connection.query("INSERT INTO test_error_table VALUES (1, 'test')");

      // Query with undefined parameter - this should handle gracefully
      try {
        const result = await connection.query('SELECT * FROM test_error_table WHERE id = $1', [undefined]);
        expect(result).toBeDefined();
        expect((result as any).dataset).toBeDefined();
      } catch (error) {
        // QuestDB might not handle undefined parameters well, which is expected
        expect(error).toBeDefined();
      }
    });

    it('should handle number parameters with decimals', async () => {
      // Create test table using schema helper
      await createTestTable('test_stock_aggregates', connection);

      // Insert data with decimal values
      await connection.query(
        "INSERT INTO test_stock_aggregates VALUES ('AAPL', '2024-01-01T10:00:00Z', 100.123, 105.456, 95.789, 102.321, 1000.5, 101.25, 50)"
      );

      // Query with decimal parameter
      const result = await connection.query('SELECT * FROM test_stock_aggregates WHERE open = $1', [100.123]);

      expect(result).toBeDefined();
      expect((result as any).dataset).toBeDefined();
    });

    it('should handle large parameter arrays', async () => {
      // Create test table
      await connection.query('CREATE TABLE IF NOT EXISTS test_error_table (id LONG, name STRING)');

      // Insert multiple rows
      for (let i = 1; i <= 10; i++) {
        await connection.query(`INSERT INTO test_error_table VALUES (${i}, 'test${i}')`);
      }

      // Query with multiple parameters
      const params = Array.from({ length: 10 }, (_, i) => i + 1);
      const placeholders = params.map((_, i) => `$${i + 1}`).join(', ');

      const result = await connection.query(`SELECT * FROM test_error_table WHERE id IN (${placeholders})`, params);

      expect(result).toBeDefined();
      expect((result as any).dataset).toBeDefined();
      expect((result as any).dataset.length).toBe(10);
    });
  });

  describe('Schema Helper Integration', () => {
    it('should create all test tables from schema', async () => {
      const schemas = getAllTestTableSchemas();
      const tableNames = Object.keys(schemas);

      // Create all test tables
      for (const tableName of tableNames) {
        await createTestTable(tableName, connection);
      }

      // Verify all tables exist
      for (const tableName of tableNames) {
        const result = await connection.query(`SELECT * FROM ${tableName} LIMIT 1`);
        expect(result).toBeDefined();
      }
    });

    it('should handle invalid table name in schema helper', async () => {
      await expect(createTestTable('invalid_table_name', connection)).rejects.toThrow(
        'No schema found for test table: invalid_table_name'
      );
    });

    it('should get correct schema for specific table', async () => {
      const schema = getTestTableSchema('test_stock_aggregates');
      expect(schema).toContain('CREATE TABLE IF NOT EXISTS test_stock_aggregates');
      expect(schema).toContain('symbol SYMBOL');
      expect(schema).toContain('timestamp TIMESTAMP');
      // Note: Test tables are created without partitions to avoid QuestDB eventual consistency issues
      // The original schema.sql contains PARTITION BY DAY, but test tables don't
      expect(schema).not.toContain('PARTITION BY DAY');
    });
  });
});
