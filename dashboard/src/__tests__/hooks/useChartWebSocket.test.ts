import { renderHook, act } from '@testing-library/react';
import { useChartWebSocket } from '../../hooks/useChartWebSocket';
import { useWebSocket } from '../../hooks/useWebSocket';

// Mock the useWebSocket hook
jest.mock('../../hooks/useWebSocket', () => ({
  useWebSocket: jest.fn(),
}));

const mockUseWebSocket = useWebSocket as jest.MockedFunction<typeof useWebSocket>;

describe('useChartWebSocket', () => {
  const mockSendMessage = jest.fn();
  const mockOnChartData = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseWebSocket.mockReturnValue({
      lastMessage: null,
      sendMessage: mockSendMessage,
      isConnected: true,
    });
  });

  it('should initialize with correct values', () => {
    const { result } = renderHook(() =>
      useChartWebSocket({
        symbol: 'AAPL',
        onChartData: mockOnChartData,
      })
    );

    expect(result.current.isConnected).toBe(true);
    expect(typeof result.current.subscribeToChartData).toBe('function');
    expect(typeof result.current.unsubscribeFromChartData).toBe('function');
  });

  it('should subscribe to chart data', () => {
    const { result } = renderHook(() =>
      useChartWebSocket({
        symbol: 'AAPL',
        onChartData: mockOnChartData,
      })
    );

    act(() => {
      result.current.subscribeToChartData();
    });

    expect(mockSendMessage).toHaveBeenCalledWith({
      type: 'subscribe',
      data: { channel: 'chart_quote', symbol: 'AAPL' },
    });
  });

  it('should unsubscribe from chart data', () => {
    const { result } = renderHook(() =>
      useChartWebSocket({
        symbol: 'AAPL',
        onChartData: mockOnChartData,
      })
    );

    act(() => {
      result.current.unsubscribeFromChartData();
    });

    expect(mockSendMessage).toHaveBeenCalledWith({
      type: 'unsubscribe',
      data: { channel: 'chart_quote', symbol: 'AAPL' },
    });
  });

  it('should call onChartData when receiving chart_quote message for correct symbol', () => {
    const mockBar = {
      t: '2023-01-01T12:00:00Z',
      o: 106,
      h: 110,
      l: 104,
      c: 108,
      v: 1500,
    };

    mockUseWebSocket.mockReturnValue({
      lastMessage: {
        type: 'chart_quote',
        data: {
          symbol: 'AAPL',
          bar: mockBar,
        },
      },
      sendMessage: mockSendMessage,
      isConnected: true,
    });

    renderHook(() =>
      useChartWebSocket({
        symbol: 'AAPL',
        onChartData: mockOnChartData,
      })
    );

    expect(mockOnChartData).toHaveBeenCalledWith(mockBar);
  });

  it('should not call onChartData when receiving message for different symbol', () => {
    const mockBar = {
      t: '2023-01-01T12:00:00Z',
      o: 106,
      h: 110,
      l: 104,
      c: 108,
      v: 1500,
    };

    mockUseWebSocket.mockReturnValue({
      lastMessage: {
        type: 'chart_quote',
        data: {
          symbol: 'MSFT', // Different symbol
          bar: mockBar,
        },
      },
      sendMessage: mockSendMessage,
      isConnected: true,
    });

    renderHook(() =>
      useChartWebSocket({
        symbol: 'AAPL',
        onChartData: mockOnChartData,
      })
    );

    expect(mockOnChartData).not.toHaveBeenCalled();
  });

  it('should not call onChartData when receiving non-chart_quote message', () => {
    mockUseWebSocket.mockReturnValue({
      lastMessage: {
        type: 'other_message',
        data: {
          symbol: 'AAPL',
          someData: 'test',
        },
      },
      sendMessage: mockSendMessage,
      isConnected: true,
    });

    renderHook(() =>
      useChartWebSocket({
        symbol: 'AAPL',
        onChartData: mockOnChartData,
      })
    );

    expect(mockOnChartData).not.toHaveBeenCalled();
  });

  it('should not call onChartData when lastMessage is null', () => {
    mockUseWebSocket.mockReturnValue({
      lastMessage: null,
      sendMessage: mockSendMessage,
      isConnected: true,
    });

    renderHook(() =>
      useChartWebSocket({
        symbol: 'AAPL',
        onChartData: mockOnChartData,
      })
    );

    expect(mockOnChartData).not.toHaveBeenCalled();
  });

  it('should update subscription when symbol changes', () => {
    const { result, rerender } = renderHook(
      ({ symbol }) =>
        useChartWebSocket({
          symbol,
          onChartData: mockOnChartData,
        }),
      {
        initialProps: { symbol: 'AAPL' },
      }
    );

    act(() => {
      result.current.subscribeToChartData();
    });

    expect(mockSendMessage).toHaveBeenCalledWith({
      type: 'subscribe',
      data: { channel: 'chart_quote', symbol: 'AAPL' },
    });

    // Change symbol and subscribe again
    rerender({ symbol: 'MSFT' });

    act(() => {
      result.current.subscribeToChartData();
    });

    expect(mockSendMessage).toHaveBeenCalledWith({
      type: 'subscribe',
      data: { channel: 'chart_quote', symbol: 'MSFT' },
    });
  });

  it('should reflect connection status from useWebSocket', () => {
    mockUseWebSocket.mockReturnValue({
      lastMessage: null,
      sendMessage: mockSendMessage,
      isConnected: false,
    });

    const { result } = renderHook(() =>
      useChartWebSocket({
        symbol: 'AAPL',
        onChartData: mockOnChartData,
      })
    );

    expect(result.current.isConnected).toBe(false);
  });
});
