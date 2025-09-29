import { BackfillService } from '../../services/backfill';
import { OptionIngestionService } from '../../services/option-ingestion';
import { getMinDate, hasData } from '@whalewatch/shared';

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
    tickers: ['AAPL'],
    app: {
      backfillMaxDays: 7,
    },
  },
}));

describe('Option Contract Backfill Behavior', () => {
  let backfillService: BackfillService;
  let mockOptionIngestionService: jest.Mocked<OptionIngestionService>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mocked services
    mockOptionIngestionService = {
      getOldestAsOfDate: jest.fn(),
      processOptionContractsBackfill: jest.fn(),
    } as any;

    // Mock the constructors
    (OptionIngestionService as jest.Mock).mockImplementation(() => mockOptionIngestionService);

    backfillService = new BackfillService();
  });

  describe('backfillOptionContracts with no existing data', () => {
    it('should start backfill from today when no option contracts exist', async () => {
      // Arrange
      const ticker = 'AAPL';
      const endDate = new Date('2025-09-24'); // Target date from user's example

      // Mock that no existing option contracts exist
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

      // Verify the end date is correct
      const actualEndDate = callArgs[2] as Date;
      expect(actualEndDate).toEqual(endDate);
    });

    it('should log the correct message when no existing option contracts', async () => {
      // Arrange
      const ticker = 'AAPL';
      const endDate = new Date('2025-09-24');

      mockOptionIngestionService.getOldestAsOfDate.mockResolvedValue(null);
      mockOptionIngestionService.processOptionContractsBackfill.mockResolvedValue(undefined);

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      // Act
      await (backfillService as any).backfillOptionContracts(ticker, endDate);

      // Assert
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          `${ticker} has no existing option contracts, backfilling options from today TO: ${
            endDate.toISOString().split('T')[0]
          }`
        )
      );

      consoleSpy.mockRestore();
    });
  });

  describe('backfillOptionContracts with existing data', () => {
    it('should skip backfill when existing data covers the target date', async () => {
      // Arrange
      const ticker = 'AAPL';
      const endDate = new Date('2025-09-24');
      const existingOldestDate = new Date('2025-09-20'); // Older than target

      mockOptionIngestionService.getOldestAsOfDate.mockResolvedValue(existingOldestDate);

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      // Act
      await (backfillService as any).backfillOptionContracts(ticker, endDate);

      // Assert
      expect(mockOptionIngestionService.getOldestAsOfDate).toHaveBeenCalledWith(ticker);
      expect(mockOptionIngestionService.processOptionContractsBackfill).not.toHaveBeenCalled();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          `${ticker} options contracts already have data through ${endDate.toISOString().split('T')[0]}`
        )
      );

      consoleSpy.mockRestore();
    });

    it('should backfill when existing data is newer than target date', async () => {
      // Arrange
      const ticker = 'AAPL';
      const endDate = new Date('2025-09-24');
      const existingOldestDate = new Date('2025-09-30'); // Newer than target

      mockOptionIngestionService.getOldestAsOfDate.mockResolvedValue(existingOldestDate);
      mockOptionIngestionService.processOptionContractsBackfill.mockResolvedValue(undefined);

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      // Act
      await (backfillService as any).backfillOptionContracts(ticker, endDate);

      // Assert
      expect(mockOptionIngestionService.getOldestAsOfDate).toHaveBeenCalledWith(ticker);
      expect(mockOptionIngestionService.processOptionContractsBackfill).toHaveBeenCalledWith(
        ticker,
        existingOldestDate,
        endDate
      );

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          `${ticker} options oldest as_of is ${
            existingOldestDate.toISOString().split('T')[0]
          }, backfilling options from`
        )
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Integration with getMinDate changes', () => {
    it('should work correctly with getMinDate returning today as default', async () => {
      // Arrange
      const ticker = 'AAPL';
      const endDate = new Date('2025-09-24');
      const today = new Date();

      // Mock getMinDate to return today (new behavior)
      (getMinDate as jest.Mock).mockResolvedValue(today);

      // Mock hasData to return false (no actual data exists)
      (hasData as jest.Mock).mockResolvedValue(false);

      mockOptionIngestionService.getOldestAsOfDate.mockResolvedValue(null);
      mockOptionIngestionService.processOptionContractsBackfill.mockResolvedValue(undefined);

      // Act
      await (backfillService as any).backfillOptionContracts(ticker, endDate);

      // Assert
      expect(mockOptionIngestionService.processOptionContractsBackfill).toHaveBeenCalledWith(
        ticker,
        expect.any(Date), // Should be today's date
        endDate
      );
    });
  });

  describe('Error handling', () => {
    it('should handle errors in getOldestAsOfDate gracefully', async () => {
      // Arrange
      const ticker = 'AAPL';
      const endDate = new Date('2025-09-24');

      mockOptionIngestionService.getOldestAsOfDate.mockRejectedValue(new Error('Database error'));

      // Act & Assert - should not throw
      await expect((backfillService as any).backfillOptionContracts(ticker, endDate)).resolves.not.toThrow();
    });

    it('should handle errors in processOptionContractsBackfill gracefully', async () => {
      // Arrange
      const ticker = 'AAPL';
      const endDate = new Date('2025-09-24');

      mockOptionIngestionService.getOldestAsOfDate.mockResolvedValue(null);
      mockOptionIngestionService.processOptionContractsBackfill.mockRejectedValue(new Error('API Error'));

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      // Act & Assert - should not throw
      await expect((backfillService as any).backfillOptionContracts(ticker, endDate)).resolves.not.toThrow();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Error backfilling options for AAPL'));

      consoleSpy.mockRestore();
    });
  });
});
