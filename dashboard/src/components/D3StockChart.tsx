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
  const [chartLoaded, setChartLoaded] = useState(false);
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

  // Track when data loading was last allowed to prevent immediate loading
  const lastDataLoadAllowedRef = useRef<number>(0);
  const DATA_LOAD_DELAY = 2000; // Wait 2 seconds after chart creation before allowing data loading

  // Track when panning ended to prevent immediate chart recreation
  const lastPanningEndRef = useRef<number>(0);
  const PANNING_END_DEBOUNCE = 500; // Wait 500ms after panning ends before allowing chart recreation

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
    const handleResize = () => {
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
    if (chartDataHook.chartData.length > 0) {
      const totalDataLength = chartDataHook.chartData.length;
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
        chartExistsRef.current = false; // Reset chart existence for new data
      }
      // If data length increased (new data loaded), don't adjust view position
      // The view should only change during user interactions, not data loads
      else if (totalDataLength > prevDataLength) {
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

        // Only force chart recreation if user has panned (not during initial load)
        if (hasUserPanned) {
          chartExistsRef.current = false;
        }
      }

      prevDataLengthRef.current = totalDataLength;
    }
  }, [chartDataHook.chartData.length, currentViewStart, currentViewEnd]);

  // Check if we need to load more data when panning
  const checkAndLoadMoreData = useCallback(async () => {
    const now = Date.now();
    const timeSinceLastChartCreation = now - lastChartCreationRef.current;

    // console.log('checkAndLoadMoreData called:', {
    //   currentViewStart,
    //   bufferSize: 300,
    //   shouldLoadLeft: currentViewStart <= 300,
    //   hasUserPanned,
    //   chartExists: chartExistsRef.current,
    //   timeSinceLastChartCreation,
    //   DATA_LOAD_DELAY,
    // });

    if (
      !symbol ||
      !timeframe ||
      isLoadingMoreData ||
      isInitialLoad.current ||
      !hasUserPanned ||
      isVerticallyPanningRef.current ||
      isDataLoadingRef.current ||
      !chartExistsRef.current || // Don't load data if chart doesn't exist yet
      timeSinceLastChartCreation < DATA_LOAD_DELAY // Wait for delay after chart creation
    ) {
      // console.log('checkAndLoadMoreData: Early return');
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

      // Check if view indices have changed significantly (more than 5 points for more responsive loading)
      const hasSignificantChange =
        !lastViewIndices ||
        Math.abs(currentViewStart - lastViewIndices.start) > 5 ||
        Math.abs(currentViewEnd - lastViewIndices.end) > 5;

      // Reduce throttling during panning for more responsive data loading
      const throttlingInterval = isPanning
        ? DATA_LOAD_CHECK_INTERVAL / 2
        : DATA_LOAD_CHECK_INTERVAL;

      // Only check for data loading if enough time has passed, we're not already loading, and there's a significant change
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
  const lastVisibleDataRef = useRef<typeof chartDataHook.chartData | null>(null);
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

    // Sort data by time - always use current state
    const sortedData = [...chartDataHook.chartData].sort(
      (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
    );

    // Get visible data based on current view state
    const visibleData = getVisibleData(currentViewStart, currentViewEnd);

    // Ensure we have valid data before proceeding
    if (visibleData.length === 0) {
      console.warn('createChart: No visible data available, skipping chart creation');
      isCreatingChartRef.current = false;
      return;
    }

    // Validate that we have valid data points
    const hasValidData = visibleData.every(
      (d) =>
        d &&
        typeof d.time === 'string' &&
        typeof d.open === 'number' &&
        typeof d.high === 'number' &&
        typeof d.low === 'number' &&
        typeof d.close === 'number' &&
        !isNaN(d.open) &&
        !isNaN(d.high) &&
        !isNaN(d.low) &&
        !isNaN(d.close)
    );

    if (!hasValidData) {
      console.warn('createChart: Invalid data points detected, skipping chart creation', {
        visibleDataLength: visibleData.length,
        firstDataPoint: visibleData[0],
        lastDataPoint: visibleData[visibleData.length - 1],
      });
      isCreatingChartRef.current = false;
      return;
    }

    console.log('Creating chart with visible data:', {
      totalData: sortedData.length,
      visibleData: visibleData.length,
      visibleDataStart: visibleData[0]?.time,
      visibleDataEnd: visibleData[visibleData.length - 1]?.time,
    });

    // Create scales - map visible data array indices to full chart width
    // Calculate proper band width to stretch across the full chart area
    const bandWidth = innerWidth / visibleData.length;
    const xScale = d3
      .scaleLinear()
      .domain([0, visibleData.length - 1])
      .range([0, innerWidth - bandWidth]);

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

    // Create chart elements - draw only visible data based on current view state
    const chartVisibleData = getVisibleData(currentViewStart, currentViewEnd);

    // Create simple scale for initial chart rendering
    const simpleChartXScale = d3
      .scaleLinear()
      .domain([0, chartVisibleData.length - 1])
      .range([0, innerWidth]);

    updateChartElements(chartContent, chartVisibleData, simpleChartXScale, yScale);

    const zoom = d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.5, 10]);

    const handleZoomStart = () => {
      setIsZooming(true);
      setIsPanning(true);
      setHasUserPanned(true); // Mark that user has started panning

      // Prevent chart recreation during panning
      chartExistsRef.current = true;
    };

    const handleZoom = (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
      const { transform } = event;

      // Check if transform has actually changed to prevent unnecessary updates on click
      const prevTransform = transformRef.current;
      const hasTransformChanged =
        !prevTransform ||
        Math.abs(transform.x - prevTransform.x) > 0.1 ||
        Math.abs(transform.y - prevTransform.y) > 0.1 ||
        Math.abs(transform.k - prevTransform.k) > 0.001;

      // Only proceed if transform has actually changed
      if (!hasTransformChanged) {
        return;
      }

      // DEBUG: Log transform changes
      console.log('🔍 ZOOM DEBUG - Transform changed:', {
        prevTransform: prevTransform
          ? { x: prevTransform.x, y: prevTransform.y, k: prevTransform.k }
          : null,
        newTransform: { x: transform.x, y: transform.y, k: transform.k },
        changes: {
          xChange: prevTransform ? transform.x - prevTransform.x : 0,
          yChange: prevTransform ? transform.y - prevTransform.y : 0,
          kChange: prevTransform ? transform.k - prevTransform.k : 0,
        },
      });

      transformRef.current = transform;

      // Transform the chart content
      chartContent.attr('transform', transform.toString());

      // Calculate the visible range using simple math based on pan offset
      const panOffsetPixels = Math.abs(transform.x);
      const bandWidth = innerWidth / CHART_DATA_POINTS;
      const panOffset = Math.round(panOffsetPixels / bandWidth);
      const maxPanOffset = Math.max(0, sortedData.length - CHART_DATA_POINTS);
      const clampedPanOffset = Math.min(panOffset, maxPanOffset);
      const newViewStart = Math.max(0, sortedData.length - CHART_DATA_POINTS - clampedPanOffset);
      const newViewEnd = Math.min(sortedData.length - 1, newViewStart + CHART_DATA_POINTS - 1);

      // Get the visible data range for the new view
      const visibleData = getVisibleData(newViewStart, newViewEnd);

      if (visibleData.length === 0) return;

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
        .nice()
        .range([innerHeight, 0]);

      // Update axes using the same scale logic as initial rendering
      const g = svg.select<SVGGElement>('g[transform]');
      const xAxisGroup = g.select<SVGGElement>('.x-axis');

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

      // Update Y-axis with consistent scaling
      const yAxisGroup = g.select<SVGGElement>('.y-axis');
      yAxisGroup
        .attr('transform', `translate(${innerWidth},${transform.y})`)
        .call(d3.axisRight(consistentYScale).tickFormat(d3.format('.2f')));

      // Keep the axis line (domain path) fixed by overriding its transform
      yAxisGroup.select('.domain').attr('transform', `translate(0,${-transform.y})`);

      // Update view state immediately for responsive panning
      setCurrentViewStart(newViewStart);
      setCurrentViewEnd(newViewEnd);

      // Only update chart elements if the visible data has actually changed
      // AND we're not actively panning (to prevent jumping during smooth panning)
      const visibleDataChanged =
        !lastVisibleDataRef.current ||
        lastVisibleDataRef.current.length !== visibleData.length ||
        (lastVisibleDataRef.current.length > 0 &&
          visibleData.length > 0 &&
          lastVisibleDataRef.current[0].time !== visibleData[0].time);

      // Update chart elements if the visible data has changed
      // This ensures the chart shows the correct data for the current view
      if (visibleData.length > 0 && visibleDataChanged) {
        // Chart will automatically re-render via useEffect when state changes
        lastVisibleDataRef.current = visibleData;
      }

      // Check if we need to load more data (throttled)
      const now = Date.now();
      if (now - lastDataLoadCheckRef.current >= 100) {
        // Reduced throttling for panning
        checkAndLoadMoreData();
      }
    };

    const handleZoomEnd = (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
      setIsZooming(false);
      setIsPanning(false);
      transformRef.current = event.transform;

      // Don't update view bounds here - they're already updated correctly in handleZoom
      // The D3 scale domain calculation gives wrong ranges

      // Track when panning ended
      lastPanningEndRef.current = Date.now();

      // Update chart elements now that panning has ended
      // This ensures the chart shows the correct data for the final position
      // Chart will automatically re-render via useEffect when state changes
    };

    zoom.on('start', handleZoomStart).on('zoom', handleZoom).on('end', handleZoomEnd);
    svg.call(zoom);

    // No transform needed since scale domain matches visible data range
    // The visible data (120-199) will span the full chart width (0 to innerWidth)

    // Axes will be created by the centralized useEffect

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
        // Use the current view state to get visible data
        const currentVisibleData = getVisibleData(currentViewStart, currentViewEnd);
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

    // Mark chart as loaded after a brief delay to ensure DOM is ready
    setTimeout(() => {
      setChartLoaded(true);
      console.log('🎯 CHART LOADED - Axes can now be created');
    }, 100);
  }, [chartDataHook.chartData, dimensions, chartType, currentViewStart, currentViewEnd]);

  // Get visible data based on provided view indices
  const getVisibleData = useCallback(
    (startIndex: number, endIndex: number) => {
      // Always use the current state data
      const sortedData = [...chartDataHook.chartData].sort(
        (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
      );

      // If no data, return empty array
      if (sortedData.length === 0) {
        console.log('getVisibleData: No data available');
        return [];
      }

      // Handle edge cases more gracefully for panning
      // Allow negative start indices for historical data loading
      // Clamp indices to valid ranges instead of falling back
      const actualStartIndex = Math.max(0, Math.min(startIndex, sortedData.length - 1));
      const actualEndIndex = Math.max(actualStartIndex, Math.min(endIndex, sortedData.length - 1));

      // If we have a valid range, use it
      if (actualStartIndex <= actualEndIndex && actualEndIndex < sortedData.length) {
        const visibleData = sortedData.slice(actualStartIndex, actualEndIndex + 1);

        // Only return empty if we truly have no data
        if (visibleData.length > 0) {
          return visibleData;
        }
      }

      // If we're panning to historical data (negative start), try to get what we can
      if (startIndex < 0) {
        const availableStart = Math.max(0, sortedData.length + startIndex);
        const availableEnd = Math.min(
          sortedData.length - 1,
          availableStart + CHART_DATA_POINTS - 1
        );
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
    },
    [chartDataHook.chartData]
  );

  // Centralized chart rendering - automatically re-renders when dependencies change
  useEffect(() => {
    if (!svgRef.current || chartDataHook.chartData.length === 0) {
      console.log('🎯 RENDER SKIP:', {
        hasSvg: !!svgRef.current,
        dataLength: chartDataHook.chartData.length,
      });
      return;
    }

    // Only render if chart is fully created AND loaded
    if (!chartExistsRef.current || !chartLoaded) {
      console.log('🎯 RENDER SKIP - Chart not ready:', {
        chartExists: chartExistsRef.current,
        chartLoaded,
      });
      return;
    }

    const svg = d3.select(svgRef.current);
    const chartContent = svg.select('.chart-content');

    if (chartContent.empty()) {
      console.log('🎯 RENDER SKIP - No chart content');
      return;
    }

    console.log('🎯 RENDER START:', {
      dataLength: chartDataHook.chartData.length,
      currentViewStart,
      currentViewEnd,
      chartExists: chartExistsRef.current,
    });

    // Get visible data based on current view state
    const visibleData = getVisibleData(currentViewStart, currentViewEnd);
    if (visibleData.length === 0) return;

    // Create scales for visible data
    const { width, height, margin } = dimensions;
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    const bandWidth = innerWidth / visibleData.length;

    const xScale = d3
      .scaleLinear()
      .domain([0, visibleData.length - 1])
      .range([0, innerWidth - bandWidth]);

    const yScale = d3
      .scaleLinear()
      .domain([
        d3.min(visibleData, (d) => d.low) as number,
        d3.max(visibleData, (d) => d.high) as number,
      ])
      .nice()
      .range([innerHeight, 0]);

    // Clear previous chart elements (but not axes)
    chartContent.selectAll('*').remove();

    // Create axes in the main chart group (not in the clipped chart-content)
    const g = svg.select<SVGGElement>('g[transform]');

    console.log('🎯 AXIS DEBUG:', {
      gElement: g.node(),
      visibleDataLength: visibleData.length,
      xScaleDomain: xScale.domain(),
      xScaleRange: xScale.range(),
      innerHeight,
      innerWidth,
      hasGElement: !!g.node(),
    });

    // Axes are now created in a separate useEffect after chart is loaded

    // Create extended sliding scale for consistency with panning behavior
    const slidingXScale = d3
      .scaleLinear()
      .domain([currentViewStart - CHART_DATA_POINTS, currentViewStart + CHART_DATA_POINTS * 2])
      .range([-innerWidth, innerWidth * 2]);

    // Create a scale for visible data positioning (maps visible data indices to actual data indices)
    const visibleDataXScale = d3
      .scaleLinear()
      .domain([0, visibleData.length - 1])
      .range([currentViewStart, currentViewEnd]);

    // Render candlesticks using the scales
    createCandlestickChart(
      chartContent as unknown as d3.Selection<SVGGElement, unknown, null, undefined>,
      visibleData,
      xScale,
      yScale
    );
  }, [
    chartDataHook.chartData,
    currentViewStart,
    currentViewEnd,
    dimensions,
    getVisibleData,
    chartLoaded,
  ]);

  // Separate effect for axis creation - only runs after chart is loaded
  useEffect(() => {
    if (!chartLoaded || !svgRef.current || chartDataHook.chartData.length === 0) {
      return;
    }

    console.log('🎯 AXIS CREATION - Chart is loaded, creating axes');

    const svg = d3.select(svgRef.current);
    const g = svg.select<SVGGElement>('g[transform]');

    if (g.empty()) {
      console.log('🎯 AXIS CREATION SKIP - No main group found');
      return;
    }

    // Get visible data for axis creation
    const visibleData = getVisibleData(currentViewStart, currentViewEnd);
    if (visibleData.length === 0) {
      console.log('🎯 AXIS CREATION SKIP - No visible data');
      return;
    }

    const { width, height, margin } = dimensions;
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    // Create scales for axes
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

    // Remove existing axes
    g.select('.x-axis').remove();
    g.select('.y-axis').remove();

    // Create X-axis
    const xAxis = g
      .append('g')
      .attr('class', 'x-axis')
      .attr('transform', `translate(0,${innerHeight})`)
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
      .attr('transform', `translate(${innerWidth},0)`)
      .call(d3.axisRight(yScale).tickFormat(d3.format('.2f')));

    console.log('🎯 AXES CREATED SUCCESSFULLY:', {
      xAxisElement: xAxis.node(),
      yAxisElement: yAxis.node(),
      visibleDataLength: visibleData.length,
    });
  }, [
    chartLoaded,
    currentViewStart,
    currentViewEnd,
    dimensions,
    getVisibleData,
    chartDataHook.chartData,
  ]);

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
      // Use the simple x scale directly
      const x = xScale(index);

      // Debug logging for first few candlesticks
      if (index < 3) {
        console.log('🕯️ CANDLESTICK DEBUG:', {
          index,
          xScaleDomain: xScale.domain(),
          xScaleRange: xScale.range(),
          x,
          candleWidth,
          dataPoint: d,
        });
      }
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

  // Only candlestick chart is supported - other chart types removed

  // Create chart when data is available and view is properly set
  useEffect(() => {
    if (chartDataHook.chartData.length > 0 && currentViewEnd > 0) {
      // Only validate that we have a reasonable range
      // Negative indices are normal when panning to historical data
      if (currentViewStart > currentViewEnd || currentViewEnd < 0) {
        console.warn('Invalid view range in chart creation effect, resetting to valid values:', {
          currentViewStart,
          currentViewEnd,
          dataLength: chartDataHook.chartData.length,
        });

        // Reset to valid view indices
        const validViewStart = Math.max(0, chartDataHook.chartData.length - CHART_DATA_POINTS);
        const validViewEnd = chartDataHook.chartData.length - 1;
        setCurrentViewStart(validViewStart);
        setCurrentViewEnd(validViewEnd);
        return;
      }

      const now = Date.now();
      const timeSinceLastCreation = now - lastChartCreationRef.current;

      // Create chart if it doesn't exist yet, or if there's a significant data change
      // Don't recreate chart after panning - this causes unwanted y-scale recalculation
      const shouldCreateChart =
        !chartExistsRef.current ||
        (timeSinceLastCreation >= CHART_CREATION_DEBOUNCE &&
          !isHoveringRef.current &&
          !isDataLoadingRef.current &&
          !isPanning && // Don't recreate during panning
          !isZooming && // Don't recreate while actively zooming
          !hasUserPanned); // Don't recreate after user has panned

      if (shouldCreateChart) {
        console.log(
          'Creating chart - chartExists:',
          chartExistsRef.current,
          'timeSinceLast:',
          timeSinceLastCreation,
          'dataLength:',
          chartDataHook.chartData.length,
          'hasUserPanned:',
          hasUserPanned,
          'isPanning:',
          isPanning,
          'isZooming:',
          isZooming,
          'viewIndices:',
          { currentViewStart, currentViewEnd }
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
    currentViewStart,
    currentViewEnd,
    hasUserPanned,
    isPanning,
    isZooming,
  ]);

  // Update chart data when view state changes (to show historical data)

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
              View:{' '}
              {(() => {
                const actualStart = Math.max(0, currentViewStart);
                const actualEnd = Math.min(chartDataHook.chartData.length - 1, currentViewEnd);
                const actualPoints = actualEnd - actualStart + 1;
                return `${actualStart}-${actualEnd} (${actualPoints} points)`;
              })()}
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
