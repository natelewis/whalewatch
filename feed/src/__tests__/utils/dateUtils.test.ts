import { getMinDate, getMaxDate, hasData, normalizeToMidnight, QuestDBServiceInterface } from '@whalewatch/shared';

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

  describe('normalizeToMidnight', () => {
    it('should normalize a date to midnight (00:00:00.000)', () => {
      // Arrange
      const date = new Date('2024-01-15T14:30:45.123Z');

      // Act
      const result = normalizeToMidnight(date);

      // Assert
      expect(result.getFullYear()).toBe(2024);
      expect(result.getMonth()).toBe(0); // January is 0
      expect(result.getDate()).toBe(15);
      expect(result.getHours()).toBe(0);
      expect(result.getMinutes()).toBe(0);
      expect(result.getSeconds()).toBe(0);
      expect(result.getMilliseconds()).toBe(0);
    });

    it('should handle dates at different times of day consistently', () => {
      // Arrange
      const morning = new Date('2024-01-15T08:30:45.123Z');
      const afternoon = new Date('2024-01-15T16:45:30.456Z');
      const evening = new Date('2024-01-15T23:59:59.999Z');

      // Act
      const normalizedMorning = normalizeToMidnight(morning);
      const normalizedAfternoon = normalizeToMidnight(afternoon);
      const normalizedEvening = normalizeToMidnight(evening);

      // Assert
      expect(normalizedMorning.getTime()).toBe(normalizedAfternoon.getTime());
      expect(normalizedAfternoon.getTime()).toBe(normalizedEvening.getTime());
      expect(normalizedMorning.getTime()).toBe(normalizedEvening.getTime());
    });

    it('should preserve the original date but reset time to midnight', () => {
      // Arrange
      const originalDate = new Date('2024-12-25T12:34:56.789Z');

      // Act
      const normalized = normalizeToMidnight(originalDate);

      // Assert
      expect(normalized.getFullYear()).toBe(2024);
      expect(normalized.getMonth()).toBe(11); // December is 11
      expect(normalized.getDate()).toBe(25);
      expect(normalized.getHours()).toBe(0);
      expect(normalized.getMinutes()).toBe(0);
      expect(normalized.getSeconds()).toBe(0);
      expect(normalized.getMilliseconds()).toBe(0);
    });

    it('should handle edge cases like leap year dates', () => {
      // Arrange
      const leapYearDate = new Date('2024-02-29T15:30:45.123Z');

      // Act
      const result = normalizeToMidnight(leapYearDate);

      // Assert
      expect(result.getFullYear()).toBe(2024);
      expect(result.getMonth()).toBe(1); // February is 1
      expect(result.getDate()).toBe(29);
      expect(result.getHours()).toBe(0);
      expect(result.getMinutes()).toBe(0);
      expect(result.getSeconds()).toBe(0);
      expect(result.getMilliseconds()).toBe(0);
    });

    it('should not mutate the original date object', () => {
      // Arrange
      const originalDate = new Date('2024-01-15T14:30:45.123Z');
      const originalTime = originalDate.getTime();

      // Act
      normalizeToMidnight(originalDate);

      // Assert
      expect(originalDate.getTime()).toBe(originalTime);
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
