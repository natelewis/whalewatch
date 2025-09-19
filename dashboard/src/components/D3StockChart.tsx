import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import * as d3 from 'd3';
import { ChartTimeframe, DEFAULT_CHART_DATA_POINTS, ChartDimensions } from '../types';
import { getLocalStorageItem, setLocalStorageItem } from '../utils/localStorage';
import { CandlestickData } from '../utils/chartDataUtils';
import { useChartWebSocket } from '../hooks/useChartWebSocket';
import { useChartDataProcessor } from '../hooks/useChartDataProcessor';
import { useChartStateManager } from '../hooks/useChartStateManager';
import { apiService } from '../services/apiService';
import {
  TimeframeConfig,
  applyAxisStyling,
  createXAxis,
  createYAxis,
  calculateTimeBasedTickValues,
  createIndexToTimeScale,
  formatPrice,
  clampIndex,
  hasRequiredChartParams,
  calculateInnerDimensions,
  isValidChartData,
  processChartData,
} from '../utils/chartDataUtils';
import { BarChart3, Settings, Play, Pause, RotateCcw, ArrowRight } from 'lucide-react';

interface D3StockChartProps {
  symbol: string;
  onSymbolChange: (symbol: string) => void;
}

// ============================================================================
// CONFIGURATION CONSTANTS - Modify these to adjust chart behavior
// ============================================================================
const CHART_DATA_POINTS = 80; // Number of data points to display on chart

// Buffer and margin constants
const BUFFER_SIZE_MULTIPLIER = 0.5; // Buffer size as percentage of chart data points (40 points)
const MIN_BUFFER_SIZE = 20; // Minimum buffer size in data points
const MARGIN_SIZE = 2; // Fixed margin size in data points for re-render detection
// Removed unused candlestick buffer constants since we now render only visible points

// Zoom and scale constants
const ZOOM_SCALE_MIN = 0.5; // Minimum zoom scale
const ZOOM_SCALE_MAX = 10; // Maximum zoom scale

// UI and layout constants
const MIN_CHART_HEIGHT = 400; // Minimum chart height in pixels
const CHART_HEIGHT_OFFSET = 100; // Height offset for chart container
const PRICE_PADDING_MULTIPLIER = 0.2; // Price range padding (20%)
const DATA_PRELOAD_BUFFER = 100; // Buffer points for data preloading

// ============================================================================

// ============================================================================
// CENTRALIZED CALCULATIONS - Single source of truth for all chart math
// ============================================================================
interface ChartCalculations {
  // Dimensions
  innerWidth: number;
  innerHeight: number;

  // Base scales (untransformed) - maps full dataset to screen coordinates
  baseXScale: d3.ScaleLinear<number, number>;
  baseYScale: d3.ScaleLinear<number, number>;

  // Transformed scales (for panning/zooming)
  transformedXScale: d3.ScaleLinear<number, number>;
  transformedYScale: d3.ScaleLinear<number, number>;

  // View calculations
  viewStart: number;
  viewEnd: number;
  visibleData: CandlestickData[];
  allData: CandlestickData[]; // Full dataset for rendering

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
  allChartData: CandlestickData[];
  transform: d3.ZoomTransform;
  fixedYScaleDomain: [number, number] | null;
}): ChartCalculations => {
  // Calculate dimensions (single source)
  const { innerWidth, innerHeight } = calculateInnerDimensions(dimensions);

  // RIGHT-ALIGNED SYSTEM: Rightmost data is always at right edge (ground 0)
  const availableDataLength = allChartData.length;
  const bandWidth = innerWidth / CHART_DATA_POINTS;

  // Calculate pan offset in data points (positive = pan left, negative = pan right)
  const panOffsetPixels = transform.x;
  const panOffsetDataPoints = panOffsetPixels / bandWidth;

  // Calculate which portion of the full dataset should be visible
  // Rightmost data is always at the right edge, panning moves the view left
  const rightmostDataIndex = availableDataLength - 1;
  const viewEnd = Math.min(rightmostDataIndex, rightmostDataIndex - panOffsetDataPoints);
  const viewStart = Math.max(0, viewEnd - CHART_DATA_POINTS + 1);

  // Create base X scale that maps data indices to screen coordinates
  // The scale should always map the full dataset to a fixed range that shows 80 points
  // Panning is handled by the transform, not by changing the scale range

  // Calculate the scale range to accommodate the full dataset
  // The range should be wide enough to show all data points with proper spacing
  const totalDataWidth = availableDataLength * bandWidth;

  // Position the scale so the rightmost data is at the right edge
  const rightmostX = innerWidth;
  const leftmostX = rightmostX - totalDataWidth;

  // Create X scale that maps the full dataset to a range that allows panning
  // The scale should map the full dataset, but we'll only render visible points
  const baseXScale = d3
    .scaleLinear()
    .domain([0, availableDataLength - 1]) // Full dataset range
    .range([leftmostX, rightmostX]); // Range sized for full dataset

  // // Debug logging for view calculations
  // console.log('📊 Chart state calculations:', {
  //   availableDataLength,
  //   bandWidth,
  //   totalDataWidth,
  //   leftmostX,
  //   rightmostX,
  //   viewStart,
  //   viewEnd,
  //   panOffsetPixels,
  //   panOffsetDataPoints,
  //   scaleDomain: [0, availableDataLength - 1],
  //   scaleRange: [leftmostX, rightmostX],
  //   visiblePoints: viewEnd - viewStart + 1,
  // });

  // Create Y scale based on all data or fixed domain
  const baseYScale = d3
    .scaleLinear()
    .domain(
      fixedYScaleDomain ||
        ((): [number, number] => {
          const minPrice = d3.min(allChartData, (d) => d.low) as number;
          const maxPrice = d3.max(allChartData, (d) => d.high) as number;
          return [minPrice, maxPrice];
        })()
    )
    .range([innerHeight, 0]);

  // Calculate transformed scales (single source)
  const transformedXScale = transform.rescaleX(baseXScale);
  const transformedYScale = transform.rescaleY(baseYScale);

  // Get visible data slice for tooltips and other interactions
  const visibleData = allChartData.slice(viewStart, viewEnd + 1);

  return {
    innerWidth,
    innerHeight,
    baseXScale,
    baseYScale,
    transformedXScale,
    transformedYScale,
    viewStart,
    viewEnd,
    visibleData,
    allData: allChartData,
    transformString: transform.toString(),
  };
};
// ============================================================================

// Create D3 chart - Pure D3 function with no React dependencies
const createChart = ({
  svgElement,
  allChartData,
  xScale,
  yScale,
  visibleData,
  dimensions,
  stateCallbacks,
  chartState,
  bufferRangeRef,
  isPanningRef,
  onBufferedCandlesRendered,
}: {
  svgElement: SVGSVGElement;
  allChartData: CandlestickData[];
  xScale: d3.ScaleLinear<number, number>;
  yScale: d3.ScaleLinear<number, number>;
  visibleData: CandlestickData[];
  dimensions: ChartDimensions;
  stateCallbacks: {
    setIsZooming?: (value: boolean) => void;
    setCurrentViewStart?: (value: number) => void;
    setCurrentViewEnd?: (value: number) => void;
    setHoverData?: (
      value: {
        x: number;
        y: number;
        data: { time: string; open: number; high: number; low: number; close: number };
      } | null
    ) => void;
    setChartLoaded?: (value: boolean) => void;
    setFixedYScaleDomain?: (value: [number, number] | null) => void;
    setChartExists?: (value: boolean) => void;
    setCurrentTransform?: (value: d3.ZoomTransform) => void;
    forceRerender?: () => void;
    setZoomBehavior?: (behavior: d3.ZoomBehavior<SVGSVGElement, unknown>) => void;
    getFixedYScaleDomain?: () => [number, number] | null;
    getCurrentData?: () => CandlestickData[];
    getCurrentDimensions?: () => ChartDimensions;
  };
  chartState: {
    fixedYScaleDomain: [number, number] | null;
    chartLoaded: boolean;
  };
  bufferRangeRef: React.MutableRefObject<{ start: number; end: number } | null>;
  isPanningRef: React.MutableRefObject<boolean>;
  onBufferedCandlesRendered?: () => void;
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
    chartState.chartLoaded ||
    !allChartData ||
    allChartData.length === 0
  ) {
    console.log('createChart: Early return conditions:', {
      allChartDataLength: allChartData?.length || 0,
      allChartDataIsArray: Array.isArray(allChartData),
      hasXScale: !!xScale,
      hasYScale: !!yScale,
      chartLoaded: chartState.chartLoaded,
      hasVisibleData: !!visibleData,
      visibleDataLength: visibleData?.length || 0,
      hasRequiredParams: hasRequiredChartParams({ allChartData, xScale, yScale, visibleData }),
    });
    return;
  }

  if (stateCallbacks.setChartExists) {
    stateCallbacks.setChartExists(true);
  }
  const svg = d3.select(svgElement);
  svg.selectAll('*').remove(); // Clear previous chart

  const { innerWidth, innerHeight } = calculateInnerDimensions(dimensions);
  const { margin } = dimensions;

  // Data is already sorted from chartDataUtils.processChartData

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

  // Use the provided base X scale for consistency with calculations
  // This ensures the same scale is used for both initial load and pan/zoom

  // Create X-axis using the same approach as pan/zoom for consistency
  // Add safety check to prevent error when allChartData is empty
  if (allChartData.length === 0) {
    console.warn('createIndexToTimeScale called with empty allChartData in initial render');
    return;
  }
  const initialTimeScale = createIndexToTimeScale(xScale, allChartData);
  const timeBasedTickValues = calculateTimeBasedTickValues(allChartData, 20);
  const xAxis = g
    .append('g')
    .attr('class', 'x-axis')
    .attr('transform', `translate(0,${chartInnerHeight})`)
    .call(createXAxis(initialTimeScale, allChartData, timeBasedTickValues));

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

  const zoom = d3.zoom<SVGSVGElement, unknown>().scaleExtent([ZOOM_SCALE_MIN, ZOOM_SCALE_MAX]);

  // Store reference to zoom behavior for programmatic control
  if (stateCallbacks.setZoomBehavior) {
    stateCallbacks.setZoomBehavior(zoom);
  }

  const handleZoomStart = (): void => {
    if (stateCallbacks.setIsZooming) {
      stateCallbacks.setIsZooming(true);
    }
    isPanningRef.current = true;
  };

  const handleZoom = (event: d3.D3ZoomEvent<SVGSVGElement, unknown>): void => {
    const { transform } = event;

    // Update current transform for debugging
    if (stateCallbacks.setCurrentTransform) {
      stateCallbacks.setCurrentTransform(transform);
    }

    // Get the current fixed Y-scale domain from the ref to avoid stale closure issues
    const currentFixedYScaleDomain = stateCallbacks.getFixedYScaleDomain?.() || null;

    // Get the current data from the callback to avoid stale closure issues
    const currentData = stateCallbacks.getCurrentData?.();

    // Early return if no valid data - prevents errors during panning
    if (!currentData || currentData.length === 0) {
      console.warn('handleZoom called with empty currentData, skipping zoom processing', {
        getCurrentDataResult: currentData,
        currentDataLength: currentData?.length || 0,
      });
      return;
    }

    // Get current dimensions from the callback to avoid stale closure issues
    const currentDimensions = stateCallbacks.getCurrentDimensions?.();

    // Early return if no valid dimensions
    if (!currentDimensions) {
      console.warn('handleZoom called with no dimensions, skipping zoom processing');
      return;
    }

    // Single source of truth for all calculations
    const calculations = calculateChartState({
      dimensions: currentDimensions,
      allChartData: currentData,
      transform,
      fixedYScaleDomain: currentFixedYScaleDomain,
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

    // Update X-axis using time-based scale that aligns with candlesticks
    const xAxisGroup = g.select<SVGGElement>('.x-axis');
    if (!xAxisGroup.empty()) {
      const { innerHeight: axisInnerHeight } = calculateInnerDimensions(currentDimensions);

      // Create time-based scale that maps data indices to screen coordinates
      const indexToTimeScale = createIndexToTimeScale(calculations.transformedXScale, currentData);

      // Calculate time-based tick values (every 20 data points) for the full dataset
      // This ensures consistent tick count between initial load and pan/zoom
      const currentTimeBasedTickValues = calculateTimeBasedTickValues(currentData, 20);

      // Use time-based scale with dynamic tick values
      xAxisGroup.attr('transform', `translate(0,${axisInnerHeight})`);
      xAxisGroup.call(createXAxis(indexToTimeScale, currentData, currentTimeBasedTickValues));

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

    // Check if we need to re-render candlesticks due to panning outside buffer
    const bufferSize = Math.max(
      MIN_BUFFER_SIZE,
      Math.floor(CHART_DATA_POINTS * BUFFER_SIZE_MULTIPLIER)
    );
    const currentViewStart = calculations.viewStart;
    const currentViewEnd = calculations.viewEnd;
    const dataLength = calculations.allData.length;

    // Check if current view is outside the current buffer range
    const currentBufferRange = bufferRangeRef.current;

    // Use a fixed margin to prevent oscillation around the threshold
    // Fixed margin is more stable than percentage-based margin
    const marginSize = MARGIN_SIZE;

    // // Debug logging for buffer range tracking
    // console.log('🔍 Buffer range check:', {
    //   currentView: `${currentViewStart}-${currentViewEnd}`,
    //   currentBufferRange: currentBufferRange
    //     ? `${currentBufferRange.start}-${currentBufferRange.end}`
    //     : 'none',
    //   bufferSize,
    //   marginSize,
    //   dataLength,
    // });

    // Smart buffer range logic that accounts for data boundaries
    let needsRerender = false;

    if (!currentBufferRange) {
      // No buffer range set yet - always re-render
      needsRerender = true;
      console.log('🔄 No buffer range set - triggering re-render');
    } else {
      // Check if we're at data boundaries and adjust margin accordingly
      const atDataStart = currentViewStart <= marginSize; // Within margin of data start
      const atDataEnd = currentViewEnd >= dataLength - marginSize - 1; // Within margin of data end

      // console.log('🔍 Buffer boundary check:', {
      //   atDataStart,
      //   atDataEnd,
      //   currentViewStart,
      //   currentViewEnd,
      //   dataLength,
      //   marginSize,
      // });

      if (atDataStart && atDataEnd) {
        // At both boundaries - only re-render if view has changed significantly
        const startDiff = Math.abs(currentViewStart - currentBufferRange.start);
        const endDiff = Math.abs(currentViewEnd - currentBufferRange.end);
        needsRerender = startDiff > marginSize || endDiff > marginSize;
        console.log('🔍 At both boundaries:', { startDiff, endDiff, needsRerender });
      } else if (atDataStart) {
        // At start boundary - only check if we've moved forward significantly
        needsRerender = currentViewEnd > currentBufferRange.end - marginSize;
        // console.log('🔍 At start boundary:', {
        //   currentViewEnd,
        //   bufferEnd: currentBufferRange.end,
        //   threshold: currentBufferRange.end - marginSize,
        //   needsRerender,
        // });
      } else if (atDataEnd) {
        // At end boundary - only check start margin
        needsRerender = currentViewStart < currentBufferRange.start + marginSize;
        // console.log('🔍 At end boundary:', {
        //   currentViewStart,
        //   bufferStart: currentBufferRange.start,
        //   threshold: currentBufferRange.start + marginSize,
        //   needsRerender,
        // });
      } else {
        // In the middle - check both margins
        const startCheck = currentViewStart < currentBufferRange.start + marginSize;
        const endCheck = currentViewEnd > currentBufferRange.end - marginSize;
        needsRerender = startCheck || endCheck;
        // console.log('🔍 In the middle:', {
        //   startCheck,
        //   endCheck,
        //   currentViewStart,
        //   currentViewEnd,
        //   bufferStart: currentBufferRange.start,
        //   bufferEnd: currentBufferRange.end,
        //   needsRerender,
        // });
      }
    }

    if (needsRerender) {
      console.log('🔄 Re-rendering candlesticks - view outside buffer range', {
        currentView: `${currentViewStart}-${currentViewEnd}`,
        bufferRange: currentBufferRange
          ? `${currentBufferRange.start}-${currentBufferRange.end}`
          : 'none',
        marginSize,
        bufferSize,
      });
      renderCandlestickChart(svgElement, calculations);

      // Trigger data loading callback when buffered candles are rendered during panning
      if (onBufferedCandlesRendered) {
        onBufferedCandlesRendered();
      }

      // Update buffer range tracking with smart boundary-aware buffer
      const atDataStart = currentViewStart <= marginSize; // Within margin of data start
      const atDataEnd = currentViewEnd >= dataLength - marginSize; // Within margin of data end

      let actualStart, actualEnd;

      if (atDataStart && atDataEnd) {
        // At both boundaries - use the full data range
        actualStart = 0;
        actualEnd = dataLength - 1;
      } else if (atDataStart) {
        // At start boundary - only buffer forward
        actualStart = 0;
        actualEnd = Math.min(dataLength - 1, Math.ceil(currentViewEnd) + bufferSize);
      } else if (atDataEnd) {
        // At end boundary - only buffer backward
        actualStart = Math.max(0, Math.floor(currentViewStart) - bufferSize);
        actualEnd = dataLength - 1;
      } else {
        // In the middle - buffer both ways
        actualStart = Math.max(0, Math.floor(currentViewStart) - bufferSize);
        actualEnd = Math.min(dataLength - 1, Math.ceil(currentViewEnd) + bufferSize);
      }

      bufferRangeRef.current = { start: actualStart, end: actualEnd };

      console.log('🔄 Updated buffer range:', {
        newBufferRange: `${actualStart}-${actualEnd}`,
        viewRange: `${currentViewStart}-${currentViewEnd}`,
        bufferSize,
      });
    }
  };

  const handleZoomEnd = (): void => {
    if (stateCallbacks.setIsZooming) {
      stateCallbacks.setIsZooming(false);
    }
    isPanningRef.current = false;
  };

  zoom.on('start', handleZoomStart).on('zoom', handleZoom).on('end', handleZoomEnd);
  svg.call(zoom);

  // Add crosshair
  const crosshair = g.append('g').attr('class', 'crosshair').style('pointer-events', 'none');

  crosshair
    .append('line')
    .attr('class', 'crosshair-x')
    .attr('stroke', '#666')
    .attr('stroke-Bufferwidth', 1)
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

      // Use the right-aligned scale for consistent positioning with candles and X-axis
      const currentTransform = d3.zoomTransform(svg.node() as SVGSVGElement);
      const transformedXScale = currentTransform.rescaleX(xScale);
      const mouseIndex = transformedXScale.invert(mouseX);
      const index = Math.round(mouseIndex);

      // Use the full data (already sorted from chartDataUtils.processChartData)
      const sortedChartData = allChartData;

      if (!isValidChartData(sortedChartData)) {
        return;
      }

      const clampedIndex = clampIndex(index, sortedChartData.length);
      const d = sortedChartData[clampedIndex];

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

  // Fixed Y-scale domain is now set during initial rendering to ensure consistency

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
  console.log('🎨 renderCandlestickChart called with:', {
    allDataLength: calculations.allData.length,
    viewStart: calculations.viewStart,
    viewEnd: calculations.viewEnd,
    stackTrace: new Error().stack?.split('\n').slice(1, 4).join('\n'),
  });

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
  const hoverWidth = Math.max(8, candleWidth * 2); // Wider hover area

  // Render candles with a buffer around the visible viewport for smooth panning
  // This provides a good balance between performance and smooth interaction
  const bufferSize = Math.max(
    MIN_BUFFER_SIZE,
    Math.floor(CHART_DATA_POINTS * BUFFER_SIZE_MULTIPLIER)
  );
  // Convert fractional view indices to integers for proper array slicing
  const actualStart = Math.max(0, Math.floor(calculations.viewStart) - bufferSize);
  const actualEnd = Math.min(
    calculations.allData.length - 1,
    Math.ceil(calculations.viewEnd) + bufferSize
  );
  const visibleCandles = calculations.allData.slice(actualStart, actualEnd + 1);

  console.log('🎨 Rendering candlesticks:', {
    allDataLength: calculations.allData.length,
    viewStart: calculations.viewStart,
    viewEnd: calculations.viewEnd,
    actualStart,
    actualEnd,
    visibleCandlesCount: visibleCandles.length,
    bufferSize,
    scaleDomain: calculations.baseXScale.domain(),
    scaleRange: calculations.baseXScale.range(),
    firstCandleTime:
      visibleCandles.length > 0 ? new Date(visibleCandles[0].time).toLocaleString() : 'none',
    lastCandleTime:
      visibleCandles.length > 0
        ? new Date(visibleCandles[visibleCandles.length - 1].time).toLocaleString()
        : 'none',
    firstCandleIndex: actualStart,
    lastCandleIndex: actualEnd,
  });

  // Use the base linear scale for candlestick positioning since the chart content group
  // already has the transform applied

  visibleCandles.forEach((d, localIndex) => {
    // Calculate the global data index for proper positioning
    const globalIndex = actualStart + localIndex;

    // Use the base linear scale for positioning since the chart content group already has the transform applied
    // This prevents double transformation (scale + group transform)
    const x = calculations.baseXScale(globalIndex);

    const isUp = d.close >= d.open;
    const color = isUp ? '#26a69a' : '#ef5350';

    // Add invisible hover area for easier interaction
    candleSticks
      .append('rect')
      .attr('x', x - hoverWidth / 2)
      .attr('y', 0)
      .attr('width', hoverWidth)
      .attr('height', calculations.innerHeight)
      .attr('fill', 'transparent')
      .attr('class', 'candlestick-hover-area')
      .style('cursor', 'pointer')
      .on('mouseover', function (event) {
        // Show tooltip with debugging info
        const tooltip = d3
          .select('body')
          .selectAll<HTMLDivElement, number>('.candlestick-tooltip')
          .data([1]);
        tooltip
          .enter()
          .append('div')
          .attr('class', 'candlestick-tooltip')
          .style('position', 'absolute')
          .style('background', 'rgba(0, 0, 0, 0.8)')
          .style('color', 'white')
          .style('padding', '8px')
          .style('border-radius', '4px')
          .style('font-size', '12px')
          .style('pointer-events', 'none')
          .style('z-index', '1000')
          .merge(tooltip)
          .html(
            `
            <div><strong>Time:</strong> ${new Date(d.time).toLocaleString()}</div>
            <div><strong>O:</strong> ${d.open.toFixed(2)}</div>
            <div><strong>H:</strong> ${d.high.toFixed(2)}</div>
            <div><strong>L:</strong> ${d.low.toFixed(2)}</div>
            <div><strong>C:</strong> ${d.close.toFixed(2)}</div>
          `
          )
          .style('left', `${event.pageX + 10}px`)
          .style('top', `${event.pageY - 10}px`);
      })
      .on('mouseout', function () {
        d3.select('body').selectAll('.candlestick-tooltip').remove();
      });

    // High-Low line
    candleSticks
      .append('line')
      .attr('x1', x)
      .attr('x2', x)
      .attr('y1', calculations.baseYScale(d.high))
      .attr('y2', calculations.baseYScale(d.low))
      .attr('stroke', color)
      .attr('stroke-width', 1)
      .attr('class', 'candlestick-line')
      .style('opacity', 1);

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
      .attr('stroke-width', 1)
      .attr('class', 'candlestick-rect')
      .style('opacity', 0.8);
  });

  console.log('🎨 Rendered BUFFERED candles (SMOOTH PANNING):', {
    allDataLength: calculations.allData.length,
    bufferedCandlesRendered: visibleCandles.length,
    visibleDataLength: calculations.visibleData.length,
    viewRange: `${calculations.viewStart}-${calculations.viewEnd}`,
    bufferRange: `${actualStart}-${actualEnd}`,
    bufferSize: bufferSize,
    rightmostDataIndex: calculations.allData.length - 1,
    rightmostX: calculations.innerWidth,
    scaleInfo: {
      domain: calculations.baseXScale.domain(),
      range: calculations.baseXScale.range(),
      totalWidth: calculations.baseXScale.range()[1] - calculations.baseXScale.range()[0],
    },
  });
};

// Function to update clip-path when data changes
const updateClipPath = (
  svgElement: SVGSVGElement,
  allChartData: CandlestickData[],
  dimensions: ChartDimensions
): void => {
  const svg = d3.select(svgElement);
  const { innerWidth, innerHeight } = calculateInnerDimensions(dimensions);

  // Calculate buffer space for the clip-path
  // Since we're rendering the full dataset, we need a buffer that can
  // accommodate the full dataset width plus extra space for smooth panning
  const bandWidth = innerWidth / CHART_DATA_POINTS;
  const totalDataWidth = allChartData.length * bandWidth;

  // Create a buffer that's large enough for the full dataset plus extra space
  // This allows for smooth panning without clipping issues
  const bufferSpace = Math.max(innerWidth * 2, totalDataWidth + innerWidth);

  // Update the existing clip-path rectangle
  const clipRect = svg.select('#clip rect');
  if (!clipRect.empty()) {
    clipRect
      .attr('x', -bufferSpace)
      .attr('y', -bufferSpace)
      .attr('width', innerWidth + bufferSpace * 2)
      .attr('height', innerHeight + bufferSpace * 2);

    console.log('🔄 Updated clip-path for expanded dataset:', {
      dataLength: allChartData.length,
      totalDataWidth,
      bufferSpace,
      clipWidth: innerWidth + bufferSpace * 2,
      clipHeight: innerHeight + bufferSpace * 2,
    });
  }
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

  // Debug logging for data state
  useEffect(() => {
    console.log('Chart data state:', {
      allDataLength: chartState.allData.length,
      isValidData,
      isLoading: chartState.isLoading,
      error: chartState.error,
      symbol,
      timeframe,
    });
  }, [
    chartState.allData.length,
    isValidData,
    chartState.isLoading,
    chartState.error,
    symbol,
    timeframe,
  ]);

  // Local state for current transform (for debugging)
  const [currentTransform, setCurrentTransform] = useState<d3.ZoomTransform | null>(null);

  // Experiment mode state
  const [experimentDataPoints, setExperimentDataPoints] = useState(DEFAULT_CHART_DATA_POINTS);
  const manualRenderInProgressRef = useRef(false);

  // Track current buffer range to know when to re-render (use ref to avoid stale closures)
  const currentBufferRangeRef = useRef<{ start: number; end: number } | null>(null);

  // Track if we're currently in a panning operation to prevent infinite loops
  const isPanningRef = useRef(false);

  // Track if we're currently loading data to prevent duplicate requests
  const isLoadingDataRef = useRef(false);

  // Track if chart has been created to prevent unnecessary re-creation
  const chartCreatedRef = useRef(false);

  // Track if initial view has been set to prevent repeated setup
  const initialViewSetRef = useRef(false);

  // Store reference to the zoom behavior for programmatic control
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);

  // Store reference to the fixed Y-scale domain to avoid stale closure issues
  const fixedYScaleDomainRef = useRef<[number, number] | null>(null);

  // Store reference to the current data to avoid stale closure issues
  const currentDataRef = useRef<CandlestickData[]>([]);

  // Store reference to the current dimensions to avoid stale closure issues
  const currentDimensionsRef = useRef<ChartDimensions>({
    width: 0,
    height: 0,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
  });

  // Update dimensions ref when dimensions change
  useEffect(() => {
    currentDimensionsRef.current = chartState.dimensions;
  }, [chartState.dimensions]);

  // Update data ref when chart data changes
  useEffect(() => {
    currentDataRef.current = chartState.allData;
  }, [chartState.allData]);

  // Function to automatically load more data when buffered candles are rendered
  const loadMoreDataOnBufferedRender = useCallback((): void => {
    if (timeframe === null) {
      console.warn('Cannot auto-load more data: no timeframe selected');
      return;
    }

    // Only load more data if we haven't reached the maximum yet
    if (experimentDataPoints >= 500) {
      console.log('📊 Max data points reached, skipping auto-load');
      return;
    }

    // Calculate buffer size the same way as in renderCandlestickChart
    const bufferSize = Math.max(
      MIN_BUFFER_SIZE,
      Math.floor(CHART_DATA_POINTS * BUFFER_SIZE_MULTIPLIER)
    );

    // Add the same amount of data that we're rendering in the buffer
    const newDataPoints = Math.min(experimentDataPoints + bufferSize, 500);
    setExperimentDataPoints(newDataPoints);

    console.log('🔄 Auto-loading more historical data on buffered render:', {
      currentPoints: experimentDataPoints,
      newPoints: newDataPoints,
      bufferSize,
      pointsToAdd: bufferSize,
      symbol,
      timeframe,
    });

    // Use the API service directly with the increased data points
    apiService
      .getChartData(symbol, timeframe, newDataPoints, undefined, DATA_PRELOAD_BUFFER)
      .then((response) => {
        const { formattedData } = processChartData(response.bars);

        console.log('📊 Auto-load before setAllData:', {
          currentAllDataLength: chartState.allData.length,
          newFormattedDataLength: formattedData.length,
        });

        chartActions.setAllData(formattedData);

        console.log('✅ Successfully auto-loaded more data:', {
          newDataLength: formattedData.length,
          dataPoints: newDataPoints,
        });
      })
      .catch((error) => {
        console.error('Failed to auto-load more data:', error);
        // Revert the data points on error
        setExperimentDataPoints(experimentDataPoints);
      });
  }, [timeframe, experimentDataPoints, symbol, chartState.allData.length, chartActions]);

  // Wrapper function that renders candlesticks and triggers data loading for non-panning cases
  const renderCandlestickChartWithCallback = useCallback(
    (svgElement: SVGSVGElement, calculations: ChartCalculations): void => {
      renderCandlestickChart(svgElement, calculations);

      // For non-panning cases, only trigger data loading if viewing historical data
      const totalDataLength = calculations.allData.length;
      // 10 point buffer from right edge
      const isViewingHistoricalData = calculations.viewEnd < totalDataLength - 10;
      const isCurrentlyPanning = isPanningRef.current;

      // Only auto-load for non-panning cases when viewing historical data
      if (!isCurrentlyPanning && isViewingHistoricalData) {
        console.log('🔄 Triggering auto-load for historical data view (non-panning):', {
          viewEnd: calculations.viewEnd,
          totalDataLength,
          isViewingHistoricalData,
          isCurrentlyPanning,
        });
        loadMoreDataOnBufferedRender();
      } else {
        console.log('⏭️ Skipping auto-load (non-panning):', {
          viewEnd: calculations.viewEnd,
          totalDataLength,
          isViewingHistoricalData,
          isCurrentlyPanning,
          reason: isCurrentlyPanning ? 'panning (handled elsewhere)' : 'viewing recent data',
        });
      }
    },
    [loadMoreDataOnBufferedRender]
  );

  // Function to fetch more historical data
  const fetchMoreData = (): void => {
    if (timeframe === null) {
      console.warn('Cannot fetch more data: no timeframe selected');
      return;
    }

    const newDataPoints = Math.min(experimentDataPoints + 20, 500); // Increase by 20 points each time, max 500
    setExperimentDataPoints(newDataPoints);

    console.log('🔄 Fetching more historical data:', {
      currentPoints: experimentDataPoints,
      newPoints: newDataPoints,
      symbol,
      timeframe,
    });

    // Use the API service directly with the increased data points
    apiService
      .getChartData(symbol, timeframe, newDataPoints, undefined, DATA_PRELOAD_BUFFER)
      .then((response) => {
        const { formattedData } = processChartData(response.bars);

        console.log('📊 Before setAllData:', {
          currentAllDataLength: chartState.allData.length,
          newFormattedDataLength: formattedData.length,
        });

        chartActions.setAllData(formattedData);

        // Check state after a brief delay to see if it updates
        setTimeout(() => {
          console.log('📊 After setAllData (delayed):', {
            currentAllDataLength: chartState.allData.length,
            newFormattedDataLength: formattedData.length,
            refDataLength: currentDataRef.current.length,
          });
        }, 100);

        console.log('✅ Successfully loaded more data:', {
          newDataLength: formattedData.length,
          dataPoints: newDataPoints,
        });

        // Update the data and force a re-render with the fresh data
        console.log('✅ New data loaded, forcing re-render with fresh data');
        console.log('📊 Data update details:', {
          oldDataLength: chartState.allData.length,
          newDataLength: formattedData.length,
          newDataAdded: formattedData.length - chartState.allData.length,
        });

        // Force a re-render with the fresh data immediately
        if (svgRef.current && chartState.chartLoaded) {
          console.log('🔄 Forcing immediate re-render with fresh data');

          // Set flag to prevent React effect from overriding
          manualRenderInProgressRef.current = true;

          // Get current transform
          const currentZoomTransform = d3.zoomTransform(svgRef.current);

          // Calculate chart state with the FRESH data
          const calculations = calculateChartState({
            dimensions: chartState.dimensions,
            allChartData: formattedData, // Use the fresh data directly
            transform: currentZoomTransform,
            fixedYScaleDomain: chartState.fixedYScaleDomain,
          });

          // Update clip-path to accommodate the expanded dataset
          updateClipPath(svgRef.current as SVGSVGElement, formattedData, chartState.dimensions);

          // Update X-axis with the new data
          const xAxisGroup = d3.select(svgRef.current).select<SVGGElement>('.x-axis');
          if (!xAxisGroup.empty()) {
            const { innerHeight: axisInnerHeight } = calculateInnerDimensions(
              chartState.dimensions
            );

            // Create time-based scale that maps data indices to screen coordinates
            // Add safety check to prevent error when formattedData is empty
            if (formattedData.length === 0) {
              console.warn('createIndexToTimeScale called with empty formattedData');
              return;
            }
            const indexToTimeScale = createIndexToTimeScale(
              calculations.transformedXScale,
              formattedData
            );

            // Calculate time-based tick values (every 20 data points) for the new dataset
            const newTimeBasedTickValues = calculateTimeBasedTickValues(formattedData, 20);

            xAxisGroup.attr('transform', `translate(0,${axisInnerHeight})`);
            xAxisGroup.call(createXAxis(indexToTimeScale, formattedData, newTimeBasedTickValues));
            applyAxisStyling(xAxisGroup);
          }

          // Re-render with fresh data
          renderCandlestickChartWithCallback(svgRef.current as SVGSVGElement, calculations);

          console.log('✅ Immediate re-render completed with fresh data:', {
            allDataLength: calculations.allData.length,
            viewRange: `${calculations.viewStart}-${calculations.viewEnd}`,
          });

          // Reset flag after a delay
          setTimeout(() => {
            manualRenderInProgressRef.current = false;
          }, 1000);
        }
      })
      .catch((error) => {
        console.error('Failed to load more data:', error);
        // Revert the data points on error
        setExperimentDataPoints(experimentDataPoints);
      });
  };

  // Function to move chart to rightmost position (newest data)
  const moveToRightmost = (): void => {
    if (!isValidData || chartState.allData.length === 0) {
      return;
    }

    const totalDataLength = chartState.allData.length;
    const newEndIndex = totalDataLength - 1;
    const newStartIndex = Math.max(0, totalDataLength - CHART_DATA_POINTS);

    console.log('🎯 Moving to rightmost position:', {
      totalDataLength,
      newStartIndex,
      newEndIndex,
      rangeSize: newEndIndex - newStartIndex + 1,
    });

    // Calculate the transform needed to show the rightmost data
    const { innerWidth } = calculateInnerDimensions(chartState.dimensions);
    const bandWidth = innerWidth / CHART_DATA_POINTS;

    // Calculate how much we need to pan to the right to show the newest data
    const rightmostDataIndex = totalDataLength - 1;
    const panOffsetPixels = (rightmostDataIndex - newEndIndex) * bandWidth;

    // Create a transform that pans to the rightmost position
    const transform = d3.zoomIdentity.translate(panOffsetPixels, 0);

    // Update the current transform state
    setCurrentTransform(transform);

    // Calculate the new chart state with this transform
    const calculations = calculateChartState({
      dimensions: chartState.dimensions,
      allChartData: chartState.allData,
      transform,
      fixedYScaleDomain: chartState.fixedYScaleDomain,
    });

    // Update view state using centralized calculations
    chartActions.setCurrentViewStart(calculations.viewStart);
    chartActions.setCurrentViewEnd(calculations.viewEnd);

    // Apply transform to the main chart content group
    if (svgRef.current) {
      const svg = d3.select(svgRef.current);

      // Update the D3 zoom behavior's internal transform state
      if (zoomBehaviorRef.current) {
        svg.call(zoomBehaviorRef.current.transform, transform);
      }

      const chartContentGroup = svg.select<SVGGElement>('.chart-content');
      if (!chartContentGroup.empty()) {
        chartContentGroup.attr('transform', calculations.transformString);
      }

      // Update X-axis using time-based scale that aligns with candlesticks
      const xAxisGroup = svg.select<SVGGElement>('.x-axis');
      if (!xAxisGroup.empty()) {
        const { innerHeight: axisInnerHeight } = calculateInnerDimensions(chartState.dimensions);

        // Create time-based scale that maps data indices to screen coordinates
        // Add safety check to prevent error when allData is empty
        if (chartState.allData.length === 0) {
          console.warn('createIndexToTimeScale called with empty allData');
          return;
        }
        const indexToTimeScale = createIndexToTimeScale(
          calculations.transformedXScale,
          chartState.allData
        );

        // Calculate time-based tick values (every 20 data points) for the full dataset
        // This ensures consistent tick count between initial load and pan/zoom
        const allDataTimeBasedTickValues = calculateTimeBasedTickValues(chartState.allData, 20);

        xAxisGroup.attr('transform', `translate(0,${axisInnerHeight})`);
        xAxisGroup.call(
          createXAxis(indexToTimeScale, chartState.allData, allDataTimeBasedTickValues)
        );
        applyAxisStyling(xAxisGroup);
      }

      // Update Y-axis using centralized calculations
      const yAxisGroup = svg.select<SVGGElement>('.y-axis');
      if (!yAxisGroup.empty()) {
        yAxisGroup.call(createYAxis(calculations.transformedYScale));
        applyAxisStyling(yAxisGroup);
      }

      // Re-render candlesticks with the new view
      renderCandlestickChartWithCallback(svgRef.current as SVGSVGElement, calculations);

      // Update buffer range with smart boundary-aware buffer
      const bufferSize = Math.max(
        MIN_BUFFER_SIZE,
        Math.floor(CHART_DATA_POINTS * BUFFER_SIZE_MULTIPLIER)
      );
      const dataLength = chartState.allData.length;
      const marginSize = MARGIN_SIZE;
      const atDataStart = calculations.viewStart <= marginSize; // Within margin of data start
      const atDataEnd = calculations.viewEnd >= dataLength - marginSize; // Within margin of data end

      let actualStart, actualEnd;

      if (atDataStart && atDataEnd) {
        // At both boundaries - use the full data range
        actualStart = 0;
        actualEnd = dataLength - 1;
      } else if (atDataStart) {
        // At start boundary - only buffer forward
        actualStart = 0;
        actualEnd = Math.min(dataLength - 1, Math.ceil(calculations.viewEnd) + bufferSize);
      } else if (atDataEnd) {
        // At end boundary - only buffer backward
        actualStart = Math.max(0, Math.floor(calculations.viewStart) - bufferSize);
        actualEnd = dataLength - 1;
      } else {
        // In the middle - buffer both ways
        actualStart = Math.max(0, Math.floor(calculations.viewStart) - bufferSize);
        actualEnd = Math.min(dataLength - 1, Math.ceil(calculations.viewEnd) + bufferSize);
      }

      currentBufferRangeRef.current = { start: actualStart, end: actualEnd };

      console.log('🔄 Buffer range updated in moveToRightmost:', {
        newBufferRange: `${actualStart}-${actualEnd}`,
        viewRange: `${calculations.viewStart}-${calculations.viewEnd}`,
        bufferSize,
        dataLength,
      });
    }
  };

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

  // Chart data management is now handled by useChartStateManager

  // WebSocket for real-time data
  const chartWebSocket = useChartWebSocket({
    symbol,
    onChartData: (bar) => {
      if (chartState.isLive) {
        console.log('📊 Received WebSocket data:', bar);
        chartActions.updateChartWithLiveData(bar);
      }
    },
  });

  // Update visible data when view changes
  useEffect(() => {
    if (isValidData) {
      const newVisibleData = getVisibleData(chartState.currentViewStart, chartState.currentViewEnd);
      // console.log('Updating visible data:', {
      //   currentViewStart: chartState.currentViewStart,
      //   currentViewEnd: chartState.currentViewEnd,
      //   allChartDataLength: chartState.allData.length,
      //   newVisibleDataLength: newVisibleData.length,
      //   newVisibleDataStart: newVisibleData[0]?.time,
      //   newVisibleDataEnd: newVisibleData[newVisibleData.length - 1]?.time,
      // });
      chartActions.setData(newVisibleData);
    }
  }, [
    chartState.currentViewStart,
    chartState.currentViewEnd,
    chartState.allData,
    isValidData,
    getVisibleData,
  ]); // Removed chartActions

  // Load saved timeframe from localStorage and load initial data
  useEffect(() => {
    if (isLoadingDataRef.current) {
      console.log('🔄 Data loading already in progress, skipping duplicate request');
      return;
    }

    try {
      const savedTimeframe = getLocalStorageItem<ChartTimeframe>('chartTimeframe', '1h');
      setTimeframe(savedTimeframe);

      // Load initial data immediately
      console.log('🔄 Loading initial data for symbol:', { symbol, timeframe: savedTimeframe });
      isLoadingDataRef.current = true;
      chartActions
        .loadChartData(symbol, savedTimeframe, DEFAULT_CHART_DATA_POINTS, DATA_PRELOAD_BUFFER)
        .finally(() => {
          isLoadingDataRef.current = false;
        });
    } catch (error) {
      console.warn('Failed to load chart timeframe from localStorage:', error);
      setTimeframe('1h');

      // Load initial data with default timeframe
      console.log('🔄 Loading initial data with default timeframe:', { symbol, timeframe: '1h' });
      isLoadingDataRef.current = true;
      chartActions
        .loadChartData(symbol, '1h', DEFAULT_CHART_DATA_POINTS, DATA_PRELOAD_BUFFER)
        .finally(() => {
          isLoadingDataRef.current = false;
        });
    }
  }, [symbol]); // Removed chartActions to prevent infinite loops

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
    if (timeframe !== null && !isLoadingDataRef.current) {
      chartActions.resetChart(); // Reset chart state for new symbol/timeframe
      chartActions.setTimeframe(timeframe);

      console.log('🔄 Loading new data for symbol/timeframe:', { symbol, timeframe });
      isLoadingDataRef.current = true;
      chartActions
        .loadChartData(symbol, timeframe, DEFAULT_CHART_DATA_POINTS, DATA_PRELOAD_BUFFER)
        .finally(() => {
          isLoadingDataRef.current = false;
        });
    }
  }, [symbol, timeframe]); // Removed chartActions to prevent infinite loops

  // Cleanup refs on unmount
  useEffect(() => {
    return () => {
      isLoadingDataRef.current = false;
      chartCreatedRef.current = false;
    };
  }, []);

  // Reset refs when symbol changes
  useEffect(() => {
    chartCreatedRef.current = false;
    initialViewSetRef.current = false;
  }, [symbol]);

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
        const newDimensions = {
          ...chartState.dimensions,
          width: rect.width,
          height: Math.max(MIN_CHART_HEIGHT, rect.height - CHART_HEIGHT_OFFSET),
        };

        console.log('🔄 Resize detected:', {
          containerWidth: rect.width,
          containerHeight: rect.height,
          newWidth: newDimensions.width,
          newHeight: newDimensions.height,
          currentWidth: chartState.dimensions.width,
          currentHeight: chartState.dimensions.height,
        });

        chartActions.setDimensions(newDimensions);
      }
    };

    // Use a small delay to ensure container is properly sized
    const timeoutId = setTimeout(() => {
      handleResize();
    }, 100);

    // Also try again after a longer delay to catch any late container sizing
    const fallbackTimeoutId = setTimeout(() => {
      handleResize();
    }, 500);

    // Also use ResizeObserver for more accurate container size detection
    let resizeObserver: ResizeObserver | null = null;
    if (containerRef.current && window.ResizeObserver) {
      resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          if (entry.target === containerRef.current) {
            handleResize();
          }
        }
      });
      resizeObserver.observe(containerRef.current);
    }

    window.addEventListener('resize', handleResize);
    return () => {
      clearTimeout(timeoutId);
      clearTimeout(fallbackTimeoutId);
      window.removeEventListener('resize', handleResize);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, []); // No dependencies needed - just sets dimensions

  // Separate effect to handle dimension changes and re-render chart
  useEffect(() => {
    if (
      svgRef.current &&
      chartState.chartLoaded &&
      chartState.chartExists &&
      chartState.allData.length > 0
    ) {
      // Get current transform
      const currentZoomTransform = d3.zoomTransform(svgRef.current);

      // Calculate new chart state with updated dimensions
      const calculations = calculateChartState({
        dimensions: chartState.dimensions,
        allChartData: chartState.allData,
        transform: currentZoomTransform,
        fixedYScaleDomain: chartState.fixedYScaleDomain,
      });

      console.log('🔄 Dimensions changed, re-rendering chart:', {
        width: chartState.dimensions.width,
        height: chartState.dimensions.height,
        innerWidth: calculations.innerWidth,
        innerHeight: calculations.innerHeight,
        bandWidth: calculations.innerWidth / CHART_DATA_POINTS,
        baseXScaleDomain: calculations.baseXScale.domain(),
        baseXScaleRange: calculations.baseXScale.range(),
      });

      // Update clip-path for new dimensions
      updateClipPath(svgRef.current as SVGSVGElement, chartState.allData, chartState.dimensions);

      // Update X-axis with new dimensions
      const xAxisGroup = d3.select(svgRef.current).select<SVGGElement>('.x-axis');
      if (!xAxisGroup.empty()) {
        const { innerHeight: axisInnerHeight } = calculateInnerDimensions(chartState.dimensions);

        // Create time-based scale that maps data indices to screen coordinates
        if (chartState.allData.length > 0) {
          // Use the base X scale since the chart content group already has the transform applied
          // This prevents double transformation (scale + group transform)
          const indexToTimeScale = createIndexToTimeScale(
            calculations.baseXScale, // Use base scale since transform is applied to content group
            chartState.allData
          );
          const timeBasedTickValues = calculateTimeBasedTickValues(chartState.allData, 20);

          console.log('🔄 Updating X-axis on resize:', {
            innerWidth: calculations.innerWidth,
            bandWidth: calculations.innerWidth / CHART_DATA_POINTS,
            scaleDomain: calculations.baseXScale.domain(),
            scaleRange: calculations.baseXScale.range(),
            tickCount: timeBasedTickValues.length,
          });

          xAxisGroup.attr('transform', `translate(0,${axisInnerHeight})`);
          xAxisGroup.call(createXAxis(indexToTimeScale, chartState.allData, timeBasedTickValues));
          applyAxisStyling(xAxisGroup);
        }
      }

      // Update Y-axis with new dimensions
      const yAxisGroup = d3.select(svgRef.current).select<SVGGElement>('.y-axis');
      if (!yAxisGroup.empty()) {
        const { innerWidth: axisInnerWidth } = calculateInnerDimensions(chartState.dimensions);
        yAxisGroup.attr('transform', `translate(${axisInnerWidth},0)`);
        // Use base Y scale since the chart content group already has the transform applied
        yAxisGroup.call(createYAxis(calculations.baseYScale));
        applyAxisStyling(yAxisGroup);
      }

      // Update chart content group transform
      const chartContentGroup = d3.select(svgRef.current).select<SVGGElement>('.chart-content');
      if (!chartContentGroup.empty()) {
        chartContentGroup.attr('transform', calculations.transformString);
      }

      // Re-render candlesticks with new dimensions
      // Note: candlesticks will use base scales since transform is applied to chart content group
      renderCandlestickChartWithCallback(svgRef.current as SVGSVGElement, calculations);

      // Update overlay for new dimensions
      const overlay = d3.select(svgRef.current).select<SVGRectElement>('.overlay');
      if (!overlay.empty()) {
        const { innerWidth, innerHeight } = calculateInnerDimensions(chartState.dimensions);
        overlay.attr('width', innerWidth).attr('height', innerHeight);
      }
    }
  }, [chartState.dimensions.width, chartState.dimensions.height]); // Trigger when dimensions change

  // Set initial view to show newest data when data loads
  useEffect(() => {
    if (isValidData && !initialViewSetRef.current) {
      const totalDataLength = chartState.allData.length;

      // If this is the first load, show newest data with proper buffer setup
      if (chartState.data.length === 0 && totalDataLength > 0) {
        // Set up initial view to show most recent data with full buffer available
        const newEndIndex = totalDataLength - 1;
        const newStartIndex = Math.max(0, totalDataLength - CHART_DATA_POINTS);

        console.log('Initial load - setting view indices:', {
          totalDataLength,
          CHART_DATA_POINTS,
          newStartIndex,
          newEndIndex,
          rangeSize: newEndIndex - newStartIndex + 1,
        });

        chartActions.setViewport(newStartIndex, newEndIndex);
        initialViewSetRef.current = true;
      }
    }
  }, [chartState.allData.length, isValidData]); // Removed chartState.data.length to prevent re-runs

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

  // Initial candlestick rendering when data first loads and chart is ready
  useEffect((): void => {
    console.log('🔄 Data length change effect triggered:', {
      isValidData,
      dataLength: chartState.data.length,
      allDataLength: chartState.allData.length,
      chartLoaded: chartState.chartLoaded,
      manualRenderInProgress: manualRenderInProgressRef.current,
    });

    if (manualRenderInProgressRef.current) {
      console.log('⏭️ Skipping React effect - manual render in progress');
      return;
    }

    if (!isValidData || !chartState.data.length || !chartState.chartLoaded) {
      console.log('❌ Early return from data length effect');
      return;
    }
    if (svgRef.current) {
      // Create calculations for initial render (no transform)
      const initialTransform = d3.zoomIdentity;
      const calculations = calculateChartState({
        dimensions: chartState.dimensions,
        allChartData: chartState.allData,
        transform: initialTransform,
        fixedYScaleDomain: null, // Don't use fixed domain yet
      });

      // Calculate the fixed Y-scale domain based on the VISIBLE data slice
      // This ensures the Y-scale is appropriate for what's actually shown
      let fixedYScaleDomain: [number, number] | null = null;
      if (isValidChartData(calculations.visibleData)) {
        const visibleData = calculations.visibleData;
        const initialYMin = d3.min(visibleData, (d) => d.low) as number;
        const initialYMax = d3.max(visibleData, (d) => d.high) as number;
        const priceRange = initialYMax - initialYMin;
        const padding = priceRange * PRICE_PADDING_MULTIPLIER;
        fixedYScaleDomain = [initialYMin - padding, initialYMax + padding];

        // Set the fixed Y-scale domain for future renders
        chartActions.setFixedYScaleDomain(fixedYScaleDomain);
        fixedYScaleDomainRef.current = fixedYScaleDomain; // Store in ref for zoom handler
        console.log('🔒 Y-axis locked to VISIBLE data range (initial render):', {
          visibleDataLength: visibleData.length,
          viewRange: `${calculations.viewStart}-${calculations.viewEnd}`,
          yDomain: fixedYScaleDomain,
        });
      }

      // Recalculate with the fixed Y-scale domain
      const finalCalculations = calculateChartState({
        dimensions: chartState.dimensions,
        allChartData: chartState.allData,
        transform: initialTransform,
        fixedYScaleDomain: fixedYScaleDomain,
      });

      // Update clip-path to accommodate the current dataset
      updateClipPath(svgRef.current as SVGSVGElement, chartState.allData, chartState.dimensions);

      // Only render candlesticks on initial data load
      // Subsequent renders are handled by the zoom handler

      renderCandlestickChartWithCallback(svgRef.current as SVGSVGElement, finalCalculations);

      // Set initial buffer range with smart boundary-aware buffer
      const bufferSize = Math.max(
        MIN_BUFFER_SIZE,
        Math.floor(CHART_DATA_POINTS * BUFFER_SIZE_MULTIPLIER)
      );
      const dataLength = finalCalculations.allData.length;
      const marginSize = MARGIN_SIZE;
      const atDataStart = finalCalculations.viewStart <= marginSize; // Within margin of data start
      const atDataEnd = finalCalculations.viewEnd >= dataLength - marginSize; // Within margin of data end

      let actualStart, actualEnd;

      if (atDataStart && atDataEnd) {
        // At both boundaries - use the full data range
        actualStart = 0;
        actualEnd = dataLength - 1;
      } else if (atDataStart) {
        // At start boundary - only buffer forward
        actualStart = 0;
        actualEnd = Math.min(dataLength - 1, Math.ceil(finalCalculations.viewEnd) + bufferSize);
      } else if (atDataEnd) {
        // At end boundary - only buffer backward
        actualStart = Math.max(0, Math.floor(finalCalculations.viewStart) - bufferSize);
        actualEnd = dataLength - 1;
      } else {
        // In the middle - buffer both ways
        actualStart = Math.max(0, Math.floor(finalCalculations.viewStart) - bufferSize);
        actualEnd = Math.min(dataLength - 1, Math.ceil(finalCalculations.viewEnd) + bufferSize);
      }

      currentBufferRangeRef.current = { start: actualStart, end: actualEnd };

      console.log('🔄 Initial buffer range set:', {
        newBufferRange: `${actualStart}-${actualEnd}`,
        viewRange: `${finalCalculations.viewStart}-${finalCalculations.viewEnd}`,
        bufferSize,
        dataLength,
      });
    }
  }, [
    chartState.allData.length, // Only re-render when data length changes (new data loaded)
    chartState.dimensions,
    chartState.chartLoaded, // Wait for chart to be fully loaded
    isValidData,
  ]);

  // Create chart when data is available and view is properly set
  useEffect(() => {
    // Only create chart if it hasn't been created yet and we have valid data
    if (chartCreatedRef.current) {
      return; // Chart already created, skip
    }

    // Only log when we're actually going to create a chart
    if (
      isValidData &&
      chartState.currentViewEnd > 0 &&
      chartState.data.length > 0 &&
      chartState.allData.length > 0 &&
      !chartState.chartExists
    ) {
      console.log('Chart creation effect triggered:', {
        isValidData,
        currentViewEnd: chartState.currentViewEnd,
        dataLength: chartState.data.length,
        allDataLength: chartState.allData.length,
        isLoading: chartState.isLoading,
        error: chartState.error,
        chartExists: chartState.chartExists,
      });
    }

    if (
      isValidData &&
      chartState.currentViewEnd > 0 &&
      chartState.data.length > 0 &&
      chartState.allData.length > 0 &&
      !chartState.chartExists
    ) {
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
        // Ensure we have the latest dimensions before creating the chart
        let dimensionsToUse = chartState.dimensions;

        if (containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          const latestDimensions = {
            ...chartState.dimensions,
            width: rect.width,
            height: Math.max(MIN_CHART_HEIGHT, rect.height - CHART_HEIGHT_OFFSET),
          };

          console.log('🔄 Updating dimensions before chart creation:', {
            containerWidth: rect.width,
            containerHeight: rect.height,
            newWidth: latestDimensions.width,
            newHeight: latestDimensions.height,
            currentWidth: chartState.dimensions.width,
            currentHeight: chartState.dimensions.height,
          });

          // Update dimensions if they've changed
          if (
            latestDimensions.width !== chartState.dimensions.width ||
            latestDimensions.height !== chartState.dimensions.height
          ) {
            chartActions.setDimensions(latestDimensions);
            dimensionsToUse = latestDimensions;
          }
        }

        // Create calculations for chart creation
        const initialTransform = d3.zoomIdentity;
        const calculations = calculateChartState({
          dimensions: dimensionsToUse,
          allChartData: chartState.allData,
          transform: initialTransform,
          fixedYScaleDomain: chartState.fixedYScaleDomain,
        });

        createChart({
          svgElement: svgRef.current as SVGSVGElement,
          allChartData: chartState.allData, // This will be updated via getCurrentData
          xScale: calculations.baseXScale,
          yScale: calculations.baseYScale,
          visibleData: chartState.data,
          dimensions: dimensionsToUse,
          stateCallbacks: {
            setIsZooming: chartActions.setIsZooming,
            setCurrentViewStart: chartActions.setCurrentViewStart,
            setCurrentViewEnd: chartActions.setCurrentViewEnd,
            setHoverData: chartActions.setHoverData,
            setChartLoaded: chartActions.setChartLoaded,
            setFixedYScaleDomain: chartActions.setFixedYScaleDomain,
            setChartExists: chartActions.setChartExists,
            setCurrentTransform: setCurrentTransform,
            forceRerender,
            setZoomBehavior: (behavior) => {
              zoomBehaviorRef.current = behavior;
            },
            getFixedYScaleDomain: () => fixedYScaleDomainRef.current,
            getCurrentData: () => currentDataRef.current,
            getCurrentDimensions: () => currentDimensionsRef.current, // Add this to avoid stale dimensions
          },
          chartState: {
            fixedYScaleDomain: chartState.fixedYScaleDomain,
            chartLoaded: chartState.chartLoaded,
          },
          bufferRangeRef: currentBufferRangeRef,
          isPanningRef: isPanningRef,
          onBufferedCandlesRendered: loadMoreDataOnBufferedRender,
        });

        // Mark chart as created to prevent re-creation
        chartCreatedRef.current = true;
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
                onClick={() =>
                  timeframe &&
                  chartActions.loadChartData(
                    symbol,
                    timeframe,
                    DEFAULT_CHART_DATA_POINTS,
                    DATA_PRELOAD_BUFFER
                  )
                }
                className="p-1 text-muted-foreground hover:text-foreground"
                title="Refresh data"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
              <button
                onClick={moveToRightmost}
                className="p-1 text-muted-foreground hover:text-foreground"
                title="Move to newest data"
                disabled={!isValidData || chartState.allData.length === 0}
              >
                <ArrowRight className="h-4 w-4" />
              </button>
              <button
                onClick={fetchMoreData}
                className="flex items-center space-x-1 px-3 py-1 rounded-md text-sm transition-colors bg-orange-500 text-white hover:bg-orange-600"
                title="Fetch more historical data (+20 points)"
                disabled={!timeframe}
              >
                + More Data
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
        {chartState.isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted-foreground">Loading chart data...</p>
            </div>
          </div>
        ) : chartState.error ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <p className="text-destructive mb-4">{chartState.error}</p>
              <button
                onClick={() =>
                  timeframe &&
                  chartActions.loadChartData(
                    symbol,
                    timeframe,
                    DEFAULT_CHART_DATA_POINTS,
                    DATA_PRELOAD_BUFFER
                  )
                }
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
              >
                Retry
              </button>
            </div>
          </div>
        ) : !isValidData || chartState.allData.length === 0 ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <p className="text-muted-foreground">No data available</p>
            </div>
          </div>
        ) : (
          <div className="w-full h-full relative" style={{ minHeight: '400px' }}>
            {/* Custom Title Component */}
            <div className="mb-4 px-2 h-12 flex items-center">
              {chartState.hoverData?.data ? (
                <div className="flex justify-between items-center w-full">
                  <div className="flex flex-col">
                    <span className="font-bold text-foreground text-lg">{symbol}</span>
                    <span className="text-sm text-muted-foreground">
                      {new Date(chartState.hoverData.data.time).toLocaleString()}
                    </span>
                  </div>
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

      {/* Chart Footer - Debug Information */}
      <div className="p-4 border-t border-border">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <div className="flex items-center space-x-4">
            {/* Data Information */}
            <span>Total: {chartState.allData.length}</span>
            <span>Visible: {CHART_DATA_POINTS}</span>
            <span>Data Points: {experimentDataPoints}</span>
            <span>
              View:{' '}
              {(() => {
                const actualStart = Math.max(0, chartState.currentViewStart);
                const actualEnd = Math.min(
                  chartState.allData.length - 1,
                  chartState.currentViewEnd
                );
                const actualPoints = actualEnd - actualStart + 1;
                return `${Math.round(actualStart)}-${Math.round(actualEnd)} (${Math.round(
                  actualPoints
                )})`;
              })()}
            </span>
            <span>TF: {timeframe || 'Loading...'}</span>
            <span>Pan: {Math.round(currentTransform?.x || 0)}px</span>
          </div>
          <div className="flex items-center space-x-4">
            {/* Chart State Information */}
            <div className="flex items-center space-x-2">
              <div
                className={`w-2 h-2 rounded-full ${
                  chartState.chartLoaded ? 'bg-green-500' : 'bg-gray-500'
                }`}
              ></div>
              <span>{chartState.chartLoaded ? 'Chart Ready' : 'Loading...'}</span>
            </div>
            <div className="flex items-center space-x-2">
              <div
                className={`w-2 h-2 rounded-full ${
                  chartState.isLive ? 'bg-green-500' : 'bg-gray-500'
                }`}
              ></div>
              <span>{chartState.isLive ? 'Live' : 'Historical'}</span>
            </div>
            {chartState.isZooming && (
              <div className="flex items-center space-x-1">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                <span className="text-xs text-blue-500">Zooming</span>
              </div>
            )}
            {isAtRightEdge && !chartState.isLive && (
              <div className="flex items-center space-x-1">
                <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
                <span className="text-xs text-yellow-500">Auto-live</span>
              </div>
            )}
            {experimentDataPoints > DEFAULT_CHART_DATA_POINTS && (
              <div className="flex items-center space-x-1">
                <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                <span className="text-xs text-orange-500">
                  Extended ({experimentDataPoints} pts)
                </span>
              </div>
            )}
            <span className="text-xs text-muted-foreground">D3.js</span>
          </div>
        </div>

        {/* Additional Debug Information - Collapsible */}
        <details className="mt-2">
          <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
            Debug Details
          </summary>
          <div className="mt-2 grid grid-cols-2 gap-4 text-xs text-muted-foreground">
            <div>
              <div className="font-medium text-foreground mb-1">Data State</div>
              <div>Valid Data: {isValidData ? '✓' : '✗'}</div>
              <div>Chart Exists: {chartState.chartExists ? '✓' : '✗'}</div>
              <div>Data Length: {chartState.data.length}</div>
              <div>All Data Length: {chartState.allData.length}</div>
            </div>
            <div>
              <div className="font-medium text-foreground mb-1">View State</div>
              <div>View Start: {chartState.currentViewStart}</div>
              <div>View End: {chartState.currentViewEnd}</div>
              <div>At Right Edge: {isAtRightEdge ? '✓' : '✗'}</div>
              <div>Y-Scale Fixed: {chartState.fixedYScaleDomain ? '✓' : '✗'}</div>
            </div>
            <div>
              <div className="font-medium text-foreground mb-1">Rendering System</div>
              <div>Chart Points: {CHART_DATA_POINTS}</div>
              <div>Total Data: {chartState.allData.length}</div>
              <div>Rendering: All Data</div>
              <div>Clipping: Viewport</div>
            </div>
            <div>
              <div className="font-medium text-foreground mb-1">Dimensions</div>
              <div>Width: {Math.round(chartState.dimensions.width)}</div>
              <div>Height: {Math.round(chartState.dimensions.height)}</div>
              <div>
                Inner W:{' '}
                {Math.round(
                  chartState.dimensions.width -
                    chartState.dimensions.margin.left -
                    chartState.dimensions.margin.right
                )}
              </div>
              <div>
                Inner H:{' '}
                {Math.round(
                  chartState.dimensions.height -
                    chartState.dimensions.margin.top -
                    chartState.dimensions.margin.bottom
                )}
              </div>
            </div>
          </div>
        </details>
      </div>
    </div>
  );
};

export default D3StockChart;
