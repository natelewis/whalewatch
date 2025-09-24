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
  LOAD_EDGE_TRIGGER,
  X_AXIS_MARKER_INTERVAL,
  X_AXIS_MARKER_DATA_POINT_INTERVAL,
  X_AXIS_LABEL_CONFIGS,
  HOVER_DISPLAY,
} from '../constants';
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
import { renderPanning, checkAutoLoadTrigger } from '../utils/renderManager';

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
}): (() => void) => {
  if (!svgElement) {
    console.log('createChart: No svgElement found, skipping chart creation (SVG element not mounted yet)');
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
    console.warn('createIndexToTimeScale called with empty allChartData in initial render');
    return () => {}; // Return empty cleanup function
  }
  // Get interval-based configuration
  const interval = chartState.timeframe || '1m';
  const labelConfig = X_AXIS_LABEL_CONFIGS[interval] || X_AXIS_LABEL_CONFIGS['1m'];

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

  console.log('🔍 INITIAL RENDERING DEBUG:', {
    chartStateCurrentViewStart: chartState.currentViewStart,
    chartStateCurrentViewEnd: chartState.currentViewEnd,
    calculatedViewStart: viewStart,
    calculatedViewEnd: viewEnd,
    allChartDataLength: allChartData.length,
    interval,
    viewportSize: viewEnd - viewStart + 1,
    usingDefaultViewport: chartState.currentViewStart === 0 && chartState.currentViewEnd === 0,
  });

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

  // Show all tick marks and labels

  const zoom = d3.zoom<SVGSVGElement, unknown>().scaleExtent([ZOOM_SCALE_MIN, ZOOM_SCALE_MAX]);
  // Only allow wheel zoom through d3.zoom; we'll handle panning ourselves
  zoom.filter(event => (event as { type?: string }).type === 'wheel');
  let panStartX = 0;
  let panStartViewStart = 0;
  let panStartViewEnd = CHART_DATA_POINTS - 1;
  let panStartCenter = Math.floor((panStartViewStart + panStartViewEnd) / 2); // d3-wheel zoom path

  // Store reference to zoom behavior for programmatic control
  if (stateCallbacks.setZoomBehavior) {
    stateCallbacks.setZoomBehavior(zoom as d3.ZoomBehavior<SVGSVGElement, unknown>);
  }

  const handleZoomStart = (): void => {
    const startTransform = d3.zoomTransform(svg.node() as SVGSVGElement);
    panStartX = startTransform.x;
    // Derive start viewport from current data/dimensions to avoid stale chartState
    const startData = stateCallbacks.getCurrentData?.();
    const startDimensions = stateCallbacks.getCurrentDimensions?.();
    if (startData && startData.length > 0 && startDimensions) {
      const calcAtStart = calculateChartState({
        dimensions: startDimensions,
        allChartData: startData,
        transform: startTransform,
        fixedYScaleDomain: stateCallbacks.getFixedYScaleDomain?.() || null,
      });
      panStartViewStart = Math.floor(calcAtStart.viewStart);
      panStartViewEnd = Math.ceil(calcAtStart.viewEnd);
      panStartCenter = Math.floor((panStartViewStart + panStartViewEnd) / 2);
    }
    if (stateCallbacks.setIsZooming) {
      stateCallbacks.setIsZooming(true);
    }
    isPanningRef.current = true;

    // Keep crosshairs visible during panning - they will follow the mouse

    // Lock Y-scale domain at pan start if not already locked to prevent jumps on data loads
    const existingFixed = stateCallbacks.getFixedYScaleDomain?.() || null;
    if (!existingFixed && stateCallbacks.setFixedYScaleDomain) {
      const currentData = stateCallbacks.getCurrentData?.();
      const currentDimensions = stateCallbacks.getCurrentDimensions?.();
      if (currentData && currentData.length > 0 && currentDimensions) {
        const currentTransform = d3.zoomTransform(svg.node() as SVGSVGElement);
        const calc = calculateChartState({
          dimensions: currentDimensions,
          allChartData: currentData,
          transform: currentTransform,
          fixedYScaleDomain: null,
        });
        const minPrice = d3.min(calc.visibleData, d => d.low);
        const maxPrice = d3.max(calc.visibleData, d => d.high);
        if (minPrice != null && maxPrice != null && isFinite(minPrice) && isFinite(maxPrice)) {
          stateCallbacks.setFixedYScaleDomain([minPrice, maxPrice]);
        }
      }
    }
  };

  const handleZoom = (event: d3.D3ZoomEvent<SVGSVGElement, unknown>): void => {
    const zoomStartTime = performance.now();
    const { transform } = event;
    const sourceType = (event.sourceEvent as unknown as { type?: string })?.type;
    // Ignore non-wheel events
    if (sourceType !== 'wheel') {
      return;
    }

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
    // EXPERIMENT: Disable vertical zooming - always use identity transform
    const transformForCalc = d3.zoomIdentity;
    const calcStartTime = performance.now();
    const baseCalcs = calculateChartState({
      dimensions: currentDimensions,
      allChartData: currentData,
      transform: transformForCalc,
      fixedYScaleDomain: currentFixedYScaleDomain,
    });

    // Compute viewport indices from pixel delta
    const { innerWidth: currInnerWidth } = calculateInnerDimensions(currentDimensions);
    const bandWidth = currInnerWidth / CHART_DATA_POINTS;
    const isWheel = true;
    const windowSize = Math.max(1, CHART_DATA_POINTS);
    const halfWindow = Math.floor(windowSize / 2);
    let newCenter = panStartCenter;
    if (!isWheel) {
      const dx = transform.x - panStartX;
      const deltaIdx = dx / bandWidth;
      newCenter = Math.round(panStartCenter - deltaIdx);
    }
    // Allow padding on either side by using center-based window; renderer will handle out-of-bounds gracefully
    const newStart = newCenter - halfWindow;
    const newEnd = newCenter + halfWindow;

    if (stateCallbacks.setCurrentViewStart) {
      stateCallbacks.setCurrentViewStart(newStart);
    }
    if (stateCallbacks.setCurrentViewEnd) {
      stateCallbacks.setCurrentViewEnd(newEnd);
    }

    // Do not apply group transform; we'll re-render during pan for accurate axes and candles
    const chartContentGroup = g.select<SVGGElement>('.chart-content');
    if (!chartContentGroup.empty()) {
      chartContentGroup.attr('transform', null);
    }

    // Update X-axis during zoom using shared calculation logic
    const xAxisGroup = g.select<SVGGElement>('.x-axis');
    if (!xAxisGroup.empty()) {
      const { innerHeight: axisInnerHeight } = calculateInnerDimensions(currentDimensions);
      xAxisGroup.attr('transform', `translate(0,${axisInnerHeight})`);

      // Use shared calculation logic for consistency
      const zoomXAxisParams = calculateXAxisParams({
        viewStart: newStart,
        viewEnd: newEnd,
        allChartData: currentData,
        innerWidth: currInnerWidth,
        timeframe: interval,
      });

      xAxisGroup.call(
        createCustomTimeAxis(
          zoomXAxisParams.viewportXScale as unknown as d3.ScaleLinear<number, number>,
          currentData,
          zoomXAxisParams.labelConfig.markerIntervalMinutes,
          X_AXIS_MARKER_DATA_POINT_INTERVAL,
          zoomXAxisParams.visibleSlice,
          zoomXAxisParams.interval
        )
      );
      applyAxisStyling(xAxisGroup);
    }

    // Update Y-axis using locked domain during zoom
    const yAxisGroup = g.select<SVGGElement>('.y-axis');
    if (!yAxisGroup.empty()) {
      yAxisGroup.call(createYAxis(baseCalcs.transformedYScale));
      applyAxisStyling(yAxisGroup);
    }

    // Use centralized render function for panning/zoom operations
    const renderResult = renderPanning(
      svgElement,
      currentDimensions,
      currentData,
      newStart,
      newEnd,
      transformForCalc,
      currentFixedYScaleDomain
    );

    if (renderResult.success && renderResult.calculations) {
      // Update latest transformed Y scale used for rendering
      lastTransformedYScale = renderResult.calculations.transformedYScale;
    }
  };

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
          const priceAtCursor = lastTransformedYScale.invert(mouseY);
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
  let panStartYLocal = 0;
  let panStartTransformY = 0;
  let panStartTransformK = 1;
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

  overlayRect
    .on('pointerdown', event => {
      isPointerDown = true;
      panStartXLocal = (event as PointerEvent).clientX;
      panStartYLocal = (event as PointerEvent).clientY;
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
      // Capture starting Y-transform and scale for vertical pan
      // Capture starting transform from our internal state (not d3.zoom)
      panStartTransformY = currentTransformY;
      panStartTransformK = currentTransformK;
      const { innerWidth: iw } = calculateInnerDimensions(dims);
      const bw = iw / CHART_DATA_POINTS;
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
      const dy = (event as PointerEvent).clientY - panStartYLocal;
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
      if (stateCallbacks.setCurrentViewStart) {
        stateCallbacks.setCurrentViewStart(newStart);
      }
      if (stateCallbacks.setCurrentViewEnd) {
        stateCallbacks.setCurrentViewEnd(newEnd);
      }

      // Render live
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
      const baseCalcs = calculateChartState({
        dimensions: dims,
        allChartData: data,
        transform: currentTransform,
        fixedYScaleDomain: stateCallbacks.getFixedYScaleDomain?.() || null,
      });
      // Use centralized render function for panning operations
      const renderResult = renderPanning(
        svgElement,
        dims,
        data,
        newStart,
        newEnd,
        currentTransform,
        stateCallbacks.getFixedYScaleDomain?.() || null
      );

      if (renderResult.success && renderResult.calculations) {
        // Update latest transformed Y scale used for rendering
        lastTransformedYScale = renderResult.calculations.transformedYScale;
      }

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
      const priceAtCursor = lastTransformedYScale.invert(pmouseY);
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
        yAxisGroup.call(createYAxis(baseCalcs.transformedYScale));
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
  console.log('🎯 CHART LOADED - Axes ready');

  // Return cleanup function to remove event listeners
  return () => {
    document.removeEventListener('pointerup', handleGlobalPointerUp);
  };
};

export const renderCandlestickChart = (
  svgElement: SVGSVGElement,
  calculations: ChartCalculations,
  useProvidedViewport: boolean = false
): void => {
  const renderStartTime = performance.now();

  // Find the chart content group and remove existing candlesticks
  const chartContent = d3.select(svgElement).select('.chart-content');
  if (chartContent.empty()) {
    console.warn('Chart content group not found, cannot render candlesticks');
    return;
  }

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

  const candlestickRenderStartTime = performance.now();
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
