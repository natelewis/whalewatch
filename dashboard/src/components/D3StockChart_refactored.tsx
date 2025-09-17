import React, { useEffect, useRef, useCallback, useMemo } from 'react';
import * as d3 from 'd3';
import { ChartTimeframe, ChartType, DEFAULT_CHART_DATA_POINTS } from '../types';
import { getLocalStorageItem, setLocalStorageItem } from '../utils/localStorage';
import { useChartData } from '../hooks/useChartData';
import { useChartWebSocket } from '../hooks/useChartWebSocket';
import { useChartState, ChartDataPoint } from '../hooks/useChartState';
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

// ============================================================================
// CONFIGURATION CONSTANTS
// ============================================================================
const CHART_DATA_POINTS = 80; // Number of data points to display on chart
const PAN_BUFFER_SIZE = 20; // Buffer size for predictive loading

const D3StockChart: React.FC<D3StockChartProps> = ({ symbol, onSymbolChange }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const chartType: ChartType = 'candlestick'; // Always use candlestick

  // Initialize chart state
  const { state, actions } = useChartState(symbol, null);

  // Define timeframes array
  const timeframes: TimeframeConfig[] = useMemo(
    () => [
      { value: '1m', label: '1m', dataPoints: DEFAULT_CHART_DATA_POINTS },
      { value: '5m', label: '5m', dataPoints: DEFAULT_CHART_DATA_POINTS },
      { value: '30m', label: '30m', dataPoints: DEFAULT_CHART_DATA_POINTS },
      { value: '1h', label: '1h', dataPoints: DEFAULT_CHART_DATA_POINTS },
      { value: '2h', label: '2h', dataPoints: DEFAULT_CHART_DATA_POINTS },
      { value: '4h', label: '4h', dataPoints: DEFAULT_CHART_DATA_POINTS },
      { value: '1d', label: '1d', dataPoints: DEFAULT_CHART_DATA_POINTS },
      { value: '1w', label: '1w', dataPoints: DEFAULT_CHART_DATA_POINTS },
      { value: '1M', label: '1M', dataPoints: DEFAULT_CHART_DATA_POINTS },
    ],
    []
  );

  // Chart data management
  const chartDataHook = useChartData({
    timeframes,
    bufferPoints: 100,
    onDataLoaded: () => {
      // Data loaded callback
    },
  });

  // WebSocket for real-time data
  const chartWebSocket = useChartWebSocket({
    symbol,
  });

  // Load saved timeframe from localStorage
  useEffect(() => {
    try {
      const savedTimeframe = getLocalStorageItem<ChartTimeframe>('chartTimeframe', '1h');
      actions.setTimeframe(savedTimeframe);
    } catch (error) {
      console.warn('Failed to load chart timeframe from localStorage:', error);
      actions.setTimeframe('1h');
    }
  }, [actions]);

  // Save timeframe to localStorage
  useEffect(() => {
    if (state.timeframe !== null) {
      try {
        setLocalStorageItem('chartTimeframe', state.timeframe);
      } catch (error) {
        console.warn('Failed to save chart timeframe to localStorage:', error);
      }
    }
  }, [state.timeframe]);

  // Load chart data when symbol or timeframe changes
  useEffect(() => {
    if (state.timeframe !== null) {
      actions.setData([]); // Clear existing data
      actions.setError(null);
      actions.setIsLoading(true);
      chartDataHook.loadChartData(symbol, state.timeframe);
    }
  }, [symbol, state.timeframe, actions, chartDataHook]);

  // Update chart state when data changes
  useEffect(() => {
    if (chartDataHook.chartData.length > 0) {
      const chartData: ChartDataPoint[] = chartDataHook.chartData.map(d => ({
        time: d.time,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
      }));
      
      actions.setData(chartData);
      actions.setIsLoading(false);
      actions.setError(null);
    }
  }, [chartDataHook.chartData, actions]);

  // Handle loading and error states
  useEffect(() => {
    actions.setIsLoading(chartDataHook.isLoading);
    if (chartDataHook.error) {
      actions.setError(chartDataHook.error);
    }
  }, [chartDataHook.isLoading, chartDataHook.error, actions]);

  // Subscribe to WebSocket when live mode is enabled
  useEffect(() => {
    if (state.isLive) {
      chartWebSocket.subscribeToChartData();
    } else {
      chartWebSocket.unsubscribeFromChartData();
    }
  }, [state.isLive, chartWebSocket]);

  // Handle container resize
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        actions.setDimensions({
          width: rect.width,
          height: Math.max(400, rect.height - 100),
          margin: { top: 20, right: 30, bottom: 40, left: 60 },
        });
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [actions]);

  // Create D3 chart - now purely reactive based on state
  const createChart = useCallback(() => {
    if (!svgRef.current || state.sortedData.length === 0) {
return;
}

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove(); // Clear previous chart

    const { width, height, margin } = state.dimensions;
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    // Get scales from state
    const xScale = actions.getXScale();
    const yScale = actions.getYScale();
    const transformedXScale = actions.getTransformedXScale();
    const transformedYScale = actions.getTransformedYScale();

    // Create main group
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    // Add a clip-path to prevent drawing outside the chart area
    svg
      .append('defs')
      .append('clipPath')
      .attr('id', 'clip')
      .append('rect')
      .attr('width', innerWidth)
      .attr('height', innerHeight);

    const chartContent = g.append('g').attr('class', 'chart-content').attr('clip-path', 'url(#clip)');

    // Create chart elements using visible data from state
    createCandlestickChart(chartContent, state.viewport.visibleData, transformedXScale, transformedYScale);

    // Create zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.5, 10]);

    const handleZoomStart = () => {
      actions.setIsZooming(true);
      actions.setIsPanning(true);
    };

    const handleZoom = (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
      const { transform } = event;
      
      // Update transform in state
      actions.setTransform({
        x: transform.x,
        y: transform.y,
        k: transform.k,
      });

      // Transform the chart content
      chartContent.attr('transform', transform.toString());

      // Update axes with transformed scales
      g.select<SVGGElement>('.x-axis').call(
        d3.axisBottom(transformedXScale).tickFormat((d) => {
          const index = Math.round(d as number);
          if (index >= 0 && index < state.sortedData.length) {
            const date = new Date(state.sortedData[index].time);
            return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
          }
          return '';
        })
      );
      
      g.select<SVGGElement>('.y-axis').call(
        d3.axisRight(transformedYScale).tickFormat(d3.format('.2f'))
      );

      // Update grid lines
      g.select<SVGGElement>('.grid-x').call(
        d3
          .axisBottom(transformedXScale)
          .tickSize(-innerHeight)
          .tickFormat(() => '')
      );
      
      g.select<SVGGElement>('.grid-y').call(
        d3
          .axisRight(transformedYScale)
          .tickSize(-innerWidth)
          .tickFormat(() => '')
      );
    };

    const handleZoomEnd = () => {
      actions.setIsZooming(false);
      actions.setIsPanning(false);
    };

    zoom.on('start', handleZoomStart).on('zoom', handleZoom).on('end', handleZoomEnd);
    svg.call(zoom);

    // Apply current transform from state
    const currentTransform = d3.zoomIdentity
      .translate(state.transform.x, state.transform.y)
      .scale(state.transform.k);
    svg.call(zoom.transform, currentTransform);

    // Add axes
    g.append('g')
      .attr('class', 'x-axis')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(
        d3.axisBottom(transformedXScale).tickFormat((d) => {
          const index = Math.round(d as number);
          if (index >= 0 && index < state.viewport.visibleData.length) {
            const date = new Date(state.viewport.visibleData[index].time);
            return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
          }
          return '';
        })
      );

    g.append('g')
      .attr('class', 'y-axis')
      .attr('transform', `translate(${innerWidth},0)`)
      .call(d3.axisRight(transformedYScale).tickFormat(d3.format('.2f')));

    // Add grid lines
    g.append('g')
      .attr('class', 'grid-x')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(
        d3
          .axisBottom(transformedXScale)
          .tickSize(-innerHeight)
          .tickFormat(() => '')
      )
      .style('opacity', 0.3);

    g.append('g')
      .attr('class', 'grid-y')
      .attr('transform', `translate(${innerWidth},0)`)
      .call(
        d3
          .axisRight(transformedYScale)
          .tickSize(-innerWidth)
          .tickFormat(() => '')
      )
      .style('opacity', 0.3);

    // Add crosshair
    const crosshair = g.append('g').attr('class', 'crosshair').style('pointer-events', 'none');

    crosshair
      .append('line')
      .attr('class', 'crosshair-x')
      .attr('stroke', '#666')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '3,3')
      .style('opacity', 0);

    crosshair
      .append('line')
      .attr('class', 'crosshair-y')
      .attr('stroke', '#666')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '3,3')
      .style('opacity', 0);

    // Add hover behavior
    g.append('rect')
      .attr('class', 'overlay')
      .attr('width', innerWidth)
      .attr('height', innerHeight)
      .style('fill', 'none')
      .style('pointer-events', 'all')
      .on('mouseover', () => {
        crosshair.select('.crosshair-x').style('opacity', 1);
        crosshair.select('.crosshair-y').style('opacity', 1);
      })
      .on('mouseout', () => {
        crosshair.select('.crosshair-x').style('opacity', 0);
        crosshair.select('.crosshair-y').style('opacity', 0);
        actions.setHoverData(null);
      })
      .on('mousemove', (event) => {
        const [mouseX, mouseY] = d3.pointer(event);
        const mouseIndex = transformedXScale.invert(mouseX);

        // Find closest data point by index
        const index = Math.round(mouseIndex);
        const clampedIndex = Math.max(0, Math.min(index, state.viewport.visibleData.length - 1));
        const d = state.viewport.visibleData[clampedIndex];

        if (d) {
          // Update crosshair
          crosshair
            .select('.crosshair-x')
            .attr('x1', transformedXScale(clampedIndex))
            .attr('x2', transformedXScale(clampedIndex))
            .attr('y1', 0)
            .attr('y2', innerHeight);

          crosshair
            .select('.crosshair-y')
            .attr('x1', 0)
            .attr('x2', innerWidth)
            .attr('y1', transformedYScale(d.close))
            .attr('y2', transformedYScale(d.close));

          // Update hover data in state
          actions.setHoverData({
            x: mouseX + margin.left,
            y: mouseY + margin.top,
            data: d,
          });
        }
      });
  }, [
    state.sortedData,
    state.dimensions,
    state.transform,
    state.viewport.visibleData,
    actions,
  ]);

  // Create candlestick chart
  const createCandlestickChart = (
    g: d3.Selection<SVGGElement, unknown, null, undefined>,
    data: ChartDataPoint[],
    xScale: d3.ScaleLinear<number, number>,
    yScale: d3.ScaleLinear<number, number>
  ) => {
    // Clear previous chart elements
    g.selectAll('*').remove();

    const candleWidth = Math.max(1, 4);

    data.forEach((d, index) => {
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
        .attr('height', Math.abs(yScale(d.close) - yScale(d.open)) || 1)
        .attr('fill', isUp ? color : 'none')
        .attr('stroke', color)
        .attr('stroke-width', 1);
    });
  };

  // Recreate chart when state changes
  useEffect(() => {
    createChart();
  }, [createChart]);

  // Keyboard shortcuts for panning
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return; // Don't handle keyboard shortcuts when typing in inputs
      }

      switch (event.key) {
        case 'ArrowLeft':
          event.preventDefault();
          actions.panBy(50, 0);
          break;
        case 'ArrowRight':
          event.preventDefault();
          actions.panBy(-50, 0);
          break;
        case 'Home':
          event.preventDefault();
          actions.resetTransform();
          break;
        case 'End':
          event.preventDefault();
          if (state.sortedData.length > 0) {
            const endIndex = state.sortedData.length - 1;
            actions.panToIndex(endIndex);
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [actions, state.sortedData.length]);

  // Auto-enable live mode when user pans to the rightmost edge
  useEffect(() => {
    if (state.sortedData.length > 0) {
      const atRightEdge = state.viewport.endIndex >= state.sortedData.length - 5;
      if (atRightEdge && !state.isLive) {
        actions.setIsLive(true);
      } else if (!atRightEdge && state.isLive) {
        actions.setIsLive(false);
      }
    }
  }, [state.viewport.endIndex, state.sortedData.length, state.isLive, actions]);

  return (
    <div className="bg-card rounded-lg border border-border h-full flex flex-col">
      {/* Chart Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-4">
            <h3 className="text-lg font-semibold text-foreground">{symbol}</h3>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => actions.setIsLive(!state.isLive)}
                className={`flex items-center space-x-1 px-3 py-1 rounded-md text-sm transition-colors ${
                  state.isLive
                    ? 'bg-green-500 text-white'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                {state.isLive ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                {state.isLive ? 'Live' : 'Paused'}
              </button>
              <button
                onClick={() => state.timeframe && chartDataHook.loadChartData(symbol, state.timeframe)}
                className="p-1 text-muted-foreground hover:text-foreground"
                title="Refresh data"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
              <button
                onClick={() => {
                  actions.resetTransform();
                }}
                className="p-1 text-muted-foreground hover:text-foreground"
                title="Reset zoom"
              >
                <SquareIcon className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button className="p-2 text-muted-foreground hover:text-foreground">
              <Settings className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center space-x-4">
          {/* Timeframe Selector */}
          <div className="flex space-x-1">
            {timeframes.map((tf) => (
              <button
                key={tf.value}
                onClick={() => actions.setTimeframe(tf.value)}
                className={`px-3 py-1 text-xs rounded-md transition-colors ${
                  state.timeframe === tf.value
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
                disabled={state.timeframe === null}
              >
                {tf.label}
              </button>
            ))}
          </div>

          {/* Chart Type - Always Candlestick */}
          <div className="flex items-center space-x-1 px-3 py-1 text-xs bg-primary text-primary-foreground rounded-md">
            <BarChart3 className="h-4 w-4" />
            <span>Candlestick</span>
          </div>
        </div>
      </div>

      {/* Chart Container */}
      <div className="flex-1 p-4">
        {state.isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted-foreground">Loading chart data...</p>
            </div>
          </div>
        ) : state.error ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <p className="text-destructive mb-4">{state.error}</p>
              <button
                onClick={() => state.timeframe && chartDataHook.loadChartData(symbol, state.timeframe)}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
              >
                Retry
              </button>
            </div>
          </div>
        ) : (
          <div className="w-full h-full relative" style={{ minHeight: '400px' }}>
            {/* Custom Title Component */}
            <div className="mb-4 px-2 h-12 flex items-center">
              {state.hoverData?.data ? (
                <div className="flex justify-between items-center w-full">
                  <span className="font-bold text-foreground text-lg">{symbol}</span>
                  <div className="flex gap-3 text-sm">
                    <span className="text-muted-foreground">
                      O:{' '}
                      <span className="font-mono text-foreground">
                        {state.hoverData.data.open.toFixed(2)}
                      </span>
                    </span>
                    <span className="text-muted-foreground">
                      H:{' '}
                      <span className="font-mono text-foreground">
                        {state.hoverData.data.high.toFixed(2)}
                      </span>
                    </span>
                    <span className="text-muted-foreground">
                      L:{' '}
                      <span className="font-mono text-foreground">
                        {state.hoverData.data.low.toFixed(2)}
                      </span>
                    </span>
                    <span className="text-muted-foreground">
                      C:{' '}
                      <span className="font-mono text-foreground">
                        {state.hoverData.data.close.toFixed(2)}
                      </span>
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex justify-between items-center">
                  <span className="font-bold text-foreground text-lg">{symbol}</span>
                  <span className="text-sm text-muted-foreground">
                    {state.timeframe || 'Loading...'} • {state.sortedData.length} points
                  </span>
                </div>
              )}
            </div>

            <div ref={containerRef} className="w-full h-full">
              <svg
                ref={svgRef}
                width={state.dimensions.width}
                height={state.dimensions.height}
                className="w-full h-full"
                style={{ cursor: state.isZooming ? 'grabbing' : 'grab' }}
              />
            </div>

            {/* Tooltip */}
            {state.hoverData && (
              <div
                className="absolute bg-background border border-border rounded-lg p-2 shadow-lg pointer-events-none z-10"
                style={{
                  left: Math.min(state.hoverData.x + 10, state.dimensions.width - 200),
                  top: Math.max(state.hoverData.y - 10, 10),
                }}
              >
                <div className="text-sm">
                  <div className="font-semibold">
                    {new Date(state.hoverData.data!.time).toLocaleString()}
                  </div>
                  <div className="text-muted-foreground">
                    {state.hoverData.data!.open.toFixed(2)} / {state.hoverData.data!.high.toFixed(2)} /{' '}
                    {state.hoverData.data!.low.toFixed(2)} / {state.hoverData.data!.close.toFixed(2)}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Chart Footer */}
      <div className="p-4 border-t border-border">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <div className="flex items-center space-x-4">
            <span>Total data: {state.sortedData.length}</span>
            <span>Displaying: {state.viewport.visibleData.length} points</span>
            <span>
              View: {state.viewport.startIndex}-{state.viewport.endIndex}
            </span>
            <span>Interval: {state.timeframe || 'Loading...'}</span>
            <span>Zoom: {state.transform.k.toFixed(2)}x</span>
            <span>
              Pan: {state.transform.x.toFixed(0)}, {state.transform.y.toFixed(0)}
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <div
              className={`w-2 h-2 rounded-full ${state.isLive ? 'bg-green-500' : 'bg-gray-500'}`}
            ></div>
            <span>{state.isLive ? 'Live data (auto-enabled)' : 'Historical data'}</span>
            <span className="text-xs text-muted-foreground">(D3.js powered)</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default D3StockChart;
