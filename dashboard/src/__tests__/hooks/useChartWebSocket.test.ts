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
      socket: null,
      lastMessage: null,
      sendMessage: mockSendMessage,
      isConnected: true,
      connect: jest.fn(),
      disconnect: jest.fn(),
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
      socket: null,
      lastMessage: {
        type: 'chart_quote',
        data: {
          symbol: 'AAPL',
          bar: mockBar,
        },
        timestamp: '2023-01-01T00:00:00Z',
      },
      sendMessage: mockSendMessage,
      isConnected: true,
      connect: jest.fn(),
      disconnect: jest.fn(),
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
      socket: null,
      lastMessage: {
        type: 'chart_quote',
        data: {
          symbol: 'MSFT', // Different symbol
          bar: mockBar,
        },
        timestamp: '2023-01-01T00:00:00Z',
      },
      sendMessage: mockSendMessage,
      isConnected: true,
      connect: jest.fn(),
      disconnect: jest.fn(),
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
      socket: null,
      lastMessage: {
        type: 'options_whale',
        data: {
          id: 'test-id',
          symbol: 'AAPL',
          timestamp: '2023-01-01T00:00:00Z',
          price: 100,
          size: 10,
          side: 'buy' as const,
          conditions: [],
          exchange: 'NASDAQ',
          tape: 'A',
          contract: {
            symbol: 'AAPL240115C00150000',
            underlying_symbol: 'AAPL',
            exercise_style: 'american',
            expiration_date: '2024-01-15',
            strike_price: 150,
            option_type: 'call' as const,
          },
        },
        timestamp: '2023-01-01T00:00:00Z',
      },
      sendMessage: mockSendMessage,
      isConnected: true,
      connect: jest.fn(),
      disconnect: jest.fn(),
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
      socket: null,
      lastMessage: null,
      sendMessage: mockSendMessage,
      isConnected: true,
      connect: jest.fn(),
      disconnect: jest.fn(),
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
      socket: null,
      lastMessage: null,
      sendMessage: mockSendMessage,
      isConnected: false,
      connect: jest.fn(),
      disconnect: jest.fn(),
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
