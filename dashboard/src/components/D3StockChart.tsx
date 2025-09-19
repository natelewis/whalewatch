import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';
import { ChartTimeframe, DEFAULT_CHART_DATA_POINTS } from '../types';
import { getLocalStorageItem, setLocalStorageItem } from '../utils/localStorage';
import { ChartData, useChartData } from '../hooks/useChartData';
import { useChartWebSocket } from '../hooks/useChartWebSocket';
import { ChartDimensions } from '../hooks/useChartDimensions';
import { useChartDataProcessor } from '../hooks/useChartDataProcessor';
import { useChartStateManager } from '../hooks/useChartStateManager';
import {
  TimeframeConfig,
  applyAxisStyling,
  createXAxis,
  createYAxis,
  formatPrice,
  clampIndex,
  hasRequiredChartParams,
  calculateInnerDimensions,
  isValidChartData,
} from '../utils/chartDataUtils';
import { BarChart3, Settings, Play, Pause, RotateCcw } from 'lucide-react';

interface D3StockChartProps {
  symbol: string;
  onSymbolChange: (symbol: string) => void;
}

// ============================================================================
// CONFIGURATION CONSTANTS - Modify these to adjust chart behavior
// ============================================================================
const CHART_DATA_POINTS = 80; // Number of data points to display on chart
const OUTSIDE_BUFFER = 100; // Read datapoints to the left and right of visible area (off-screen buffer)
const TOTAL_BUFFERED_POINTS = CHART_DATA_POINTS + OUTSIDE_BUFFER * 2; // Total points including buffers
// ============================================================================

// ============================================================================
// CENTRALIZED CALCULATIONS - Single source of truth for all chart math
// ============================================================================
interface ChartCalculations {
  // Dimensions
  innerWidth: number;
  innerHeight: number;

  // Base scales (untransformed)
  baseXScale: d3.ScaleLinear<number, number>;
  baseYScale: d3.ScaleLinear<number, number>;

  // Transformed scales (for panning/zooming)
  transformedXScale: d3.ScaleLinear<number, number>;
  transformedYScale: d3.ScaleLinear<number, number>;

  // View calculations with buffer system
  viewStart: number;
  viewEnd: number;
  bufferedViewStart: number;
  bufferedViewEnd: number;
  visibleData: ChartData;
  bufferedData: ChartData; // Includes off-screen buffer data for pre-rendering

  // Transform string for rendering
  transformString: string;
}

const calculateChartState = ({
  dimensions,
  allChartData,
  transform,
  fixedYScaleDomain,
}: {
  dimensions: ChartDimensions;
  allChartData: ChartData;
  transform: d3.ZoomTransform;
  fixedYScaleDomain: [number, number] | null;
}): ChartCalculations => {
  // Calculate dimensions (single source)
  const { innerWidth, innerHeight } = calculateInnerDimensions(dimensions);

  // Handle cases where we have less data than the ideal buffer size
  const availableDataLength = allChartData.length;
  const idealBufferSize = TOTAL_BUFFERED_POINTS;
  const actualBufferSize = Math.min(idealBufferSize, availableDataLength);

  // Calculate view indices with buffer system (single source)
  const panOffsetPixels = transform.x;
  const bandWidth = innerWidth / CHART_DATA_POINTS;
  const panOffset = panOffsetPixels / bandWidth;

  // Base view shows most recent data, adjusted for available data
  const baseViewStart = Math.max(0, availableDataLength - actualBufferSize);
  const bufferedViewStart = Math.max(
    0,
    Math.min(availableDataLength - actualBufferSize, baseViewStart - panOffset)
  );
  const bufferedViewEnd = Math.min(
    availableDataLength - 1,
    bufferedViewStart + actualBufferSize - 1
  );

  // Actual visible area is the center portion, or what we can fit
  const idealVisibleStart = bufferedViewStart + OUTSIDE_BUFFER;
  const idealVisibleEnd = idealVisibleStart + CHART_DATA_POINTS - 1;

  // Ensure we don't go out of bounds
  const viewStart = Math.max(
    0,
    Math.min(idealVisibleStart, availableDataLength - CHART_DATA_POINTS)
  );
  const viewEnd = Math.min(
    availableDataLength - 1,
    Math.max(viewStart + CHART_DATA_POINTS - 1, idealVisibleEnd)
  );

  // Calculate base scales for full buffer positioning
  // Maps global data indices to screen coordinates, with visible area at [0, innerWidth]
  const baseXScale = d3.scaleLinear().domain([viewStart, viewEnd]).range([0, innerWidth]);

  // Data is already sorted from chartDataUtils.processChartData
  const sortedData = allChartData;

  // Get buffered data (includes off-screen candles for smooth panning)
  const calculatedBufferedData = sortedData.slice(bufferedViewStart, bufferedViewEnd + 1);

  const baseYScale = d3
    .scaleLinear()
    .domain(
      fixedYScaleDomain ||
        ((): [number, number] => {
          // Use bufferedData instead of visibleData to ensure y-axis matches all rendered data
          const minPrice = d3.min(calculatedBufferedData, (d) => d.low) as number;
          const maxPrice = d3.max(calculatedBufferedData, (d) => d.high) as number;
          return [minPrice, maxPrice];
        })()
    )
    .range([innerHeight, 0]);

  // Calculate transformed scales (single source)
  const transformedXScale = transform.rescaleX(baseXScale);
  const transformedYScale = transform.rescaleY(baseYScale);

  // Get visible data (center portion)
  const calculatedVisibleData = sortedData.slice(viewStart, viewEnd + 1);

  // Ensure we have reasonable data lengths
  const actualVisibleData = calculatedVisibleData.length > 0 ? calculatedVisibleData : [];
  const actualBufferedData =
    calculatedBufferedData.length > 0 ? calculatedBufferedData : actualVisibleData;

  return {
    innerWidth,
    innerHeight,
    baseXScale,
    baseYScale,
    transformedXScale,
    transformedYScale,
    viewStart,
    viewEnd,
    bufferedViewStart,
    bufferedViewEnd,
    visibleData: actualVisibleData,
    bufferedData: actualBufferedData,
    transformString: transform.toString(),
  };
};
// ============================================================================

// Removed useChartScales - now using centralized calculateChartState

// D3 state update callbacks - set by React component
let d3StateCallbacks: {
  setIsZooming?: (value: boolean) => void;
  setCurrentViewStart?: (value: number) => void;
  setCurrentViewEnd?: (value: number) => void;
  setHoverData?: (value: any) => void;
  setChartLoaded?: (value: boolean) => void;
  setFixedYScaleDomain?: (value: [number, number] | null) => void;
  setChartExists?: (value: boolean) => void;
  forceRerender?: () => void;
} = {};

// Create D3 chart - Pure D3 function with no React dependencies
const createChart = ({
  svgElement,
  allChartData,
  xScale,
  yScale,
  visibleData,
  dimensions,
  fixedYScaleDomain: _fixedYScaleDomain,
  stateCallbacks,
  chartState,
}: {
  svgElement: SVGSVGElement;
  allChartData: ChartData;
  xScale: d3.ScaleLinear<number, number>;
  yScale: d3.ScaleLinear<number, number>;
  visibleData: ChartData;
  dimensions: ChartDimensions;
  fixedYScaleDomain: [number, number] | null;
  stateCallbacks: {
    setIsZooming?: (value: boolean) => void;
    setCurrentViewStart?: (value: number) => void;
    setCurrentViewEnd?: (value: number) => void;
    setHoverData?: (value: any) => void;
    setChartLoaded?: (value: boolean) => void;
    setFixedYScaleDomain?: (value: [number, number] | null) => void;
    setChartExists?: (value: boolean) => void;
    forceRerender?: () => void;
  };
  chartState: {
    fixedYScaleDomain: [number, number] | null;
    chartLoaded: boolean;
  };
}): void => {
  if (!svgElement) {
    console.log('createChart: No svgElement found, skipping chart creation');
    return;
  }

  if (!d3.select(svgElement).select('g').empty()) {
    console.log('createChart: g element not found, skipping chart creation');
    return;
  }

  if (
    !hasRequiredChartParams({ allChartData, xScale, yScale, visibleData }) ||
    chartState.chartLoaded
  ) {
    console.log('createChart: Early return conditions:', {
      allChartDataLength: allChartData?.length || 0,
      allChartDataIsArray: Array.isArray(allChartData),
      hasXScale: !!xScale,
      hasYScale: !!yScale,
      chartLoaded: chartState.chartLoaded,
      hasVisibleData: !!visibleData,
      visibleDataLength: visibleData?.length || 0,
    });
    return;
  }

  // Set up state callbacks for D3 to communicate with React
  d3StateCallbacks = stateCallbacks;

  if (stateCallbacks.setChartExists) {
    stateCallbacks.setChartExists(true);
  }
  const svg = d3.select(svgElement);
  svg.selectAll('*').remove(); // Clear previous chart

  const { innerWidth, innerHeight } = calculateInnerDimensions(dimensions);
  const { margin } = dimensions;

  // Data is already sorted from chartDataUtils.processChartData
  const sortedData = allChartData;

  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`); // gRef.current;

  // Add a clip-path that's large enough for all buffered content
  // Allow plenty of space for off-screen candlesticks to be rendered
  const bufferSpace = innerWidth * 2; // Large buffer for off-screen rendering
  svg
    .append('defs')
    .append('clipPath')
    .attr('id', 'clip')
    .append('rect')
    .attr('x', -bufferSpace)
    .attr('y', -bufferSpace)
    .attr('width', innerWidth + bufferSpace * 2)
    .attr('height', innerHeight + bufferSpace * 2);

  // Create chart content group for transforms
  g.append('g').attr('class', 'chart-content').attr('clip-path', 'url(#clip)');

  // Create axes in the main chart group
  const { innerWidth: chartInnerWidth, innerHeight: chartInnerHeight } =
    calculateInnerDimensions(dimensions);

  // Create X-axis using global indices (will be updated dynamically in handleZoom)
  const xAxis = g
    .append('g')
    .attr('class', 'x-axis')
    .attr('transform', `translate(0,${chartInnerHeight})`)
    .call(createXAxis(xScale, sortedData));

  // Create Y-axis
  const yAxis = g
    .append('g')
    .attr('class', 'y-axis')
    .attr('transform', `translate(${chartInnerWidth},0)`)
    .call(createYAxis(yScale));

  // Apply consistent styling to both axes
  applyAxisStyling(xAxis);
  applyAxisStyling(yAxis);

  // Show all tick marks and labels

  const zoom = d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.5, 10]);

  const handleZoomStart = (): void => {
    if (stateCallbacks.setIsZooming) {
      stateCallbacks.setIsZooming(true);
    }
  };

  const handleZoom = (event: d3.D3ZoomEvent<SVGSVGElement, unknown>): void => {
    const { transform } = event;

    // Single source of truth for all calculations
    const calculations = calculateChartState({
      dimensions,
      allChartData: sortedData,
      transform,
      fixedYScaleDomain: chartState.fixedYScaleDomain,
    });

    // Update view state using centralized calculations
    if (stateCallbacks.setCurrentViewStart) {
      stateCallbacks.setCurrentViewStart(calculations.viewStart);
    }
    if (stateCallbacks.setCurrentViewEnd) {
      stateCallbacks.setCurrentViewEnd(calculations.viewEnd);
    }

    // Apply transform to the main chart content group (includes candlesticks)
    const chartContentGroup = g.select<SVGGElement>('.chart-content');
    if (!chartContentGroup.empty()) {
      chartContentGroup.attr('transform', calculations.transformString);
    }

    // Update X-axis using the same transformed scale as candlesticks
    const xAxisGroup = g.select<SVGGElement>('.x-axis');
    if (!xAxisGroup.empty()) {
      const { innerHeight: axisInnerHeight } = calculateInnerDimensions(dimensions);
      xAxisGroup.attr('transform', `translate(0,${axisInnerHeight})`);
      xAxisGroup.call(createXAxis(calculations.transformedXScale, allChartData));

      // Apply consistent styling to maintain consistency with initial load
      applyAxisStyling(xAxisGroup);
    }

    // Update Y-axis using centralized calculations
    const yAxisGroup = g.select<SVGGElement>('.y-axis');
    if (!yAxisGroup.empty()) {
      yAxisGroup.call(createYAxis(calculations.transformedYScale));

      // Apply consistent styling to maintain consistency with initial load
      applyAxisStyling(yAxisGroup);
    }
  };

  const handleZoomEnd = (): void => {
    if (stateCallbacks.setIsZooming) {
      stateCallbacks.setIsZooming(false);
    }
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
      if (stateCallbacks.setHoverData) {
        stateCallbacks.setHoverData(null);
      }
    })
    .on('mousemove', (event) => {
      if (!xScale || !yScale) {
        return;
      }
      const [mouseX, mouseY] = d3.pointer(event);

      // Get the current transform from the zoom behavior
      const currentTransform = d3.zoomTransform(svg.node() as SVGSVGElement);
      const transformedXScale = currentTransform.rescaleX(xScale);
      const mouseIndex = transformedXScale.invert(mouseX);

      // Find closest data point by index for tooltip data
      const index = Math.round(mouseIndex);

      // Use the full data (already sorted from chartDataUtils.processChartData)
      const sortedChartData = allChartData;

      if (!isValidChartData(sortedChartData)) {
        return;
      }

      const clampedIndex = clampIndex(index, sortedChartData.length);
      const d = sortedChartData[clampedIndex];

      // Debug logging to verify hover data is updating
      console.log('Hover debug:', {
        mouseX,
        mouseIndex,
        index,
        clampedIndex,
        dataPoint: d
          ? { time: d.time, open: d.open, high: d.high, low: d.low, close: d.close }
          : null,
      });

      if (d) {
        // Update crosshair to follow cursor position exactly
        crosshair
          .select('.crosshair-x')
          .attr('x1', mouseX)
          .attr('x2', mouseX)
          .attr('y1', 0)
          .attr('y2', innerHeight);

        crosshair
          .select('.crosshair-y')
          .attr('x1', 0)
          .attr('x2', innerWidth)
          .attr('y1', mouseY)
          .attr('y2', mouseY);

        // Update hover data (still use closest bar data for tooltip)
        if (stateCallbacks.setHoverData) {
          stateCallbacks.setHoverData({
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
      }
    });

  // Set the fixed y-scale domain based on all chart data to lock it during panning
  if (isValidChartData(allChartData)) {
    const sortedChartData = allChartData;
    const initialYMin = d3.min(sortedChartData, (d) => d.low) as number;
    const initialYMax = d3.max(sortedChartData, (d) => d.high) as number;
    const priceRange = initialYMax - initialYMin;
    const padding = priceRange * 0.2; // Add 20% padding above and below for more labels
    if (stateCallbacks.setFixedYScaleDomain) {
      stateCallbacks.setFixedYScaleDomain([initialYMin - padding, initialYMax + padding]);
    }
    console.log('🔒 Y-axis locked to full data range:', [
      initialYMin - padding,
      initialYMax + padding,
    ]);
  }

  if (stateCallbacks.setChartLoaded) {
    stateCallbacks.setChartLoaded(true);
  }
  console.log('🎯 CHART LOADED - Axes can now be created');
};

// Removed updateCurrentView - now using centralized calculateChartState

const renderCandlestickChart = (
  svgElement: SVGSVGElement,
  calculations: ChartCalculations
): void => {
  // Find the chart content group and remove existing candlesticks
  const chartContent = d3.select(svgElement).select('.chart-content');
  if (chartContent.empty()) {
    console.warn('Chart content group not found, cannot render candlesticks');
    return;
  }

  chartContent.selectAll('.candle-sticks').remove();
  const candleSticks = chartContent.append('g').attr('class', 'candle-sticks');

  // Don't apply transform here - it's handled in handleZoom for smooth panning

  const candleWidth = Math.max(1, 4);

  // Render ALL buffered data - let clipping handle what's visible
  // Pre-render everything so it's available during smooth panning
  calculations.bufferedData.forEach((d, bufferedIndex) => {
    // Use global index directly with the scale
    const globalIndex = calculations.bufferedViewStart + bufferedIndex;
    const x = calculations.baseXScale(globalIndex);

    console.log(`Rendering candle ${bufferedIndex}: globalIndex=${globalIndex}, x=${x}`);

    const isUp = d.close >= d.open;
    const color = isUp ? '#26a69a' : '#ef5350';

    // High-Low line
    candleSticks
      .append('line')
      .attr('x1', x)
      .attr('x2', x)
      .attr('y1', calculations.baseYScale(d.high))
      .attr('y2', calculations.baseYScale(d.low))
      .attr('stroke', color)
      .attr('stroke-width', 1);

    // Open-Close rectangle
    candleSticks
      .append('rect')
      .attr('x', x - candleWidth / 2)
      .attr('y', calculations.baseYScale(Math.max(d.open, d.close)))
      .attr('width', candleWidth)
      .attr(
        'height',
        Math.abs(calculations.baseYScale(d.close) - calculations.baseYScale(d.open)) || 1
      )
      .attr('fill', isUp ? color : 'none')
      .attr('stroke', color)
      .attr('stroke-width', 1);
  });

  console.log('🎨 Rendered candles (FULL BUFFER):', {
    bufferedDataLength: calculations.bufferedData.length,
    visibleDataLength: calculations.visibleData.length,
    bufferedRange: `${calculations.bufferedViewStart}-${calculations.bufferedViewEnd}`,
    visibleRange: `${calculations.viewStart}-${calculations.viewEnd}`,
    bufferAvailable: `L:${calculations.viewStart - calculations.bufferedViewStart}, R:${
      calculations.bufferedViewEnd - calculations.viewEnd
    }`,
    scaleInfo: {
      domain: calculations.baseXScale.domain(),
      range: calculations.baseXScale.range(),
      totalWidth: calculations.baseXScale.range()[1] - calculations.baseXScale.range()[0],
      bufferWidth: OUTSIDE_BUFFER * (calculations.innerWidth / CHART_DATA_POINTS),
    },
    positioning: {
      firstBufferedX: calculations.baseXScale(0),
      firstVisibleX: calculations.baseXScale(OUTSIDE_BUFFER),
      lastVisibleX: calculations.baseXScale(OUTSIDE_BUFFER + CHART_DATA_POINTS - 1),
      lastBufferedX: calculations.baseXScale(TOTAL_BUFFERED_POINTS - 1),
    },
    dataInfo: {
      firstBufferedTime: calculations.bufferedData[0]?.time,
      firstVisibleTime: calculations.bufferedData[OUTSIDE_BUFFER]?.time,
      lastVisibleTime: calculations.bufferedData[OUTSIDE_BUFFER + CHART_DATA_POINTS - 1]?.time,
      lastBufferedTime: calculations.bufferedData[calculations.bufferedData.length - 1]?.time,
    },
  });
};

const D3StockChart: React.FC<D3StockChartProps> = ({ symbol }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Use consolidated state management
  const { state: chartState, actions: chartActions } = useChartStateManager(symbol, null);

  // Use new utility hooks
  const { isValidData, getVisibleData } = useChartDataProcessor(chartState.allData);

  // Force re-render when D3 state changes
  const [, forceUpdate] = useState({});
  const forceRerender = (): void => forceUpdate({});

  // Local state for timeframe management
  const [timeframe, setTimeframe] = useState<ChartTimeframe | null>(null);

  // Centralized calculations will be used instead of useChartScales

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
    bufferPoints: 100, // Buffer for data preloading
    onDataLoaded: (data: ChartData) => {
      // Update all chart data whenever new data is loaded
      chartActions.setAllData(data);
    },
  });

  // WebSocket for real-time data
  const chartWebSocket = useChartWebSocket({
    symbol,
  });

  // Update visible data when view changes
  useEffect(() => {
    if (isValidData) {
      const newVisibleData = getVisibleData(chartState.currentViewStart, chartState.currentViewEnd);
      console.log('Updating visible data:', {
        currentViewStart: chartState.currentViewStart,
        currentViewEnd: chartState.currentViewEnd,
        allChartDataLength: chartState.allData.length,
        newVisibleDataLength: newVisibleData.length,
        newVisibleDataStart: newVisibleData[0]?.time,
        newVisibleDataEnd: newVisibleData[newVisibleData.length - 1]?.time,
      });
      chartActions.setData(newVisibleData);
    }
  }, [
    chartState.currentViewStart,
    chartState.currentViewEnd,
    chartState.allData,
    isValidData,
    getVisibleData,
  ]); // Removed chartActions

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
      chartActions.resetChart(); // Reset chart state for new symbol/timeframe
      chartActions.setTimeframe(timeframe);

      console.log('🔄 Loading new data for symbol/timeframe:', { symbol, timeframe });
      chartDataHook.loadChartData(symbol, timeframe);
    }
  }, [symbol, timeframe]); // Removed chartActions and chartDataHook from dependencies

  // Subscribe to WebSocket when live mode is enabled
  useEffect(() => {
    if (chartState.isLive) {
      chartWebSocket.subscribeToChartData();
    } else {
      chartWebSocket.unsubscribeFromChartData();
    }
  }, [chartState.isLive]); // Removed chartWebSocket from dependencies

  // Handle container resize
  useEffect(() => {
    const handleResize = (): void => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        chartActions.setDimensions({
          ...chartState.dimensions,
          width: rect.width,
          height: Math.max(400, rect.height - 100),
        });
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []); // Removed dependencies to prevent infinite loops

  // Set initial view to show newest data when data loads
  useEffect(() => {
    if (isValidData) {
      const totalDataLength = chartState.allData.length;

      // If this is the first load, show newest data with proper buffer setup
      if (chartState.data.length === 0 && totalDataLength > 0) {
        // Set up initial view to show most recent data with full buffer available
        const newEndIndex = totalDataLength - 1;
        const newStartIndex = Math.max(0, totalDataLength - CHART_DATA_POINTS);

        console.log('Initial load - setting view indices with buffer system:', {
          totalDataLength,
          CHART_DATA_POINTS,
          OUTSIDE_BUFFER,
          TOTAL_BUFFERED_POINTS,
          newStartIndex,
          newEndIndex,
          rangeSize: newEndIndex - newStartIndex + 1,
          availableLeftBuffer: newStartIndex,
          availableRightBuffer: totalDataLength - newEndIndex - 1,
        });

        chartActions.setViewport(newStartIndex, newEndIndex);
      }
    }
  }, [chartState.allData.length, chartState.data.length, isValidData]); // Removed chartActions

  // Auto-enable live mode when user pans to the rightmost edge
  const [isAtRightEdge, setIsAtRightEdge] = useState(false);
  const lastRightEdgeCheckRef = useRef<number>(0);
  const RIGHT_EDGE_CHECK_INTERVAL = 1000; // Check every 1 second to prevent rapid toggling

  useEffect(() => {
    const dataLength = chartState.allData.length;
    const atRightEdge = chartState.currentViewEnd >= dataLength - 5; // Within 5 points of the end
    const now = Date.now();
    const timeSinceLastCheck = now - lastRightEdgeCheckRef.current;

    // Only check for right edge changes if enough time has passed
    if (timeSinceLastCheck >= RIGHT_EDGE_CHECK_INTERVAL) {
      lastRightEdgeCheckRef.current = now;
      setIsAtRightEdge(atRightEdge);

      if (atRightEdge && !chartState.isLive) {
        console.log('User reached right edge - enabling live mode for real-time data');
        chartActions.setIsLive(true);
      } else if (!atRightEdge && chartState.isLive) {
        console.log('User moved away from right edge - disabling live mode');
        chartActions.setIsLive(false);
      }
    }
  }, [chartState.currentViewEnd, chartState.allData.length, chartState.isLive]); // Removed chartActions

  useEffect((): void => {
    // svgRef.current now points to the <svg> element in the DOM
    console.log('SVG element is ready:', svgRef.current);
  }, []);

  // Centralized chart rendering - only re-render when data changes, not during panning
  useEffect((): void => {
    if (!isValidData || !chartState.data.length) {
      return;
    }
    if (svgRef.current) {
      // Create calculations for initial render (no transform)
      const initialTransform = d3.zoomIdentity;
      const calculations = calculateChartState({
        dimensions: chartState.dimensions,
        allChartData: chartState.allData,
        transform: initialTransform,
        fixedYScaleDomain: chartState.fixedYScaleDomain,
      });

      renderCandlestickChart(svgRef.current as SVGSVGElement, calculations);
    }
  }, [
    chartState.data,
    chartState.allData,
    chartState.dimensions,
    chartState.fixedYScaleDomain,
    isValidData,
  ]);

  // Create chart when data is available and view is properly set
  useEffect(() => {
    if (isValidData && chartState.currentViewEnd > 0 && chartState.data.length > 0) {
      // Only validate that we have a reasonable range
      // Negative indices are normal when panning to historical data
      if (
        chartState.currentViewStart > chartState.currentViewEnd ||
        chartState.currentViewEnd < 0
      ) {
        console.warn('Invalid view range in chart creation effect, resetting to valid values:', {
          currentViewStart: chartState.currentViewStart,
          currentViewEnd: chartState.currentViewEnd,
          dataLength: chartState.allData.length,
        });

        // Reset to valid view indices
        const validViewStart = Math.max(0, chartState.allData.length - CHART_DATA_POINTS);
        const validViewEnd = chartState.allData.length - 1;
        chartActions.setViewport(validViewStart, validViewEnd);
        return;
      }

      // Create chart if it doesn't exist yet, or if there's a significant data change
      // Don't recreate chart after panning - this causes unwanted y-scale recalculation
      const shouldCreateChart = !chartState.chartExists;

      if (shouldCreateChart) {
        // Create calculations for chart creation
        const initialTransform = d3.zoomIdentity;
        const calculations = calculateChartState({
          dimensions: chartState.dimensions,
          allChartData: chartState.allData,
          transform: initialTransform,
          fixedYScaleDomain: chartState.fixedYScaleDomain,
        });

        createChart({
          svgElement: svgRef.current as SVGSVGElement,
          allChartData: chartState.allData,
          xScale: calculations.baseXScale,
          yScale: calculations.baseYScale,
          visibleData: chartState.data,
          dimensions: chartState.dimensions,
          fixedYScaleDomain: chartState.fixedYScaleDomain,
          stateCallbacks: {
            setIsZooming: chartActions.setIsZooming,
            setCurrentViewStart: chartActions.setCurrentViewStart,
            setCurrentViewEnd: chartActions.setCurrentViewEnd,
            setHoverData: chartActions.setHoverData,
            setChartLoaded: chartActions.setChartLoaded,
            setFixedYScaleDomain: chartActions.setFixedYScaleDomain,
            setChartExists: chartActions.setChartExists,
            forceRerender,
          },
          chartState,
        });
      }
    }

    return undefined; // Explicit return for linter
  }, [
    chartState.allData.length,
    chartState.currentViewStart,
    chartState.currentViewEnd,
    chartState.dimensions,
    chartState.data,
    chartState.fixedYScaleDomain,
    chartState.chartExists,
    isValidData,
  ]); // Removed chartActions

  return (
    <div className="bg-card rounded-lg border border-border h-full flex flex-col">
      {/* Chart Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-4">
            <h3 className="text-lg font-semibold text-foreground">{symbol}</h3>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => chartActions.setIsLive(!chartState.isLive)}
                className={`flex items-center space-x-1 px-3 py-1 rounded-md text-sm transition-colors ${
                  chartState.isLive
                    ? 'bg-green-500 text-white'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                {chartState.isLive ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                {chartState.isLive ? 'Live' : 'Paused'}
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
              {chartState.hoverData?.data ? (
                <div className="flex justify-between items-center w-full">
                  <span className="font-bold text-foreground text-lg">{symbol}</span>
                  <div className="flex gap-3 text-sm">
                    <span className="text-muted-foreground">
                      O:{' '}
                      <span className="font-mono text-foreground">
                        {formatPrice(chartState.hoverData.data.open)}
                      </span>
                    </span>
                    <span className="text-muted-foreground">
                      H:{' '}
                      <span className="font-mono text-foreground">
                        {formatPrice(chartState.hoverData.data.high)}
                      </span>
                    </span>
                    <span className="text-muted-foreground">
                      L:{' '}
                      <span className="font-mono text-foreground">
                        {formatPrice(chartState.hoverData.data.low)}
                      </span>
                    </span>
                    <span className="text-muted-foreground">
                      C:{' '}
                      <span className="font-mono text-foreground">
                        {formatPrice(chartState.hoverData.data.close)}
                      </span>
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex justify-between items-center">
                  <span className="font-bold text-foreground text-lg">{symbol}</span>
                </div>
              )}
            </div>

            <div ref={containerRef} className="w-full h-full">
              <svg
                ref={svgRef}
                width={chartState.dimensions.width}
                height={chartState.dimensions.height}
                className="w-full h-full"
                style={{ cursor: chartState.isZooming ? 'grabbing' : 'grab' }}
              />
            </div>

            {/* Tooltip */}
          </div>
        )}
      </div>

      {/* Chart Footer */}
      <div className="p-4 border-t border-border">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <div className="flex items-center space-x-4">
            <span>Total data: {chartState.allData.length}</span>
            <span>Displaying: {CHART_DATA_POINTS} points</span>
            <span>
              View:{' '}
              {(() => {
                const actualStart = Math.max(0, chartState.currentViewStart);
                const actualEnd = Math.min(
                  chartState.allData.length - 1,
                  chartState.currentViewEnd
                );
                const actualPoints = actualEnd - actualStart + 1;
                return `${actualStart}-${actualEnd} (${actualPoints} points)`;
              })()}
            </span>
            <span>Interval: {timeframe || 'Loading...'}</span>
          </div>
          <div className="flex items-center space-x-2">
            <div
              className={`w-2 h-2 rounded-full ${
                chartState.isLive ? 'bg-green-500' : 'bg-gray-500'
              }`}
            ></div>
            <span>{chartState.isLive ? 'Live data (auto-enabled)' : 'Historical data'}</span>
            {isAtRightEdge && !chartState.isLive && (
              <div className="flex items-center space-x-1">
                <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
                <span className="text-xs text-yellow-500">Live mode will activate</span>
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
