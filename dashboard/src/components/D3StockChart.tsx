import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import * as d3 from 'd3';
import { ChartTimeframe, DEFAULT_CHART_DATA_POINTS } from '../types';
import { getLocalStorageItem, setLocalStorageItem } from '../utils/localStorage';
import { ChartData, useChartData } from '../hooks/useChartData';
import { useChartWebSocket } from '../hooks/useChartWebSocket';
import { TimeframeConfig } from '../utils/chartDataUtils';
import { BarChart3, Settings, Play, Pause, RotateCcw, Square as SquareIcon } from 'lucide-react';

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
// ============================================================================

const useChartScales = ({
  visibleData,
  dimensions,
}: {
  visibleData: ChartData;
  dimensions: ChartDimensions;
}): {
  xScale: d3.ScaleLinear<number, number> | null;
  yScale: d3.ScaleLinear<number, number> | null;
} => {
  return useMemo(() => {
    if (!visibleData || visibleData.length === 0 || dimensions.width === 0) {
      return { xScale: null, yScale: null };
    }

    const { width, height, margin } = dimensions;
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

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
      .range([innerHeight, 0]);

    return { xScale, yScale };
  }, [visibleData, dimensions]);
};

// Create D3 chart
const createChart = ({
  svgElement,
  chartExists,
  allChartData,
  xScale,
  yScale,
  chartLoaded,
  visibleData,
  setChartExists,
  setChartContent,
  dimensions,
  currentViewStart,
  currentViewEnd,
  chartContent,
  setIsZooming,
  setIsPanning,
  setHasUserPanned,
  setCurrentViewStart,
  setCurrentViewEnd,
  checkAndLoadMoreData,
  setHoverData,
  setChartLoaded,
}: {
  svgElement: SVGSVGElement;
  chartExists: boolean;
  allChartData: ChartData;
  xScale: d3.ScaleLinear<number, number>;
  yScale: d3.ScaleLinear<number, number>;
  chartLoaded: boolean;
  visibleData: ChartData;
  setChartExists: (value: boolean) => void;
  setChartContent: (value: d3.Selection<SVGGElement, unknown, null, undefined> | null) => void;
  dimensions: ChartDimensions;
  currentViewStart: number;
  currentViewEnd: number;
  chartContent: d3.Selection<SVGGElement, unknown, null, undefined> | null;
  setIsZooming: (value: boolean) => void;
  setIsPanning: (value: boolean) => void;
  setHasUserPanned: (value: boolean) => void;
  setCurrentViewStart: (value: number) => void;
  setCurrentViewEnd: (value: number) => void;
  checkAndLoadMoreData: () => void;
  setHoverData: (value: HoverData | null) => void;
  setChartLoaded: (value: boolean) => void;
}): void => {
  if (
    chartExists ||
    !allChartData ||
    !Array.isArray(allChartData) ||
    allChartData.length === 0 ||
    !xScale ||
    !yScale ||
    chartLoaded ||
    !visibleData ||
    visibleData.length === 0
  ) {
    console.log('createChart: Early return conditions:', {
      chartExists,
      allChartDataLength: allChartData?.length || 0,
      allChartDataIsArray: Array.isArray(allChartData),
      hasXScale: !!xScale,
      hasYScale: !!yScale,
      chartLoaded,
      hasVisibleData: !!visibleData,
      visibleDataLength: visibleData?.length || 0,
    });
    return;
  }

  if (!svgElement) {
    return;
  }

  setChartExists(true);
  const svg = d3.select(svgElement);
  svg.selectAll('*').remove(); // Clear previous chart
  // gRef.current = null; // Reset the g ref when clearing the chart
  setChartContent(null); // Reset the chart content when clearing the chart

  const { width, height, margin } = dimensions;
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  // Sort data by time - always use current state
  const sortedData = [...allChartData].sort(
    (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
  );

  console.log('Creating chart with visible data:', {
    totalData: sortedData.length,
    visibleData: visibleData.length,
    visibleDataStart: visibleData[0]?.time,
    visibleDataEnd: visibleData[visibleData.length - 1]?.time,
    currentViewStart,
    currentViewEnd,
  });

  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`); // gRef.current;

  // Add a clip-path to prevent drawing outside the chart area
  svg
    .append('defs')
    .append('clipPath')
    .attr('id', 'clip')
    .append('rect')
    .attr('width', innerWidth)
    .attr('height', innerHeight);

  // Create chart content group (store in state for reuse)
  if (!chartContent) {
    const newChartContent = g
      .append('g')
      .attr('class', 'chart-content')
      .attr('clip-path', 'url(#clip)');
    setChartContent(newChartContent);
  }

  // Create axes in the main chart group
  const { width: chartWidth, height: chartHeight, margin: chartMargin } = dimensions;
  const chartInnerWidth = chartWidth - chartMargin.left - chartMargin.right;
  const chartInnerHeight = chartHeight - chartMargin.top - chartMargin.bottom;

  // Create X-axis
  const xAxis = g
    .append('g')
    .attr('class', 'x-axis')
    .attr('transform', `translate(0,${chartInnerHeight})`)
    .call(
      d3.axisBottom(xScale).tickFormat((d) => {
        const visibleIndex = Math.round(d as number);
        if (visibleIndex >= 0 && visibleIndex < visibleData.length) {
          const date = new Date(visibleData[visibleIndex].time);
          return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        }
        return '';
      })
    );

  // Create Y-axis
  const yAxis = g
    .append('g')
    .attr('class', 'y-axis')
    .attr('transform', `translate(${chartInnerWidth},0)`)
    .call(d3.axisRight(yScale).tickFormat(d3.format('.2f')));

  // Style the domain lines to be gray and remove end tick marks (nubs)
  xAxis.select('.domain').style('stroke', '#666').style('stroke-width', 1);
  yAxis.select('.domain').style('stroke', '#666').style('stroke-width', 1);

  // Style tick lines to be gray, keep labels white
  xAxis.selectAll('.tick line').style('stroke', '#666').style('stroke-width', 1);
  yAxis.selectAll('.tick line').style('stroke', '#666').style('stroke-width', 1);
  xAxis.selectAll('.tick text').style('font-size', '12px');
  yAxis.selectAll('.tick text').style('font-size', '12px');

  // Remove the tick marks at the very ends (nubs) by hiding the first and last ticks
  xAxis
    .selectAll('.tick')
    .filter((d, i, nodes) => {
      const totalTicks = nodes.length;
      return i === 0 || i === totalTicks - 1;
    })
    .style('display', 'none');

  yAxis
    .selectAll('.tick')
    .filter((d, i, nodes) => {
      const totalTicks = nodes.length;
      return i === 0 || i === totalTicks - 1;
    })
    .style('display', 'none');

  const zoom = d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.5, 10]);

  const handleZoomStart = (): void => {
    setIsZooming(true);
    setIsPanning(true);
    setHasUserPanned(true); // Mark that user has started panning
  };

  const handleZoom = (event: d3.D3ZoomEvent<SVGSVGElement, unknown>): void => {
    const { transform } = event;
    updateCurrentView({
      transform,
      sortedData,
      setCurrentViewStart,
      setCurrentViewEnd,
    });

    // Use the same scale logic as the initial state for consistent tick spacing
    // This ensures tick marks maintain the same spacing during panning
    const consistentXScale = d3
      .scaleLinear()
      .domain([0, visibleData.length - 1])
      .range([0, innerWidth]);

    // Y-axis: Use the visible data price range for consistent scaling
    const consistentYScale = d3
      .scaleLinear()
      .domain([
        d3.min(visibleData, (d) => d.low) as number,
        d3.max(visibleData, (d) => d.high) as number,
      ])
      .range([innerHeight, 0]);

    // Update axes using the same scale logic as initial rendering
    const xAxisGroup = g.select<SVGGElement>('.x-axis');
    if (!xAxisGroup.empty()) {
      // Update X-axis with consistent scaling and sliding transform
      xAxisGroup.attr('transform', `translate(${transform.x},${innerHeight})`).call(
        d3.axisBottom(consistentXScale).tickFormat((d) => {
          const visibleIndex = Math.round(d as number);
          if (visibleIndex >= 0 && visibleIndex < visibleData.length) {
            const date = new Date(visibleData[visibleIndex].time);
            return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
          }
          return '';
        })
      );
      // Keep the axis line (domain path) fixed by overriding its transform
      xAxisGroup.select('.domain').attr('transform', `translate(${-transform.x},0)`);
    }

    const yAxisGroup = g.select<SVGGElement>('.y-axis');
    if (!yAxisGroup.empty()) {
      yAxisGroup
        .attr('transform', `translate(${innerWidth},${transform.y})`)
        .call(d3.axisRight(consistentYScale).tickFormat(d3.format('.2f')));
      // Keep the axis line (domain path) fixed by overriding its transform
      yAxisGroup.select('.domain').attr('transform', `translate(0,${-transform.y})`);
    }

    // Use existing chart content or create new one
    if (!chartContent) {
      const newChartContent = g
        .append('g')
        .attr('class', 'chart-content')
        .attr('clip-path', 'url(#clip)');
      setChartContent(newChartContent);
    }

    // Check if we need to load more data (throttled)
    // const now = Date.now();
    // if (now - lastDataLoadCheckRef.current >= 100) {
    // Reduced throttling for panning
    checkAndLoadMoreData();
    // }
  };

  const handleZoomEnd = (): void => {
    setIsZooming(false);
    setIsPanning(false);
  };

  zoom.on('start', handleZoomStart).on('zoom', handleZoom).on('end', handleZoomEnd);
  svg.call(zoom);

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
      if (!xScale || !yScale) {
        return;
      }
      const [mouseX, mouseY] = d3.pointer(event);
      const mouseIndex = xScale.invert(mouseX);

      // Find closest data point by index
      const index = Math.round(mouseIndex);
      // Use the current view state to get visible data
      // const currentVisibleData = getVisibleData(currentViewStart, currentViewEnd);
      const currentVisibleData = visibleData;
      if (!currentVisibleData) {
        return;
      }
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

  setChartLoaded(true);
  console.log('🎯 CHART LOADED - Axes can now be created');
};

const updateCurrentView = ({
  transform,
  sortedData,
  setCurrentViewStart,
  setCurrentViewEnd,
}: {
  transform: d3.ZoomTransform;
  sortedData: ChartData;
  setCurrentViewStart: (value: number) => void;
  setCurrentViewEnd: (value: number) => void;
}): { newViewStart: number; newViewEnd: number } => {
  // Calculate the visible range using simple math based on pan offset
  const panOffsetPixels = Math.abs(transform.x);
  const bandWidth = innerWidth / CHART_DATA_POINTS;
  const panOffset = Math.floor(panOffsetPixels / bandWidth);
  const maxPanOffset = Math.max(0, sortedData.length - CHART_DATA_POINTS);
  const clampedPanOffset = Math.min(panOffset, maxPanOffset);
  const newViewStart = Math.max(0, sortedData.length - CHART_DATA_POINTS - clampedPanOffset);
  const newViewEnd = Math.min(sortedData.length - 1, newViewStart + CHART_DATA_POINTS - 1);

  setCurrentViewStart(newViewStart);
  setCurrentViewEnd(newViewEnd);

  return { newViewStart, newViewEnd };
};

const renderCandlestickChart = (
  g: d3.Selection<SVGGElement, unknown, null, undefined>,
  data: ChartData,
  xScale: d3.ScaleLinear<number, number> | null,
  yScale: d3.ScaleLinear<number, number> | null
): void => {
  if (!xScale || !yScale) {
    return;
  }

  // Clear previous chart elements
  g.selectAll('*').remove();

  const candleWidth = Math.max(1, 4);

  data.forEach((d, index) => {
    // Use the simple x scale directly
    const x = xScale(index);

    // Debug logging for first few candlesticks (removed to prevent spam)
    const isUp = d.close >= d.open;
    const color = isUp ? '#26a69a' : '#ef5350';

    // High-Low line
    g.append('line')
      .attr('x1', x)
      .attr('x2', x)
      .attr('y1', yScale(d.high))
      .attr('y2', yScale(d.low))
      .attr('stroke', color)
      .attr('stroke-width', 1);

    // Open-Close rectangle
    g.append('rect')
      .attr('x', x - candleWidth / 2)
      .attr('y', yScale(Math.max(d.open, d.close)))
      .attr('width', candleWidth)
      .attr('height', Math.abs(yScale(d.close) - yScale(d.open)) || 1)
      .attr('fill', isUp ? color : 'none')
      .attr('stroke', color)
      .attr('stroke-width', 1);
  });
};

const getVisibleDataPoints = (
  startIndex: number,
  endIndex: number,
  chartData: ChartData
): ChartData => {
  // Always use the current state data
  const sortedData = [...chartData].sort(
    (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
  );

  // If no data, return empty array
  if (sortedData.length === 0) {
    console.log('getVisibleData: No data available');
    return [];
  }

  // If indices are not properly initialized (both 0), return the most recent data
  if (startIndex === 0 && endIndex === 0) {
    const fallbackStart = Math.max(0, sortedData.length - CHART_DATA_POINTS);
    const fallbackEnd = sortedData.length - 1;
    const fallbackData = sortedData.slice(fallbackStart, fallbackEnd + 1);

    console.log('getVisibleData: Indices not initialized, using most recent data', {
      totalData: sortedData.length,
      fallbackStart,
      fallbackEnd,
      fallbackDataLength: fallbackData.length,
    });

    return fallbackData;
  }

  // Handle edge cases more gracefully for panning
  // Allow negative start indices for historical data loading
  // Clamp indices to valid ranges instead of falling back
  const actualStartIndex = Math.max(0, Math.min(startIndex, sortedData.length - 1));
  const actualEndIndex = Math.max(actualStartIndex, Math.min(endIndex, sortedData.length - 1));

  // If we have a valid range, use it
  if (actualStartIndex <= actualEndIndex && actualEndIndex < sortedData.length) {
    const slicedData = sortedData.slice(actualStartIndex, actualEndIndex + 1);
    console.log('getVisibleData: Using requested range', {
      requestedIndices: { startIndex, endIndex },
      actualIndices: { actualStartIndex, actualEndIndex },
      slicedDataLength: slicedData.length,
    });
    return slicedData;
  }

  // If we're panning to historical data (negative start), try to get what we can
  if (startIndex < 0) {
    const availableStart = Math.max(0, sortedData.length + startIndex);
    const availableEnd = Math.min(sortedData.length - 1, availableStart + CHART_DATA_POINTS - 1);
    const historicalData = sortedData.slice(availableStart, availableEnd + 1);

    if (historicalData.length > 0) {
      console.log('getVisibleData: Using historical data for panning', {
        requestedStart: startIndex,
        actualStart: availableStart,
        actualEnd: availableEnd,
        dataLength: historicalData.length,
      });
      return historicalData;
    }
  }

  // Final fallback: return the most recent data
  const fallbackStart = Math.max(0, sortedData.length - CHART_DATA_POINTS);
  const fallbackEnd = sortedData.length - 1;
  const fallbackData = sortedData.slice(fallbackStart, fallbackEnd + 1);

  console.log('getVisibleData: Using fallback data', {
    requestedIndices: { startIndex, endIndex },
    actualIndices: { actualStartIndex, actualEndIndex },
    totalData: sortedData.length,
    fallbackStart,
    fallbackEnd,
    fallbackDataLength: fallbackData.length,
  });

  return fallbackData;
};

const D3StockChart: React.FC<D3StockChartProps> = ({ symbol }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [chartContent, setChartContent] = useState<d3.Selection<
    SVGGElement,
    unknown,
    null,
    undefined
  > | null>(null);
  const [timeframe, setTimeframe] = useState<ChartTimeframe | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [hoverData, setHoverData] = useState<HoverData | null>(null);
  const [isZooming, setIsZooming] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [chartLoaded, setChartLoaded] = useState(false);
  // const [xScale, setXScale] = useState<d3.ScaleLinear<number, number> | null>(null);
  // const [yScale, setYScale] = useState<d3.ScaleLinear<number, number> | null>(null);
  const [visibleData, setVisibleData] = useState<ChartData>([]);
  const [allChartData, setAllChartData] = useState<ChartData>([]);

  // Panning and predictive loading state
  const [currentViewStart, setCurrentViewStart] = useState(0);
  const [currentViewEnd, setCurrentViewEnd] = useState(0);
  const [isLoadingMoreData, setIsLoadingMoreData] = useState(false);
  const isInitialLoad = useRef(true);

  // Track loading attempts to prevent infinite loops
  const lastLoadAttemptRef = useRef<{ type: 'left' | 'right'; dataLength: number } | null>(null);

  // Track if we're currently loading data to preserve price range
  const isDataLoadingRef = useRef<boolean>(false);

  // Track if we're currently vertically panning to prevent data loading conflicts
  const isVerticallyPanningRef = useRef<boolean>(false);

  // Track if user has panned to enable data loading
  const [hasUserPanned, setHasUserPanned] = useState<boolean>(false);

  // Track last data loading check to prevent spam
  const lastDataLoadCheckRef = useRef<number>(0);
  const DATA_LOAD_CHECK_INTERVAL = 500; // Minimum 500ms between data load checks

  // Track last view indices to detect significant changes
  const lastViewIndicesRef = useRef<{ start: number; end: number } | null>(null);

  // Track if chart already exists to avoid unnecessary recreations
  const [chartExists, setChartExists] = useState<boolean>(false);

  // Chart dimensions
  const [dimensions, setDimensions] = useState<ChartDimensions>({
    width: 800,
    height: 400,
    margin: { top: 20, right: 30, bottom: 40, left: 60 },
  });

  const { xScale, yScale } = useChartScales({ visibleData, dimensions });

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
    bufferPoints: 100, // Increased buffer for more data preloading
    onDataLoaded: (data: ChartData) => {
      // Update all chart data whenever new data is loaded
      setAllChartData(data);
    },
  });

  // WebSocket for real-time data
  const chartWebSocket = useChartWebSocket({
    symbol,
  });

  // Update visible data when view changes
  useEffect(() => {
    if (allChartData.length > 0) {
      const newVisibleData = getVisibleDataPoints(currentViewStart, currentViewEnd, allChartData);
      console.log('Updating visible data:', {
        currentViewStart,
        currentViewEnd,
        allChartDataLength: allChartData.length,
        newVisibleDataLength: newVisibleData.length,
        newVisibleDataStart: newVisibleData[0]?.time,
        newVisibleDataEnd: newVisibleData[newVisibleData.length - 1]?.time,
      });
      setVisibleData(newVisibleData);
    }
  }, [currentViewStart, currentViewEnd, allChartData]);

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
      isInitialLoad.current = true; // Reset for new symbol/timeframe
      // setChartExists(false); // Reset chart existence for new symbol/timeframe
      setHasUserPanned(false); // Reset user panning state
      setChartLoaded(false); // Reset chart loaded state
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
    const handleResize = (): void => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setDimensions((prev) => {
          const newDims = {
            ...prev,
            width: rect.width,
            height: Math.max(400, rect.height - 100),
          };

          // DEBUG: Log dimension changes
          console.log('📐 DIMENSIONS DEBUG - Resize:', {
            containerRect: { width: rect.width, height: rect.height },
            previousDimensions: prev,
            newDimensions: newDims,
            changed: {
              widthChanged: Math.abs(prev.width - newDims.width) > 0.1,
              heightChanged: Math.abs(prev.height - newDims.height) > 0.1,
            },
          });

          return newDims;
        });
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Track previous data length to detect when new data is loaded
  const prevDataLengthRef = useRef<number>(0);

  // Set initial view to show newest data when data loads
  useEffect(() => {
    if (allChartData.length > 0) {
      const totalDataLength = allChartData.length;
      const prevDataLength = prevDataLengthRef.current;

      // If this is the first load, show newest data
      if (prevDataLength === 0) {
        const newEndIndex = totalDataLength - 1;
        const newStartIndex = Math.max(0, totalDataLength - CHART_DATA_POINTS);

        console.log('Initial load - setting view indices:', {
          totalDataLength,
          CHART_DATA_POINTS,
          newStartIndex,
          newEndIndex,
          rangeSize: newEndIndex - newStartIndex + 1,
        });

        setCurrentViewStart(newStartIndex);
        setCurrentViewEnd(newEndIndex);
        isInitialLoad.current = false; // Mark initial load as complete
        // setChartExists(false); // Reset chart existence for new data
      } else if (totalDataLength > prevDataLength) {
        // If data length increased (new data loaded), don't adjust view position
        // The view should only change during user interactions, not data loads
        console.log('New data loaded, but not adjusting view (user interaction only):', {
          totalDataLength,
          prevDataLength,
          dataAdded: totalDataLength - prevDataLength,
          currentViewStart,
          currentViewEnd,
          hasUserPanned,
        });

        // Reset loading attempt tracking
        lastLoadAttemptRef.current = null;
      }

      prevDataLengthRef.current = totalDataLength;
    }
  }, [allChartData.length]);

  // Check if we need to load more data when panning
  const checkAndLoadMoreData = useCallback(async (): Promise<void> => {
    if (
      !symbol ||
      !timeframe ||
      isLoadingMoreData ||
      isInitialLoad.current ||
      !hasUserPanned ||
      isVerticallyPanningRef.current ||
      isDataLoadingRef.current ||
      !chartExists
    ) {
      // console.log('checkAndLoadMoreData: Early return');
      return;
    }

    // Set data loading flag immediately to prevent concurrent calls
    isDataLoadingRef.current = true;

    const totalDataLength = allChartData.length;
    const bufferSize = 300; // Load more data when within 300 points of edge - very aggressive preloading

    let shouldLoadLeft = false;
    let shouldLoadRight = false;

    // Check if we need more historical data (panning left)
    if (currentViewStart <= bufferSize && !chartDataHook.isLeftLoading && totalDataLength > 0) {
      const lastAttempt = lastLoadAttemptRef.current;
      if (!(lastAttempt?.type === 'left' && lastAttempt.dataLength === totalDataLength)) {
        shouldLoadLeft = true;
      }
    }

    // Check if we need more recent data (panning right)
    if (
      currentViewEnd >= totalDataLength - bufferSize &&
      !chartDataHook.isRightLoading &&
      totalDataLength > 0
    ) {
      const lastAttempt = lastLoadAttemptRef.current;
      if (!(lastAttempt?.type === 'right' && lastAttempt.dataLength === totalDataLength)) {
        shouldLoadRight = true;
      }
    }

    // If no loading is needed, reset the flag and return
    if (!shouldLoadLeft && !shouldLoadRight) {
      isDataLoadingRef.current = false;
      return;
    }

    // Load data if needed
    try {
      if (shouldLoadLeft) {
        lastLoadAttemptRef.current = { type: 'left', dataLength: totalDataLength };
        setIsLoadingMoreData(true);
        await chartDataHook.loadMoreDataLeft(symbol, timeframe);
      }

      if (shouldLoadRight) {
        lastLoadAttemptRef.current = { type: 'right', dataLength: totalDataLength };
        setIsLoadingMoreData(true);
        await chartDataHook.loadMoreDataRight(symbol, timeframe);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setIsLoadingMoreData(false);
      isDataLoadingRef.current = false; // Reset data loading flag
    }
  }, [
    symbol,
    timeframe,
    currentViewStart,
    currentViewEnd,
    chartDataHook,
    isLoadingMoreData,
    isInitialLoad,
    hasUserPanned,
  ]);

  // Check for data loading when view changes (with throttling)
  useEffect(() => {
    if (allChartData.length > 0 && !isLoadingMoreData && !isInitialLoad.current && hasUserPanned) {
      const now = Date.now();
      const timeSinceLastCheck = now - lastDataLoadCheckRef.current;
      const lastViewIndices = lastViewIndicesRef.current;

      // Check if view indices have changed significantly (more than 5 points for more responsive loading)
      const hasSignificantChange =
        !lastViewIndices ||
        Math.abs(currentViewStart - lastViewIndices.start) > 5 ||
        Math.abs(currentViewEnd - lastViewIndices.end) > 5;

      // Reduce throttling during panning for more responsive data loading
      const throttlingInterval = isPanning
        ? DATA_LOAD_CHECK_INTERVAL / 2
        : DATA_LOAD_CHECK_INTERVAL;

      // Only check for data loading if enough time has passed, we're not already loading,
      // and there's a significant change
      if (
        timeSinceLastCheck >= throttlingInterval &&
        !isDataLoadingRef.current &&
        hasSignificantChange
      ) {
        lastDataLoadCheckRef.current = now;
        lastViewIndicesRef.current = { start: currentViewStart, end: currentViewEnd };
        checkAndLoadMoreData();
      }
    }
    return undefined;
  }, [
    currentViewStart,
    currentViewEnd,
    checkAndLoadMoreData,
    isLoadingMoreData,
    isInitialLoad,
    hasUserPanned,
    isPanning,
  ]);

  // Auto-enable live mode when user pans to the rightmost edge
  const [isAtRightEdge, setIsAtRightEdge] = useState(false);
  const lastRightEdgeCheckRef = useRef<number>(0);
  const RIGHT_EDGE_CHECK_INTERVAL = 1000; // Check every 1 second to prevent rapid toggling

  useEffect(() => {
    const dataLength = allChartData.length;
    const atRightEdge = currentViewEnd >= dataLength - 5; // Within 5 points of the end
    const now = Date.now();
    const timeSinceLastCheck = now - lastRightEdgeCheckRef.current;

    // Only check for right edge changes if enough time has passed
    if (timeSinceLastCheck >= RIGHT_EDGE_CHECK_INTERVAL) {
      lastRightEdgeCheckRef.current = now;
      setIsAtRightEdge(atRightEdge);

      if (atRightEdge && !isLive) {
        console.log('User reached right edge - enabling live mode for real-time data');
        setIsLive(true);
      } else if (!atRightEdge && isLive) {
        console.log('User moved away from right edge - disabling live mode');
        setIsLive(false);
      }
    }
  }, [currentViewEnd, allChartData.length, isLive]);

  useEffect(() => {
    // svgRef.current now points to the <svg> element in the DOM
    console.log('SVG element is ready:', svgRef.current);
  }, []); // Empty array means this effect runs only once

  // Centralized chart rendering - automatically re-renders when dependencies change
  useEffect(() => {
    if (!chartContent || chartContent.empty()) {
      // No chart content available
      return;
    }

    // Render started (debug log removed to prevent spam)

    // Get visible data based on current view state
    // const currentVisibleData = getVisibleData(currentViewStart, currentViewEnd);
    const currentVisibleData = visibleData;
    if (!currentVisibleData || currentVisibleData.length === 0) {
      return;
    }

    if (chartContent) {
      renderCandlestickChart(chartContent, currentVisibleData, xScale, yScale);
    }
  }, [
    allChartData.length,
    currentViewStart,
    currentViewEnd,
    dimensions,
    chartLoaded,
    xScale,
    yScale,
  ]);

  // Create chart when data is available and view is properly set
  useEffect(() => {
    if (allChartData.length > 0 && currentViewEnd > 0 && visibleData && visibleData.length > 0) {
      // Only validate that we have a reasonable range
      // Negative indices are normal when panning to historical data
      if (currentViewStart > currentViewEnd || currentViewEnd < 0) {
        console.warn('Invalid view range in chart creation effect, resetting to valid values:', {
          currentViewStart,
          currentViewEnd,
          dataLength: allChartData.length,
        });

        // Reset to valid view indices
        const validViewStart = Math.max(0, allChartData.length - CHART_DATA_POINTS);
        const validViewEnd = allChartData.length - 1;
        setCurrentViewStart(validViewStart);
        setCurrentViewEnd(validViewEnd);
        return;
      }

      // Create chart if it doesn't exist yet, or if there's a significant data change
      // Don't recreate chart after panning - this causes unwanted y-scale recalculation
      const shouldCreateChart = !chartExists;

      if (shouldCreateChart && xScale && yScale) {
        console.log(
          'Creating chart - chartExists:',
          chartExists,
          'dataLength:',
          allChartData.length,
          'visibleDataLength:',
          visibleData.length,
          'hasUserPanned:',
          hasUserPanned,
          'isPanning:',
          isPanning,
          'isZooming:',
          isZooming,
          'viewIndices:',
          { currentViewStart, currentViewEnd }
        );
        createChart({
          svgElement: svgRef.current as SVGSVGElement,
          chartExists,
          allChartData,
          xScale,
          yScale,
          chartLoaded,
          visibleData,
          setChartExists,
          setChartContent,
          dimensions,
          currentViewStart,
          currentViewEnd,
          chartContent,
          setIsZooming,
          setIsPanning,
          setHasUserPanned,
          setCurrentViewStart,
          setCurrentViewEnd,
          checkAndLoadMoreData,
          setHoverData,
          setChartLoaded,
        });
      }
    }

    return undefined; // Explicit return for linter
  }, [
    allChartData.length,
    xScale,
    yScale,
    currentViewStart,
    currentViewEnd,
    dimensions,
    visibleData,
  ]);

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
                    {timeframe || 'Loading...'} • {allChartData.length} points
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
            <span>Total data: {allChartData.length}</span>
            <span>Displaying: {CHART_DATA_POINTS} points</span>
            <span>
              View:{' '}
              {(() => {
                const actualStart = Math.max(0, currentViewStart);
                const actualEnd = Math.min(allChartData.length - 1, currentViewEnd);
                const actualPoints = actualEnd - actualStart + 1;
                return `${actualStart}-${actualEnd} (${actualPoints} points)`;
              })()}
            </span>
            <span>Interval: {timeframe || 'Loading...'}</span>
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
