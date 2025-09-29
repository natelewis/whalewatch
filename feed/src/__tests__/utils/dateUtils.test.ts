import { getMinDate, getMaxDate, hasData, QuestDBServiceInterface } from '@whalewatch/shared';

// Mock QuestDB service interface for testing
const createMockQuestDBService = (
  responses: Array<{ columns: { name: string; type: string }[]; dataset: unknown[][] }>
): QuestDBServiceInterface => {
  let callCount = 0;

  return {
    executeQuery: jest.fn().mockImplementation(() => {
      const response = responses[callCount] || { columns: [], dataset: [] };
      callCount++;
      return Promise.resolve(response);
    }),
    convertArrayToObject: jest
      .fn()
      .mockImplementation((dataset: unknown[][], columns: { name: string; type: string }[]) => {
        return dataset.map((row: unknown) => {
          if (!Array.isArray(row)) {
            throw new Error('Expected array data from QuestDB');
          }
          const obj: Record<string, string | number | boolean | null> = {};
          columns.forEach((col, index) => {
            obj[col.name] = row[index] as string | number | boolean | null;
          });
          return obj;
        });
      }),
  };
};

describe('DateUtils Functions', () => {
  describe('getMinDate', () => {
    it('should return the actual minimum date when data exists', async () => {
      // Arrange
      const mockResponse = {
        columns: [{ name: 'min_date', type: 'TIMESTAMP' }],
        dataset: [['2024-01-15T00:00:00.000Z']],
      };
      const mockService = createMockQuestDBService([mockResponse]);
      const params = {
        ticker: 'AAPL',
        tickerField: 'symbol',
        dateField: 'timestamp',
        table: 'stock_aggregates',
      };

      // Act
      const result = await getMinDate(mockService, params);

      // Assert
      expect(result).toEqual(new Date('2024-01-15T00:00:00.000Z'));
      expect(mockService.executeQuery).toHaveBeenCalledWith(
        "SELECT MIN(timestamp) as min_date FROM test_stock_aggregates WHERE symbol = 'AAPL'"
      );
    });

    it("should return today's date when no data exists", async () => {
      // Arrange
      const mockResponse = {
        columns: [{ name: 'min_date', type: 'TIMESTAMP' }],
        dataset: [[null]],
      };
      const mockService = createMockQuestDBService([mockResponse]);
      const params = {
        ticker: 'NONEXISTENT',
        tickerField: 'symbol',
        dateField: 'timestamp',
        table: 'stock_aggregates',
      };

      // Act
      const result = await getMinDate(mockService, params);

      // Assert
      const today = new Date();
      expect(result).toBeDefined();
      expect(result!.getTime()).toBeCloseTo(today.getTime(), -2); // Within 1 second
      expect(mockService.executeQuery).toHaveBeenCalledWith(
        "SELECT MIN(timestamp) as min_date FROM test_stock_aggregates WHERE symbol = 'NONEXISTENT'"
      );
    });

    it("should return today's date when empty dataset is returned", async () => {
      // Arrange
      const mockResponse = {
        columns: [{ name: 'min_date', type: 'TIMESTAMP' }],
        dataset: [],
      };
      const mockService = createMockQuestDBService([mockResponse]);
      const params = {
        ticker: 'EMPTY',
        tickerField: 'symbol',
        dateField: 'timestamp',
        table: 'stock_aggregates',
      };

      // Act
      const result = await getMinDate(mockService, params);

      // Assert
      const today = new Date();
      expect(result).toBeDefined();
      expect(result!.getTime()).toBeCloseTo(today.getTime(), -2); // Within 1 second
    });

    it("should return today's date when query throws an error", async () => {
      // Arrange
      const mockService = createMockQuestDBService([]);
      mockService.executeQuery = jest.fn().mockRejectedValue(new Error('Database error'));
      const params = {
        ticker: 'ERROR',
        tickerField: 'symbol',
        dateField: 'timestamp',
        table: 'stock_aggregates',
      };

      // Act
      const result = await getMinDate(mockService, params);

      // Assert
      const today = new Date();
      expect(result).toBeDefined();
      expect(result!.getTime()).toBeCloseTo(today.getTime(), -2); // Within 1 second
    });

    it('should use test table prefix when NODE_ENV is test', async () => {
      // Arrange
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'test';

      const mockResponse = {
        columns: [{ name: 'min_date', type: 'TIMESTAMP' }],
        dataset: [['2024-01-15T00:00:00.000Z']],
      };
      const mockService = createMockQuestDBService([mockResponse]);
      const params = {
        ticker: 'AAPL',
        tickerField: 'symbol',
        dateField: 'timestamp',
        table: 'stock_aggregates',
      };

      // Act
      await getMinDate(mockService, params);

      // Assert
      expect(mockService.executeQuery).toHaveBeenCalledWith(
        "SELECT MIN(timestamp) as min_date FROM test_stock_aggregates WHERE symbol = 'AAPL'"
      );

      // Cleanup
      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('getMaxDate', () => {
    it('should return the actual maximum date when data exists', async () => {
      // Arrange
      const mockResponse = {
        columns: [{ name: 'max_date', type: 'TIMESTAMP' }],
        dataset: [['2024-01-20T00:00:00.000Z']],
      };
      const mockService = createMockQuestDBService([mockResponse]);
      const params = {
        ticker: 'AAPL',
        tickerField: 'symbol',
        dateField: 'timestamp',
        table: 'stock_aggregates',
      };

      // Act
      const result = await getMaxDate(mockService, params);

      // Assert
      expect(result).toEqual(new Date('2024-01-20T00:00:00.000Z'));
      expect(mockService.executeQuery).toHaveBeenCalledWith(
        "SELECT MAX(timestamp) as max_date FROM test_stock_aggregates WHERE symbol = 'AAPL'"
      );
    });

    it('should return null when no data exists', async () => {
      // Arrange
      const mockResponse = {
        columns: [{ name: 'max_date', type: 'TIMESTAMP' }],
        dataset: [[null]],
      };
      const mockService = createMockQuestDBService([mockResponse]);
      const params = {
        ticker: 'NONEXISTENT',
        tickerField: 'symbol',
        dateField: 'timestamp',
        table: 'stock_aggregates',
      };

      // Act
      const result = await getMaxDate(mockService, params);

      // Assert
      expect(result).toBeNull();
    });

    it('should return null when query throws an error', async () => {
      // Arrange
      const mockService = createMockQuestDBService([]);
      mockService.executeQuery = jest.fn().mockRejectedValue(new Error('Database error'));
      const params = {
        ticker: 'ERROR',
        tickerField: 'symbol',
        dateField: 'timestamp',
        table: 'stock_aggregates',
      };

      // Act
      const result = await getMaxDate(mockService, params);

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('hasData', () => {
    it('should return true when data exists', async () => {
      // Arrange
      const mockResponse = {
        columns: [{ name: 'count', type: 'LONG' }],
        dataset: [[5]],
      };
      const mockService = createMockQuestDBService([mockResponse]);
      const params = {
        ticker: 'AAPL',
        tickerField: 'symbol',
        table: 'stock_aggregates',
      };

      // Act
      const result = await hasData(mockService, params);

      // Assert
      expect(result).toBe(true);
      expect(mockService.executeQuery).toHaveBeenCalledWith(
        "SELECT COUNT(*) as count FROM test_stock_aggregates WHERE symbol = 'AAPL'"
      );
    });

    it('should return false when no data exists', async () => {
      // Arrange
      const mockResponse = {
        columns: [{ name: 'count', type: 'LONG' }],
        dataset: [[0]],
      };
      const mockService = createMockQuestDBService([mockResponse]);
      const params = {
        ticker: 'NONEXISTENT',
        tickerField: 'symbol',
        table: 'stock_aggregates',
      };

      // Act
      const result = await hasData(mockService, params);

      // Assert
      expect(result).toBe(false);
    });

    it('should return false when empty dataset is returned', async () => {
      // Arrange
      const mockResponse = {
        columns: [{ name: 'count', type: 'LONG' }],
        dataset: [],
      };
      const mockService = createMockQuestDBService([mockResponse]);
      const params = {
        ticker: 'EMPTY',
        tickerField: 'symbol',
        table: 'stock_aggregates',
      };

      // Act
      const result = await hasData(mockService, params);

      // Assert
      expect(result).toBe(false);
    });

    it('should return false when query throws an error', async () => {
      // Arrange
      const mockService = createMockQuestDBService([]);
      mockService.executeQuery = jest.fn().mockRejectedValue(new Error('Database error'));
      const params = {
        ticker: 'ERROR',
        tickerField: 'symbol',
        table: 'stock_aggregates',
      };

      // Act
      const result = await hasData(mockService, params);

      // Assert
      expect(result).toBe(false);
    });

    it('should use test table prefix when NODE_ENV is test', async () => {
      // Arrange
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'test';

      const mockResponse = {
        columns: [{ name: 'count', type: 'LONG' }],
        dataset: [[1]],
      };
      const mockService = createMockQuestDBService([mockResponse]);
      const params = {
        ticker: 'AAPL',
        tickerField: 'symbol',
        table: 'stock_aggregates',
      };

      // Act
      await hasData(mockService, params);

      // Assert
      expect(mockService.executeQuery).toHaveBeenCalledWith(
        "SELECT COUNT(*) as count FROM test_stock_aggregates WHERE symbol = 'AAPL'"
      );

      // Cleanup
      process.env.NODE_ENV = originalEnv;
    });
  });
});
