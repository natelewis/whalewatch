import { BackfillService } from '../../services/backfill';
import { OptionIngestionService } from '../../services/option-ingestion';
import { StockIngestionService } from '../../services/stock-ingestion';
import { getMinDate } from '@whalewatch/shared';

// Mock the services
jest.mock('../../services/option-ingestion');
jest.mock('../../services/stock-ingestion');
jest.mock('../../db/connection', () => ({
  db: {
    connect: jest.fn(),
    disconnect: jest.fn(),
    executeSchema: jest.fn(),
  },
}));

// Mock the shared utilities
jest.mock('@whalewatch/shared', () => ({
  getMinDate: jest.fn(),
  getMaxDate: jest.fn(),
  hasData: jest.fn(),
}));

// Mock config
jest.mock('../../config', () => ({
  config: {
    tickers: ['AAPL', 'MSFT'],
    app: {
      backfillMaxDays: 7,
    },
  },
}));

describe('BackfillService', () => {
  let backfillService: BackfillService;
  let mockOptionIngestionService: jest.Mocked<OptionIngestionService>;
  let mockStockIngestionService: jest.Mocked<StockIngestionService>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mocked services
    mockOptionIngestionService = {
      getOldestAsOfDate: jest.fn(),
      processOptionContractsBackfill: jest.fn(),
    } as any;

    mockStockIngestionService = {
      getHistoricalBars: jest.fn(),
    } as any;

    // Mock the constructors
    (OptionIngestionService as jest.Mock).mockImplementation(() => mockOptionIngestionService);
    (StockIngestionService as jest.Mock).mockImplementation(() => mockStockIngestionService);

    backfillService = new BackfillService();
  });

  describe('backfillOptionContracts', () => {
    it('should skip backfill when existing data covers the target date', async () => {
      // Arrange
      const ticker = 'AAPL';
      const endDate = new Date('2024-01-20');
      const existingOldestDate = new Date('2024-01-15');

      mockOptionIngestionService.getOldestAsOfDate.mockResolvedValue(existingOldestDate);

      // Act
      await (backfillService as any).backfillOptionContracts(ticker, endDate);

      // Assert
      expect(mockOptionIngestionService.getOldestAsOfDate).toHaveBeenCalledWith(ticker);
      expect(mockOptionIngestionService.processOptionContractsBackfill).not.toHaveBeenCalled();
    });

    it('should backfill when existing data is newer than target date', async () => {
      // Arrange
      const ticker = 'AAPL';
      const endDate = new Date('2024-01-20');
      const existingOldestDate = new Date('2024-01-25'); // Newer than target

      mockOptionIngestionService.getOldestAsOfDate.mockResolvedValue(existingOldestDate);
      mockOptionIngestionService.processOptionContractsBackfill.mockResolvedValue(undefined);

      // Act
      await (backfillService as any).backfillOptionContracts(ticker, endDate);

      // Assert
      expect(mockOptionIngestionService.getOldestAsOfDate).toHaveBeenCalledWith(ticker);
      expect(mockOptionIngestionService.processOptionContractsBackfill).toHaveBeenCalledWith(
        ticker,
        existingOldestDate,
        endDate
      );
    });

    it('should backfill from today when no existing option contracts exist', async () => {
      // Arrange
      const ticker = 'AAPL';
      const endDate = new Date('2024-01-20');

      mockOptionIngestionService.getOldestAsOfDate.mockResolvedValue(null);
      mockOptionIngestionService.processOptionContractsBackfill.mockResolvedValue(undefined);

      // Act
      await (backfillService as any).backfillOptionContracts(ticker, endDate);

      // Assert
      expect(mockOptionIngestionService.getOldestAsOfDate).toHaveBeenCalledWith(ticker);
      expect(mockOptionIngestionService.processOptionContractsBackfill).toHaveBeenCalledWith(
        ticker,
        expect.any(Date), // Should be today's date
        endDate
      );

      // Verify the start date is today (within 1 second)
      const callArgs = mockOptionIngestionService.processOptionContractsBackfill.mock.calls[0];
      const startDate = callArgs[1] as Date;
      const today = new Date();
      expect(startDate.getTime()).toBeCloseTo(today.getTime(), -2);
    });

    it('should handle errors gracefully during option backfill', async () => {
      // Arrange
      const ticker = 'AAPL';
      const endDate = new Date('2024-01-20');

      mockOptionIngestionService.getOldestAsOfDate.mockResolvedValue(null);
      mockOptionIngestionService.processOptionContractsBackfill.mockRejectedValue(new Error('API Error'));

      // Act & Assert - should not throw
      await expect((backfillService as any).backfillOptionContracts(ticker, endDate)).resolves.not.toThrow();
    });
  });

  describe('backfillStockAggregates', () => {
    it('should skip backfill when existing data covers the target date', async () => {
      // Arrange
      const ticker = 'AAPL';
      const endDate = new Date('2024-01-20');
      const existingOldestDate = new Date('2024-01-15');

      (getMinDate as jest.Mock).mockResolvedValue(existingOldestDate);

      // Act
      await (backfillService as any).backfillStockAggregates(ticker, endDate);

      // Assert
      expect(getMinDate).toHaveBeenCalledWith(expect.any(Object), {
        ticker,
        tickerField: 'symbol',
        dateField: 'timestamp',
        table: 'stock_aggregates',
      });
    });

    it('should backfill when existing data is newer than target date', async () => {
      // Arrange
      const ticker = 'AAPL';
      const endDate = new Date('2024-01-20');
      const existingOldestDate = new Date('2024-01-25'); // Newer than target

      (getMinDate as jest.Mock).mockResolvedValue(existingOldestDate);
      mockStockIngestionService.getHistoricalBars.mockResolvedValue([]);

      // Act
      await (backfillService as any).backfillStockAggregates(ticker, endDate);

      // Assert
      expect(getMinDate).toHaveBeenCalledWith(expect.any(Object), {
        ticker,
        tickerField: 'symbol',
        dateField: 'timestamp',
        table: 'stock_aggregates',
      });
    });

    it('should backfill from historical date when no existing stock data exists', async () => {
      // Arrange
      const ticker = 'AAPL';
      const endDate = new Date('2024-01-20');
      const today = new Date();

      (getMinDate as jest.Mock).mockResolvedValue(today); // getMinDate now returns today when no data
      mockStockIngestionService.getHistoricalBars.mockResolvedValue([]);

      // Act
      await (backfillService as any).backfillStockAggregates(ticker, endDate);

      // Assert
      expect(getMinDate).toHaveBeenCalledWith(expect.any(Object), {
        ticker,
        tickerField: 'symbol',
        dateField: 'timestamp',
        table: 'stock_aggregates',
      });
    });
  });

  describe('backfillTickerToDate', () => {
    it('should call both stock and option backfill methods', async () => {
      // Arrange
      const ticker = 'AAPL';
      const endDate = new Date('2024-01-20');

      const backfillStockAggregatesSpy = jest
        .spyOn(backfillService as any, 'backfillStockAggregates')
        .mockResolvedValue(undefined);
      const backfillOptionContractsSpy = jest
        .spyOn(backfillService as any, 'backfillOptionContracts')
        .mockResolvedValue(undefined);

      // Act
      await backfillService.backfillTickerToDate(ticker, endDate);

      // Assert
      expect(backfillStockAggregatesSpy).toHaveBeenCalledWith(ticker, endDate);
      expect(backfillOptionContractsSpy).toHaveBeenCalledWith(ticker, endDate);
    });
  });

  describe('backfillAllToDate', () => {
    it('should backfill all configured tickers to the target date', async () => {
      // Arrange
      const endDate = new Date('2024-01-20');

      const backfillStockAggregatesAndOptionsSpy = jest
        .spyOn(backfillService as any, 'backfillStockAggregatesAndOptions')
        .mockResolvedValue(undefined);

      // Act
      await backfillService.backfillAllToDate(endDate);

      // Assert
      expect(backfillStockAggregatesAndOptionsSpy).toHaveBeenCalledWith('AAPL', endDate);
      expect(backfillStockAggregatesAndOptionsSpy).toHaveBeenCalledWith('MSFT', endDate);
    });

    it('should handle errors for individual tickers gracefully', async () => {
      // Arrange
      const endDate = new Date('2024-01-20');

      const backfillStockAggregatesAndOptionsSpy = jest
        .spyOn(backfillService as any, 'backfillStockAggregatesAndOptions')
        .mockResolvedValueOnce(undefined) // AAPL succeeds
        .mockRejectedValueOnce(new Error('MSFT Error')); // MSFT fails

      // Act & Assert - should not throw
      await expect(backfillService.backfillAllToDate(endDate)).resolves.not.toThrow();

      expect(backfillStockAggregatesAndOptionsSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('processStockAggregateBackfill', () => {
    it('should process stock data day by day from start to end date', async () => {
      // Arrange
      const ticker = 'AAPL';
      const startDate = new Date('2024-01-15');
      const endDate = new Date('2024-01-17');

      const mockBars = [
        { t: '2024-01-15T10:00:00Z', o: 100, h: 105, l: 99, c: 104, v: 1000, vw: 102, n: 50 },
        { t: '2024-01-16T10:00:00Z', o: 104, h: 108, l: 103, c: 107, v: 1200, vw: 105, n: 60 },
      ];

      mockStockIngestionService.getHistoricalBars.mockResolvedValue(mockBars);

      // Mock the insertAlpacaAggregates method
      const insertAlpacaAggregatesSpy = jest
        .spyOn(backfillService as any, 'insertAlpacaAggregates')
        .mockResolvedValue(undefined);

      // Act
      const result = await (backfillService as any).processStockAggregateBackfill(ticker, startDate, endDate);

      // Assert
      expect(result).toBe(2); // Two bars processed
      expect(mockStockIngestionService.getHistoricalBars).toHaveBeenCalledTimes(3); // 3 days
      expect(insertAlpacaAggregatesSpy).toHaveBeenCalledTimes(2); // Two days with data
    });

    it('should warn when end date is in the future', async () => {
      // Arrange
      const ticker = 'AAPL';
      const startDate = new Date('2024-01-15');
      const endDate = new Date(Date.now() + 24 * 60 * 60 * 1000); // Tomorrow

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      mockStockIngestionService.getHistoricalBars.mockResolvedValue([]);

      // Act
      await (backfillService as any).processStockAggregateBackfill(ticker, startDate, endDate);

      // Assert
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('WARNING: End date'));

      consoleSpy.mockRestore();
    });

    it('should warn when start date is after end date', async () => {
      // Arrange
      const ticker = 'AAPL';
      const startDate = new Date('2024-01-20');
      const endDate = new Date('2024-01-15');

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      mockStockIngestionService.getHistoricalBars.mockResolvedValue([]);

      // Act
      await (backfillService as any).processStockAggregateBackfill(ticker, startDate, endDate);

      // Assert
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('WARNING: Start date'));

      consoleSpy.mockRestore();
    });
  });
});
