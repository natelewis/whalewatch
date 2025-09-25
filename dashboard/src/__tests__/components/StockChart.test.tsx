import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import StockChart from '../../components/StockChart';
// Removed useChartData import - now using useChartStateManager
import { useChartStateManager } from '../../hooks/useChartStateManager';
import { useChartWebSocket } from '../../hooks/useChartWebSocket';
import { ChartTimeframe } from '../../types';

// Mock the hooks
vi.mock('../../hooks/useChartStateManager');
vi.mock('../../hooks/useChartWebSocket');

// Mock D3
interface MockD3Element {
  attr: ReturnType<typeof vi.fn>;
  style: ReturnType<typeof vi.fn>;
  call: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  datum: ReturnType<typeof vi.fn>;
  empty: ReturnType<typeof vi.fn>;
  append: () => MockD3Element;
  select: () => MockD3Element;
  selectAll: () => MockD3Element;
  node: ReturnType<typeof vi.fn>;
  transition: () => {
    duration: ReturnType<typeof vi.fn>;
    call: ReturnType<typeof vi.fn>;
  };
  getAttribute: ReturnType<typeof vi.fn>;
  setAttribute: ReturnType<typeof vi.fn>;
  size: ReturnType<typeof vi.fn>;
}

const createMockD3Element = (): MockD3Element => {
  const mockElement: MockD3Element = {
    attr: vi.fn().mockReturnThis(),
    style: vi.fn().mockReturnThis(),
    call: vi.fn().mockReturnThis(),
    on: vi.fn().mockReturnThis(),
    datum: vi.fn().mockReturnThis(),
    empty: vi.fn().mockReturnValue(false),
    append: vi.fn(),
    select: vi.fn(),
    selectAll: vi.fn().mockReturnValue({
      remove: vi.fn(),
      attr: vi.fn().mockReturnThis(),
      style: vi.fn().mockReturnThis(),
      call: vi.fn().mockReturnThis(),
      on: vi.fn().mockReturnThis(),
      datum: vi.fn().mockReturnThis(),
      empty: vi.fn().mockReturnValue(false),
      append: vi.fn(),
      size: vi.fn().mockReturnValue(0),
    }),
    node: vi.fn().mockReturnValue({
      getAttribute: vi.fn().mockReturnValue('mock-class'),
      setAttribute: vi.fn(),
    }),
    transition: vi.fn().mockReturnValue({
      duration: vi.fn().mockReturnThis(),
      call: vi.fn().mockReturnThis(),
    }),
    getAttribute: vi.fn().mockReturnValue('mock-class'),
    setAttribute: vi.fn().mockReturnThis(),
    size: vi.fn().mockReturnValue(0),
  };

  // Set up the circular references after the object is created
  (mockElement.append as jest.MockedFunction<() => MockD3Element>).mockReturnValue(mockElement);
  (mockElement.select as jest.MockedFunction<() => MockD3Element>).mockReturnValue(mockElement);
  ((mockElement.selectAll() as MockD3Element).append as jest.MockedFunction<() => MockD3Element>).mockReturnValue(
    mockElement
  );

  return mockElement;
};

interface MockD3Scale {
  (value: number): number;
  domain: ReturnType<typeof vi.fn>;
  range: ReturnType<typeof vi.fn>;
  invert: ReturnType<typeof vi.fn>;
  nice?: ReturnType<typeof vi.fn>;
}

const createMockScale = (defaultDomain: [number, number], defaultRange: [number, number]): MockD3Scale => {
  const scale = Object.assign(
    vi.fn((value: number) => value * 10),
    {
      domain: vi.fn((domain?: [number, number]) => {
        if (domain) {
          return scale; // Return scale for chaining
        }
        return defaultDomain; // Return array when called without arguments
      }),
      range: vi.fn((range?: [number, number]) => {
        if (range) {
          return scale; // Return scale for chaining
        }
        return defaultRange; // Return array when called without arguments
      }),
      nice: vi.fn().mockReturnThis(),
      invert: vi.fn(),
    }
  ) as MockD3Scale;
  return scale;
};

vi.mock('d3', () => ({
  select: vi.fn(() => createMockD3Element()),
  scaleTime: vi.fn(() => createMockScale([0, 100], [0, 800])),
  scaleLinear: vi.fn(() => createMockScale([0, 100], [0, 400])),
  axisRight: vi.fn(() => ({
    tickSizeOuter: vi.fn().mockReturnThis(),
    ticks: vi.fn().mockReturnThis(),
    tickFormat: vi.fn().mockReturnThis(),
    tickSize: vi.fn().mockReturnThis(),
  })),
  axisBottom: vi.fn(() => ({
    tickSizeOuter: vi.fn().mockReturnThis(),
    ticks: vi.fn().mockReturnThis(),
    tickFormat: vi.fn().mockReturnThis(),
    tickSize: vi.fn().mockReturnThis(),
  })),
  format: vi.fn(() => vi.fn((value: number) => value.toString())),
  zoom: vi.fn(() => ({
    scaleExtent: vi.fn().mockReturnThis(),
    on: vi.fn().mockReturnThis(),
    filter: vi.fn().mockReturnThis(),
  })),
  zoomIdentity: vi.fn(() => ({
    x: 0,
    y: 0,
    k: 1,
    translateX: vi.fn().mockReturnThis(),
    translateY: vi.fn().mockReturnThis(),
    scale: vi.fn().mockReturnThis(),
    rescaleX: vi.fn().mockReturnValue(createMockScale([0, 100], [0, 800])),
    rescaleY: vi.fn().mockReturnValue(createMockScale([0, 100], [0, 400])),
    toString: vi.fn(() => 'translate(0,0) scale(1)'),
  })),
  zoomTransform: vi.fn(() => ({
    x: 0,
    y: 0,
    k: 1,
    translateX: vi.fn().mockReturnThis(),
    translateY: vi.fn().mockReturnThis(),
    scale: vi.fn().mockReturnThis(),
    rescaleX: vi.fn().mockReturnValue(createMockScale([0, 100], [0, 800])),
    rescaleY: vi.fn().mockReturnValue(createMockScale([0, 100], [0, 400])),
    toString: vi.fn(() => 'translate(0,0) scale(1)'),
  })),
  extent: vi.fn(() => [new Date('2023-01-01'), new Date('2023-01-02')]),
  min: vi.fn(() => 100),
  max: vi.fn(() => 200),
  line: vi.fn(() => ({
    x: vi.fn().mockReturnThis(),
    y: vi.fn().mockReturnThis(),
    curve: vi.fn().mockReturnThis(),
  })),
  area: vi.fn(() => ({
    x: vi.fn().mockReturnThis(),
    y0: vi.fn().mockReturnThis(),
    y1: vi.fn().mockReturnThis(),
    curve: vi.fn().mockReturnThis(),
  })),
  axisLeft: vi.fn(() => ({
    tickSizeOuter: vi.fn().mockReturnThis(),
    ticks: vi.fn().mockReturnThis(),
    tickFormat: vi.fn().mockReturnThis(),
    tickSize: vi.fn().mockReturnThis(),
  })),
  bisector: vi.fn(() => ({
    left: vi.fn(() => 0),
  })),
  pointer: vi.fn(() => [100, 100]),
  timeFormat: vi.fn(() => vi.fn()),
  curveLinear: 'linear',
}));

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn((): string | null => null), // Default to null for all tests
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

const mockChartData = [
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

const mockUseChartStateManager = {
  state: {
    data: mockChartData,
    allData: mockChartData,
    isLoading: false,
    error: null,
    isZooming: false,
    chartLoaded: false,
    chartExists: false,
    currentViewStart: 0,
    currentViewEnd: mockChartData.length - 1,
    dimensions: {
      width: 800,
      height: 400,
      margin: { top: 20, right: 60, bottom: 40, left: 0 },
    },
    transform: { x: 0, y: 0, k: 1 },
    hoverData: null,
    dateDisplay: null,
    timeframe: '1h' as const,
    symbol: 'TSLA',
    fixedYScaleDomain: null,
  },
  actions: {
    loadChartData: vi.fn().mockResolvedValue(undefined) as (
      symbol: string,
      timeframe: ChartTimeframe,
      dataPoints?: number,
      startTime?: string,
      direction?: 'past' | 'future' | 'centered'
    ) => Promise<void>,
    loadMoreData: vi.fn(),
    updateChartWithLiveData: vi.fn(),
    setAllData: vi.fn(),
    setData: vi.fn(),
    setIsLive: vi.fn(),
    setIsWebSocketEnabled: vi.fn(),
    setIsZooming: vi.fn(),
    setError: vi.fn(),
    setIsLoading: vi.fn(),
    resetChart: vi.fn(),
    setTimeframe: vi.fn(),
    setCurrentViewStart: vi.fn(),
    setCurrentViewEnd: vi.fn(),
    setViewport: vi.fn(),
    setHoverData: vi.fn(),
    setDateDisplay: vi.fn(),
    setChartLoaded: vi.fn(),
    setChartExists: vi.fn(),
    setTransform: vi.fn(),
    updateTransform: vi.fn(),
    resetTransform: vi.fn(),
    setSymbol: vi.fn(),
    setDimensions: vi.fn(),
    setFixedYScaleDomain: vi.fn(),
    setCurrentVerticalPan: vi.fn(),
    addDataPoint: vi.fn(),
    updateData: vi.fn(),
    updateMultiple: vi.fn(),
  },
};

const mockUseChartWebSocket = {
  subscribeToChartData: vi.fn(),
  unsubscribeFromChartData: vi.fn(),
  isConnected: true,
};

describe('StockChart', () => {
  beforeEach(() => {
    vi.mocked(useChartStateManager).mockReturnValue({
      ...mockUseChartStateManager,
      isInitialLoad: false,
    });
    vi.mocked(useChartWebSocket).mockReturnValue(mockUseChartWebSocket);
    localStorageMock.getItem.mockReturnValue('1h');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    render(<StockChart symbol="TSLA" onSymbolChange={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'TSLA' })).toBeInTheDocument();
  });

  it('displays loading state when data is loading', () => {
    vi.mocked(useChartStateManager).mockReturnValue({
      ...mockUseChartStateManager,
      isInitialLoad: false,
      state: {
        ...mockUseChartStateManager.state,
        isLoading: true,
        isZooming: false,
      },
    });

    render(<StockChart symbol="TSLA" onSymbolChange={vi.fn()} />);
    expect(screen.getByText('Loading chart data...')).toBeInTheDocument();
  });

  it('displays error state when there is an error', () => {
    vi.mocked(useChartStateManager).mockReturnValue({
      ...mockUseChartStateManager,
      isInitialLoad: false,
      state: {
        ...mockUseChartStateManager.state,
        error: 'Failed to load data',
        isZooming: false,
      },
    });

    render(<StockChart symbol="TSLA" onSymbolChange={vi.fn()} />);
    expect(screen.getByText('Failed to load data')).toBeInTheDocument();
    expect(screen.getByText('Retry')).toBeInTheDocument();
  });

  it('displays chart data when loaded', () => {
    render(<StockChart symbol="TSLA" onSymbolChange={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'TSLA' })).toBeInTheDocument();
    // The component shows "Total data: 2" in the footer
    expect(screen.getByText(/Total data:/)).toBeInTheDocument();
    expect(
      screen.getByText((content, element) => {
        return element?.textContent === 'Total data: 2';
      })
    ).toBeInTheDocument();
  });

  it('allows timeframe selection', () => {
    render(<StockChart symbol="TSLA" onSymbolChange={vi.fn()} />);

    const timeframeButtons = screen
      .getAllByRole('button')
      .filter(
        button =>
          button.textContent?.includes('1m') ||
          button.textContent?.includes('15m') ||
          button.textContent?.includes('1h')
      );

    expect(timeframeButtons.length).toBeGreaterThan(0);

    fireEvent.click(timeframeButtons[0]);
    expect(mockUseChartStateManager.actions.loadChartData).toHaveBeenCalled();
  });

  it('shows zoom and pan information in footer', () => {
    render(<StockChart symbol="TSLA" onSymbolChange={vi.fn()} />);

    expect(screen.getByText('Zoom: 1.00x')).toBeInTheDocument();
    expect(screen.getByText('Pan: 0, 0')).toBeInTheDocument();
  });

  it('shows live data indicator', () => {
    render(<StockChart symbol="TSLA" onSymbolChange={vi.fn()} />);

    expect(screen.getByText('Live Data')).toBeInTheDocument();
  });

  it('handles window resize', () => {
    render(<StockChart symbol="TSLA" onSymbolChange={vi.fn()} />);

    // Simulate window resize
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1200,
    });
    Object.defineProperty(window, 'innerHeight', {
      writable: true,
      configurable: true,
      value: 800,
    });

    fireEvent(window, new Event('resize'));

    // Chart should re-render with new dimensions
    expect(screen.getByRole('heading', { name: 'TSLA' })).toBeInTheDocument();
  });

  it('loads saved timeframe from localStorage', () => {
    localStorageMock.getItem.mockReturnValue('"15m"'); // JSON stringified

    render(<StockChart symbol="TSLA" onSymbolChange={vi.fn()} />);

    expect(localStorageMock.getItem).toHaveBeenCalledWith('chartTimeframe');
    // The component uses the saved timeframe from localStorage
    expect(mockUseChartStateManager.actions.loadChartData).toHaveBeenCalledWith('TSLA', '15m', 1000, undefined, 'past');
  });

  it('saves timeframe to localStorage when changed', () => {
    render(<StockChart symbol="TSLA" onSymbolChange={vi.fn()} />);

    const timeframeButton = screen.getByText('15m');
    fireEvent.click(timeframeButton);

    // The component saves the timeframe as a JSON string
    expect(localStorageMock.setItem).toHaveBeenCalledWith('chartTimeframe', '"15m"');
  });

  it('handles missing chart data gracefully', () => {
    vi.mocked(useChartStateManager).mockReturnValue({
      ...mockUseChartStateManager,
      isInitialLoad: false,
      state: {
        ...mockUseChartStateManager.state,
        data: [],
        allData: [],
        timeframe: null,
        isZooming: false,
      },
    });

    render(<StockChart symbol="TSLA" onSymbolChange={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'TSLA' })).toBeInTheDocument();
    // The component shows "Total data: 0" in the footer when there's no data
    expect(screen.getByText(/Total data:/)).toBeInTheDocument();
    expect(
      screen.getByText((content, element) => {
        return element?.textContent === 'Total data: 0';
      })
    ).toBeInTheDocument();
  });

  it('updates chart when symbol changes', () => {
    const { rerender } = render(<StockChart symbol="TSLA" onSymbolChange={vi.fn()} />);

    rerender(<StockChart symbol="AAPL" onSymbolChange={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'AAPL' })).toBeInTheDocument();
    // The component loads data on mount with the initial symbol
    expect(mockUseChartStateManager.actions.loadChartData).toHaveBeenCalledWith('TSLA', '1h', 1000, undefined, 'past');
  });

  it('displays WebSocket connection indicator when connected', () => {
    vi.mocked(useChartWebSocket).mockReturnValue({
      ...mockUseChartWebSocket,
      isConnected: true,
    });

    render(<StockChart symbol="TSLA" onSymbolChange={vi.fn()} />);

    expect(screen.getByText('TSLA')).toBeInTheDocument();
    expect(screen.getByText('Live Data')).toBeInTheDocument();
  });

  it('displays WebSocket connection indicator when disconnected', () => {
    vi.mocked(useChartWebSocket).mockReturnValue({
      ...mockUseChartWebSocket,
      isConnected: false,
    });

    render(<StockChart symbol="TSLA" onSymbolChange={vi.fn()} />);

    expect(screen.getByText('TSLA')).toBeInTheDocument();
    expect(screen.getByText('Disconnected')).toBeInTheDocument();
  });
});
