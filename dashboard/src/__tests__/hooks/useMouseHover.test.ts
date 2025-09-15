import { renderHook, act } from '@testing-library/react';
import { useMouseHover } from '../../hooks/useMouseHover';

// Mock DOM methods
const mockQuerySelector = jest.fn();
const mockAddEventListener = jest.fn();
const mockRemoveEventListener = jest.fn();
const mockGetBoundingClientRect = jest.fn();

describe('useMouseHover', () => {
  let mockChartRef: HTMLDivElement;
  let mockOnMouseMove: jest.Mock;
  let mockOnMouseLeave: jest.Mock;
  let mockOnMouseEnter: jest.Mock;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Create mock functions
    mockOnMouseMove = jest.fn();
    mockOnMouseLeave = jest.fn();
    mockOnMouseEnter = jest.fn();

    // Create mock chart ref
    mockChartRef = {
      querySelector: mockQuerySelector,
      addEventListener: mockAddEventListener,
      removeEventListener: mockRemoveEventListener,
    } as unknown as HTMLDivElement;

    // Setup mock implementations
    mockQuerySelector.mockReturnValue({
      getBoundingClientRect: mockGetBoundingClientRect,
    });
    mockGetBoundingClientRect.mockReturnValue({
      left: 0,
      top: 0,
      width: 100,
      height: 100,
    });
  });

  it('should add event listeners on mount', () => {
    renderHook(() =>
      useMouseHover({
        chartRef: mockChartRef,
        onMouseMove: mockOnMouseMove,
        onMouseLeave: mockOnMouseLeave,
        onMouseEnter: mockOnMouseEnter,
      })
    );

    expect(mockAddEventListener).toHaveBeenCalledWith('mousemove', expect.any(Function));
    expect(mockAddEventListener).toHaveBeenCalledWith('mouseleave', expect.any(Function));
  });

  it('should remove event listeners on unmount', () => {
    const { unmount } = renderHook(() =>
      useMouseHover({
        chartRef: mockChartRef,
        onMouseMove: mockOnMouseMove,
        onMouseLeave: mockOnMouseLeave,
        onMouseEnter: mockOnMouseEnter,
      })
    );

    unmount();

    expect(mockRemoveEventListener).toHaveBeenCalledWith('mousemove', expect.any(Function));
    expect(mockRemoveEventListener).toHaveBeenCalledWith('mouseleave', expect.any(Function));
  });

  it('should not add event listeners when disabled', () => {
    renderHook(() =>
      useMouseHover({
        chartRef: mockChartRef,
        enabled: false,
        onMouseMove: mockOnMouseMove,
        onMouseLeave: mockOnMouseLeave,
        onMouseEnter: mockOnMouseEnter,
      })
    );

    expect(mockAddEventListener).not.toHaveBeenCalled();
  });

  it('should return correct initial state', () => {
    const { result } = renderHook(() =>
      useMouseHover({
        chartRef: mockChartRef,
        onMouseMove: mockOnMouseMove,
        onMouseLeave: mockOnMouseLeave,
        onMouseEnter: mockOnMouseEnter,
      })
    );

    expect(result.current.mousePosition).toBeNull();
    expect(result.current.isHovering).toBe(false);
    expect(typeof result.current.getRelativePosition).toBe('function');
  });

  it('should calculate relative position correctly', () => {
    const { result } = renderHook(() =>
      useMouseHover({
        chartRef: mockChartRef,
        onMouseMove: mockOnMouseMove,
        onMouseLeave: mockOnMouseLeave,
        onMouseEnter: mockOnMouseEnter,
      })
    );

    const mockEvent = {
      clientX: 50,
      clientY: 75,
    } as MouseEvent;

    const position = result.current.getRelativePosition(mockEvent);

    expect(position).toEqual({ x: 50, y: 75 });
  });

  it('should return null for relative position when chart ref is null', () => {
    const { result } = renderHook(() =>
      useMouseHover({
        chartRef: null,
        onMouseMove: mockOnMouseMove,
        onMouseLeave: mockOnMouseLeave,
        onMouseEnter: mockOnMouseEnter,
      })
    );

    const mockEvent = {
      clientX: 50,
      clientY: 75,
    } as MouseEvent;

    const position = result.current.getRelativePosition(mockEvent);

    expect(position).toBeNull();
  });

  it('should return null for relative position when plot area is not found', () => {
    mockQuerySelector.mockReturnValue(null);

    const { result } = renderHook(() =>
      useMouseHover({
        chartRef: mockChartRef,
        onMouseMove: mockOnMouseMove,
        onMouseLeave: mockOnMouseLeave,
        onMouseEnter: mockOnMouseEnter,
      })
    );

    const mockEvent = {
      clientX: 50,
      clientY: 75,
    } as MouseEvent;

    const position = result.current.getRelativePosition(mockEvent);

    expect(position).toBeNull();
  });

  it('should call onMouseLeave when mouse leaves', () => {
    renderHook(() =>
      useMouseHover({
        chartRef: mockChartRef,
        onMouseMove: mockOnMouseMove,
        onMouseLeave: mockOnMouseLeave,
        onMouseEnter: mockOnMouseEnter,
      })
    );

    // Get the mouse leave handler that was registered
    const mouseLeaveHandler = mockAddEventListener.mock.calls.find(
      call => call[0] === 'mouseleave'
    )?.[1];

    expect(mouseLeaveHandler).toBeDefined();

    // Call the handler
    act(() => {
      mouseLeaveHandler?.();
    });

    expect(mockOnMouseLeave).toHaveBeenCalled();
  });

  it('should not call callbacks when disabled', () => {
    renderHook(() =>
      useMouseHover({
        chartRef: mockChartRef,
        enabled: false,
        onMouseMove: mockOnMouseMove,
        onMouseLeave: mockOnMouseLeave,
        onMouseEnter: mockOnMouseEnter,
      })
    );

    expect(mockOnMouseMove).not.toHaveBeenCalled();
    expect(mockOnMouseLeave).not.toHaveBeenCalled();
    expect(mockOnMouseEnter).not.toHaveBeenCalled();
  });
});
