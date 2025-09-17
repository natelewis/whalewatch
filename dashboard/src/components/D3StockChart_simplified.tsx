import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import * as d3 from 'd3';
import { ChartTimeframe, ChartType, DEFAULT_CHART_DATA_POINTS } from '../types';
import { getLocalStorageItem, setLocalStorageItem } from '../utils/localStorage';
import { useChartData } from '../hooks/useChartData';
import { useChartWebSocket } from '../hooks/useChartWebSocket';
import { TimeframeConfig } from '../utils/chartDataUtils';
import {
  BarChart3,
  Settings,
  Play,
  Pause,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Move,
  Square as SquareIcon,
} from 'lucide-react';

interface D3StockChartProps {
  symbol: string;
  onSymbolChange: (symbol: string) => void;
}

interface ChartDimensions {
  width: number;
  height: number;
  margin: { top: number; right: number; bottom: number; left: number };
}

interface HoverData {
  x: number;
  y: number;
  data: {
    time: string;
    open: number;
    high: number;
    low: number;
    close: number;
  } | null;
}

interface ChartState {
  // Data
  rawData: Array<{
    time: string;
    open: number;
    high: number;
    low: number;
    close: number;
  }>;
  visibleData: Array<{
    time: string;
    open: number;
    high: number;
    low: number;
    close: number;
  }>;

  // View bounds
  viewStart: number;
  viewEnd: number;

  // Transform state
  zoomLevel: number;
  panOffset: { x: number; y: number };
  transform: d3.ZoomTransform;

  // Chart dimensions
  dimensions: ChartDimensions;

  // UI state
  isZooming: boolean;
  isPanning: boolean;
  hoverData: HoverData | null;

  // Data loading state
  isLoading: boolean;
  isLoadingMoreData: boolean;
  isDataLoading: boolean;
  hasMoreData: boolean;

  // Chart state
  chartExists: boolean;
  isCreatingChart: boolean;

  // User interaction state
  hasUserPanned: boolean;
  isAtRightEdge: boolean;
  isLive: boolean;
}

// ============================================================================
// CONFIGURATION CONSTANTS
// ============================================================================
const CHART_DATA_POINTS = 80;
const PAN_BUFFER_SIZE = 20;
const CHART_CREATION_DEBOUNCE = 1000;

const D3StockChart: React.FC<D3StockChartProps> = ({ symbol, onSymbolChange }) => {
  // Initialize comprehensive state
  const [chartState, setChartState] = useState<ChartState>({
    // Data
    rawData: [],
    visibleData: [],

    // View bounds
    viewStart: 0,
    viewEnd: CHART_DATA_POINTS,

    // Transform state
    zoomLevel: 1,
    panOffset: { x: 0, y: 0 },
    transform: d3.zoomIdentity,

    // Chart dimensions
    dimensions: {
      width: 800,
      height: 400,
      margin: { top: 20, right: 30, bottom: 40, left: 60 },
    },

    // UI state
    isZooming: false,
    isPanning: false,
    hoverData: null,

    // Data loading state
    isLoading: false,
    isLoadingMoreData: false,
    isDataLoading: false,
    hasMoreData: true,

    // Chart state
    chartExists: false,
    isCreatingChart: false,

    // User interaction state
    hasUserPanned: false,
    isAtRightEdge: false,
    isLive: false,
  });

  // Refs
  const svgRef = useRef<SVGSVGElement>(null);
  const lastChartCreationRef = useRef<number>(0);
  const isInitialLoad = useRef(true);
  const hasLoadedInitialData = useRef(false);
  const lastDataLengthRef = useRef<number>(0);
  const lastVisibleDataRef = useRef<string>('');

  // Define timeframes array
  const timeframes: TimeframeConfig[] = useMemo(
    () => [
      { value: '1m', label: '1m', dataPoints: DEFAULT_CHART_DATA_POINTS },
      { value: '5m', label: '5m', dataPoints: DEFAULT_CHART_DATA_POINTS },
      { value: '30m', label: '30m', dataPoints: DEFAULT_CHART_DATA_POINTS },
      { value: '1h', label: '1h', dataPoints: DEFAULT_CHART_DATA_POINTS },
      { value: '1d', label: '1d', dataPoints: DEFAULT_CHART_DATA_POINTS },
    ],
    []
  );

  // Hooks
  const chartDataHook = useChartData({
    timeframes,
    bufferPoints: 100,
    onDataLoaded: () => {
      // Data loaded callback
    },
  });

  const chartWebSocket = useChartWebSocket({
    symbol,
  });

  const timeframe = getLocalStorageItem<ChartTimeframe>('chartTimeframe', '5m');

  // ============================================================================
  // STATE UPDATE FUNCTIONS
  // ============================================================================

  // Update chart state with validation
  const updateChartState = useCallback((updates: Partial<ChartState>) => {
    setChartState((prev) => {
      const newState = { ...prev, ...updates };

      // Validate view bounds
      if (updates.viewStart !== undefined || updates.viewEnd !== undefined) {
        const viewStart = updates.viewStart ?? newState.viewStart;
        const viewEnd = updates.viewEnd ?? newState.viewEnd;
        const dataLength = newState.rawData.length;

        if (dataLength > 0) {
          newState.viewStart = Math.max(0, Math.min(viewStart, dataLength - 1));
          newState.viewEnd = Math.max(newState.viewStart, Math.min(viewEnd, dataLength));
        }
      }

      return newState;
    });
  }, []);

  // ============================================================================
  // DATA LOADING FUNCTIONS
  // ============================================================================

  // Load initial data
  const loadInitialData = useCallback(async () => {
    if (!timeframe) {
return;
}

    console.log('Loading initial data for symbol:', symbol, 'timeframe:', timeframe);
    updateChartState({ isLoading: true, isDataLoading: true });

    try {
      await chartDataHook.loadChartData(symbol, timeframe);
    } finally {
      updateChartState({ isLoading: false, isDataLoading: false });
    }
  }, [symbol, timeframe, chartDataHook.loadChartData, updateChartState]);

  // Load more data when needed
  const loadMoreData = useCallback(async () => {
    if (!timeframe || chartState.isDataLoading || chartState.isLoadingMoreData) {
return;
}

    console.log('Loading more data for symbol:', symbol, 'timeframe:', timeframe);
    updateChartState({ isLoadingMoreData: true, isDataLoading: true });

    try {
      const dataLength = chartState.rawData.length;
      const bufferSize = 300;

      // Check if we need more historical data (panning left)
      if (chartState.viewStart <= bufferSize) {
        await chartDataHook.loadMoreDataLeft(symbol, timeframe);
      }

      // Check if we need more recent data (panning right)
      if (chartState.viewEnd >= dataLength - bufferSize) {
        await chartDataHook.loadMoreDataRight(symbol, timeframe);
      }
    } finally {
      updateChartState({ isLoadingMoreData: false, isDataLoading: false });
    }
  }, [
    symbol,
    timeframe,
    chartState.isDataLoading,
    chartState.isLoadingMoreData,
    chartState.rawData.length,
    chartState.viewStart,
    chartState.viewEnd,
    chartDataHook.loadMoreDataLeft,
    chartDataHook.loadMoreDataRight,
    updateChartState,
  ]);

  // ============================================================================
  // CHART CREATION FUNCTIONS
  // ============================================================================

  // Create the D3 chart
  const createChart = useCallback(() => {
    if (!svgRef.current || chartState.visibleData.length === 0 || chartState.isCreatingChart) {
      console.log('Skipping chart creation:', {
        hasSvg: !!svgRef.current,
        dataLength: chartState.visibleData.length,
        isCreating: chartState.isCreatingChart,
      });
      return;
    }

    updateChartState({ isCreatingChart: true });

    const { width, height, margin } = chartState.dimensions;
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    // Clear existing chart
    d3.select(svgRef.current).selectAll('*').remove();

    // Create SVG
    const svg = d3.select(svgRef.current).attr('width', width).attr('height', height);

    // Create main group
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    // Create scales
    const xScale = d3
      .scaleLinear()
      .domain([0, chartState.visibleData.length - 1])
      .range([0, innerWidth]);

    const yScale = d3
      .scaleLinear()
      .domain([
        d3.min(chartState.visibleData, (d) => d.low) as number,
        d3.max(chartState.visibleData, (d) => d.high) as number,
      ])
      .nice()
      .range([innerHeight, 0]);

    // Create axes
    const xAxis = d3
      .axisBottom(xScale)
      .tickSize(-innerHeight)
      .tickFormat(() => '');

    const yAxis = d3.axisLeft(yScale).tickSize(-innerWidth).tickFormat(d3.format('.2f'));

    // Add axes
    g.append('g')
      .attr('class', 'x-axis')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(xAxis);

    g.append('g').attr('class', 'y-axis').call(yAxis);

    // Create candlesticks
    const candleWidth = Math.max(1, 4);

    chartState.visibleData.forEach((d, index) => {
      const x = xScale(index) - candleWidth / 2;
      const isUp = d.close >= d.open;
      const color = isUp ? '#26a69a' : '#ef5350';

      // High-Low line
      g.append('line')
        .attr('x1', x + candleWidth / 2)
        .attr('x2', x + candleWidth / 2)
        .attr('y1', yScale(d.high))
        .attr('y2', yScale(d.low))
        .attr('stroke', color)
        .attr('stroke-width', 1);

      // Open-Close rectangle
      g.append('rect')
        .attr('x', x)
        .attr('y', yScale(Math.max(d.open, d.close)))
        .attr('width', candleWidth)
        .attr('height', Math.abs(yScale(d.close) - yScale(d.open)))
        .attr('fill', color)
        .attr('stroke', color)
        .attr('stroke-width', 1);
    });

    // Add zoom behavior
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.5, 10])
      .on('start', () => updateChartState({ isZooming: true, isPanning: true }))
      .on('zoom', (event) => {
        const transform = event.transform;
        updateChartState({
          transform,
          zoomLevel: transform.k,
          panOffset: { x: transform.x, y: transform.y },
        });
      })
      .on('end', (event) => {
        const transform = event.transform;
        updateChartState({
          isZooming: false,
          isPanning: false,
          transform,
          zoomLevel: transform.k,
          panOffset: { x: transform.x, y: transform.y },
        });
      });

    svg.call(zoom);

    // Mark chart as created
    updateChartState({
      chartExists: true,
      isCreatingChart: false,
      hasUserPanned: false,
    });

    lastChartCreationRef.current = Date.now();
  }, [chartState, updateChartState]);

  // ============================================================================
  // EFFECTS
  // ============================================================================

  // Reset initial data loading flag when symbol changes
  useEffect(() => {
    hasLoadedInitialData.current = false;
  }, [symbol]);

  // Load initial data when component mounts
  useEffect(() => {
    if (timeframe && !hasLoadedInitialData.current) {
      console.log('Loading initial data for timeframe:', timeframe);
      hasLoadedInitialData.current = true;
      loadInitialData();
    }
  }, [timeframe, loadInitialData]);

  // Update raw data when chart data changes
  useEffect(() => {
    const currentLength = chartDataHook.chartData.length;
    console.log('Chart data changed:', currentLength, 'points');

    if (currentLength > 0 && currentLength !== lastDataLengthRef.current) {
      console.log('Updating raw data from', lastDataLengthRef.current, 'to', currentLength);
      lastDataLengthRef.current = currentLength;
      setChartState((prev) => ({ ...prev, rawData: chartDataHook.chartData }));
    }
  }, [chartDataHook.chartData]);

  // Update visible data when raw data or view bounds change
  useEffect(() => {
    console.log('Updating visible data:', {
      rawDataLength: chartState.rawData.length,
      viewStart: chartState.viewStart,
      viewEnd: chartState.viewEnd,
    });

    if (chartState.rawData.length === 0) {
return;
}

    const sortedData = [...chartState.rawData].sort(
      (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
    );

    const visibleData = sortedData.slice(chartState.viewStart, chartState.viewEnd + 1);

    // Create a hash of the visible data to check if it's actually different
    const visibleDataHash = `${visibleData.length}-${visibleData[0]?.time}-${
      visibleData[visibleData.length - 1]?.time
    }`;

    if (visibleDataHash !== lastVisibleDataRef.current) {
      console.log('Visible data changed, updating chart state');
      lastVisibleDataRef.current = visibleDataHash;
      setChartState((prev) => ({ ...prev, visibleData }));
    } else {
      console.log('Visible data unchanged, skipping update');
    }
  }, [chartState.rawData, chartState.viewStart, chartState.viewEnd]);

  // Create chart when visible data changes
  useEffect(() => {
    if (chartState.visibleData.length > 0 && !chartState.isCreatingChart) {
      const now = Date.now();
      const timeSinceLastCreation = now - lastChartCreationRef.current;

      if (!chartState.chartExists || timeSinceLastCreation >= CHART_CREATION_DEBOUNCE) {
        createChart();
      }
    }
  }, [chartState.visibleData, chartState.chartExists, chartState.isCreatingChart, createChart]);

  // Load more data when needed (throttled)
  useEffect(() => {
    if (chartState.rawData.length > 0 && chartState.hasMoreData && !chartState.isDataLoading) {
      const timeoutId = setTimeout(() => {
        loadMoreData();
      }, 500); // Throttle data loading

      return () => clearTimeout(timeoutId);
    }
    return undefined;
  }, [
    chartState.rawData.length,
    chartState.viewStart,
    chartState.viewEnd,
    chartState.hasMoreData,
    chartState.isDataLoading,
    loadMoreData,
  ]);

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="bg-card rounded-lg border border-border h-full flex flex-col">
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <h2 className="text-lg font-semibold">Stock Chart</h2>
            <div className="flex items-center space-x-2">
              <span className="text-sm text-muted-foreground">Symbol:</span>
              <span className="font-mono text-sm">{symbol}</span>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => createChart()}
              className="p-2 text-muted-foreground hover:text-foreground"
              title="Refresh chart"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 relative">
        <svg ref={svgRef} className="w-full h-full" style={{ minHeight: '400px' }} />

        {chartState.isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80">
            <div className="text-sm text-muted-foreground">Loading chart...</div>
          </div>
        )}
      </div>

      <div className="p-4 border-t border-border">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center space-x-4">
            <span>Data points: {chartState.rawData.length}</span>
            <span>Visible: {chartState.visibleData.length}</span>
            <span>
              View: {chartState.viewStart}-{chartState.viewEnd}
            </span>
          </div>
          <div className="flex items-center space-x-4">
            <span>Zoom: {chartState.zoomLevel.toFixed(2)}x</span>
            <span>
              Pan: {chartState.panOffset.x.toFixed(0)}, {chartState.panOffset.y.toFixed(0)}
            </span>
            <span>{chartState.isLive ? 'Live' : 'Historical'}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default D3StockChart;
