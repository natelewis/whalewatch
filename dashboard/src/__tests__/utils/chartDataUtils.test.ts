import {
  deduplicateAndSortBars,
  formatBarsToCandlestickData,
  calculateDataRange,
  getDataPointsForTimeframe,
  processChartData,
  fillMissingMinutes,
} from '../../utils/chartDataUtils';
import { AlpacaBar, ChartTimeframe } from '../../types';

describe('chartDataUtils', () => {
  const mockBars: AlpacaBar[] = [
    {
      t: '2023-01-01T10:00:00Z',
      o: 100,
      h: 105,
      l: 95,
      c: 102,
      v: 1000,
    },
    {
      t: '2023-01-01T09:00:00Z', // Earlier time
      o: 98,
      h: 103,
      l: 97,
      c: 100,
      v: 800,
    },
    {
      t: '2023-01-01T10:00:00Z', // Duplicate timestamp
      o: 100,
      h: 105,
      l: 95,
      c: 102,
      v: 1000,
    },
    {
      t: '2023-01-01T11:00:00Z',
      o: 102,
      h: 108,
      l: 98,
      c: 106,
      v: 1200,
    },
  ];

  describe('deduplicateAndSortBars', () => {
    it('should remove duplicate entries by timestamp', () => {
      const result = deduplicateAndSortBars(mockBars);
      expect(result).toHaveLength(3);
    });

    it('should sort bars by time', () => {
      const result = deduplicateAndSortBars(mockBars);
      expect(result[0].t).toBe('2023-01-01T09:00:00Z');
      expect(result[1].t).toBe('2023-01-01T10:00:00Z');
      expect(result[2].t).toBe('2023-01-01T11:00:00Z');
    });

    it('should handle empty array', () => {
      const result = deduplicateAndSortBars([]);
      expect(result).toEqual([]);
    });
  });

  describe('formatBarsToCandlestickData', () => {
    it('should convert AlpacaBar to CandlestickData format', () => {
      const result = formatBarsToCandlestickData(mockBars);

      expect(result).toHaveLength(4);
      expect(result[0]).toEqual({
        timestamp: '2023-01-01T10:00:00Z',
        open: 100,
        high: 105,
        low: 95,
        close: 102,
        volume: 1000,
      });
    });

    it('should handle empty array', () => {
      const result = formatBarsToCandlestickData([]);
      expect(result).toEqual([]);
    });
  });

  describe('calculateDataRange', () => {
    it('should calculate data range from bars', () => {
      const result = calculateDataRange(mockBars);

      expect(result).toEqual({
        earliest: '2023-01-01T10:00:00Z',
        latest: '2023-01-01T11:00:00Z',
      });
    });

    it('should return null for empty array', () => {
      const result = calculateDataRange([]);
      expect(result).toBeNull();
    });
  });

  describe('getDataPointsForTimeframe', () => {
    const timeframes = [
      { value: '1m' as ChartTimeframe, label: '1m', limit: 100, dataPoints: 100 },
      { value: '1h' as ChartTimeframe, label: '1h', limit: 200, dataPoints: 200 },
    ];

    it('should return correct data points for timeframe', () => {
      const result = getDataPointsForTimeframe('1h', timeframes);
      expect(result).toBe(200);
    });

    it('should return default data points for unknown timeframe', () => {
      const result = getDataPointsForTimeframe('1d' as ChartTimeframe, timeframes);
      expect(result).toBe(1000); // DEFAULT_CHART_DATA_POINTS
    });
  });

  describe('processChartData', () => {
    it('should process bars into formatted data and range', () => {
      const result = processChartData(mockBars);

      expect(result.formattedData).toHaveLength(3); // After deduplication
      expect(result.dataRange).toEqual({
        earliest: '2023-01-01T09:00:00Z',
        latest: '2023-01-01T11:00:00Z',
      });
    });

    it('should handle empty array', () => {
      const result = processChartData([]);

      expect(result.formattedData).toEqual([]);
      expect(result.dataRange).toBeNull();
    });
  });

  describe('fillMissingMinutes', () => {
    const oneMinuteData = [
      {
        timestamp: '2023-01-01T10:00:00Z',
        open: 100,
        high: 105,
        low: 95,
        close: 102,
        volume: 1000,
      },
      {
        timestamp: '2023-01-01T10:03:00Z', // 3 minutes gap
        open: 102,
        high: 108,
        low: 98,
        close: 106,
        volume: 1200,
      },
    ];

    it('should fill missing minutes for 1m timeframe', () => {
      const result = fillMissingMinutes(oneMinuteData, '1m');

      expect(result).toHaveLength(4); // Original 2 + 2 filled
      expect(result[1].timestamp).toBe('2023-01-01T10:01:00Z');
      expect(result[2].timestamp).toBe('2023-01-01T10:02:00Z');
    });

    it('should not fill for non-1m timeframes', () => {
      const result = fillMissingMinutes(oneMinuteData, '1h');
      expect(result).toEqual(oneMinuteData);
    });

    it('should handle empty data', () => {
      const result = fillMissingMinutes([], '1m');
      expect(result).toEqual([]);
    });

    it('should not fill small gaps', () => {
      const smallGapData = [
        {
          timestamp: '2023-01-01T10:00:00Z',
          open: 100,
          high: 105,
          low: 95,
          close: 102,
          volume: 1000,
        },
        {
          timestamp: '2023-01-01T10:01:00Z', // 1 minute gap
          open: 102,
          high: 108,
          low: 98,
          close: 106,
          volume: 1200,
        },
      ];

      const result = fillMissingMinutes(smallGapData, '1m');
      expect(result).toEqual(smallGapData);
    });
  });
});
