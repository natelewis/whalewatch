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
  onBufferedCandlesRendered?: () => void;
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
    .call(createCustomTimeAxis(xScale, allChartData));

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

    // Apply transform to the main chart content group (includes candlesticks)
    const chartContentGroup = g.select<SVGGElement>('.chart-content');
    if (!chartContentGroup.empty()) {
      const transformStartTime = performance.now();
      // console.log('🔄 Updating chart content group transform:', {
      //   transformString: calculations.transformString,
      //   transformX: transform.x,
      //   transformY: transform.y,
      //   transformK: transform.k,
      //   yScaleDomain: calculations.baseYScale.domain(),
      //   yScaleRange: calculations.baseYScale.range(),
      // });
      chartContentGroup.attr('transform', calculations.transformString);
      const transformEndTime = performance.now();
      console.log(`⏱️ Transform update took: ${(transformEndTime - transformStartTime).toFixed(2)}ms`);
    }

    // Update X-axis using time-based scale that aligns with candlesticks
    // Throttle X-axis updates during panning to improve performance
    const xAxisGroup = g.select<SVGGElement>('.x-axis');
    if (!xAxisGroup.empty()) {
      const axisStartTime = performance.now();
      const { innerHeight: axisInnerHeight } = calculateInnerDimensions(currentDimensions);

      // Use custom time axis with proper positioning
      xAxisGroup.attr('transform', `translate(0,${axisInnerHeight})`);
      xAxisGroup.call(createCustomTimeAxis(calculations.transformedXScale, currentData));

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

    // Check if we need to re-render candlesticks due to panning outside buffer
    const bufferSize = BUFFER_SIZE;
    const currentViewStart = calculations.viewStart;
    const currentViewEnd = calculations.viewEnd;
    const dataLength = calculations.allData.length;

    // Check if current view is outside the current buffer range
    const currentBufferRange = bufferRangeRef.current;

    // Use a fixed margin to prevent oscillation around the threshold
    // Fixed margin is more stable than percentage-based margin
    const marginSize = MARGIN_SIZE;

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

      if (atDataStart && atDataEnd) {
        // At both boundaries - only re-render if view has changed significantly
        const startDiff = Math.abs(currentViewStart - currentBufferRange.start);
        const endDiff = Math.abs(currentViewEnd - currentBufferRange.end);
        needsRerender = startDiff > marginSize || endDiff > marginSize;
        console.log('🔍 At both boundaries:', {
          startDiff,
          endDiff,
          needsRerender,
        });
      } else if (atDataStart) {
        // At start boundary - only check if we've moved forward significantly
        needsRerender = currentViewEnd > currentBufferRange.end - marginSize;
      } else if (atDataEnd) {
        // At end boundary - only check start margin
        needsRerender = currentViewStart < currentBufferRange.start + marginSize;
      } else {
        // In the middle - check both margins
        const startCheck = currentViewStart < currentBufferRange.start + marginSize;
        const endCheck = currentViewEnd > currentBufferRange.end - marginSize;
        needsRerender = startCheck || endCheck;
      }
    }

    if (needsRerender) {
      const rerenderStartTime = performance.now();
      console.log('🔄 Re-rendering candlesticks - view outside buffer range', {
        currentView: `${currentViewStart}-${currentViewEnd}`,
        bufferRange: currentBufferRange ? `${currentBufferRange.start}-${currentBufferRange.end}` : 'none',
        marginSize,
        bufferSize,
      });
      renderCandlestickChart(svgElement, calculations);
      const rerenderEndTime = performance.now();
      console.log(`⏱️ Candlestick re-render took: ${(rerenderEndTime - rerenderStartTime).toFixed(2)}ms`);

      // Trigger data loading callback when buffered candles are rendered during panning
      if (onBufferedCandlesRendered) {
        const dataLoadStartTime = performance.now();
        console.log('🔄 Starting data loading during panning...');
        onBufferedCandlesRendered();
        const dataLoadEndTime = performance.now();
        console.log(`⏱️ Data loading callback took: ${(dataLoadEndTime - dataLoadStartTime).toFixed(2)}ms`);
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

  chartContent.selectAll('.candle-sticks').remove();
  const candleSticks = chartContent.append('g').attr('class', 'candle-sticks');

  // Don't apply transform here - it's handled in handleZoom for smooth panning

  const candleWidth = Math.max(1, 4);
  const hoverWidth = Math.max(8, candleWidth * 2); // Wider hover area

  // Render candles with a buffer around the visible viewport for smooth panning
  // This provides a good balance between performance and smooth interaction
  const bufferSize = BUFFER_SIZE;
  // Convert fractional view indices to integers for proper array slicing
  const actualStart = Math.max(0, Math.floor(calculations.viewStart) - bufferSize);
  const actualEnd = Math.min(calculations.allData.length - 1, Math.ceil(calculations.viewEnd) + bufferSize);
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
    yScaleDomain: calculations.baseYScale.domain(),
    yScaleRange: calculations.baseYScale.range(),
    firstCandleTime: visibleCandles.length > 0 ? new Date(visibleCandles[0].timestamp).toLocaleString() : 'none',
    lastCandleTime:
      visibleCandles.length > 0
        ? new Date(visibleCandles[visibleCandles.length - 1].timestamp).toLocaleString()
        : 'none',
    firstCandleIndex: actualStart,
    lastCandleIndex: actualEnd,
    firstCandleY: visibleCandles.length > 0 ? calculations.baseYScale(visibleCandles[0].close) : 'none',
    lastCandleY:
      visibleCandles.length > 0 ? calculations.baseYScale(visibleCandles[visibleCandles.length - 1].close) : 'none',
  });

  // Use the base linear scale for candlestick positioning since the chart content group
  // already has the transform applied

  const candlestickRenderStartTime = performance.now();
  visibleCandles.forEach((d, localIndex) => {
    // Calculate the global data index for proper positioning
    const globalIndex = actualStart + localIndex;

    // Use the base linear scale for positioning since the chart content group already has the transform applied
    // This prevents double transformation (scale + group transform)
    const x = calculations.baseXScale(globalIndex);

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
    const highY = calculations.baseYScale(d.high);
    const lowY = calculations.baseYScale(d.low);

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
      .attr('y', calculations.baseYScale(Math.max(d.open, d.close)))
      .attr('width', candleWidth)
      .attr('height', Math.abs(calculations.baseYScale(d.close) - calculations.baseYScale(d.open)) || 1)
      .attr('fill', color)
      .attr('stroke', color)
      .attr('stroke-width', 1)
      .attr('class', 'candlestick-rect');
    // .style('opacity', 0.8);
  });

  const candlestickRenderEndTime = performance.now();
  const totalRenderTime = candlestickRenderEndTime - renderStartTime;
  const candlestickLoopTime = candlestickRenderEndTime - candlestickRenderStartTime;

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
  }
};
