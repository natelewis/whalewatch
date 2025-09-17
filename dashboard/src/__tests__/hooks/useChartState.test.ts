import { renderHook, act } from '@testing-library/react';
import { useChartState } from '../../hooks/useChartState';

describe('useChartState', () => {
  it('should initialize with default values', () => {
    const { result } = renderHook(() => useChartState('AAPL', '1h'));
    
    expect(result.current.state.symbol).toBe('AAPL');
    expect(result.current.state.timeframe).toBe('1h');
    expect(result.current.state.data).toEqual([]);
    expect(result.current.state.isLive).toBe(false);
    expect(result.current.state.transform).toEqual({ x: 0, y: 0, k: 1 });
  });

  it('should update data when setData is called', () => {
    const { result } = renderHook(() => useChartState('AAPL', '1h'));
    
    const testData = [
      { time: '2023-01-01T00:00:00Z', open: 100, high: 105, low: 95, close: 102 },
      { time: '2023-01-01T01:00:00Z', open: 102, high: 108, low: 98, close: 106 },
    ];

    act(() => {
      result.current.actions.setData(testData);
    });

    expect(result.current.state.data).toEqual(testData);
    expect(result.current.state.sortedData).toEqual(testData);
  });

  it('should update transform when setTransform is called', () => {
    const { result } = renderHook(() => useChartState('AAPL', '1h'));
    
    const newTransform = { x: 100, y: 50, k: 2 };

    act(() => {
      result.current.actions.setTransform(newTransform);
    });

    expect(result.current.state.transform).toEqual(newTransform);
  });

  it('should update viewport when data and transform change', () => {
    const { result } = renderHook(() => useChartState('AAPL', '1h'));
    
    const testData = Array.from({ length: 100 }, (_, i) => ({
      time: `2023-01-01T${i.toString().padStart(2, '0')}:00:00Z`,
      open: 100 + i,
      high: 105 + i,
      low: 95 + i,
      close: 102 + i,
    }));

    act(() => {
      result.current.actions.setData(testData);
    });

    // Should have visible data after data is set
    expect(result.current.state.viewport.visibleData.length).toBeGreaterThan(0);
    expect(result.current.state.viewport.startIndex).toBeGreaterThanOrEqual(0);
    expect(result.current.state.viewport.endIndex).toBeLessThan(testData.length);
  });

  it('should pan by delta when panBy is called', () => {
    const { result } = renderHook(() => useChartState('AAPL', '1h'));
    
    act(() => {
      result.current.actions.panBy(50, 25);
    });

    expect(result.current.state.transform.x).toBe(50);
    expect(result.current.state.transform.y).toBe(25);
  });

  it('should zoom to scale when zoomToScale is called', () => {
    const { result } = renderHook(() => useChartState('AAPL', '1h'));
    
    act(() => {
      result.current.actions.zoomToScale(2.5);
    });

    expect(result.current.state.transform.k).toBe(2.5);
  });

  it('should reset transform when resetTransform is called', () => {
    const { result } = renderHook(() => useChartState('AAPL', '1h'));
    
    // First set some transform
    act(() => {
      result.current.actions.setTransform({ x: 100, y: 50, k: 2 });
    });

    expect(result.current.state.transform).toEqual({ x: 100, y: 50, k: 2 });

    // Then reset
    act(() => {
      result.current.actions.resetTransform();
    });

    expect(result.current.state.transform).toEqual({ x: 0, y: 0, k: 1 });
  });

  it('should update UI state when actions are called', () => {
    const { result } = renderHook(() => useChartState('AAPL', '1h'));
    
    act(() => {
      result.current.actions.setIsLive(true);
      result.current.actions.setIsZooming(true);
      result.current.actions.setIsPanning(true);
      result.current.actions.setIsLoading(true);
      result.current.actions.setError('Test error');
    });

    expect(result.current.state.isLive).toBe(true);
    expect(result.current.state.isZooming).toBe(true);
    expect(result.current.state.isPanning).toBe(true);
    expect(result.current.state.isLoading).toBe(true);
    expect(result.current.state.error).toBe('Test error');
  });

  it('should compute scales correctly', () => {
    const { result } = renderHook(() => useChartState('AAPL', '1h'));
    
    const testData = [
      { time: '2023-01-01T00:00:00Z', open: 100, high: 105, low: 95, close: 102 },
      { time: '2023-01-01T01:00:00Z', open: 102, high: 108, low: 98, close: 106 },
    ];

    act(() => {
      result.current.actions.setData(testData);
    });

    const xScale = result.current.actions.getXScale();
    const yScale = result.current.actions.getYScale();

    expect(xScale).toBeDefined();
    expect(yScale).toBeDefined();
    expect(typeof xScale(0)).toBe('number');
    expect(typeof yScale(100)).toBe('number');
  });
});
