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

  // Create Y-axis group
  const yAxis = g.append('g').attr('class', 'y-axis').attr('transform', `translate(${chartInnerWidth},0)`);
  yAxis.call(createYAxis(yScale));

  applyAxisStyling(xAxis);
  applyAxisStyling(yAxis);

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

    // Hide crosshairs during panning
    crosshair.select('.crosshair-x').style('opacity', 0);
    crosshair.select('.crosshair-y').style('opacity', 0);

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
    // Build calculations ignoring transform.x (index-based panning)
    const transformForCalc = d3.zoomIdentity.translate(0, transform.y).scale(transform.k);
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

    // Update X-axis during zoom with viewport scale and visible slice
    const xAxisGroup = g.select<SVGGElement>('.x-axis');
    if (!xAxisGroup.empty()) {
      const { innerHeight: axisInnerHeight } = calculateInnerDimensions(currentDimensions);
      xAxisGroup.attr('transform', `translate(0,${axisInnerHeight})`);
      const viewportXScale = d3.scaleLinear().domain([newStart, newEnd]).range([0, currInnerWidth]);
      const sliceStart = Math.max(0, Math.min(currentData.length - 1, newStart));
      const sliceEnd = Math.max(sliceStart, Math.min(currentData.length - 1, newEnd));
      const visibleSlice = currentData.slice(sliceStart, sliceEnd + 1);
      xAxisGroup.call(
        createCustomTimeAxis(
          viewportXScale as unknown as d3.ScaleLinear<number, number>,
          currentData,
          X_AXIS_MARKER_INTERVAL,
          X_AXIS_MARKER_DATA_POINT_INTERVAL,
          visibleSlice
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

    // Re-render candles during zoom for real-time visuals
    const calculations = {
      ...baseCalcs,
      viewStart: newStart,
      viewEnd: newEnd,
      visibleData: currentData.slice(newStart, newEnd + 1),
    } as ChartCalculations;
    renderCandlestickChart(svgElement, calculations);
  };

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

  // Custom pan variables
  let isPointerDown = false;
  let panStartXLocal = 0;
  let panStartCenterLocal = 0;
  let panStartYLocal = 0;
  let panStartTransformY = 0;
  let panStartTransformK = 1;
  let currentTransformY = 0;
  let currentTransformK = 1;
  let lastKnownDataLength = allChartData.length;
  let loadRequestedLeft = false;
  let loadRequestedRight = false;
  let lastLoadDataLengthLeft: number | null = null;
  let lastLoadDataLengthRight: number | null = null;

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
      const { innerWidth: currInnerWidth } = calculateInnerDimensions(dims);
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
      // Apply vertical pan by adjusting the Y-transform based on pointer dy (zoom level preserved)
      const newTransformY = panStartTransformY + dy;
      currentTransformY = newTransformY;
      currentTransformK = panStartTransformK;
      const currentTransform = d3.zoomIdentity.translate(0, currentTransformY).scale(currentTransformK);
      if (stateCallbacks.setCurrentTransform) {
        stateCallbacks.setCurrentTransform(currentTransform);
      }
      const baseCalcs = calculateChartState({
        dimensions: dims,
        allChartData: data,
        transform: currentTransform,
        fixedYScaleDomain: stateCallbacks.getFixedYScaleDomain?.() || null,
      });
      const calculations = {
        ...baseCalcs,
        viewStart: newStart,
        viewEnd: newEnd,
        visibleData: data.slice(Math.max(0, newStart), Math.min(data.length - 1, newEnd) + 1),
      } as ChartCalculations;
      renderCandlestickChart(svgElement, calculations);

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
        const viewportXScale = d3.scaleLinear().domain([newStart, newEnd]).range([0, axisInnerWidth]);
        const visibleSlice = data.slice(Math.max(0, newStart), Math.min(total - 1, newEnd) + 1);
        xAxisGroup.call(
          createCustomTimeAxis(
            viewportXScale as unknown as d3.ScaleLinear<number, number>,
            data,
            X_AXIS_MARKER_INTERVAL,
            X_AXIS_MARKER_DATA_POINT_INTERVAL,
            visibleSlice
          )
        );
        applyAxisStyling(xAxisGroup);
      }
      // Edge auto-load trigger during pan
      if (onBufferedCandlesRendered) {
        // Reset per-edge lock when data length changes
        if (lastLoadDataLengthLeft !== null && data.length !== lastLoadDataLengthLeft) {
          loadRequestedLeft = false;
          lastLoadDataLengthLeft = null;
        }
        if (lastLoadDataLengthRight !== null && data.length !== lastLoadDataLengthRight) {
          loadRequestedRight = false;
          lastLoadDataLengthRight = null;
        }

        const distanceLeft = Math.max(0, newStart);
        const distanceRight = Math.max(0, total - 1 - newEnd);
        const threshold = LOAD_EDGE_TRIGGER;

        if (distanceLeft <= threshold && !loadRequestedLeft) {
          loadRequestedLeft = true;
          lastLoadDataLengthLeft = data.length;
          setTimeout(() => onBufferedCandlesRendered('past'), 0);
        }
        if (distanceRight <= threshold && !loadRequestedRight) {
          loadRequestedRight = true;
          lastLoadDataLengthRight = data.length;
          setTimeout(() => onBufferedCandlesRendered('future'), 0);
        }
      }
    })
    .on('pointerup', () => {
      isPointerDown = false;
      isPanningRef.current = false;
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
    })
    .on('mouseleave', () => {
      // Drop pan if mouse leaves the page during panning
      if (isPointerDown) {
        isPointerDown = false;
        isPanningRef.current = false;
        loadRequestedLeft = false;
        loadRequestedRight = false;
        lastLoadDataLengthLeft = null;
        lastLoadDataLengthRight = null;
      }
    });

  // Fixed Y-scale domain is now set during initial rendering to ensure consistency

  if (stateCallbacks.setChartLoaded) {
    stateCallbacks.setChartLoaded(true);
  }
  console.log('🎯 CHART LOADED - Axes ready');
};

export const renderCandlestickChart = (svgElement: SVGSVGElement, calculations: ChartCalculations): void => {
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

  // Render constant-size viewport slice with padding if needed
  const windowSize = Math.max(1, CHART_DATA_POINTS);
  const halfWindow = Math.floor(windowSize / 2);
  const centerIndex = Math.floor((calculations.viewStart + calculations.viewEnd) / 2);
  const desiredStart = centerIndex - halfWindow + 1;
  const desiredEnd = desiredStart + windowSize - 1;
  const actualStart = desiredStart;
  const actualEnd = desiredEnd;
  const sliceStart = Math.max(0, Math.min(calculations.allData.length - 1, desiredStart));
  const sliceEnd = Math.max(sliceStart, Math.min(calculations.allData.length - 1, desiredEnd));
  const core = calculations.allData.slice(sliceStart, sliceEnd + 1);
  const padLeftCount = Math.max(0, sliceStart - desiredStart);
  const padRightCount = Math.max(0, desiredEnd - sliceEnd);
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
