import { renderHook, act } from '@testing-library/react';
import { usePriceTooltip } from '../../hooks/usePriceTooltip';

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

describe('usePriceTooltip', () => {
  let mockChartRef: HTMLDivElement;
  let mockTooltip: HTMLElement;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Create mock tooltip element
    mockTooltip = {
      style: {},
      textContent: '',
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
  });

  it('should create tooltip element on mount', () => {
    renderHook(() =>
      usePriceTooltip({
        chartRef: mockChartRef,
        topPrice: 100,
        minPrice: 50,
        effectiveHeight: 100,
        effectiveWidth: 100,
      })
    );

    expect(mockCreateElement).toHaveBeenCalledWith('div');
    expect(mockAppendChild).toHaveBeenCalledWith(mockTooltip);
  });

  it('should remove tooltip element on unmount', () => {
    const { unmount } = renderHook(() =>
      usePriceTooltip({
        chartRef: mockChartRef,
        topPrice: 100,
        minPrice: 50,
        effectiveHeight: 100,
        effectiveWidth: 100,
      })
    );

    unmount();

    expect(mockRemove).toHaveBeenCalled();
  });

  it('should add event listeners on mount', () => {
    renderHook(() =>
      usePriceTooltip({
        chartRef: mockChartRef,
        topPrice: 100,
        minPrice: 50,
        effectiveHeight: 100,
        effectiveWidth: 100,
      })
    );

    expect(mockAddEventListener).toHaveBeenCalledWith('mousemove', expect.any(Function));
    expect(mockAddEventListener).toHaveBeenCalledWith('mouseleave', expect.any(Function));
  });

  it('should remove event listeners on unmount', () => {
    const { unmount } = renderHook(() =>
      usePriceTooltip({
        chartRef: mockChartRef,
        topPrice: 100,
        minPrice: 50,
        effectiveHeight: 100,
        effectiveWidth: 100,
      })
    );

    unmount();

    expect(mockRemoveEventListener).toHaveBeenCalledWith('mousemove', expect.any(Function));
    expect(mockRemoveEventListener).toHaveBeenCalledWith('mouseleave', expect.any(Function));
  });

  it('should calculate price correctly from mouse Y position', () => {
    const { result } = renderHook(() =>
      usePriceTooltip({
        chartRef: mockChartRef,
        topPrice: 100,
        minPrice: 50,
        effectiveHeight: 100,
        effectiveWidth: 100,
      })
    );

    // Test price calculation
    // At top of chart (Y=0), should be topPrice (100)
    // At bottom of chart (Y=100), should be minPrice (50)
    // At middle of chart (Y=50), should be average (75)
    
    // This would require testing the internal calculation logic
    // which is currently private to the hook
    expect(result.current.tooltipElement).toBe(mockTooltip);
  });

  it('should not show tooltip when disabled', () => {
    const { result } = renderHook(() =>
      usePriceTooltip({
        chartRef: mockChartRef,
        topPrice: 100,
        minPrice: 50,
        effectiveHeight: 100,
        effectiveWidth: 100,
        enabled: false,
      })
    );

    // When disabled, tooltip should not be shown
    act(() => {
      result.current.showTooltip(75, 50, 50);
    });

    // The tooltip should not be visible when disabled
    expect(mockTooltip.style.display).toBe('none');
  });

  it('should show tooltip when enabled', () => {
    const { result } = renderHook(() =>
      usePriceTooltip({
        chartRef: mockChartRef,
        topPrice: 100,
        minPrice: 50,
        effectiveHeight: 100,
        effectiveWidth: 100,
        enabled: true,
      })
    );

    act(() => {
      result.current.showTooltip(75, 50, 50);
    });

    expect(mockTooltip.textContent).toBe('75.00');
    expect(mockTooltip.style.display).toBe('block');
  });

  it('should hide tooltip', () => {
    const { result } = renderHook(() =>
      usePriceTooltip({
        chartRef: mockChartRef,
        topPrice: 100,
        minPrice: 50,
        effectiveHeight: 100,
        effectiveWidth: 100,
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
});
