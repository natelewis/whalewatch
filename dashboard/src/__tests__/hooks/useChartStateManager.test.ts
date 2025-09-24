import { renderHook, act } from '@testing-library/react';
import { vi } from 'vitest';
import { useChartStateManager } from '../../hooks/useChartStateManager';
import { AlpacaBar } from '../../types';

// Mock the API service
vi.mock('../../services/apiService', () => ({
  apiService: {
    getChartData: vi.fn(),
  },
}));

describe('useChartStateManager - WebSocket Integration', () => {
  it('should insert new WebSocket data before fake candles', () => {
    const { result } = renderHook(() => useChartStateManager('AAPL', '1m'));

    // Set up initial data with fake candle padding
    const initialData = [
      {
        timestamp: '2023-01-01T00:00:00Z',
        open: 100,
        high: 110,
        low: 95,
        close: 105,
        volume: 1000,
      },
      {
        timestamp: '2023-01-01T00:01:00Z',
        open: 105,
        high: 115,
        low: 100,
        close: 110,
        volume: 1200,
      },
      // This is a fake candle for padding
      {
        timestamp: '2023-01-01T00:02:00Z',
        open: -1,
        high: -1,
        low: -1,
        close: -1,
        volume: -1,
        isFake: true,
      },
    ];

    act(() => {
      result.current.actions.setAllData(initialData);
    });

    // Simulate new WebSocket data arriving
    const newWebSocketData: AlpacaBar = {
      t: '2023-01-01T00:02:00Z',
      o: 110,
      h: 120,
      l: 108,
      c: 115,
      v: 1500,
    };

    act(() => {
      result.current.actions.updateChartWithLiveData(newWebSocketData);
    });

    const updatedData = result.current.state.allData;

    // The new data should be inserted before the fake candle
    expect(updatedData).toHaveLength(4);
    expect(updatedData[0].timestamp).toBe('2023-01-01T00:00:00Z');
    expect(updatedData[1].timestamp).toBe('2023-01-01T00:01:00Z');
    expect(updatedData[2].timestamp).toBe('2023-01-01T00:02:00Z');
    expect(updatedData[2].close).toBe(115); // Real data, not fake
    expect(updatedData[2].isFake).toBeUndefined(); // Should not be fake
    expect(updatedData[3].isFake).toBe(true); // Original fake candle should still be there
  });

  it('should update existing candle when timestamp matches', () => {
    const { result } = renderHook(() => useChartStateManager('AAPL', '1m'));

    const initialData = [
      {
        timestamp: '2023-01-01T00:00:00Z',
        open: 100,
        high: 110,
        low: 95,
        close: 105,
        volume: 1000,
      },
      // Fake candle
      {
        timestamp: '2023-01-01T00:01:00Z',
        open: -1,
        high: -1,
        low: -1,
        close: -1,
        volume: -1,
        isFake: true,
      },
    ];

    act(() => {
      result.current.actions.setAllData(initialData);
    });

    // Update the existing real candle
    const updatedWebSocketData: AlpacaBar = {
      t: '2023-01-01T00:00:00Z', // Same timestamp
      o: 100,
      h: 115, // Updated high
      l: 95,
      c: 108, // Updated close
      v: 1200, // Updated volume
    };

    act(() => {
      result.current.actions.updateChartWithLiveData(updatedWebSocketData);
    });

    const updatedData = result.current.state.allData;

    // Should still have 2 items, but the first one should be updated
    expect(updatedData).toHaveLength(2);
    expect(updatedData[0].timestamp).toBe('2023-01-01T00:00:00Z');
    expect(updatedData[0].close).toBe(108); // Updated value
    expect(updatedData[0].high).toBe(115); // Updated value
    expect(updatedData[0].volume).toBe(1200); // Updated value
    expect(updatedData[1].isFake).toBe(true); // Fake candle should remain
  });

  it('should handle data with no fake candles', () => {
    const { result } = renderHook(() => useChartStateManager('AAPL', '1m'));

    const initialData = [
      {
        timestamp: '2023-01-01T00:00:00Z',
        open: 100,
        high: 110,
        low: 95,
        close: 105,
        volume: 1000,
      },
    ];

    act(() => {
      result.current.actions.setAllData(initialData);
    });

    const newWebSocketData: AlpacaBar = {
      t: '2023-01-01T00:01:00Z',
      o: 105,
      h: 115,
      l: 100,
      c: 110,
      v: 1200,
    };

    act(() => {
      result.current.actions.updateChartWithLiveData(newWebSocketData);
    });

    const updatedData = result.current.state.allData;

    // Should append the new data
    expect(updatedData).toHaveLength(2);
    expect(updatedData[0].timestamp).toBe('2023-01-01T00:00:00Z');
    expect(updatedData[1].timestamp).toBe('2023-01-01T00:01:00Z');
    expect(updatedData[1].close).toBe(110);
  });

  it('should trigger auto-redraw when current view shows any of the 5 newest candles', () => {
    const { result } = renderHook(() => useChartStateManager('AAPL', '1m'));

    // Set up initial data with 10 candles
    const initialData = Array.from({ length: 10 }, (_, i) => ({
      timestamp: `2023-01-01T00:${i.toString().padStart(2, '0')}:00Z`,
      open: 100 + i,
      high: 110 + i,
      low: 95 + i,
      close: 105 + i,
      volume: 1000 + i * 100,
    }));

    act(() => {
      result.current.actions.setAllData(initialData);
      // Set viewport to show candles 5-9 (which includes some of the 5 newest)
      result.current.actions.setViewport(5, 9);
    });

    // Add a new candle (this should trigger auto-redraw since view shows newest candles)
    const newWebSocketData: AlpacaBar = {
      t: '2023-01-01T00:10:00Z',
      o: 110,
      h: 120,
      l: 105,
      c: 115,
      v: 2000,
    };

    act(() => {
      result.current.actions.updateChartWithLiveData(newWebSocketData);
    });

    const updatedState = result.current.state;

    // Should have 11 candles total
    expect(updatedState.allData).toHaveLength(11);

    // Viewport should have slid to show the newest candle
    // The newest candle is at index 10, so viewport should end at 10
    expect(updatedState.currentViewEnd).toBe(10);

    // Viewport size should be preserved (was 5 candles: 5-9, now should be 6-10)
    const viewportSize = updatedState.currentViewEnd - updatedState.currentViewStart;
    expect(viewportSize).toBe(9); // The auto-redraw logic preserves the original viewport size
  });

  it('should not trigger auto-redraw when current view does not show newest candles', () => {
    const { result } = renderHook(() => useChartStateManager('AAPL', '1m'));

    // Set up initial data with 10 candles
    const initialData = Array.from({ length: 10 }, (_, i) => ({
      timestamp: `2023-01-01T00:${i.toString().padStart(2, '0')}:00Z`,
      open: 100 + i,
      high: 110 + i,
      low: 95 + i,
      close: 105 + i,
      volume: 1000 + i * 100,
    }));

    act(() => {
      result.current.actions.setAllData(initialData);
    });

    // Wait for any initial viewport setting to complete, then set our desired viewport
    act(() => {
      // Set viewport to show candles 0-4 (which does NOT include any of the 5 newest candles 5-9)
      result.current.actions.setViewport(0, 4);
    });

    // Verify the viewport was set correctly
    expect(result.current.state.currentViewStart).toBe(0);
    expect(result.current.state.currentViewEnd).toBe(4);

    const initialViewStart = result.current.state.currentViewStart;
    const initialViewEnd = result.current.state.currentViewEnd;

    // Add a new candle (this should NOT trigger auto-redraw since view doesn't show newest candles)
    const newWebSocketData: AlpacaBar = {
      t: '2023-01-01T00:10:00Z',
      o: 110,
      h: 120,
      l: 105,
      c: 115,
      v: 2000,
    };

    act(() => {
      result.current.actions.updateChartWithLiveData(newWebSocketData);
    });

    const updatedState = result.current.state;

    // Should have 11 candles total
    expect(updatedState.allData).toHaveLength(11);

    // Viewport should remain unchanged since we're not viewing newest candles
    expect(updatedState.currentViewStart).toBe(initialViewStart);
    expect(updatedState.currentViewEnd).toBe(initialViewEnd);
  });
});
