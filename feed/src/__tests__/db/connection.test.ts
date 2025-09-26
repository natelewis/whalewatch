// Test file for QuestDBConnection with real database connection
import { QuestDBConnection } from '../../db/connection';

// QuestDBConnection tests with real database connection
describe('QuestDBConnection', () => {
  let connection: QuestDBConnection;

  beforeEach(() => {
    connection = new QuestDBConnection();
  });

  afterEach(async () => {
    // Clean up test table
    try {
      await connection.query('DROP TABLE IF EXISTS test_connection_table');
    } catch (error) {
      // Ignore cleanup errors
    }

    // Disconnect after each test
    if (connection && (connection as any).isConnected) {
      await connection.disconnect();
    }
  });

  describe('constructor', () => {
    it('should initialize with correct base URL', () => {
      expect((connection as any).baseUrl).toBe('http://127.0.0.1:9000');
      expect((connection as any).isConnected).toBe(false);
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
});
