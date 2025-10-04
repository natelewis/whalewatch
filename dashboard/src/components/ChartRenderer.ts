import * as d3 from 'd3';
import React from 'react';
import {
  CANDLE_UP_COLOR,
  CANDLE_DOWN_COLOR,
  CHART_DATA_POINTS,
  ZOOM_SCALE_MIN,
  ZOOM_SCALE_MAX,
  X_AXIS_MARKER_DATA_POINT_INTERVAL,
  HOVER_DISPLAY,
} from '../constants';
import { logger } from '../utils/logger';
import { ChartDimensions, CandlestickData } from '../types';
import {
  calculateInnerDimensions,
  hasRequiredChartParams,
  clampIndex,
  isValidChartData,
  createCustomTimeAxis,
  createYAxis,
  applyAxisStyling,
  createViewportXScale,
  isFakeCandle,
  calculateXAxisParams,
} from '../utils/chartDataUtils';
import { memoizedCalculateChartState } from '../utils/memoizedChartUtils';
import { smartDateRenderer } from '../utils/dateRenderer';
import { checkAutoLoadTrigger, renderPanning } from '../utils/renderManager';
import { createChartPanningThrottle, createPerformanceTimer } from '../utils/throttleUtils';

// ============================================================================
// CONFIGURATION CONSTANTS - imported from centralized constants
// ============================================================================

// ============================================================================
// TYPES
// ============================================================================

// Import types from centralized location
import { ChartStateCallbacks, ChartState, ChartCalculations } from '../types';

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
  isPanningRef: React.MutableRefObject<boolean>;
  onBufferedCandlesRendered?: (direction: 'past' | 'future') => void;
}): (() => void) => {
  if (!svgElement) {
    logger.chart.render('createChart: No svgElement found, skipping chart creation (SVG element not mounted yet)');
    return () => {}; // Return empty cleanup function
  }

  // Check if DOM element exists (for hot reload scenarios)
  const gElementExists = !d3.select(svgElement).select('g').empty();

  if (
    !hasRequiredChartParams({ allChartData, xScale, yScale, visibleData }) ||
    (chartState.chartLoaded && gElementExists) || // Only skip if chart is loaded AND DOM element exists
    !allChartData ||
    allChartData.length === 0
  ) {
    return () => {}; // Return empty cleanup function
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
    logger.warn('createIndexToTimeScale called with empty allChartData in initial render');
    return () => {}; // Return empty cleanup function
  }
  // Get interval-based configuration
  const interval = chartState.timeframe || '1m';

  // Use shared calculation logic for consistency across all rendering scenarios
  // If viewport is not set (both are 0), use a reasonable default showing the last ~80 data points
  let viewStart, viewEnd;
  if (chartState.currentViewStart === 0 && chartState.currentViewEnd === 0) {
    // Default viewport: show the last CHART_DATA_POINTS data points
    viewEnd = allChartData.length - 1;
    viewStart = Math.max(0, allChartData.length - CHART_DATA_POINTS);
  } else {
    viewStart = Math.max(0, Math.floor(chartState.currentViewStart || 0));
    viewEnd = Math.min(allChartData.length - 1, Math.ceil(chartState.currentViewEnd || allChartData.length - 1));
  }

  const xAxisParams = calculateXAxisParams({
    viewStart,
    viewEnd,
    allChartData,
    innerWidth: chartInnerWidth,
    timeframe: interval,
  });

  const xAxis = g
    .append('g')
    .attr('class', 'x-axis')
    .attr('transform', `translate(0,${chartInnerHeight})`)
    .call(
      createCustomTimeAxis(
        xAxisParams.viewportXScale as unknown as d3.ScaleLinear<number, number>,
        allChartData,
        xAxisParams.labelConfig.markerIntervalMinutes,
        X_AXIS_MARKER_DATA_POINT_INTERVAL,
        xAxisParams.visibleSlice,
        xAxisParams.interval
      )
    );

  // Create Y-axis group
  const yAxis = g.append('g').attr('class', 'y-axis').attr('transform', `translate(${chartInnerWidth},0)`);
  yAxis.call(createYAxis(yScale));

  applyAxisStyling(xAxis);
  applyAxisStyling(yAxis);

  // Keep a reference to the most recently used transformed Y scale for perfect sync
  // Initialize with the base yScale, but immediately update if a transform exists in chartState
  let lastTransformedYScale: d3.ScaleLinear<number, number> = yScale;
  if (chartState.currentTransformY !== undefined && chartState.currentTransformK !== undefined) {
    const initialTransform = d3.zoomIdentity
      .translate(0, chartState.currentTransformY)
      .scale(chartState.currentTransformK);
    lastTransformedYScale = initialTransform.rescaleY(yScale);
  }

  // Store reference to SVG element for global scale updates
  const svgElementRef = svgElement;

  // Show all tick marks and labels

  const zoom = d3.zoom<SVGSVGElement, unknown>().scaleExtent([ZOOM_SCALE_MIN, ZOOM_SCALE_MAX]);
  // Only allow wheel zoom through d3.zoom; we'll handle panning ourselves
  zoom.filter(event => (event as { type?: string }).type === 'wheel');

  // Store reference to zoom behavior for programmatic control
  if (stateCallbacks.setZoomBehavior) {
    stateCallbacks.setZoomBehavior(zoom as d3.ZoomBehavior<SVGSVGElement, unknown>);
  }

  // Add crosshair
  const crosshair = g.append('g').attr('class', 'crosshair').style('pointer-events', 'none');

  // Add date display
  const dateDisplay = g.append('g').attr('class', 'date-display').style('pointer-events', 'none');

  // Add price display (to the right of the horizontal crosshair, over y-axis labels)
  const priceDisplay = g.append('g').attr('class', 'price-display').style('pointer-events', 'none');

  crosshair
    .append('line')
    .attr('class', 'crosshair-x')
    .attr('stroke', 'hsl(var(--muted-foreground))')
    .attr('stroke-Bufferwidth', 1)
    .attr('stroke-dasharray', '3,3')
    .style('opacity', 0);

  crosshair
    .append('line')
    .attr('class', 'crosshair-y')
    .attr('stroke', 'hsl(var(--muted-foreground))')
    .attr('stroke-width', 1)
    .attr('stroke-dasharray', '3,3')
    .style('opacity', 0);

  // Date display elements
  const dateDisplayRect = dateDisplay
    .append('rect')
    .attr('class', 'date-display-bg')
    .attr('rx', 0)
    .attr('ry', 0)
    .style('opacity', 0);

  const dateDisplayText = dateDisplay
    .append('text')
    .attr('class', 'date-display-text')
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'middle')
    .style('opacity', 0);

  // Price display elements
  const priceDisplayRect = priceDisplay
    .append('rect')
    .attr('class', 'price-display-bg')
    .attr('rx', 0)
    .attr('ry', 0)
    .style('opacity', 0);

  const priceDisplayText = priceDisplay
    .append('text')
    .attr('class', 'price-display-text')
    .attr('text-anchor', 'start')
    .attr('dominant-baseline', 'middle')
    .style('opacity', 0);

  // Pointer overlay for custom pan
  const overlayRect = g
    .append('rect')
    .attr('class', 'overlay')
    .attr('width', innerWidth)
    .attr('height', innerHeight)
    .style('fill', 'none')
    .style('pointer-events', 'all');

  // Hover behavior
  overlayRect
    .on('mouseover', () => {
      crosshair.select('.crosshair-x').style('opacity', 1);
      crosshair.select('.crosshair-y').style('opacity', 1);
    })
    .on('mouseout', () => {
      crosshair.select('.crosshair-x').style('opacity', 0);
      crosshair.select('.crosshair-y').style('opacity', 0);
      dateDisplayRect.style('opacity', 0);
      dateDisplayText.style('opacity', 0);
      priceDisplayRect.style('opacity', 0);
      priceDisplayText.style('opacity', 0);
      if (stateCallbacks.setHoverData) {
        stateCallbacks.setHoverData(null);
      }
      if (stateCallbacks.setDateDisplay) {
        stateCallbacks.setDateDisplay(null);
      }
    })
    .on('mousemove', event => {
      const [mouseX, mouseY] = d3.pointer(event);

      // Always recompute scales using the latest data and dimensions to avoid stale closures
      const currentData = stateCallbacks.getCurrentData?.() || allChartData;
      const currentDimensions = stateCallbacks.getCurrentDimensions?.() || dimensions;

      if (!isValidChartData(currentData)) {
        return;
      }

      const { innerWidth: currInnerWidth, innerHeight: currInnerHeight } = calculateInnerDimensions(currentDimensions);

      // Use the same scale calculation as candlestick positioning for proper synchronization
      // This ensures hover data matches the actual candlestick positions
      const currentViewStart = stateCallbacks.getCurrentViewStart?.() || 0;
      const currentViewEnd = stateCallbacks.getCurrentViewEnd?.() || currentData.length - 1;

      // Create the same scale used for candlestick positioning
      const xScaleForHover = createViewportXScale(currentViewStart, currentViewEnd, currentData.length, currInnerWidth);
      const mouseIndex = xScaleForHover.invert(mouseX);
      const index = Math.round(mouseIndex);

      const clampedIndex = clampIndex(index, currentData.length);
      const d = currentData[clampedIndex];

      if (d && !isFakeCandle(d)) {
        // Always update crosshair to follow cursor position exactly (with latest dimensions)
        // This works both during normal hover and during panning
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

        // Update date display
        if (stateCallbacks.setDateDisplay) {
          const currentMargin = currentDimensions.margin;
          const dateText = smartDateRenderer(d.timestamp, 'chart-hover');

          // Position the date display below the vertical domain line
          const dateDisplayY = currInnerHeight + 20; // 20px below the chart

          stateCallbacks.setDateDisplay({
            x: mouseX + currentMargin.left,
            y: dateDisplayY + currentMargin.top,
            timestamp: dateText,
            visible: true,
          });

          // Update the visual date display elements
          // First set the text to measure its width
          dateDisplayText
            .attr('x', mouseX)
            .attr('y', dateDisplayY - 5.5)
            .text(dateText)
            .attr('fill', HOVER_DISPLAY.FILL_COLOR)
            .attr('font-size', HOVER_DISPLAY.FONT_SIZE)
            .attr('font-family', HOVER_DISPLAY.FONT_FAMILY)
            .style('opacity', 1);

          // Calculate text width and add padding on each side
          const textWidth = dateDisplayText.node()?.getBBox().width || 0;
          const rectWidth = textWidth + HOVER_DISPLAY.DATE_BOX_PADDING * 2;
          const rectX = mouseX - rectWidth / 2;

          dateDisplayRect
            .attr('x', rectX)
            .attr('y', dateDisplayY - 13)
            .attr('width', rectWidth)
            .attr('height', HOVER_DISPLAY.DATE_BOX_HEIGHT)
            .attr('fill', 'hsl(var(--background))')
            .attr('stroke', 'hsl(var(--muted-foreground))')
            .attr('stroke-width', 1)
            .style('opacity', 1);
        }

        // Update price display aligned with horizontal crosshair and over y-axis labels
        {
          // Use the exact same transformed Y-scale used for the latest render
          const currentTransformedScale = getGlobalLastTransformedYScale(lastTransformedYScale);
          const priceAtCursor = currentTransformedScale.invert(mouseY);
          const priceTextStr = Number.isFinite(priceAtCursor) ? priceAtCursor.toFixed(2) : '';

          // Position box starting just to the right of the chart area (over y-axis labels)
          const boxX = currInnerWidth + 4; // small offset into the y-axis label area

          priceDisplayText
            .attr('x', boxX + HOVER_DISPLAY.PRICE_BOX_PADDING) // Left-justify text with padding
            .attr('y', mouseY + 1)
            .text(priceTextStr)
            .attr('fill', HOVER_DISPLAY.FILL_COLOR)
            .attr('font-size', HOVER_DISPLAY.FONT_SIZE)
            .attr('font-family', HOVER_DISPLAY.FONT_FAMILY)
            .style('opacity', 1);

          priceDisplayRect
            .attr('x', boxX)
            .attr('y', mouseY - HOVER_DISPLAY.PRICE_BOX_HEIGHT / 2)
            .attr('width', HOVER_DISPLAY.PRICE_BOX_WIDTH)
            .attr('height', HOVER_DISPLAY.PRICE_BOX_HEIGHT)
            .attr('fill', 'hsl(var(--background))')
            .attr('stroke', 'hsl(var(--muted-foreground))')
            .attr('stroke-width', 1)
            .style('opacity', 1);
        }
      }
    });

  // Custom pan variables
  let isPointerDown = false;
  let panStartXLocal = 0;
  let panStartCenterLocal = 0;
  // Initialize vertical pan from chartState to persist across re-renders
  let currentTransformY = chartState.currentTransformY || 0;
  let currentTransformK = chartState.currentTransformK || 1;
  let lastKnownDataLength = allChartData.length;
  let loadRequestedLeft = false;
  let loadRequestedRight = false;
  let lastLoadDataLengthLeft: number | null = null;
  let lastLoadDataLengthRight: number | null = null;
  let currentViewStart = 0;
  let currentViewEnd = 0;
  let currentDataLength = 0;

  const getWindowSize = (): number => CHART_DATA_POINTS;

  // Performance timer for throttled panning operations
  const panningTimer = createPerformanceTimer('Panning Update');

  // Create throttled panning handler for smooth performance
  const throttledPanningHandler = createChartPanningThrottle(
    (newStart: number, newEnd: number) => {
      panningTimer.end();

      // Get fresh data and dimensions from callbacks (used in rendering)
      const _data = stateCallbacks.getCurrentData?.() || allChartData;
      const _dims = stateCallbacks.getCurrentDimensions?.() || dimensions;

      // Update state callbacks
      if (stateCallbacks.setCurrentViewStart) {
        stateCallbacks.setCurrentViewStart(newStart);
      }
      if (stateCallbacks.setCurrentViewEnd) {
        stateCallbacks.setCurrentViewEnd(newEnd);
      }

      // EXPERIMENT: Disable vertical panning - always use identity transform
      // This means the Y-axis will always be recalculated based on visible data
      currentTransformY = 0; // Always reset to 0
      currentTransformK = 1; // Always reset to 1

      // Persist the vertical pan state for re-renders
      if (stateCallbacks.setCurrentVerticalPan) {
        stateCallbacks.setCurrentVerticalPan(currentTransformY, currentTransformK);
      }

      const currentTransform = d3.zoomIdentity; // EXPERIMENT: Always use identity transform
      if (stateCallbacks.setCurrentTransform) {
        stateCallbacks.setCurrentTransform(currentTransform);
      }

      // Use centralized render function for panning operations
      const renderResult = renderPanning(
        svgElement,
        _dims,
        _data,
        newStart,
        newEnd,
        currentTransform,
        stateCallbacks.getFixedYScaleDomain?.() || null
      );

      if (renderResult.success && renderResult.calculations) {
        // Update latest transformed Y scale used for rendering
        lastTransformedYScale = renderResult.calculations.transformedYScale;

        // Render technical indicators during panning
        if (stateCallbacks.renderTechnicalIndicators && stateCallbacks.getTechnicalIndicatorsData) {
          const technicalIndicatorsData = stateCallbacks.getTechnicalIndicatorsData();
          if (technicalIndicatorsData.length > 0) {
            const renderItems = technicalIndicatorsData.map(item => ({
              id: item.item.id,
              data: item.data,
              color: item.item.color,
              label: item.item.label,
              type: item.item.type,
            }));
            stateCallbacks.renderTechnicalIndicators(svgElement, renderItems, renderResult.calculations);
          }
        }
      }

      // Note: Crosshair and hover updates are handled separately in the main pointermove handler
      // to avoid duplicate calculations and maintain smooth performance
    },
    16 // ~60fps throttling for responsive panning
  );

  overlayRect
    .on('pointerdown', event => {
      isPointerDown = true;
      panStartXLocal = (event as PointerEvent).clientX;
      // If data length changed since last pan (e.g., after add-left or prune),
      // preserve current vertical transform; only update the known length.
      const latestData = stateCallbacks.getCurrentData?.() || allChartData;
      if (latestData.length !== lastKnownDataLength) {
        lastKnownDataLength = latestData.length;
      }
      // Reset edge-trigger flags at the start of a pan
      loadRequestedLeft = false;
      loadRequestedRight = false;
      lastLoadDataLengthLeft = null;
      lastLoadDataLengthRight = null;

      // Prefer live viewport from React state via callbacks to avoid stale or recomputed defaults
      const data = stateCallbacks.getCurrentData?.() || allChartData;
      const dims = stateCallbacks.getCurrentDimensions?.() || dimensions;
      const startFromState = stateCallbacks.getCurrentViewStart?.();
      const endFromState = stateCallbacks.getCurrentViewEnd?.();
      let startIdx = Number.isFinite(startFromState as number) ? Math.floor(startFromState as number) : 0;
      let endIdx = Number.isFinite(endFromState as number) ? Math.floor(endFromState as number) : data.length - 1;
      // Fallback: if invalid, compute from base calcs
      if (!Number.isFinite(startIdx) || !Number.isFinite(endIdx) || endIdx < startIdx) {
        const currentTransform = d3.zoomTransform(svg.node() as SVGSVGElement);
        const baseCalcs = calculateChartState({
          dimensions: dims,
          allChartData: data,
          transform: d3.zoomIdentity.translate(0, currentTransform.y).scale(currentTransform.k),
          fixedYScaleDomain: stateCallbacks.getFixedYScaleDomain?.() || null,
        });
        startIdx = Math.floor(baseCalcs.viewStart);
        endIdx = Math.floor(baseCalcs.viewEnd);
      }
      panStartCenterLocal = Math.floor((startIdx + endIdx) / 2);
      isPanningRef.current = true;
    })
    .on('pointermove', event => {
      if (!isPointerDown) {
        return;
      }
      const data = stateCallbacks.getCurrentData?.() || allChartData;
      const dims = stateCallbacks.getCurrentDimensions?.() || dimensions;
      const { innerWidth: currInnerWidth, innerHeight: currInnerHeight } = calculateInnerDimensions(dims);
      const [pmouseX, pmouseY] = d3.pointer(event);
      const bandWidth = currInnerWidth / CHART_DATA_POINTS;
      // If data length changed during pan (e.g., auto-load left), shift pan anchor to preserve view
      if (data.length !== lastKnownDataLength) {
        const deltaLen = data.length - lastKnownDataLength;
        if (deltaLen !== 0) {
          if (deltaLen > 0 && loadRequestedLeft) {
            panStartCenterLocal = Math.max(0, Math.min(data.length - 1, panStartCenterLocal + deltaLen));
          }
          // For future/right loads with pruning, we rely on React viewport anchoring
        }
        lastKnownDataLength = data.length;
      }
      const dx = (event as PointerEvent).clientX - panStartXLocal;
      const deltaIdx = dx / bandWidth;
      const center = Math.max(0, Math.min(data.length - 1, Math.round(panStartCenterLocal - deltaIdx)));
      const windowSize = getWindowSize();
      const halfWindow = Math.floor(windowSize / 2);
      let newStart = center - halfWindow + 1;
      let newEnd = newStart + windowSize - 1;
      const total = data.length;

      // Update current viewport for auto-load check
      currentViewStart = newStart;
      currentViewEnd = newEnd;
      currentDataLength = total;
      if (newStart < 0) {
        newStart = 0;
        newEnd = Math.min(total - 1, newStart + windowSize - 1);
      }
      if (newEnd > total - 1) {
        newEnd = total - 1;
        newStart = Math.max(0, newEnd - (windowSize - 1));
      }
      // Start performance timer for throttled panning
      panningTimer.start();

      // Use throttled handler for expensive panning operations
      throttledPanningHandler.execute(newStart, newEnd);

      // Keep crosshair and price display synced with pointer during pan
      crosshair
        .select('.crosshair-x')
        .attr('x1', pmouseX)
        .attr('x2', pmouseX)
        .attr('y1', 0)
        .attr('y2', currInnerHeight)
        .style('opacity', 1);

      crosshair
        .select('.crosshair-y')
        .attr('x1', 0)
        .attr('x2', currInnerWidth)
        .attr('y1', pmouseY)
        .attr('y2', pmouseY)
        .style('opacity', 1);

      // Update price display using the active transformed Y-scale
      const currentTransformedScale = getGlobalLastTransformedYScale(lastTransformedYScale);
      const priceAtCursor = currentTransformedScale.invert(pmouseY);
      const priceTextStr = Number.isFinite(priceAtCursor) ? priceAtCursor.toFixed(2) : '';
      const boxX = currInnerWidth + 4;

      priceDisplayText
        .attr('x', boxX + HOVER_DISPLAY.PRICE_BOX_PADDING) // Left-justify text with padding
        .attr('y', pmouseY + 1)
        .text(priceTextStr)
        .attr('fill', HOVER_DISPLAY.FILL_COLOR)
        .attr('font-size', HOVER_DISPLAY.FONT_SIZE)
        .attr('font-family', HOVER_DISPLAY.FONT_FAMILY)
        .style('opacity', 1);

      priceDisplayRect
        .attr('x', boxX)
        .attr('y', pmouseY - HOVER_DISPLAY.PRICE_BOX_HEIGHT / 2)
        .attr('width', HOVER_DISPLAY.PRICE_BOX_WIDTH)
        .attr('height', HOVER_DISPLAY.PRICE_BOX_HEIGHT)
        .attr('fill', 'hsl(var(--background))')
        .attr('stroke', 'hsl(var(--muted-foreground))')
        .attr('stroke-width', 1)
        .style('opacity', 1);

      // Update axes during pan for live feedback
      const svgSel2 = d3.select(svgElement);
      const yAxisGroup = svgSel2.select<SVGGElement>('.y-axis');
      if (!yAxisGroup.empty()) {
        yAxisGroup.call(createYAxis(lastTransformedYScale));
        applyAxisStyling(yAxisGroup);
      }
      const xAxisGroup = svgSel2.select<SVGGElement>('.x-axis');
      if (!xAxisGroup.empty()) {
        const { innerHeight: axisInnerHeight, innerWidth: axisInnerWidth } = calculateInnerDimensions(dims);
        xAxisGroup.attr('transform', `translate(0,${axisInnerHeight})`);

        // Use shared calculation logic for consistency
        const panXAxisParams = calculateXAxisParams({
          viewStart: newStart,
          viewEnd: newEnd,
          allChartData: data,
          innerWidth: axisInnerWidth,
          timeframe: chartState.timeframe || '1m',
        });

        xAxisGroup.call(
          createCustomTimeAxis(
            panXAxisParams.viewportXScale as unknown as d3.ScaleLinear<number, number>,
            data,
            panXAxisParams.labelConfig.markerIntervalMinutes,
            X_AXIS_MARKER_DATA_POINT_INTERVAL,
            panXAxisParams.visibleSlice,
            panXAxisParams.interval
          )
        );
        applyAxisStyling(xAxisGroup);
      }
    })
    .on('pointerup', () => {
      isPointerDown = false;
      isPanningRef.current = false;

      // Ensure final throttled panning update is processed
      throttledPanningHandler.flush();

      // Check auto-load trigger when pan operation is completed
      if (onBufferedCandlesRendered) {
        checkAutoLoadTrigger(
          currentViewStart,
          currentViewEnd,
          currentDataLength,
          onBufferedCandlesRendered,
          { current: loadRequestedLeft },
          { current: loadRequestedRight },
          { current: lastLoadDataLengthLeft },
          { current: lastLoadDataLengthRight }
        );
      }

      loadRequestedLeft = false;
      loadRequestedRight = false;
      lastLoadDataLengthLeft = null;
      lastLoadDataLengthRight = null;
    })
    .on('pointercancel', () => {
      isPointerDown = false;
      isPanningRef.current = false;

      // Ensure final throttled panning update is processed
      throttledPanningHandler.flush();

      loadRequestedLeft = false;
      loadRequestedRight = false;
      lastLoadDataLengthLeft = null;
      lastLoadDataLengthRight = null;
    });

  // Add global pointerup event listener to catch mouse release outside chart area
  const handleGlobalPointerUp = (): void => {
    // End pan if mouse is released anywhere (including outside chart area)
    if (isPointerDown) {
      isPointerDown = false;
      isPanningRef.current = false;

      // Ensure final throttled panning update is processed
      throttledPanningHandler.flush();

      loadRequestedLeft = false;
      loadRequestedRight = false;
      lastLoadDataLengthLeft = null;
      lastLoadDataLengthRight = null;
    }
  };

  // Add global event listener to catch pointerup anywhere on the page
  document.addEventListener('pointerup', handleGlobalPointerUp);

  // Fixed Y-scale domain is now set during initial rendering to ensure consistency

  if (stateCallbacks.setChartLoaded) {
    stateCallbacks.setChartLoaded(true);
  }
  logger.chart.target('CHART LOADED - Axes ready');

  // Return cleanup function to remove event listeners
  return () => {
    document.removeEventListener('pointerup', handleGlobalPointerUp);
  };
};

// Global reference to track the last transformed Y scale for crosshair sync
let globalLastTransformedYScale: d3.ScaleLinear<number, number> | null = null;

// Function to update the global Y scale reference for crosshair sync
export const updateGlobalLastTransformedYScale = (scale: d3.ScaleLinear<number, number>): void => {
  globalLastTransformedYScale = scale;
};

// Function to get the current global Y scale reference
export const getGlobalLastTransformedYScale = (
  fallbackScale: d3.ScaleLinear<number, number>
): d3.ScaleLinear<number, number> => {
  return globalLastTransformedYScale || fallbackScale;
};

export const renderCandlestickChart = (
  svgElement: SVGSVGElement,
  calculations: ChartCalculations,
  useProvidedViewport: boolean = false
): void => {
  // Update global reference for crosshair sync
  updateGlobalLastTransformedYScale(calculations.transformedYScale);
  // Find the chart content group and remove existing candlesticks
  const chartContent = d3.select(svgElement).select('.chart-content');
  if (chartContent.empty()) {
    logger.warn('Chart content group not found, cannot render candlesticks');
    return;
  }

  // Create or reuse the candles layer for idempotent rendering
  let candleSticks = chartContent.select<SVGGElement>('.candle-sticks');
  if (candleSticks.empty()) {
    candleSticks = chartContent.append('g').attr('class', 'candle-sticks');
  } else {
    candleSticks.selectAll('*').remove();
  }

  // Create or reuse the volume lines layer for idempotent rendering
  let volumeLines = chartContent.select<SVGGElement>('.volume-lines');
  if (volumeLines.empty()) {
    volumeLines = chartContent.append('g').attr('class', 'volume-lines');
  } else {
    volumeLines.selectAll('*').remove();
  }

  // Don't apply transform here - it's handled in handleZoom for smooth panning

  const candleWidth = Math.max(1, 4);
  const hoverWidth = Math.max(8, candleWidth * 2); // Wider hover area

  // Render viewport slice - either provided or calculated
  let sliceStart: number;
  let sliceEnd: number;
  let actualStart: number;
  let actualEnd: number;

  if (useProvidedViewport) {
    // Use the provided viewport directly for skip-to and panning operations
    sliceStart = calculations.viewStart;
    sliceEnd = calculations.viewEnd;
    actualStart = sliceStart;
    actualEnd = sliceEnd;
  } else {
    // Use constant-size viewport slice with padding for other operations
    const windowSize = Math.max(1, CHART_DATA_POINTS);
    const halfWindow = Math.floor(windowSize / 2);
    const centerIndex = Math.floor((calculations.viewStart + calculations.viewEnd) / 2);
    const desiredStart = centerIndex - halfWindow + 1;
    const desiredEnd = desiredStart + windowSize - 1;
    actualStart = desiredStart;
    actualEnd = desiredEnd;
    sliceStart = Math.max(0, Math.min(calculations.allData.length - 1, desiredStart));
    sliceEnd = Math.max(sliceStart, Math.min(calculations.allData.length - 1, desiredEnd));
  }
  const core = calculations.allData.slice(sliceStart, sliceEnd + 1);

  let padLeftCount: number;
  let padRightCount: number;

  if (useProvidedViewport) {
    // No padding when using provided viewport
    padLeftCount = 0;
    padRightCount = 0;
  } else {
    // Calculate padding for constant-size viewport
    padLeftCount = Math.max(0, sliceStart - actualStart);
    padRightCount = Math.max(0, actualEnd - sliceEnd);
  }

  const leftFill = core.length > 0 ? core[0] : null;
  const rightFill = core.length > 0 ? core[core.length - 1] : null;
  const padLeft: typeof core = leftFill ? Array.from({ length: padLeftCount }, () => leftFill) : [];
  const padRight: typeof core = rightFill ? Array.from({ length: padRightCount }, () => rightFill) : [];
  const visibleCandles = [...padLeft, ...core, ...padRight];

  // Build safe viewport X scale; avoid collapsed domains at drop
  const xScaleForPosition = createViewportXScale(
    calculations.viewStart,
    calculations.viewEnd,
    calculations.allData.length,
    calculations.innerWidth
  );

  visibleCandles.forEach((d, localIndex) => {
    // Calculate the global data index for proper positioning
    const globalIndex = actualStart + localIndex;

    // Use transformed X scale for positioning
    const x = xScaleForPosition(globalIndex);

    // Check if this is a fake candle
    const isFake = isFakeCandle(d);

    if (isFake) {
      // For fake candles, render only a subtle placeholder
      // This provides visual spacing without showing actual price data
      candleSticks
        .append('rect')
        .attr('x', x - candleWidth / 2)
        .attr('y', 0)
        .attr('width', candleWidth)
        .attr('height', calculations.innerHeight)
        .attr('fill', 'transparent')
        .attr('stroke', 'hsl(var(--muted-foreground))')
        .attr('stroke-width', 0.5)
        .attr('stroke-dasharray', '2,2')
        .attr('class', 'candlestick-fake')
        .style('opacity', 0.3);

      // Add invisible hover area for fake candles too (for consistent interaction)
      candleSticks
        .append('rect')
        .attr('x', x - hoverWidth / 2)
        .attr('y', 0)
        .attr('width', hoverWidth)
        .attr('height', calculations.innerHeight)
        .attr('fill', 'transparent')
        .attr('class', 'candlestick-hover-area')
        .style('cursor', 'pointer')
        .on('mouseover', function () {})
        .on('mouseout', function () {});
    } else {
      // Render normal candlestick for real data
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
        .on('mouseover', function () {})
        .on('mouseout', function () {});

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
    }
  });

  // Render volume lines
  renderVolumeLines(volumeLines, visibleCandles, actualStart, calculations);
};

/**
 * Render volume lines below the chart
 * Volume lines extend from the x-axis upward, with height proportional to volume
 * Color matches candlestick color at 50% opacity
 */
const renderVolumeLines = (
  volumeLinesGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
  visibleCandles: CandlestickData[],
  actualStart: number,
  calculations: ChartCalculations
): void => {
  if (visibleCandles.length === 0) {
    return;
  }

  // Calculate volume scale - use 25% of visible chart height
  const volumeAreaHeight = calculations.innerHeight * 0.25;
  const volumeBaseY = calculations.innerHeight; // Start from bottom of chart

  // Find min and max volume in visible data for scaling
  const volumes = visibleCandles.filter(d => !isFakeCandle(d)).map(d => d.volume);

  if (volumes.length === 0) {
    return;
  }

  const minVolume = Math.min(...volumes);
  const maxVolume = Math.max(...volumes);

  // Avoid division by zero
  if (maxVolume === minVolume) {
    return;
  }

  // Create volume scale
  const volumeScale = d3.scaleLinear().domain([minVolume, maxVolume]).range([0, volumeAreaHeight]);

  // Build safe viewport X scale for positioning
  const xScaleForPosition = createViewportXScale(
    calculations.viewStart,
    calculations.viewEnd,
    calculations.allData.length,
    calculations.innerWidth
  );

  visibleCandles.forEach((d, localIndex) => {
    // Calculate the global data index for proper positioning
    const globalIndex = actualStart + localIndex;

    // Use transformed X scale for positioning
    const x = xScaleForPosition(globalIndex);

    // Check if this is a fake candle
    const isFake = isFakeCandle(d);

    if (!isFake) {
      // Calculate volume line properties
      const volumeHeight = volumeScale(d.volume);
      const lineY = volumeBaseY - volumeHeight;

      // Determine color based on candlestick direction
      const isUp = d.close >= d.open;
      const color = isUp ? CANDLE_UP_COLOR : CANDLE_DOWN_COLOR;

      // Render volume line
      volumeLinesGroup
        .append('line')
        .attr('x1', x)
        .attr('x2', x)
        .attr('y1', volumeBaseY)
        .attr('y2', lineY)
        .attr('stroke', color)
        .attr('stroke-width', 1)
        .attr('opacity', 0.5) // 50% opacity as requested
        .attr('class', 'volume-line');
    }
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

// Function to update axes when dimensions change
export const updateAxes = (
  svgElement: SVGSVGElement,
  dimensions: ChartDimensions,
  allChartData: CandlestickData[],
  currentViewStart: number,
  currentViewEnd: number,
  yScale: d3.ScaleLinear<number, number>,
  timeframe: string = '1m'
): void => {
  const svg = d3.select(svgElement);
  const { innerWidth, innerHeight } = calculateInnerDimensions(dimensions);

  // Update X-axis
  const xAxisGroup = svg.select<SVGGElement>('.x-axis');
  if (!xAxisGroup.empty()) {
    // Update transform to new height
    xAxisGroup.attr('transform', `translate(0,${innerHeight})`);

    // Calculate X-axis parameters with new dimensions
    const xAxisParams = calculateXAxisParams({
      viewStart: currentViewStart,
      viewEnd: currentViewEnd,
      allChartData,
      innerWidth,
      timeframe,
    });

    // Update the X-axis with new scale
    xAxisGroup.call(
      createCustomTimeAxis(
        xAxisParams.viewportXScale as unknown as d3.ScaleLinear<number, number>,
        allChartData,
        xAxisParams.labelConfig.markerIntervalMinutes,
        X_AXIS_MARKER_DATA_POINT_INTERVAL,
        xAxisParams.visibleSlice,
        xAxisParams.interval
      )
    );
    applyAxisStyling(xAxisGroup);
  }

  // Update Y-axis
  const yAxisGroup = svg.select<SVGGElement>('.y-axis');
  if (!yAxisGroup.empty()) {
    // Update transform to new width
    yAxisGroup.attr('transform', `translate(${innerWidth},0)`);

    // Update the Y-axis with new scale
    yAxisGroup.call(createYAxis(yScale));
    applyAxisStyling(yAxisGroup);
  }

  logger.chart.render('Axes updated for dimension change:', {
    width: innerWidth,
    height: innerHeight,
    viewport: `${currentViewStart}-${currentViewEnd}`,
  });
};
