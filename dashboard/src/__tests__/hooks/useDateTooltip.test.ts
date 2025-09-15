import { renderHook, act } from '@testing-library/react';
import { useDateTooltip } from '../../hooks/useDateTooltip';
import { ChartTimeframe } from '../../types';

// Mock DOM methods
const mockCreateElement = jest.fn();
const mockAppendChild = jest.fn();
const mockRemove = jest.fn();
const mockQuerySelector = jest.fn();
const mockAddEventListener = jest.fn();
const mockRemoveEventListener = jest.fn();
const mockGetBoundingClientRect = jest.fn();

// Mock document and window
Object.defineProperty(document, 'createElement', {
  value: mockCreateElement,
  writable: true,
});

Object.defineProperty(document, 'body', {
  value: { appendChild: mockAppendChild },
  writable: true,
});

Object.defineProperty(window, 'addEventListener', {
  value: mockAddEventListener,
  writable: true,
});

Object.defineProperty(window, 'removeEventListener', {
  value: mockRemoveEventListener,
  writable: true,
});

describe('useDateTooltip', () => {
  let mockChartRef: HTMLDivElement;
  let mockTooltip: HTMLElement;
  const mockChartData = [
    {
      time: '2023-01-01T10:00:00Z',
      open: 100,
      high: 105,
      low: 95,
      close: 102,
    },
    {
      time: '2023-01-01T11:00:00Z',
      open: 102,
      high: 108,
      low: 98,
      close: 106,
    },
  ];

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Create mock tooltip element
    mockTooltip = {
      style: {},
      innerHTML: '',
      getBoundingClientRect: jest.fn().mockReturnValue({
        width: 200,
        height: 100,
      }),
      remove: mockRemove,
    } as unknown as HTMLElement;

    // Create mock chart ref
    mockChartRef = {
      querySelector: mockQuerySelector,
      addEventListener: mockAddEventListener,
      removeEventListener: mockRemoveEventListener,
    } as unknown as HTMLDivElement;

    // Setup mock implementations
    mockCreateElement.mockReturnValue(mockTooltip);
    mockQuerySelector.mockReturnValue({
      getBoundingClientRect: mockGetBoundingClientRect,
    });
    mockGetBoundingClientRect.mockReturnValue({
      left: 0,
      top: 0,
      right: 100,
      width: 100,
      height: 100,
    });

    // Mock window properties
    Object.defineProperty(window, 'innerWidth', { value: 1200, writable: true });
    Object.defineProperty(window, 'innerHeight', { value: 800, writable: true });
  });

  it('should create tooltip element on mount', () => {
    renderHook(() =>
      useDateTooltip({
        chartRef: mockChartRef,
        chartData: mockChartData,
        timeframe: '1h',
      })
    );

    expect(mockCreateElement).toHaveBeenCalledWith('div');
    expect(mockAppendChild).toHaveBeenCalledWith(mockTooltip);
  });

  it('should remove tooltip element on unmount', () => {
    const { unmount } = renderHook(() =>
      useDateTooltip({
        chartRef: mockChartRef,
        chartData: mockChartData,
        timeframe: '1h',
      })
    );

    unmount();

    expect(mockRemove).toHaveBeenCalled();
  });

  it('should add event listeners on mount', () => {
    renderHook(() =>
      useDateTooltip({
        chartRef: mockChartRef,
        chartData: mockChartData,
        timeframe: '1h',
      })
    );

    expect(mockAddEventListener).toHaveBeenCalledWith('mousemove', expect.any(Function));
    expect(mockAddEventListener).toHaveBeenCalledWith('mouseleave', expect.any(Function));
  });

  it('should remove event listeners on unmount', () => {
    const { unmount } = renderHook(() =>
      useDateTooltip({
        chartRef: mockChartRef,
        chartData: mockChartData,
        timeframe: '1h',
      })
    );

    unmount();

    expect(mockRemoveEventListener).toHaveBeenCalledWith('mousemove', expect.any(Function));
    expect(mockRemoveEventListener).toHaveBeenCalledWith('mouseleave', expect.any(Function));
  });

  it('should format time correctly for hourly timeframe', () => {
    const { result } = renderHook(() =>
      useDateTooltip({
        chartRef: mockChartRef,
        chartData: mockChartData,
        timeframe: '1h',
      })
    );

    const formattedTime = result.current.getFormattedTime(0);
    expect(formattedTime).toMatch(/\d{2}:\d{2}/); // Should match HH:MM format
  });

  it('should format time correctly for daily timeframe', () => {
    const { result } = renderHook(() =>
      useDateTooltip({
        chartRef: mockChartRef,
        chartData: mockChartData,
        timeframe: '1d',
      })
    );

    const formattedTime = result.current.getFormattedTime(0);
    expect(formattedTime).toMatch(/\w{3} \d{1,2}, \d{2}:\d{2}/); // Should match "Jan 1, 10:00" format
  });

  it('should show tooltip with correct data', () => {
    const { result } = renderHook(() =>
      useDateTooltip({
        chartRef: mockChartRef,
        chartData: mockChartData,
        timeframe: '1h',
      })
    );

    act(() => {
      result.current.showTooltip(0, 100, 100);
    });

    expect(mockTooltip.innerHTML).toContain('Time:');
    expect(mockTooltip.innerHTML).toContain('Open: $100.0000');
    expect(mockTooltip.innerHTML).toContain('High: $105.0000');
    expect(mockTooltip.innerHTML).toContain('Low: $95.0000');
    expect(mockTooltip.innerHTML).toContain('Close: $102.0000');
    expect(mockTooltip.style.display).toBe('block');
  });

  it('should not show tooltip when disabled', () => {
    const { result } = renderHook(() =>
      useDateTooltip({
        chartRef: mockChartRef,
        chartData: mockChartData,
        timeframe: '1h',
        enabled: false,
      })
    );

    act(() => {
      result.current.showTooltip(0, 100, 100);
    });

    expect(mockTooltip.style.display).toBe('none');
  });

  it('should hide tooltip', () => {
    const { result } = renderHook(() =>
      useDateTooltip({
        chartRef: mockChartRef,
        chartData: mockChartData,
        timeframe: '1h',
      })
    );

    act(() => {
      result.current.hideTooltip();
    });

    // Should be hidden after timeout
    setTimeout(() => {
      expect(mockTooltip.style.display).toBe('none');
    }, 150);
  });

  it('should handle empty chart data', () => {
    const { result } = renderHook(() =>
      useDateTooltip({
        chartRef: mockChartRef,
        chartData: [],
        timeframe: '1h',
      })
    );

    const formattedTime = result.current.getFormattedTime(0);
    expect(formattedTime).toBe('');
  });

  it('should handle invalid data index', () => {
    const { result } = renderHook(() =>
      useDateTooltip({
        chartRef: mockChartRef,
        chartData: mockChartData,
        timeframe: '1h',
      })
    );

    const formattedTime = result.current.getFormattedTime(-1);
    expect(formattedTime).toBe('');

    const formattedTime2 = result.current.getFormattedTime(10);
    expect(formattedTime2).toBe('');
  });
});
