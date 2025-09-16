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

// ============================================================================
// CONFIGURATION CONSTANTS - Modify these to adjust chart behavior
// ============================================================================
const CHART_DATA_POINTS = 80; // Number of data points to display on chart
const PAN_BUFFER_SIZE = 20; // Buffer size for predictive loading (load more data when within this many points of edge)
// ============================================================================

const D3StockChart: React.FC<D3StockChartProps> = ({ symbol, onSymbolChange }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [timeframe, setTimeframe] = useState<ChartTimeframe | null>(null);
  const chartType: ChartType = 'candlestick'; // Always use candlestick
  const [isLive, setIsLive] = useState(false);
  const [hoverData, setHoverData] = useState<HoverData | null>(null);
  const [isZooming, setIsZooming] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });

  // Panning and predictive loading state
  const [currentViewStart, setCurrentViewStart] = useState(0);
  const [currentViewEnd, setCurrentViewEnd] = useState(0);
  const [isLoadingMoreData, setIsLoadingMoreData] = useState(false);
  const [lastPanTime, setLastPanTime] = useState(0);
  const [dataPanOffset, setDataPanOffset] = useState(0); // Offset within the 80-point window
  const panTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const chartRecreateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Chart dimensions
  const [dimensions, setDimensions] = useState<ChartDimensions>({
    width: 800,
    height: 400,
    margin: { top: 20, right: 30, bottom: 40, left: 60 },
  });

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
    enableViewBasedLoading: false,
    onDataLoaded: () => {},
    onError: () => {},
  });

  // WebSocket for real-time data
  const chartWebSocket = useChartWebSocket({
    symbol,
    onChartData: chartDataHook.updateChartWithLiveData,
  });

  // Load saved timeframe from localStorage
  useEffect(() => {
    try {
      const savedTimeframe = getLocalStorageItem<ChartTimeframe>('chartTimeframe', '1h');
      setTimeframe(savedTimeframe);
    } catch (error) {
      console.warn('Failed to load chart timeframe from localStorage:', error);
      setTimeframe('1h');
    }
  }, []);

  // Save timeframe to localStorage
  useEffect(() => {
    if (timeframe !== null) {
      try {
        setLocalStorageItem('chartTimeframe', timeframe);
      } catch (error) {
        console.warn('Failed to save chart timeframe to localStorage:', error);
      }
    }
  }, [timeframe]);

  // Load chart data when symbol or timeframe changes
  useEffect(() => {
    if (timeframe !== null) {
      chartDataHook.loadChartData(symbol, timeframe);
    }
  }, [symbol, timeframe]);

  // Subscribe to WebSocket when live mode is enabled
  useEffect(() => {
    if (isLive) {
      chartWebSocket.subscribeToChartData();
    } else {
      chartWebSocket.unsubscribeFromChartData();
    }
  }, [isLive]);

  // Handle container resize
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setDimensions((prev) => ({
          ...prev,
          width: rect.width,
          height: Math.max(400, rect.height - 100),
        }));
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Update view bounds when data changes - always maintain 80-point view
  useEffect(() => {
    if (chartDataHook.chartData.length > 0) {
      const dataLength = chartDataHook.chartData.length;

      // Always show exactly CHART_DATA_POINTS (80) or all data if less than 80
      const viewSize = Math.min(CHART_DATA_POINTS, dataLength);

      // Always start from the most recent data (rightmost)
      const newViewStart = Math.max(0, dataLength - viewSize);
      const newViewEnd = dataLength - 1;

      console.log('Updating view bounds:', {
        dataLength,
        viewSize,
        newViewStart,
        newViewEnd,
        currentViewStart,
        currentViewEnd,
      });

      setCurrentViewStart(newViewStart);
      setCurrentViewEnd(newViewEnd);
    }
  }, [chartDataHook.chartData.length]);

  // Predictive data loading based on pan position
  const checkAndLoadData = useCallback(async () => {
    if (!symbol || !timeframe || isLoadingMoreData) return;

    const dataLength = chartDataHook.chartData.length;
    const bufferSize = PAN_BUFFER_SIZE; // Load more data when within buffer size of edge

    // Only load historical data to the left - use WebSocket for new data on the right
    // Add additional checks to prevent infinite loading
    if (currentViewStart <= bufferSize && dataLength < 500 && !chartDataHook.isLeftLoading) {
      console.log('Loading more historical data on the left...', {
        currentViewStart,
        bufferSize,
        dataLength,
        isLoadingMoreData,
        isLeftLoading: chartDataHook.isLeftLoading,
      });
      setIsLoadingMoreData(true);
      try {
        await chartDataHook.loadMoreDataLeft(symbol, timeframe);
      } catch (error) {
        console.error('Failed to load more historical data on the left:', error);
      } finally {
        setIsLoadingMoreData(false);
      }
    }

    // For right side, we rely on WebSocket for real-time data
    // No need to load more historical data to the right
  }, [symbol, timeframe, currentViewStart, chartDataHook, isLoadingMoreData]);

  // Debounced data loading to prevent excessive API calls
  const debouncedDataLoad = useCallback(() => {
    if (panTimeoutRef.current) {
      clearTimeout(panTimeoutRef.current);
    }

    panTimeoutRef.current = setTimeout(() => {
      checkAndLoadData();
    }, 300); // 300ms debounce
  }, [checkAndLoadData]);

  // Check for data loading when view bounds change
  // Temporarily disabled to focus on panning
  // useEffect(() => {
  //   debouncedDataLoad();
  //
  //   return () => {
  //     if (panTimeoutRef.current) {
  //       clearTimeout(panTimeoutRef.current);
  //     }
  //   };
  // }, [currentViewStart, currentViewEnd, debouncedDataLoad]);

  // Auto-enable live mode when user pans to the rightmost edge
  const [isAtRightEdge, setIsAtRightEdge] = useState(false);

  useEffect(() => {
    const dataLength = chartDataHook.chartData.length;
    const atRightEdge = currentViewEnd >= dataLength - 5; // Within 5 points of the end
    setIsAtRightEdge(atRightEdge);

    if (atRightEdge && !isLive) {
      console.log('User reached right edge - enabling live mode for real-time data');
      setIsLive(true);
    } else if (!atRightEdge && isLive) {
      console.log('User moved away from right edge - disabling live mode');
      setIsLive(false);
    }
  }, [currentViewEnd, chartDataHook.chartData.length, isLive]);

  // Keyboard shortcuts for panning
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return; // Don't handle keyboard shortcuts when typing in inputs
      }

      switch (event.key) {
        case 'ArrowLeft':
          event.preventDefault();
          // Pan left by adjusting the transform
          if (svgRef.current) {
            const svg = d3.select(svgRef.current);
            const currentTransform = d3.zoomTransform(svg.node() as Element);
            const newTransform = currentTransform.translate(50, 0);
            svg
              .transition()
              .duration(200)
              .call(d3.zoom<SVGSVGElement, unknown>().transform, newTransform);
          }
          break;
        case 'ArrowRight':
          event.preventDefault();
          // Pan right by adjusting the transform
          if (svgRef.current) {
            const svg = d3.select(svgRef.current);
            const currentTransform = d3.zoomTransform(svg.node() as Element);
            const newTransform = currentTransform.translate(-50, 0);
            svg
              .transition()
              .duration(200)
              .call(d3.zoom<SVGSVGElement, unknown>().transform, newTransform);
          }
          break;
        case 'Home':
          event.preventDefault();
          // Reset to beginning
          if (svgRef.current) {
            const svg = d3.select(svgRef.current);
            svg
              .transition()
              .duration(500)
              .call(d3.zoom<SVGSVGElement, unknown>().transform, d3.zoomIdentity);
          }
          break;
        case 'End':
          event.preventDefault();
          // Go to end
          if (svgRef.current) {
            const svg = d3.select(svgRef.current);
            const dataLength = chartDataHook.chartData.length;
            const endTransform = d3.zoomIdentity.translate(
              -(dataLength - CHART_DATA_POINTS) * 8,
              0
            );
            svg
              .transition()
              .duration(500)
              .call(d3.zoom<SVGSVGElement, unknown>().transform, endTransform);
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [chartDataHook.chartData.length]);

  // Create D3 chart
  const createChart = useCallback(() => {
    if (!svgRef.current || chartDataHook.chartData.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove(); // Clear previous chart

    const { width, height, margin } = dimensions;
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    // Sort data by time
    const sortedData = [...chartDataHook.chartData].sort(
      (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
    );

    // Get only the visible data points (80 points or all if less)
    // Show 80 points starting from the pan offset
    const viewSize = Math.min(CHART_DATA_POINTS, sortedData.length);
    const startIndex = Math.max(0, sortedData.length - viewSize - dataPanOffset);
    const endIndex = Math.min(sortedData.length - 1, startIndex + viewSize - 1);
    const visibleData = sortedData.slice(startIndex, endIndex + 1);

    console.log('Creating chart with visible data:', {
      totalData: sortedData.length,
      visibleData: visibleData.length,
      viewSize,
      dataPanOffset,
      startIndex,
      endIndex,
    });

    // Create scales - use linear scale to remove gaps
    const xScale = d3
      .scaleLinear()
      .domain([0, visibleData.length - 1])
      .range([0, innerWidth]);

    const yScale = d3
      .scaleLinear()
      .domain([
        d3.min(visibleData, (d) => d.low) as number,
        d3.max(visibleData, (d) => d.high) as number,
      ])
      .nice()
      .range([innerHeight, 0]);

    // Create main group
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    // Add zoom behavior
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.5, 10])
      .on('start', () => {
        setIsZooming(true);
        setIsPanning(true);
      })
      .on('zoom', (event) => {
        const { transform } = event;
        setZoomLevel(transform.k);
        setPanOffset({ x: transform.x, y: transform.y });

        // Update scales
        const newXScale = transform.rescaleX(xScale);
        const newYScale = transform.rescaleY(yScale);

        // Calculate pan offset based on transform
        const totalDataLength = chartDataHook.chartData.length;
        const visibleWidth = innerWidth / transform.k;

        // Direct calculation: when dragging right (panning left), transform.x is positive
        // We want to show older data (higher offset) when panning left
        // Use a smaller divisor to make panning feel more natural and less sensitive
        const newDataPanOffset = Math.max(0, Math.floor(transform.x / 8));

        // Don't update state during panning - only update the visual elements directly
        // This prevents the throttled feeling and makes panning completely smooth

        // Update view bounds for predictive loading
        const viewStartIndex = Math.max(0, Math.floor(transform.x / 8));
        const viewEndIndex = Math.min(
          totalDataLength - 1,
          Math.ceil(transform.x / 8 + visibleWidth / 8)
        );
        setCurrentViewStart(viewStartIndex);
        setCurrentViewEnd(viewEndIndex);

        // Update axes in real-time
        g.select('.x-axis').call(d3.axisBottom(newXScale) as any);
        g.select('.y-axis').call(d3.axisRight(newYScale) as any);

        // Update grid lines in real-time
        g.select('.grid-x').call(
          d3
            .axisBottom(newXScale)
            .tickSize(-innerHeight)
            .tickFormat(() => '') as any
        );
        g.select('.grid-y').call(
          d3
            .axisRight(newYScale)
            .tickSize(-innerWidth)
            .tickFormat(() => '') as any
        );

        // Update chart elements in real-time without triggering state changes
        // Calculate visible data directly here to avoid state updates during panning
        const sortedData = [...chartDataHook.chartData].sort(
          (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
        );
        const viewSize = Math.min(CHART_DATA_POINTS, sortedData.length);
        const dataStartIndex = Math.max(0, sortedData.length - viewSize - newDataPanOffset);
        const dataEndIndex = Math.min(sortedData.length - 1, dataStartIndex + viewSize - 1);
        const currentVisibleData = sortedData.slice(dataStartIndex, dataEndIndex + 1);

        updateChartElements(g, currentVisibleData, newXScale, newYScale);

        // Update crosshair position if hovering
        const crosshair = g.select('.crosshair');
        const crosshairX = crosshair.select('.crosshair-x');
        const crosshairY = crosshair.select('.crosshair-y');

        // Check if crosshair elements exist and are visible
        if (!crosshairX.empty() && !crosshairY.empty() && crosshairX.style('opacity') !== '0') {
          // Update crosshair with new scales
          const mouseX = d3.pointer(event.sourceEvent, svg.node())[0] - margin.left;
          const mouseIndex = newXScale.invert(mouseX);
          const index = Math.round(mouseIndex);
          const clampedIndex = Math.max(0, Math.min(index, currentVisibleData.length - 1));
          const d = currentVisibleData[clampedIndex];

          if (d) {
            crosshairX.attr('x1', newXScale(clampedIndex)).attr('x2', newXScale(clampedIndex));
            crosshairY.attr('y1', newYScale(d.close)).attr('y2', newYScale(d.close));
          }
        }
      })
      .on('end', () => {
        setIsZooming(false);
        setIsPanning(false);

        // Update the dataPanOffset state only when panning ends
        // This ensures smooth panning without state updates during drag
        const finalTransform = d3.zoomTransform(svg.node() as Element);
        const finalDataPanOffset = Math.max(0, Math.floor(finalTransform.x / 8));
        setDataPanOffset(finalDataPanOffset);
      });

    svg.call(zoom);

    // Add axes
    g.append('g')
      .attr('class', 'x-axis')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(
        d3.axisBottom(xScale).tickFormat((d) => {
          const index = Math.round(d as number);
          if (index >= 0 && index < visibleData.length) {
            const date = new Date(visibleData[index].time);
            return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
          }
          return '';
        })
      );

    g.append('g')
      .attr('class', 'y-axis')
      .attr('transform', `translate(${innerWidth},0)`)
      .call(d3.axisRight(yScale).tickFormat(d3.format('.2f')));

    // Add grid lines
    g.append('g')
      .attr('class', 'grid-x')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(
        d3
          .axisBottom(xScale)
          .tickSize(-innerHeight)
          .tickFormat(() => '')
      )
      .style('opacity', 0.3);

    g.append('g')
      .attr('class', 'grid-y')
      .attr('transform', `translate(${innerWidth},0)`)
      .call(
        d3
          .axisRight(yScale)
          .tickSize(-innerWidth)
          .tickFormat(() => '')
      )
      .style('opacity', 0.3);

    // Create chart elements
    updateChartElements(g, visibleData, xScale, yScale);

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
        setHoverData(null);
      })
      .on('mousemove', (event) => {
        const [mouseX, mouseY] = d3.pointer(event);
        const mouseIndex = xScale.invert(mouseX);

        // Find closest data point by index
        const index = Math.round(mouseIndex);
        // Calculate visible data directly using current transform
        const sortedData = [...chartDataHook.chartData].sort(
          (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
        );
        const viewSize = Math.min(CHART_DATA_POINTS, sortedData.length);

        // Get current pan offset from transform
        let currentPanOffset = dataPanOffset; // fallback to state
        if (svgRef.current) {
          const currentTransform = d3.zoomTransform(svgRef.current);
          currentPanOffset = Math.max(0, Math.floor(currentTransform.x / 8));
        }

        const hoverStartIndex = Math.max(0, sortedData.length - viewSize - currentPanOffset);
        const hoverEndIndex = Math.min(sortedData.length - 1, hoverStartIndex + viewSize - 1);
        const currentVisibleData = sortedData.slice(hoverStartIndex, hoverEndIndex + 1);
        const clampedIndex = Math.max(0, Math.min(index, currentVisibleData.length - 1));
        const d = currentVisibleData[clampedIndex];

        if (d) {
          // Update crosshair
          crosshair
            .select('.crosshair-x')
            .attr('x1', xScale(clampedIndex))
            .attr('x2', xScale(clampedIndex))
            .attr('y1', 0)
            .attr('y2', innerHeight);

          crosshair
            .select('.crosshair-y')
            .attr('x1', 0)
            .attr('x2', innerWidth)
            .attr('y1', yScale(d.close))
            .attr('y2', yScale(d.close));

          // Update hover data
          setHoverData({
            x: mouseX + margin.left,
            y: mouseY + margin.top,
            data: {
              time: d.time,
              open: d.open,
              high: d.high,
              low: d.low,
              close: d.close,
            },
          });
        }
      });
  }, [chartDataHook.chartData, dimensions, chartType]);

  // Update chart elements - always candlestick
  const updateChartElements = (
    g: d3.Selection<SVGGElement, unknown, null, undefined>,
    data: typeof chartDataHook.chartData,
    xScale: d3.ScaleLinear<number, number>,
    yScale: d3.ScaleLinear<number, number>
  ) => {
    // Clear previous chart elements
    g.selectAll('.chart-elements').remove();

    const chartGroup = g.append('g').attr('class', 'chart-elements');
    createCandlestickChart(chartGroup, data, xScale, yScale);
  };

  // Create candlestick chart
  const createCandlestickChart = (
    g: d3.Selection<SVGGElement, unknown, null, undefined>,
    data: typeof chartDataHook.chartData,
    xScale: d3.ScaleLinear<number, number>,
    yScale: d3.ScaleLinear<number, number>
  ) => {
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

  // Get current visible data based on current transform (not state)
  const getCurrentVisibleData = useCallback(() => {
    const sortedData = [...chartDataHook.chartData].sort(
      (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
    );

    const viewSize = Math.min(CHART_DATA_POINTS, sortedData.length);

    // Get current transform from the SVG element
    let currentPanOffset = dataPanOffset; // fallback to state
    if (svgRef.current) {
      const currentTransform = d3.zoomTransform(svgRef.current);
      currentPanOffset = Math.max(0, Math.floor(currentTransform.x / 8));
    }

    const startIndex = Math.max(0, sortedData.length - viewSize - currentPanOffset);
    const endIndex = Math.min(sortedData.length - 1, startIndex + viewSize - 1);

    const visibleData = sortedData.slice(startIndex, endIndex + 1);

    return visibleData;
  }, [chartDataHook.chartData, dataPanOffset]);

  // Only candlestick chart is supported - other chart types removed

  // Recreate chart when data or dimensions change (not on pan offset changes)
  useEffect(() => {
    // Clear any pending chart recreation
    if (chartRecreateTimeoutRef.current) {
      clearTimeout(chartRecreateTimeoutRef.current);
    }

    // Debounce chart recreation to prevent excessive updates
    chartRecreateTimeoutRef.current = setTimeout(() => {
      createChart();
    }, 100); // 100ms debounce

    return () => {
      if (chartRecreateTimeoutRef.current) {
        clearTimeout(chartRecreateTimeoutRef.current);
      }
    };
  }, [createChart]);

  // Chart type is always candlestick - no selection needed

  return (
    <div className="bg-card rounded-lg border border-border h-full flex flex-col">
      {/* Chart Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-4">
            <h3 className="text-lg font-semibold text-foreground">{symbol}</h3>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setIsLive(!isLive)}
                className={`flex items-center space-x-1 px-3 py-1 rounded-md text-sm transition-colors ${
                  isLive
                    ? 'bg-green-500 text-white'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                {isLive ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                {isLive ? 'Live' : 'Paused'}
              </button>
              <button
                onClick={() => timeframe && chartDataHook.loadChartData(symbol, timeframe)}
                className="p-1 text-muted-foreground hover:text-foreground"
                title="Refresh data"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
              <button
                onClick={() => {
                  setZoomLevel(1);
                  setPanOffset({ x: 0, y: 0 });
                  createChart();
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
                onClick={() => setTimeframe(tf.value)}
                className={`px-3 py-1 text-xs rounded-md transition-colors ${
                  timeframe === tf.value
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
                disabled={timeframe === null}
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
        {chartDataHook.isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted-foreground">Loading chart data...</p>
            </div>
          </div>
        ) : chartDataHook.error ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <p className="text-destructive mb-4">{chartDataHook.error}</p>
              <button
                onClick={() => timeframe && chartDataHook.loadChartData(symbol, timeframe)}
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
              {hoverData?.data ? (
                <div className="flex justify-between items-center w-full">
                  <span className="font-bold text-foreground text-lg">{symbol}</span>
                  <div className="flex gap-3 text-sm">
                    <span className="text-muted-foreground">
                      O:{' '}
                      <span className="font-mono text-foreground">
                        {hoverData.data.open.toFixed(2)}
                      </span>
                    </span>
                    <span className="text-muted-foreground">
                      H:{' '}
                      <span className="font-mono text-foreground">
                        {hoverData.data.high.toFixed(2)}
                      </span>
                    </span>
                    <span className="text-muted-foreground">
                      L:{' '}
                      <span className="font-mono text-foreground">
                        {hoverData.data.low.toFixed(2)}
                      </span>
                    </span>
                    <span className="text-muted-foreground">
                      C:{' '}
                      <span className="font-mono text-foreground">
                        {hoverData.data.close.toFixed(2)}
                      </span>
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex justify-between items-center">
                  <span className="font-bold text-foreground text-lg">{symbol}</span>
                  <span className="text-sm text-muted-foreground">
                    {timeframe || 'Loading...'} • {chartDataHook.chartData.length} points
                  </span>
                </div>
              )}
            </div>

            <div ref={containerRef} className="w-full h-full">
              <svg
                ref={svgRef}
                width={dimensions.width}
                height={dimensions.height}
                className="w-full h-full"
                style={{ cursor: isZooming ? 'grabbing' : 'grab' }}
              />
            </div>

            {/* Tooltip */}
            {hoverData && (
              <div
                className="absolute bg-background border border-border rounded-lg p-2 shadow-lg pointer-events-none z-10"
                style={{
                  left: Math.min(hoverData.x + 10, dimensions.width - 200),
                  top: Math.max(hoverData.y - 10, 10),
                }}
              >
                <div className="text-sm">
                  <div className="font-semibold">
                    {new Date(hoverData.data!.time).toLocaleString()}
                  </div>
                  <div className="text-muted-foreground">
                    {hoverData.data!.open.toFixed(2)} / {hoverData.data!.high.toFixed(2)} /{' '}
                    {hoverData.data!.low.toFixed(2)} / {hoverData.data!.close.toFixed(2)}
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
            <span>Total data: {chartDataHook.chartData.length}</span>
            <span>Displaying: {CHART_DATA_POINTS} points</span>
            <span>
              View: {currentViewStart}-{currentViewEnd}
            </span>
            <span>Interval: {timeframe || 'Loading...'}</span>
            <span>Zoom: {zoomLevel.toFixed(2)}x</span>
            <span>
              Pan: {panOffset.x.toFixed(0)}, {panOffset.y.toFixed(0)}
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <div
              className={`w-2 h-2 rounded-full ${isLive ? 'bg-green-500' : 'bg-gray-500'}`}
            ></div>
            <span>{isLive ? 'Live data (auto-enabled)' : 'Historical data'}</span>
            {isAtRightEdge && !isLive && (
              <div className="flex items-center space-x-1">
                <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
                <span className="text-xs text-yellow-500">Live mode will activate</span>
              </div>
            )}
            {isLoadingMoreData && (
              <div className="flex items-center space-x-1">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                <span className="text-xs text-blue-500">Loading historical data...</span>
              </div>
            )}
            <span className="text-xs text-muted-foreground">(D3.js powered)</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default D3StockChart;
