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
  const transformRef = useRef<d3.ZoomTransform>(d3.zoomIdentity);

  // Panning and predictive loading state
  const [currentViewStart, setCurrentViewStart] = useState(0);
  const [currentViewEnd, setCurrentViewEnd] = useState(0);
  const [isLoadingMoreData, setIsLoadingMoreData] = useState(false);
  const [lastPanTime, setLastPanTime] = useState(0);
  const panTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const chartRecreateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isInitialLoad = useRef(true);

  // Track loading attempts to prevent infinite loops
  const lastLoadAttemptRef = useRef<{ type: 'left' | 'right'; dataLength: number } | null>(null);

  // Track if we're currently loading data to preserve price range
  const isDataLoadingRef = useRef<boolean>(false);

  // Track if we're currently vertically panning to prevent data loading conflicts
  const isVerticallyPanningRef = useRef<boolean>(false);

  // Track if user has manually adjusted price range to preserve it during panning
  const hasUserAdjustedPriceRangeRef = useRef<boolean>(false);

  // Track if user has panned to enable data loading
  const [hasUserPanned, setHasUserPanned] = useState<boolean>(false);

  // Track last data loading check to prevent spam
  const lastDataLoadCheckRef = useRef<number>(0);
  const DATA_LOAD_CHECK_INTERVAL = 500; // Minimum 500ms between data load checks

  // Track last view indices to detect significant changes
  const lastViewIndicesRef = useRef<{ start: number; end: number } | null>(null);

  // Track if we're currently creating a chart to prevent multiple simultaneous creations
  const isCreatingChartRef = useRef<boolean>(false);

  // Track if chart already exists to avoid unnecessary recreations
  const chartExistsRef = useRef<boolean>(false);

  // Track when chart was last created to prevent rapid recreations
  const lastChartCreationRef = useRef<number>(0);
  const CHART_CREATION_DEBOUNCE = 1000; // Minimum 1 second between chart creations

  // Track if user is hovering to prevent chart recreation during hover
  const isHoveringRef = useRef<boolean>(false);

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
    bufferPoints: 100, // Increased buffer for more data preloading
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
      chartExistsRef.current = false; // Reset chart existence for new symbol/timeframe
      setHasUserPanned(false); // Reset user panning state
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

  // Track previous data length to detect when new data is loaded
  const prevDataLengthRef = useRef<number>(0);

  // Set initial view to show newest data when data loads
  useEffect(() => {
    if (chartDataHook.chartData.length > 0) {
      const totalDataLength = chartDataHook.chartData.length;
      const prevDataLength = prevDataLengthRef.current;

      // If this is the first load, show newest data
      if (prevDataLength === 0) {
        const newEndIndex = totalDataLength - 1;
        const newStartIndex = Math.max(0, newEndIndex - CHART_DATA_POINTS + 1);

        setCurrentViewStart(newStartIndex);
        setCurrentViewEnd(newEndIndex);
        isInitialLoad.current = false; // Mark initial load as complete
        chartExistsRef.current = false; // Reset chart existence for new data
      }
      // If data length increased (new data loaded), adjust view position
      else if (totalDataLength > prevDataLength) {
        const dataAdded = totalDataLength - prevDataLength;
        const currentStart = currentViewStart;
        const currentEnd = currentViewEnd;

        // Shift view indices to account for new data that was prepended
        // (historical data is added to the beginning of the array)
        const newViewStart = currentStart + dataAdded;
        const newViewEnd = currentEnd + dataAdded;

        // Clamp to valid bounds
        const clampedViewStart = Math.max(
          0,
          Math.min(newViewStart, totalDataLength - CHART_DATA_POINTS)
        );
        const clampedViewEnd = Math.min(
          totalDataLength - 1,
          Math.max(newViewEnd, clampedViewStart + CHART_DATA_POINTS - 1)
        );

        setCurrentViewStart(clampedViewStart);
        setCurrentViewEnd(clampedViewEnd);

        // Reset loading attempt tracking
        lastLoadAttemptRef.current = null;
      }

      prevDataLengthRef.current = totalDataLength;
    }
  }, [chartDataHook.chartData.length, currentViewStart, currentViewEnd]);

  // Check if we need to load more data when panning
  const checkAndLoadMoreData = useCallback(async () => {
    if (
      !symbol ||
      !timeframe ||
      isLoadingMoreData ||
      isInitialLoad.current ||
      !hasUserPanned ||
      isVerticallyPanningRef.current ||
      isDataLoadingRef.current
    ) {
      return;
    }

    // Set data loading flag immediately to prevent concurrent calls
    isDataLoadingRef.current = true;

    const totalDataLength = chartDataHook.chartData.length;
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
    if (
      chartDataHook.chartData.length > 0 &&
      !isLoadingMoreData &&
      !isInitialLoad.current &&
      hasUserPanned
    ) {
      const now = Date.now();
      const timeSinceLastCheck = now - lastDataLoadCheckRef.current;
      const lastViewIndices = lastViewIndicesRef.current;

      // Check if view indices have changed significantly (more than 10 points)
      const hasSignificantChange =
        !lastViewIndices ||
        Math.abs(currentViewStart - lastViewIndices.start) > 10 ||
        Math.abs(currentViewEnd - lastViewIndices.end) > 10;

      // Only check for data loading if enough time has passed, we're not already loading, and there's a significant change
      if (
        timeSinceLastCheck >= DATA_LOAD_CHECK_INTERVAL &&
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
  ]);

  // Auto-enable live mode when user pans to the rightmost edge
  const [isAtRightEdge, setIsAtRightEdge] = useState(false);
  const lastRightEdgeCheckRef = useRef<number>(0);
  const RIGHT_EDGE_CHECK_INTERVAL = 1000; // Check every 1 second to prevent rapid toggling

  useEffect(() => {
    const dataLength = chartDataHook.chartData.length;
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
          setHasUserPanned(true); // Mark that user has started panning
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
          setHasUserPanned(true); // Mark that user has started panning
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
          setHasUserPanned(true); // Mark that user has started panning
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
          setHasUserPanned(true); // Mark that user has started panning
          // Go to end
          if (svgRef.current) {
            const svg = d3.select(svgRef.current);
            const dataLength = chartDataHook.chartData.length;
            const endTransform = d3.zoomIdentity.translate(
              -(dataLength - CHART_DATA_POINTS) * 12,
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
    if (!svgRef.current || chartDataHook.chartData.length === 0 || isCreatingChartRef.current)
      return;

    isCreatingChartRef.current = true;
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
    const startIndex = Math.max(0, sortedData.length - viewSize);
    const endIndex = Math.min(sortedData.length - 1, startIndex + viewSize - 1);
    const visibleData = sortedData.slice(startIndex, endIndex + 1);

    console.log('Creating chart with visible data:', {
      totalData: sortedData.length,
      visibleData: visibleData.length,
      viewSize,
      startIndex,
      endIndex,
    });

    const bandWidth = innerWidth / CHART_DATA_POINTS;

    // Create scales - use linear scale to remove gaps
    const xScale = d3
      .scaleLinear()
      .domain([0, sortedData.length - 1])
      .range([0, (sortedData.length - 1) * bandWidth]);

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

    let chartContent: d3.Selection<SVGGElement, unknown, null, undefined>;

    // Add a clip-path to prevent drawing outside the chart area
    svg
      .append('defs')
      .append('clipPath')
      .attr('id', 'clip')
      .append('rect')
      .attr('width', innerWidth)
      .attr('height', innerHeight);

    chartContent = g.append('g').attr('class', 'chart-content').attr('clip-path', 'url(#clip)');

    // Create chart elements - draw ALL data
    updateChartElements(chartContent, sortedData, xScale, yScale);

    const zoom = d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.5, 10]);

    const handleZoomStart = () => {
      setIsZooming(true);
      setIsPanning(true);
      setHasUserPanned(true); // Mark that user has started panning
    };

    const handleZoom = (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
      const { transform } = event;
      transformRef.current = transform;

      // Transform the chart content
      chartContent.attr('transform', transform.toString());

      // Rescale the scales for the axes
      const newXScale = transform.rescaleX(xScale);
      const newYScale = transform.rescaleY(yScale);

      // Update axes
      g.select<SVGGElement>('.x-axis').call(
        d3.axisBottom(newXScale).tickFormat((d) => {
          const index = Math.round(d as number);
          if (index >= 0 && index < sortedData.length) {
            const date = new Date(sortedData[index].time);
            return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
          }
          return '';
        })
      );
      g.select<SVGGElement>('.y-axis').call(d3.axisRight(newYScale).tickFormat(d3.format('.2f')));

      // Update grid lines
      g.select<SVGGElement>('.grid-x').call(
        d3
          .axisBottom(newXScale)
          .tickSize(-innerHeight)
          .tickFormat(() => '')
      );
      g.select<SVGGElement>('.grid-y').call(
        d3
          .axisRight(newYScale)
          .tickSize(-innerWidth)
          .tickFormat(() => '')
      );
    };

    const handleZoomEnd = (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
      setIsZooming(false);
      setIsPanning(false);
      transformRef.current = event.transform;

      // Update view bounds for predictive loading
      const newXScale = transformRef.current.rescaleX(xScale);
      const visibleDomain = newXScale.domain();
      setCurrentViewStart(Math.floor(visibleDomain[0]));
      setCurrentViewEnd(Math.ceil(visibleDomain[1]));
    };

    zoom.on('start', handleZoomStart).on('zoom', handleZoom).on('end', handleZoomEnd);
    svg.call(zoom);

    // Apply initial or stored transform
    if (isInitialLoad.current) {
      const startOfViewIndex = sortedData.length - CHART_DATA_POINTS;
      const initialTranslateX = startOfViewIndex > 0 ? -xScale(startOfViewIndex) : 0;
      const initialTransform = d3.zoomIdentity.translate(initialTranslateX, 0);
      transformRef.current = initialTransform;
      svg.call(zoom.transform, initialTransform);

      // Set initial view bounds for predictive loading
      const newXScale = initialTransform.rescaleX(xScale);
      const visibleDomain = newXScale.domain();
      setCurrentViewStart(Math.floor(visibleDomain[0]));
      setCurrentViewEnd(Math.ceil(visibleDomain[1]));
    } else {
      svg.call(zoom.transform, transformRef.current);
    }

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
        isHoveringRef.current = true;
        crosshair.select('.crosshair-x').style('opacity', 1);
        crosshair.select('.crosshair-y').style('opacity', 1);
      })
      .on('mouseout', () => {
        isHoveringRef.current = false;
        crosshair.select('.crosshair-x').style('opacity', 0);
        crosshair.select('.crosshair-y').style('opacity', 0);
        setHoverData(null);
      })
      .on('mousemove', (event) => {
        const [mouseX, mouseY] = d3.pointer(event);
        const mouseIndex = xScale.invert(mouseX);

        // Find closest data point by index
        const index = Math.round(mouseIndex);
        // Use the consistent getCurrentVisibleData function
        const currentVisibleData = getCurrentVisibleData();
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

    // Reset the chart creation flag and mark chart as existing
    isCreatingChartRef.current = false;
    chartExistsRef.current = true;
  }, [chartDataHook.chartData, dimensions, chartType, currentViewStart, currentViewEnd]);

  // Update chart elements - always candlestick
  const updateChartElements = (
    g: d3.Selection<SVGGElement, unknown, null, undefined>,
    data: typeof chartDataHook.chartData,
    xScale: d3.ScaleLinear<number, number>,
    yScale: d3.ScaleLinear<number, number>
  ) => {
    // Clear previous chart elements
    g.selectAll('*').remove();

    createCandlestickChart(g, data, xScale, yScale);
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

    // Get current transform from the SVG element and calculate pan offset
    let currentPanOffset = 0; // fallback to state
    if (svgRef.current) {
      const currentTransform = d3.zoomTransform(svgRef.current);
      const panOffsetPixels = Math.max(0, currentTransform.x);
      currentPanOffset = Math.floor(panOffsetPixels / 20);
    }

    const startIndex = Math.max(0, sortedData.length - viewSize - currentPanOffset);
    const endIndex = Math.min(sortedData.length - 1, startIndex + viewSize - 1);

    const visibleData = sortedData.slice(startIndex, endIndex + 1);

    return visibleData;
  }, [chartDataHook.chartData]);

  // Only candlestick chart is supported - other chart types removed

  // Create chart when data is available and view is properly set
  useEffect(() => {
    if (chartDataHook.chartData.length > 0 && currentViewEnd > 0) {
      const now = Date.now();
      const timeSinceLastCreation = now - lastChartCreationRef.current;

      // Only create chart if it doesn't exist yet
      // For existing charts, only recreate if there's a significant data change
      const shouldCreateChart = !chartExistsRef.current;

      if (shouldCreateChart) {
        console.log(
          'Creating chart - chartExists:',
          chartExistsRef.current,
          'timeSinceLast:',
          timeSinceLastCreation
        );
        lastChartCreationRef.current = now;
        createChart();
      }
    }

    return undefined; // Explicit return for linter
  }, [
    chartDataHook.chartData.length,
    createChart,
    isInitialLoad,
    isDataLoadingRef,
    isLoadingMoreData,
  ]);

  // Update chart data when new data comes in (without recreating the chart)
  // Disabled to prevent chart recreation issues - chart will stay stable
  // useEffect(() => {
  //   if (
  //     chartDataHook.chartData.length > 0 &&
  //     chartExistsRef.current &&
  //     !isDataLoadingRef.current &&
  //     !isLoadingMoreData
  //   ) {
  //     // Small delay to ensure data processing is complete
  //     const timeoutId = setTimeout(() => {
  //       updateChartData();
  //     }, 100);

  //     return () => clearTimeout(timeoutId);
  //   }

  //   return undefined; // Explicit return for linter
  // }, [chartDataHook.chartData.length, updateChartData, isDataLoadingRef, isLoadingMoreData]);

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
