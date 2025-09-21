import * as d3 from 'd3';
import React from 'react';
import {
  BUFFER_SIZE,
  CANDLE_UP_COLOR,
  CANDLE_DOWN_COLOR,
  CHART_DATA_POINTS,
  MARGIN_SIZE,
  ZOOM_SCALE_MIN,
  ZOOM_SCALE_MAX,
  X_AXIS_MARKER_INTERVAL,
  X_AXIS_MARKER_DATA_POINT_INTERVAL,
} from '../constants';
import { ChartDimensions, CandlestickData } from '../types';
import {
  applyAxisStyling,
  createCustomTimeAxis,
  createYAxis,
  calculateInnerDimensions,
  hasRequiredChartParams,
  clampIndex,
  isValidChartData,
} from '../utils/chartDataUtils';
import { memoizedCalculateChartState } from '../utils/memoizedChartUtils';

// ============================================================================
// CONFIGURATION CONSTANTS - imported from centralized constants
// ============================================================================

// ============================================================================
// TYPES
// ============================================================================

export interface ChartCalculations {
  innerWidth: number;
  innerHeight: number;
  baseXScale: d3.ScaleLinear<number, number>;
  baseYScale: d3.ScaleLinear<number, number>;
  transformedXScale: d3.ScaleLinear<number, number>;
  transformedYScale: d3.ScaleLinear<number, number>;
  viewStart: number;
  viewEnd: number;
  visibleData: CandlestickData[];
  allData: CandlestickData[]; // Full dataset for rendering
  transformString: string;
}

// Import types from centralized location
import { ChartStateCallbacks, ChartState } from '../types';

// ============================================================================
// CENTRALIZED CALCULATIONS - Single source of truth for all chart math
// ============================================================================

/**
 * Centralized chart state calculation using memoized function
 * This is the single source of truth for all chart state calculations
 */
export const calculateChartState = memoizedCalculateChartState;

// ============================================================================
// CHART RENDERING FUNCTIONS
// ============================================================================

/**
 * Create D3 chart - Pure D3 function with no React dependencies
 */
export const createChart = ({
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
  stateCallbacks: ChartStateCallbacks;
  chartState: ChartState;
  bufferRangeRef: React.MutableRefObject<{ start: number; end: number } | null>;
  isPanningRef: React.MutableRefObject<boolean>;
  onBufferedCandlesRendered?: (direction: 'past' | 'future') => void;
}): void => {
  if (!svgElement) {
    console.log('createChart: No svgElement found, skipping chart creation (SVG element not mounted yet)');
    return;
  }

  // Check if DOM element exists (for hot reload scenarios)
  const gElementExists = !d3.select(svgElement).select('g').empty();

  if (
    !hasRequiredChartParams({ allChartData, xScale, yScale, visibleData }) ||
    (chartState.chartLoaded && gElementExists) || // Only skip if chart is loaded AND DOM element exists
    !allChartData ||
    allChartData.length === 0
  ) {
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

  // Add a clip-path that matches the chart's inner area (no render buffer)
  svg
    .append('defs')
    .append('clipPath')
    .attr('id', 'clip')
    .append('rect')
    .attr('x', 0)
    .attr('y', 0)
    .attr('width', innerWidth)
    .attr('height', innerHeight);

  // Create chart content group for transforms
  g.append('g').attr('class', 'chart-content').attr('clip-path', 'url(#clip)');

  // Create axes in the main chart group
  const { innerWidth: chartInnerWidth, innerHeight: chartInnerHeight } = calculateInnerDimensions(dimensions);

  // Use the provided base X scale for consistency with calculations
  // This ensures the same scale is used for both initial load and pan/zoom

  // Create X-axis using the same approach as pan/zoom for consistency
  // Add safety check to prevent error when allChartData is empty
  if (allChartData.length === 0) {
    console.warn('createIndexToTimeScale called with empty allChartData in initial render');
    return;
  }
  const xAxis = g
    .append('g')
    .attr('class', 'x-axis')
    .attr('transform', `translate(0,${chartInnerHeight})`)
    .call(
      createCustomTimeAxis(xScale, allChartData, X_AXIS_MARKER_INTERVAL, X_AXIS_MARKER_DATA_POINT_INTERVAL, visibleData)
    );

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
    stateCallbacks.setZoomBehavior(zoom as d3.ZoomBehavior<SVGSVGElement, unknown>);
  }

  const handleZoomStart = (): void => {
    if (stateCallbacks.setIsZooming) {
      stateCallbacks.setIsZooming(true);
    }
    isPanningRef.current = true;

    // Hide crosshairs during panning
    crosshair.select('.crosshair-x').style('opacity', 0);
    crosshair.select('.crosshair-y').style('opacity', 0);
  };

  const handleZoom = (event: d3.D3ZoomEvent<SVGSVGElement, unknown>): void => {
    const zoomStartTime = performance.now();
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
    const calcStartTime = performance.now();
    const calculations = calculateChartState({
      dimensions: currentDimensions,
      allChartData: currentData,
      transform,
      fixedYScaleDomain: currentFixedYScaleDomain,
    });
    const calcEndTime = performance.now();
    console.log(`⏱️ Chart state calculation took: ${(calcEndTime - calcStartTime).toFixed(2)}ms`);

    // Update view state using centralized calculations
    if (stateCallbacks.setCurrentViewStart) {
      stateCallbacks.setCurrentViewStart(calculations.viewStart);
    }
    if (stateCallbacks.setCurrentViewEnd) {
      stateCallbacks.setCurrentViewEnd(calculations.viewEnd);
    }

    // Do not apply transform to the content group; we use transformed scales for positioning
    const chartContentGroup = g.select<SVGGElement>('.chart-content');
    if (!chartContentGroup.empty()) {
      const transformStartTime = performance.now();
      chartContentGroup.attr('transform', null);
      const transformEndTime = performance.now();
      console.log(`⏱️ Transform clear took: ${(transformEndTime - transformStartTime).toFixed(2)}ms`);
    }

    // Update X-axis using time-based scale that aligns with candlesticks
    // Throttle X-axis updates during panning to improve performance
    const xAxisGroup = g.select<SVGGElement>('.x-axis');
    if (!xAxisGroup.empty()) {
      const axisStartTime = performance.now();
      const { innerHeight: axisInnerHeight } = calculateInnerDimensions(currentDimensions);

      // Use custom time axis with proper positioning
      xAxisGroup.attr('transform', `translate(0,${axisInnerHeight})`);
      xAxisGroup.call(
        createCustomTimeAxis(
          calculations.transformedXScale,
          currentData,
          X_AXIS_MARKER_INTERVAL,
          X_AXIS_MARKER_DATA_POINT_INTERVAL,
          calculations.visibleData
        )
      );

      // Apply consistent styling to maintain consistency with initial load
      applyAxisStyling(xAxisGroup);

      // Store current view for next comparison
      xAxisGroup.attr('data-last-view-start', calculations.viewStart);

      const axisEndTime = performance.now();
      console.log(
        `⏱️ X-axis update took: ${(axisEndTime - axisStartTime).toFixed(2)}ms
        })`
      );
    }

    // Update Y-axis using centralized calculations
    const yAxisGroup = g.select<SVGGElement>('.y-axis');
    if (!yAxisGroup.empty()) {
      const yAxisStartTime = performance.now();
      yAxisGroup.call(createYAxis(calculations.transformedYScale));

      // Apply consistent styling to maintain consistency with initial load
      applyAxisStyling(yAxisGroup);
      const yAxisEndTime = performance.now();
      console.log(`⏱️ Y-axis update took: ${(yAxisEndTime - yAxisStartTime).toFixed(2)}ms`);
    }

    // Always re-render all candles on pan (simplicity over optimization)
    const rerenderStartTime = performance.now();
    renderCandlestickChart(svgElement, calculations);
    const rerenderEndTime = performance.now();
    console.log(`⏱️ Candlestick re-render (pan) took: ${(rerenderEndTime - rerenderStartTime).toFixed(2)}ms`);

    // Auto-load is handled on pan end only to avoid recursive storms

    const zoomEndTime = performance.now();
    console.log(`⏱️ Total handleZoom took: ${(zoomEndTime - zoomStartTime).toFixed(2)}ms`);
  };

  const handleZoomEnd = (): void => {
    if (stateCallbacks.setIsZooming) {
      stateCallbacks.setIsZooming(false);
    }
    isPanningRef.current = false;

    // Show crosshairs again if mouse is still over the chart
    // We'll let the mousemove event handle showing them at the correct position

    // After pan/zoom ends, decide if we need to auto-load more data based on edge proximity
    const currentTransform = d3.zoomTransform(svg.node() as SVGSVGElement);
    const currentData = stateCallbacks.getCurrentData?.();
    const currentDimensions = stateCallbacks.getCurrentDimensions?.();
    if (!currentData || !currentDimensions) {
      return;
    }

    const endCalculations = calculateChartState({
      dimensions: currentDimensions,
      allChartData: currentData,
      transform: currentTransform,
      fixedYScaleDomain: stateCallbacks.getFixedYScaleDomain?.() || null,
    });

    const dataLength = endCalculations.allData.length;
    const threshold = Math.max(0, BUFFER_SIZE - CHART_DATA_POINTS);
    const distanceLeft = Math.max(0, Math.floor(endCalculations.viewStart));
    const distanceRight = Math.max(0, Math.floor(dataLength - 1 - endCalculations.viewEnd));

    let loadDirection: 'past' | 'future' | null = null;
    if (distanceLeft <= threshold) {
      loadDirection = 'past';
    } else if (distanceRight <= threshold) {
      loadDirection = 'future';
    }

    if (onBufferedCandlesRendered && loadDirection) {
      console.log('🔄 Auto-loading on pan end due to edge threshold...', {
        loadDirection,
        distanceLeft,
        distanceRight,
        threshold,
      });
      onBufferedCandlesRendered(loadDirection);
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
    .on('mousemove', event => {
      const [mouseX, mouseY] = d3.pointer(event);

      // Always recompute scales using the latest data and dimensions to avoid stale closures
      const currentTransform = d3.zoomTransform(svg.node() as SVGSVGElement);
      const currentData = stateCallbacks.getCurrentData?.() || allChartData;
      const currentDimensions = stateCallbacks.getCurrentDimensions?.() || dimensions;

      if (!isValidChartData(currentData)) {
        return;
      }

      const { innerWidth: currInnerWidth, innerHeight: currInnerHeight } = calculateInnerDimensions(currentDimensions);

      // Recreate the right-aligned base scale for the current dataset length
      const bandWidth = currInnerWidth / CHART_DATA_POINTS;
      const totalDataWidth = currentData.length * bandWidth;
      const rightmostX = currInnerWidth;
      const leftmostX = rightmostX - totalDataWidth;
      const currentBaseXScale = d3
        .scaleLinear()
        .domain([0, currentData.length - 1])
        .range([leftmostX, rightmostX]);

      const transformedXScale = currentTransform.rescaleX(currentBaseXScale);
      const mouseIndex = transformedXScale.invert(mouseX);
      const index = Math.round(mouseIndex);

      const clampedIndex = clampIndex(index, currentData.length);
      const d = currentData[clampedIndex];

      if (d) {
        // Only show crosshairs if not currently panning
        if (!isPanningRef.current) {
          // Update crosshair to follow cursor position exactly (with latest dimensions)
          crosshair
            .select('.crosshair-x')
            .attr('x1', mouseX)
            .attr('x2', mouseX)
            .attr('y1', 0)
            .attr('y2', currInnerHeight)
            .style('opacity', 1);

          crosshair
            .select('.crosshair-y')
            .attr('x1', 0)
            .attr('x2', currInnerWidth)
            .attr('y1', mouseY)
            .attr('y2', mouseY)
            .style('opacity', 1);
        }

        // Update hover data (use current dimensions' margin for accurate positioning)
        if (stateCallbacks.setHoverData) {
          const currentMargin = currentDimensions.margin;
          stateCallbacks.setHoverData({
            x: mouseX + currentMargin.left,
            y: mouseY + currentMargin.top,
            data: {
              timestamp: d.timestamp,
              open: d.open,
              high: d.high,
              low: d.low,
              close: d.close,
              volume: d.volume,
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

export const renderCandlestickChart = (svgElement: SVGSVGElement, calculations: ChartCalculations): void => {
  const renderStartTime = performance.now();
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

  // Debug: log current transform on content group
  const currentContentTransform = chartContent.attr('transform');
  console.log('🧭 chart-content transform:', currentContentTransform);

  // Create or reuse the candles layer for idempotent rendering
  let candleSticks = chartContent.select<SVGGElement>('.candle-sticks');
  if (candleSticks.empty()) {
    candleSticks = chartContent.append('g').attr('class', 'candle-sticks');
  } else {
    candleSticks.selectAll('*').remove();
  }

  // Don't apply transform here - it's handled in handleZoom for smooth panning

  const candleWidth = Math.max(1, 4);
  const hoverWidth = Math.max(8, candleWidth * 2); // Wider hover area

  // Render the entire available dataset (bounded by pruning elsewhere)
  const actualStart = 0;
  const actualEnd = Math.max(0, calculations.allData.length - 1);
  const visibleCandles = calculations.allData;

  // Debug markers: show clip edges and first/last candle x positions (inside chart-content so they move with pan)
  let dbg = chartContent.select<SVGGElement>('.debug-layer');
  if (dbg.empty()) {
    dbg = chartContent.append('g').attr('class', 'debug-layer').style('pointer-events', 'none');
  }
  dbg.selectAll('*').remove();
  const x0 = 0;
  const xW = calculations.innerWidth;
  const xFirst = calculations.baseXScale(0);
  const xLast = calculations.baseXScale(actualEnd);
  dbg
    .append('line')
    .attr('x1', x0)
    .attr('x2', x0)
    .attr('y1', 0)
    .attr('y2', calculations.innerHeight)
    .attr('stroke', '#ff00ff')
    .attr('stroke-width', 1)
    .attr('opacity', 0.5);
  dbg
    .append('line')
    .attr('x1', xW)
    .attr('x2', xW)
    .attr('y1', 0)
    .attr('y2', calculations.innerHeight)
    .attr('stroke', '#ff00ff')
    .attr('stroke-width', 1)
    .attr('opacity', 0.5);
  dbg.append('circle').attr('cx', xFirst).attr('cy', 10).attr('r', 3).attr('fill', '#00c853');
  dbg.append('circle').attr('cx', xLast).attr('cy', 10).attr('r', 3).attr('fill', '#d50000');
  console.log('🧭 debug positions:', {
    xFirst,
    xLast,
    clipLeft: x0,
    clipRight: xW,
    contentTransform: currentContentTransform,
  });

  console.log('🎨 Rendering candlesticks:', {
    allDataLength: calculations.allData.length,
    viewStart: calculations.viewStart,
    viewEnd: calculations.viewEnd,
    actualStart,
    actualEnd,
    visibleCandlesCount: visibleCandles.length,
    scaleDomain: calculations.baseXScale.domain(),
    scaleRange: calculations.baseXScale.range(),
    yScaleDomain: calculations.baseYScale.domain(),
    yScaleRange: calculations.baseYScale.range(),
    firstCandleTime: visibleCandles.length > 0 ? new Date(visibleCandles[0].timestamp).toLocaleString() : 'none',
    lastCandleTime:
      visibleCandles.length > 0
        ? new Date(visibleCandles[visibleCandles.length - 1].timestamp).toLocaleString()
        : 'none',
    firstCandleIndex: actualStart,
    lastCandleIndex: actualEnd,
    firstCandleY: visibleCandles.length > 0 ? calculations.transformedYScale(visibleCandles[0].close) : 'none',
    lastCandleY:
      visibleCandles.length > 0
        ? calculations.transformedYScale(visibleCandles[visibleCandles.length - 1].close)
        : 'none',
  });

  // Use the TRANSFORMED X scale for positioning so candles follow pan/zoom without group transform
  const xScaleForPosition = calculations.transformedXScale;
  console.log('🧮 baseXScale domain/range:', {
    domain: calculations.baseXScale.domain(),
    range: calculations.baseXScale.range(),
    innerWidth: calculations.innerWidth,
    innerHeight: calculations.innerHeight,
  });

  const candlestickRenderStartTime = performance.now();
  visibleCandles.forEach((d, localIndex) => {
    // Calculate the global data index for proper positioning
    const globalIndex = actualStart + localIndex;

    // Use transformed X scale for positioning
    const x = xScaleForPosition(globalIndex);

    const isUp = d.close >= d.open;
    const color = isUp ? CANDLE_UP_COLOR : CANDLE_DOWN_COLOR;

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
        const tooltip = d3.select('body').selectAll<HTMLDivElement, number>('.candlestick-tooltip').data([1]);
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
            <div><strong>Time:</strong> ${new Date(d.timestamp).toLocaleString()}</div>
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
    const highY = calculations.transformedYScale(d.high);
    const lowY = calculations.transformedYScale(d.low);

    candleSticks
      .append('line')
      .attr('x1', x)
      .attr('x2', x)
      .attr('y1', highY)
      .attr('y2', lowY)
      .attr('stroke', color)
      .attr('stroke-width', 1)
      .attr('class', 'candlestick-line');
    // .style('opacity', 1);

    // Open-Close rectangle
    candleSticks
      .append('rect')
      .attr('x', x - candleWidth / 2)
      .attr('y', calculations.transformedYScale(Math.max(d.open, d.close)))
      .attr('width', candleWidth)
      .attr('height', Math.abs(calculations.transformedYScale(d.close) - calculations.transformedYScale(d.open)) || 1)
      .attr('fill', color)
      .attr('stroke', color)
      .attr('stroke-width', 1)
      .attr('class', 'candlestick-rect');
    // .style('opacity', 0.8);
  });

  const candlestickRenderEndTime = performance.now();
  const totalRenderTime = candlestickRenderEndTime - renderStartTime;
  const candlestickLoopTime = candlestickRenderEndTime - candlestickRenderStartTime;

  console.log('🎨 Rendered all candles:', {
    allDataLength: calculations.allData.length,
    candlesRendered: visibleCandles.length,
    visibleDataLength: calculations.visibleData.length,
    viewRange: `${calculations.viewStart}-${calculations.viewEnd}`,
    bufferRange: `${actualStart}-${actualEnd}`,
    rightmostDataIndex: calculations.allData.length - 1,
    rightmostX: calculations.innerWidth,
    scaleInfo: {
      domain: calculations.baseXScale.domain(),
      range: calculations.baseXScale.range(),
      totalWidth: calculations.baseXScale.range()[1] - calculations.baseXScale.range()[0],
    },
    performance: {
      totalRenderTime: `${totalRenderTime.toFixed(2)}ms`,
      candlestickLoopTime: `${candlestickLoopTime.toFixed(2)}ms`,
      candlesPerMs: visibleCandles.length > 0 ? (visibleCandles.length / candlestickLoopTime).toFixed(2) : '0',
    },
  });
};

// Function to update clip-path when data changes
export const updateClipPath = (
  svgElement: SVGSVGElement,
  allChartData: CandlestickData[],
  dimensions: ChartDimensions
): void => {
  const svg = d3.select(svgElement);
  const { innerWidth, innerHeight } = calculateInnerDimensions(dimensions);

  // Update the existing clip-path rectangle to exactly the inner area (no buffer)
  const clipRect = svg.select('#clip rect');
  if (!clipRect.empty()) {
    clipRect.attr('x', 0).attr('y', 0).attr('width', innerWidth).attr('height', innerHeight);
  }
};
