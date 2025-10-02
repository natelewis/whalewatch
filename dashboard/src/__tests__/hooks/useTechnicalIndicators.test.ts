/**
 * Tests for useTechnicalIndicators hook
 */

import { renderHook, act } from '@testing-library/react';
import { useTechnicalIndicators } from '../../hooks/useTechnicalIndicators';
import { CandlestickData } from '../../types';

// Mock localStorage
const mockLocalStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};

Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage,
});

describe('useTechnicalIndicators', () => {
  const mockChartData: CandlestickData[] = [
    {
      timestamp: '2023-01-01T00:00:00Z',
      open: 100,
      high: 110,
      low: 95,
      close: 105,
      volume: 1000,
    },
    {
      timestamp: '2023-01-02T00:00:00Z',
      open: 105,
      high: 115,
      low: 100,
      close: 110,
      volume: 1200,
    },
  ];

  beforeEach(() => {
    mockLocalStorage.getItem.mockClear();
    mockLocalStorage.setItem.mockClear();
    mockLocalStorage.removeItem.mockClear();
    mockLocalStorage.clear.mockClear();
  });

  it('should load default state when localStorage is empty', () => {
    mockLocalStorage.getItem.mockReturnValue(null);

    const { result } = renderHook(() => useTechnicalIndicators(mockChartData));

    expect(result.current.state.items).toBeDefined();
    expect(Array.isArray(result.current.state.items)).toBe(true);
    expect(result.current.enabledItems).toEqual([]);
    expect(result.current.enabledData).toEqual([]);
  });

  it('should load saved state from localStorage', () => {
    const savedState = {
      items: [
        {
          id: 'ma-simple-20',
          type: 'moving_average' as const,
          config: { period: 20, type: 'simple' as const },
          enabled: true,
          color: '#3b82f6',
          label: 'SMA(20)',
          data: [],
        },
      ],
    };

    mockLocalStorage.getItem.mockReturnValue(JSON.stringify(savedState));

    const { result } = renderHook(() => useTechnicalIndicators(mockChartData));

    expect(result.current.state.items).toHaveLength(1);
    expect(result.current.state.items[0].enabled).toBe(true);
    expect(result.current.enabledItems).toHaveLength(1);
  });

  it('should persist state changes to localStorage', () => {
    mockLocalStorage.getItem.mockReturnValue(null);

    const { result } = renderHook(() => useTechnicalIndicators(mockChartData));

    // Find a moving average item to toggle
    const maItem = result.current.state.items.find(item => item.type === 'moving_average');
    expect(maItem).toBeDefined();
    expect(maItem!.enabled).toBe(false); // Default items are disabled

    act(() => {
      result.current.actions.toggleItem(maItem!.id);
    });

    // Check that the state was actually updated
    const updatedItem = result.current.state.items.find(item => item.id === maItem!.id);
    expect(updatedItem!.enabled).toBe(true);

    // Verify localStorage.setItem was called
    expect(mockLocalStorage.setItem).toHaveBeenCalled();

    // Get the saved state
    const savedStateCall = mockLocalStorage.setItem.mock.calls.find(call => call[0] === 'technicalIndicatorsState');
    expect(savedStateCall).toBeDefined();

    const savedState = JSON.parse(savedStateCall![1]);
    const toggledItem = savedState.items.find((item: any) => item.id === maItem!.id);
    expect(toggledItem.enabled).toBe(true); // Should now be enabled after toggle
  });

  it('should handle localStorage errors gracefully', () => {
    mockLocalStorage.getItem.mockImplementation(() => {
      throw new Error('localStorage error');
    });

    const { result } = renderHook(() => useTechnicalIndicators(mockChartData));

    // Should still work with default state
    expect(result.current.state.items).toBeDefined();
    expect(Array.isArray(result.current.state.items)).toBe(true);
  });

  it('should validate saved state structure', () => {
    // Test with invalid saved state
    mockLocalStorage.getItem.mockReturnValue('{"invalid": "data"}');

    const { result } = renderHook(() => useTechnicalIndicators(mockChartData));

    // Should fall back to default state
    expect(result.current.state.items).toBeDefined();
    expect(Array.isArray(result.current.state.items)).toBe(true);
  });

  it('should calculate enabled data correctly', () => {
    mockLocalStorage.getItem.mockReturnValue(null);

    const { result } = renderHook(() => useTechnicalIndicators(mockChartData));

    // Initially no items should be enabled
    expect(result.current.enabledItems).toHaveLength(0);
    expect(result.current.enabledData).toHaveLength(0);

    // Enable a moving average
    const maItem = result.current.state.items.find(item => item.type === 'moving_average');
    act(() => {
      result.current.actions.toggleItem(maItem!.id);
    });

    // Should have one enabled item and corresponding data
    expect(result.current.enabledItems).toHaveLength(1);
    expect(result.current.enabledData).toHaveLength(1);
    expect(result.current.enabledData[0].item.id).toBe(maItem!.id);
    expect(result.current.enabledData[0].item.enabled).toBe(true);
  });
});
