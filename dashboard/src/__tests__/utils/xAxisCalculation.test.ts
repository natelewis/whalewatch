import { calculateXAxisParams } from '../../utils/chartDataUtils';
import { CandlestickData } from '../../types';

describe('calculateXAxisParams', () => {
  const mockChartData: CandlestickData[] = [
    { timestamp: '2024-01-01T09:00:00Z', open: 100, high: 105, low: 95, close: 102, volume: 1000 },
    { timestamp: '2024-01-01T09:01:00Z', open: 102, high: 108, low: 98, close: 106, volume: 1200 },
    { timestamp: '2024-01-01T09:02:00Z', open: 106, high: 110, low: 104, close: 108, volume: 1100 },
    { timestamp: '2024-01-01T09:03:00Z', open: 108, high: 112, low: 106, close: 110, volume: 1300 },
    { timestamp: '2024-01-01T09:04:00Z', open: 110, high: 115, low: 108, close: 113, volume: 1400 },
  ];

  it('should calculate consistent x-axis parameters for the same input', () => {
    const params = {
      viewStart: 1,
      viewEnd: 3,
      allChartData: mockChartData,
      innerWidth: 800,
      timeframe: '1m',
    };

    const result1 = calculateXAxisParams(params);
    const result2 = calculateXAxisParams(params);

    // Results should be identical for the same input
    expect(result1.viewportXScale.domain()).toEqual(result2.viewportXScale.domain());
    expect(result1.viewportXScale.range()).toEqual(result2.viewportXScale.range());
    expect(result1.visibleSlice).toEqual(result2.visibleSlice);
    expect(result1.labelConfig).toEqual(result2.labelConfig);
    expect(result1.interval).toEqual(result2.interval);
  });

  it('should create correct viewport scale domain and range', () => {
    const params = {
      viewStart: 1,
      viewEnd: 3,
      allChartData: mockChartData,
      innerWidth: 800,
      timeframe: '1m',
    };

    const result = calculateXAxisParams(params);

    expect(result.viewportXScale.domain()).toEqual([1, 3]);
    expect(result.viewportXScale.range()).toEqual([0, 800]);
  });

  it('should create correct visible slice', () => {
    const params = {
      viewStart: 1,
      viewEnd: 3,
      allChartData: mockChartData,
      innerWidth: 800,
      timeframe: '1m',
    };

    const result = calculateXAxisParams(params);

    expect(result.visibleSlice).toHaveLength(3);
    expect(result.visibleSlice[0].timestamp).toBe('2024-01-01T09:01:00Z');
    expect(result.visibleSlice[1].timestamp).toBe('2024-01-01T09:02:00Z');
    expect(result.visibleSlice[2].timestamp).toBe('2024-01-01T09:03:00Z');
  });

  it('should handle edge cases with viewStart at 0', () => {
    const params = {
      viewStart: 0,
      viewEnd: 2,
      allChartData: mockChartData,
      innerWidth: 800,
      timeframe: '1m',
    };

    const result = calculateXAxisParams(params);

    expect(result.viewportXScale.domain()).toEqual([0, 2]);
    expect(result.visibleSlice).toHaveLength(3);
    expect(result.visibleSlice[0].timestamp).toBe('2024-01-01T09:00:00Z');
  });

  it('should handle edge cases with viewEnd at data length - 1', () => {
    const params = {
      viewStart: 3,
      viewEnd: 4,
      allChartData: mockChartData,
      innerWidth: 800,
      timeframe: '1m',
    };

    const result = calculateXAxisParams(params);

    expect(result.viewportXScale.domain()).toEqual([3, 4]);
    expect(result.visibleSlice).toHaveLength(2);
    expect(result.visibleSlice[0].timestamp).toBe('2024-01-01T09:03:00Z');
    expect(result.visibleSlice[1].timestamp).toBe('2024-01-01T09:04:00Z');
  });

  it('should use correct label config for different timeframes', () => {
    const params1m = {
      viewStart: 1,
      viewEnd: 3,
      allChartData: mockChartData,
      innerWidth: 800,
      timeframe: '1m',
    };

    const params1h = {
      viewStart: 1,
      viewEnd: 3,
      allChartData: mockChartData,
      innerWidth: 800,
      timeframe: '1h',
    };

    const result1m = calculateXAxisParams(params1m);
    const result1h = calculateXAxisParams(params1h);

    expect(result1m.interval).toBe('1m');
    expect(result1h.interval).toBe('1h');
    expect(result1m.labelConfig).not.toEqual(result1h.labelConfig);
  });

  it('should handle invalid viewStart/viewEnd gracefully', () => {
    const params = {
      viewStart: -1, // Invalid: negative
      viewEnd: 10, // Invalid: beyond data length
      allChartData: mockChartData,
      innerWidth: 800,
      timeframe: '1m',
    };

    const result = calculateXAxisParams(params);

    // Should clamp to valid ranges
    expect(result.viewportXScale.domain()).toEqual([-1, 10]); // Domain should match input
    expect(result.visibleSlice).toHaveLength(5); // Should clamp to available data
    expect(result.visibleSlice[0].timestamp).toBe('2024-01-01T09:00:00Z');
    expect(result.visibleSlice[4].timestamp).toBe('2024-01-01T09:04:00Z');
  });

  it('should produce consistent results for different rendering scenarios', () => {
    // Simulate initial rendering scenario
    const initialParams = {
      viewStart: 0,
      viewEnd: 4,
      allChartData: mockChartData,
      innerWidth: 800,
      timeframe: '1m',
    };

    // Simulate panning scenario with same viewport
    const panParams = {
      viewStart: 0,
      viewEnd: 4,
      allChartData: mockChartData,
      innerWidth: 800,
      timeframe: '1m',
    };

    // Simulate zoom scenario with same viewport
    const zoomParams = {
      viewStart: 0,
      viewEnd: 4,
      allChartData: mockChartData,
      innerWidth: 800,
      timeframe: '1m',
    };

    const initialResult = calculateXAxisParams(initialParams);
    const panResult = calculateXAxisParams(panParams);
    const zoomResult = calculateXAxisParams(zoomParams);

    // All scenarios should produce identical results for the same viewport
    expect(initialResult.viewportXScale.domain()).toEqual(panResult.viewportXScale.domain());
    expect(initialResult.viewportXScale.domain()).toEqual(zoomResult.viewportXScale.domain());

    expect(initialResult.viewportXScale.range()).toEqual(panResult.viewportXScale.range());
    expect(initialResult.viewportXScale.range()).toEqual(zoomResult.viewportXScale.range());

    expect(initialResult.visibleSlice).toEqual(panResult.visibleSlice);
    expect(initialResult.visibleSlice).toEqual(zoomResult.visibleSlice);

    expect(initialResult.labelConfig).toEqual(panResult.labelConfig);
    expect(initialResult.labelConfig).toEqual(zoomResult.labelConfig);

    expect(initialResult.interval).toEqual(panResult.interval);
    expect(initialResult.interval).toEqual(zoomResult.interval);
  });

  it('should create visible slice that matches the viewport range', () => {
    const params = {
      viewStart: 1,
      viewEnd: 3,
      allChartData: mockChartData,
      innerWidth: 800,
      timeframe: '1m',
    };

    const result = calculateXAxisParams(params);

    // The visible slice should contain exactly the data points in the viewport range
    expect(result.visibleSlice).toHaveLength(3); // viewEnd - viewStart + 1 = 3
    expect(result.visibleSlice[0]).toEqual(mockChartData[1]); // First visible point
    expect(result.visibleSlice[2]).toEqual(mockChartData[3]); // Last visible point

    // Verify the visible slice is a contiguous subset of the full data
    const visibleIndices = result.visibleSlice.map(point =>
      mockChartData.findIndex(d => d.timestamp === point.timestamp)
    );
    expect(visibleIndices).toEqual([1, 2, 3]); // Should match viewStart to viewEnd
  });
});
