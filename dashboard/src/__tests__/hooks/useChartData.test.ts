import { renderHook, act } from '@testing-library/react';
import { useChartData } from '../../hooks/useChartData';
import { ChartTimeframe } from '../../types';
import { apiService } from '../../services/apiService';

// Mock the API service
jest.mock('../../services/apiService', () => ({
  apiService: {
    getChartData: jest.fn(),
  },
}));

const mockApiService = apiService as jest.Mocked<typeof apiService>;

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
    jest.clearAllMocks();
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
    expect(result.current.error).toBe(errorMessage);
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
    const onDataLoaded = jest.fn();
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
    const onError = jest.fn();
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

    expect(onError).toHaveBeenCalledWith(errorMessage);
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
});
