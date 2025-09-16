import { renderHook, act } from '@testing-library/react';
import { vi } from 'vitest';
import { useChartData } from '../../hooks/useChartData';
import { ChartTimeframe } from '../../types';
import { apiService } from '../../services/apiService';

// Mock the API service
vi.mock('../../services/apiService', () => ({
  apiService: {
    getChartData: vi.fn(),
  },
}));

const mockApiService = apiService as any;

describe('useChartData', () => {
  const mockTimeframes = [
    { value: '1h' as ChartTimeframe, label: '1h', dataPoints: 100 },
    { value: '1d' as ChartTimeframe, label: '1d', dataPoints: 200 },
  ];

  const mockChartDataResponse = {
    bars: [
      {
        t: '2023-01-01T10:00:00Z',
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
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with empty state', () => {
    const { result } = renderHook(() =>
      useChartData({
        timeframes: mockTimeframes,
      })
    );

    expect(result.current.chartData).toEqual([]);
    expect(result.current.dataRange).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('should load chart data successfully', async () => {
    mockApiService.getChartData.mockResolvedValue(mockChartDataResponse);

    const { result } = renderHook(() =>
      useChartData({
        timeframes: mockTimeframes,
      })
    );

    await act(async () => {
      await result.current.loadChartData('AAPL', '1h');
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.chartData).toHaveLength(2);
    expect(result.current.dataRange).toEqual({
      earliest: '2023-01-01T10:00:00Z',
      latest: '2023-01-01T11:00:00Z',
    });
  });

  it('should handle loading state', async () => {
    let resolvePromise: (value: any) => void;
    const promise = new Promise((resolve) => {
      resolvePromise = resolve;
    });
    mockApiService.getChartData.mockReturnValue(promise as any);

    const { result } = renderHook(() =>
      useChartData({
        timeframes: mockTimeframes,
      })
    );

    act(() => {
      result.current.loadChartData('AAPL', '1h');
    });

    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      resolvePromise!(mockChartDataResponse);
      await promise;
    });

    expect(result.current.isLoading).toBe(false);
  });

  it('should handle errors', async () => {
    const errorMessage = 'Failed to fetch data';
    mockApiService.getChartData.mockRejectedValue(new Error(errorMessage));

    const { result } = renderHook(() =>
      useChartData({
        timeframes: mockTimeframes,
      })
    );

    await act(async () => {
      await result.current.loadChartData('AAPL', '1h');
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBe('Failed to load chart data');
  });

  it('should handle API error with response data', async () => {
    const apiError = {
      response: {
        data: {
          error: 'API Error',
        },
      },
    };
    mockApiService.getChartData.mockRejectedValue(apiError);

    const { result } = renderHook(() =>
      useChartData({
        timeframes: mockTimeframes,
      })
    );

    await act(async () => {
      await result.current.loadChartData('AAPL', '1h');
    });

    expect(result.current.error).toBe('API Error');
  });

  it('should call onDataLoaded callback', async () => {
    const onDataLoaded = vi.fn();
    mockApiService.getChartData.mockResolvedValue(mockChartDataResponse);

      const { result } = renderHook(() =>
        useChartData({
          timeframes: mockTimeframes,
          onDataLoaded,
        })
      );

      await act(async () => {
        await result.current.loadChartData('AAPL', '1h');
      });

      expect(onDataLoaded).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            time: '2023-01-01T10:00:00Z',
            open: 100,
            high: 105,
            low: 95,
            close: 102,
          }),
        ]),
        {
          earliest: '2023-01-01T10:00:00Z',
          latest: '2023-01-01T11:00:00Z',
        }
      );
    });

    it('should call onError callback', async () => {
      const onError = vi.fn();
      const errorMessage = 'Test error';
      mockApiService.getChartData.mockRejectedValue(new Error(errorMessage));

      const { result } = renderHook(() =>
        useChartData({
          timeframes: mockTimeframes,
          onError,
        })
      );

      await act(async () => {
        await result.current.loadChartData('AAPL', '1h');
      });

      expect(onError).toHaveBeenCalledWith('Failed to load chart data');
    });

    it('should update chart with live data', () => {
      const { result } = renderHook(() =>
        useChartData({
          timeframes: mockTimeframes,
        })
      );

      const liveBar = {
        t: '2023-01-01T12:00:00Z',
        o: 106,
        h: 110,
        l: 104,
        c: 108,
        v: 1500,
      };

      act(() => {
        result.current.updateChartWithLiveData(liveBar);
      });

      expect(result.current.chartData).toHaveLength(1);
      expect(result.current.chartData[0]).toEqual({
        time: '2023-01-01T12:00:00Z',
        open: 106,
        high: 110,
        low: 104,
        close: 108,
      });
    });

    it('should update existing candle when time matches', () => {
      const { result } = renderHook(() =>
        useChartData({
          timeframes: mockTimeframes,
        })
      );

      // Add initial data
      act(() => {
        result.current.updateChartWithLiveData({
          t: '2023-01-01T12:00:00Z',
          o: 106,
          h: 110,
          l: 104,
          c: 108,
          v: 1500,
        });
      });

      // Update with same timestamp
      act(() => {
        result.current.updateChartWithLiveData({
          t: '2023-01-01T12:00:00Z',
          o: 108,
          h: 112,
          l: 106,
          c: 110,
          v: 1600,
        });
      });

      expect(result.current.chartData).toHaveLength(1);
      expect(result.current.chartData[0].close).toBe(110);
    });

    it('should clear error', () => {
      const { result } = renderHook(() =>
        useChartData({
          timeframes: mockTimeframes,
        })
      );

      // Set an error first
      act(() => {
        result.current.clearError();
      });

      expect(result.current.error).toBeNull();
    });

    describe('View-based loading', () => {
      const mockViewBasedResponse = {
        bars: [
          { t: '2023-01-01T09:00:00Z', o: 95, h: 98, l: 94, c: 97, v: 800 },
          { t: '2023-01-01T10:00:00Z', o: 97, h: 102, l: 96, c: 100, v: 1000 },
          { t: '2023-01-01T11:00:00Z', o: 100, h: 105, l: 99, c: 103, v: 1200 },
          { t: '2023-01-01T12:00:00Z', o: 103, h: 108, l: 101, c: 106, v: 1400 },
          { t: '2023-01-01T13:00:00Z', o: 106, h: 110, l: 104, c: 108, v: 1600 },
          { t: '2023-01-01T14:00:00Z', o: 108, h: 112, l: 106, c: 110, v: 1800 },
        ],
      };

      it('should initialize view-based loading with correct view state', async () => {
        mockApiService.getChartData.mockResolvedValue(mockViewBasedResponse);

        const { result } = renderHook(() =>
          useChartData({
            timeframes: mockTimeframes,
            enableViewBasedLoading: true,
          })
        );

        await act(async () => {
          await result.current.loadChartData('AAPL', '1h');
        });

      expect(result.current.viewState).toBeDefined();
      expect(result.current.viewState?.viewSize).toBe(100); // From mockTimeframes
      expect(result.current.viewState?.totalDataPoints).toBe(6);
      expect(result.current.viewState?.currentViewStart).toBe(0); // Should start at the most recent data
      expect(result.current.viewState?.currentViewEnd).toBe(5);
      expect(result.current.chartData).toHaveLength(6); // All data in view (since we have less data than view size)
    });

    it('should pan left correctly', async () => {
      // Create more data to enable panning
      const extendedResponse = {
        bars: [
          { t: '2023-01-01T08:00:00Z', o: 90, h: 95, l: 88, c: 93, v: 600 },
          { t: '2023-01-01T09:00:00Z', o: 95, h: 98, l: 94, c: 97, v: 800 },
          { t: '2023-01-01T10:00:00Z', o: 97, h: 102, l: 96, c: 100, v: 1000 },
          { t: '2023-01-01T11:00:00Z', o: 100, h: 105, l: 99, c: 103, v: 1200 },
          { t: '2023-01-01T12:00:00Z', o: 103, h: 108, l: 101, c: 106, v: 1400 },
          { t: '2023-01-01T13:00:00Z', o: 106, h: 110, l: 104, c: 108, v: 1600 },
          { t: '2023-01-01T14:00:00Z', o: 108, h: 112, l: 106, c: 110, v: 1800 },
        ],
      };

      mockApiService.getChartData.mockResolvedValue(extendedResponse);

      const { result } = renderHook(() =>
        useChartData({
          timeframes: mockTimeframes,
          enableViewBasedLoading: true,
        })
      );

      await act(async () => {
        await result.current.loadChartData('AAPL', '1h');
      });

      // With 7 data points and view size 100, we should be able to pan
      expect(result.current.canPanLeft).toBe(false); // At the beginning
      expect(result.current.canPanRight).toBe(false); // At the end

      // Test panning when we have more data than view size
      const largeResponse = {
        bars: Array.from({ length: 150 }, (_, i) => ({
          t: new Date(Date.now() - (150 - i) * 60 * 60 * 1000).toISOString(),
          o: 100 + i * 0.1,
          h: 105 + i * 0.1,
          low: 99 + i * 0.1,
          c: 104 + i * 0.1,
          v: 1000 + i * 10,
        })),
      };

      mockApiService.getChartData.mockResolvedValue(largeResponse);

      await act(async () => {
        await result.current.loadChartData('AAPL', '1h');
      });

      // Now we should be able to pan
      expect(result.current.canPanLeft).toBe(true);
      expect(result.current.canPanRight).toBe(false);

      // Pan left
      act(() => {
        result.current.panLeft();
      });

      expect(result.current.viewState?.currentViewStart).toBe(49); // Moved left by 1
      expect(result.current.viewState?.currentViewEnd).toBe(148);
      expect(result.current.canPanLeft).toBe(true);
      expect(result.current.canPanRight).toBe(true);
    });

    it('should pan right correctly', async () => {
      // Create large dataset to enable panning
      const largeResponse = {
        bars: Array.from({ length: 150 }, (_, i) => ({
          t: new Date(Date.now() - (150 - i) * 60 * 60 * 1000).toISOString(),
          o: 100 + i * 0.1,
          h: 105 + i * 0.1,
          low: 99 + i * 0.1,
          c: 104 + i * 0.1,
          v: 1000 + i * 10,
        })),
      };

      mockApiService.getChartData.mockResolvedValue(largeResponse);

      const { result } = renderHook(() =>
        useChartData({
          timeframes: mockTimeframes,
          enableViewBasedLoading: true,
        })
      );

      await act(async () => {
        await result.current.loadChartData('AAPL', '1h');
      });

      // Pan left first to enable right panning
      act(() => {
        result.current.panLeft();
      });

      // Now pan right
      act(() => {
        result.current.panRight();
      });

      expect(result.current.viewState?.currentViewStart).toBe(50);
      expect(result.current.viewState?.currentViewEnd).toBe(149);
      expect(result.current.canPanLeft).toBe(true);
      expect(result.current.canPanRight).toBe(false);
    });

      it('should not pan when at boundaries', async () => {
        mockApiService.getChartData.mockResolvedValue(mockViewBasedResponse);

        const { result } = renderHook(() =>
          useChartData({
            timeframes: mockTimeframes,
            enableViewBasedLoading: true,
          })
        );

        await act(async () => {
          await result.current.loadChartData('AAPL', '1h');
        });

        // At rightmost position - should not be able to pan right
        expect(result.current.canPanRight).toBe(false);

        act(() => {
          result.current.panRight();
        });

        // View state should not change
        expect(result.current.viewState?.currentViewStart).toBe(0);
        expect(result.current.viewState?.currentViewEnd).toBe(5);
      });

      it('should load more data when near boundaries', async () => {
        const initialResponse = {
          bars: [
            { t: '2023-01-01T10:00:00Z', o: 100, h: 105, l: 95, c: 102, v: 1000 },
            { t: '2023-01-01T11:00:00Z', o: 102, h: 108, l: 98, c: 106, v: 1200 },
          ],
        };

        const additionalResponse = {
          bars: [
            { t: '2023-01-01T09:00:00Z', o: 95, h: 98, l: 94, c: 97, v: 800 },
            { t: '2023-01-01T10:00:00Z', o: 97, h: 102, l: 96, c: 100, v: 1000 },
          ],
        };

        mockApiService.getChartData
          .mockResolvedValueOnce(initialResponse)
          .mockResolvedValueOnce(additionalResponse);

        const { result } = renderHook(() =>
          useChartData({
            timeframes: mockTimeframes,
            enableViewBasedLoading: true,
          })
        );

        await act(async () => {
          await result.current.loadChartData('AAPL', '1h');
        });

        // Load more data to the left
        await act(async () => {
          await result.current.loadMoreDataLeft('AAPL', '1h');
        });

      expect(mockApiService.getChartData).toHaveBeenCalledTimes(2);
      expect(result.current.viewState?.totalDataPoints).toBeGreaterThanOrEqual(2);
      });

      it('should handle live data updates in view-based mode', async () => {
        mockApiService.getChartData.mockResolvedValue(mockViewBasedResponse);

        const { result } = renderHook(() =>
          useChartData({
            timeframes: mockTimeframes,
            enableViewBasedLoading: true,
          })
        );

        await act(async () => {
          await result.current.loadChartData('AAPL', '1h');
        });

        const liveBar = {
          t: '2023-01-01T15:00:00Z',
          o: 110,
          h: 115,
          l: 108,
          c: 113,
          v: 2000,
        };

        act(() => {
          result.current.updateChartWithLiveData(liveBar);
        });

        expect(result.current.chartData).toContainEqual({
          time: '2023-01-01T15:00:00Z',
          open: 110,
          high: 115,
          low: 108,
          close: 113,
        });
      });

      it('should fall back to traditional mode when view-based loading is disabled', async () => {
        mockApiService.getChartData.mockResolvedValue(mockChartDataResponse);

        const { result } = renderHook(() =>
          useChartData({
            timeframes: mockTimeframes,
            enableViewBasedLoading: false,
          })
        );

        await act(async () => {
          await result.current.loadChartData('AAPL', '1h');
        });

        expect(result.current.viewState).toBeNull();
        expect(result.current.panLeft).toBeDefined();
        expect(result.current.panRight).toBeDefined();
        expect(result.current.canPanLeft).toBe(false);
        expect(result.current.canPanRight).toBe(false);
      });
    });
});
