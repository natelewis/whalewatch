import {
  deduplicateAndSortBars,
  formatBarsToCandlestickData,
  calculateDataRange,
  getDataPointsForTimeframe,
  processChartData,
  fillMissingMinutes,
  createFakeCandle,
  isFakeCandle,
  addRightPaddingFakeCandle,
  addFakeCandlesForPadding,
  getTimeframeIntervalMs,
} from '../../utils/chartDataUtils';
import { AlpacaBar, ChartTimeframe, CandlestickData } from '../../types';

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
        start: new Date('2023-01-01T10:00:00Z').getTime(),
        end: new Date('2023-01-01T11:00:00Z').getTime(),
      });
    });

    it('should return null for empty array', () => {
      const result = calculateDataRange([]);
      expect(result).toBeNull();
    });
  });

  describe('getDataPointsForTimeframe', () => {
    const timeframes = [
      {
        value: '1m' as ChartTimeframe,
        label: '1m',
        limit: 100,
        dataPoints: 100,
      },
      {
        value: '1h' as ChartTimeframe,
        label: '1h',
        limit: 200,
        dataPoints: 200,
      },
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
      const result = processChartData(mockBars, '1m', 80);

      expect(result.formattedData.length).toBeGreaterThanOrEqual(3); // After deduplication + fake candles
      expect(result.dataRange).toEqual({
        start: new Date('2023-01-01T09:00:00Z').getTime(),
        end: new Date('2023-01-01T11:00:00Z').getTime(),
      });
    });

    it('should handle empty array', () => {
      const result = processChartData([], '1m', 80);

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
      expect(result[1].timestamp).toBe('2023-01-01T10:01:00.000Z');
      expect(result[2].timestamp).toBe('2023-01-01T10:02:00.000Z');
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

  describe('Fake Candle Functions', () => {
    describe('createFakeCandle', () => {
      it('should create a fake candle with all values set to -1 and isFake: true', () => {
        const timestamp = '2023-01-01T10:00:00Z';
        const fakeCandle = createFakeCandle(timestamp);

        expect(fakeCandle).toEqual({
          timestamp,
          open: -1,
          high: -1,
          low: -1,
          close: -1,
          volume: -1,
          isFake: true,
        });
      });
    });

    describe('isFakeCandle', () => {
      it('should return true for candles with isFake: true', () => {
        const fakeCandle: CandlestickData = {
          timestamp: '2023-01-01T10:00:00Z',
          open: 100,
          high: 110,
          low: 90,
          close: 105,
          volume: 1000,
          isFake: true,
        };

        expect(isFakeCandle(fakeCandle)).toBe(true);
      });

      it('should return true for candles with all values -1', () => {
        const fakeCandle: CandlestickData = {
          timestamp: '2023-01-01T10:00:00Z',
          open: -1,
          high: -1,
          low: -1,
          close: -1,
          volume: -1,
        };

        expect(isFakeCandle(fakeCandle)).toBe(true);
      });

      it('should return false for real candles', () => {
        const realCandle: CandlestickData = {
          timestamp: '2023-01-01T10:00:00Z',
          open: 100,
          high: 110,
          low: 90,
          close: 105,
          volume: 1000,
        };

        expect(isFakeCandle(realCandle)).toBe(false);
      });
    });

    describe('addRightPaddingFakeCandle', () => {
      it('should add exactly one fake candle to the right of the last real candle', () => {
        const data: CandlestickData[] = [
          {
            timestamp: '2023-01-01T09:00:00Z',
            open: 100,
            high: 110,
            low: 90,
            close: 105,
            volume: 1000,
          },
          {
            timestamp: '2023-01-01T10:00:00Z',
            open: 105,
            high: 115,
            low: 95,
            close: 110,
            volume: 1200,
          },
        ];

        const result = addRightPaddingFakeCandle(data, '1m');

        expect(result).toHaveLength(3);
        expect(isFakeCandle(result[2])).toBe(true);
        expect(result[2].timestamp).toBe('2023-01-01T10:01:00.000Z');
      });

      it('should not add fake candle if one already exists', () => {
        const data: CandlestickData[] = [
          {
            timestamp: '2023-01-01T09:00:00Z',
            open: 100,
            high: 110,
            low: 90,
            close: 105,
            volume: 1000,
          },
          createFakeCandle('2023-01-01T10:00:00Z'),
        ];

        const result = addRightPaddingFakeCandle(data, '1m');

        expect(result).toHaveLength(2);
        expect(isFakeCandle(result[1])).toBe(true);
      });

      it('should handle empty data', () => {
        const result = addRightPaddingFakeCandle([], '1m');
        expect(result).toEqual([]);
      });
    });

    describe('addFakeCandlesForPadding', () => {
      it('should return data as-is without adding any fake candles (buffer candle removed)', () => {
        const data: CandlestickData[] = [
          {
            timestamp: '2023-01-01T10:00:00Z',
            open: 100,
            high: 110,
            low: 90,
            close: 105,
            volume: 1000,
          },
        ];

        const result = addFakeCandlesForPadding(data, 80, '1m');

        expect(result.length).toBe(1); // No fake candles added
        expect(isFakeCandle(result[0])).toBe(false); // Original data unchanged
        expect(result[0].timestamp).toBe('2023-01-01T10:00:00Z'); // Original data
      });

      it('should return data as-is for datasets that meet target count (no fake candles)', () => {
        const data: CandlestickData[] = Array.from({ length: 80 }, (_, i) => {
          const date = new Date('2023-01-01T09:00:00Z');
          date.setMinutes(date.getMinutes() + i);
          return {
            timestamp: date.toISOString(),
            open: 100,
            high: 110,
            low: 90,
            close: 105,
            volume: 1000,
          };
        });

        const result = addFakeCandlesForPadding(data, 80, '1m');

        expect(result).toHaveLength(80); // No fake candles added
        expect(result).toEqual(data); // Data unchanged
        // Last real candle should be at 9:00 + 79 minutes = 10:19
        const lastRealCandle = new Date('2023-01-01T09:00:00Z');
        lastRealCandle.setMinutes(lastRealCandle.getMinutes() + 79);
        expect(result[79].timestamp).toBe(lastRealCandle.toISOString()); // Last real candle
      });
    });

    describe('getTimeframeIntervalMs', () => {
      it('should return correct interval for different timeframes', () => {
        expect(getTimeframeIntervalMs('1m')).toBe(60 * 1000);
        expect(getTimeframeIntervalMs('15m')).toBe(15 * 60 * 1000);
        expect(getTimeframeIntervalMs('1h')).toBe(60 * 60 * 1000);
        expect(getTimeframeIntervalMs('1d')).toBe(24 * 60 * 60 * 1000);
      });

      it('should default to 1 minute for unknown timeframes', () => {
        expect(getTimeframeIntervalMs('unknown' as ChartTimeframe)).toBe(60 * 1000);
      });
    });
  });
});
