import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';
import { ChartTimeframe, DEFAULT_CHART_DATA_POINTS } from '../types';
import { getLocalStorageItem, setLocalStorageItem } from '../utils/localStorage';
import { ChartData, useChartData } from '../hooks/useChartData';
import { TimeframeConfig, seedEmptyDataPoints } from '../utils/chartDataUtils';
import { BarChart3, Settings, Play, Pause, RotateCcw } from 'lucide-react';

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
const OUTSIDE_BUFFER = 100; // Read datapoints to the left and right of visible area (off-screen buffer)
const TOTAL_BUFFERED_POINTS = CHART_DATA_POINTS + OUTSIDE_BUFFER * 2; // Total points including buffers

// ============================================================================
// X-AXIS LABEL FORMATTING - Format labels based on timeframe
// ============================================================================
const formatXAxisLabel = (date: Date, timeframe: ChartTimeframe | null): string => {
  if (!timeframe) {
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }

  // For timeframes less than 1 day, show time only
  if (['1m', '5m', '30m', '1h'].includes(timeframe)) {
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }

  // For timeframes 1 day and above, show date with year
  if (['1d', '1w', '1M'].includes(timeframe)) {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  // Fallback to time format
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
};
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
  timeframe,
}: {
  dimensions: ChartDimensions;
  allChartData: ChartData;
  transform: d3.ZoomTransform;
  fixedYScaleDomain: [number, number] | null;
  timeframe: ChartTimeframe | null;
}): ChartCalculations => {
  // Calculate dimensions (single source)
  const { width, height, margin } = dimensions;
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  // Apply data seeding if we have limited data points
  const seededData = timeframe
    ? seedEmptyDataPoints(allChartData, timeframe, CHART_DATA_POINTS)
    : allChartData;

  // Handle cases where we have less data than the ideal buffer size
  const availableDataLength = seededData.length;
  const idealBufferSize = TOTAL_BUFFERED_POINTS;
  const actualBufferSize = Math.min(idealBufferSize, availableDataLength);

  // Calculate view indices with buffer system (single source)
  const panOffsetPixels = transform.x;
  const bandWidth = innerWidth / CHART_DATA_POINTS;
  let panOffset = panOffsetPixels / bandWidth;

  // Constrain panning to prevent going beyond the newest real data
  // Allow unlimited panning to the past (positive panOffset values)
  // But prevent all future panning (negative panOffset values)
  const minPanOffset = 0; // No future panning allowed - stop at newest real data
  if (panOffset < minPanOffset) {
    panOffset = minPanOffset; // Prevent any future panning
  }
  // Allow positive panOffset values (past panning) to pass through unchanged

  // Base view shows most recent data, adjusted for available data
  const baseViewStart = Math.max(0, availableDataLength - actualBufferSize);

  // For initial load (no panning), ensure newest candle is at right edge
  if (panOffset === 0) {
    // On initial load, position so newest candle is at right edge
    // Add a fake future data point to create padding
    const viewEnd = availableDataLength; // One position past the newest candle
    const viewStart = Math.max(0, viewEnd - CHART_DATA_POINTS);

    // Calculate buffer positions around the visible area
    const bufferedViewStart = Math.max(0, viewStart - OUTSIDE_BUFFER);
    const bufferedViewEnd = Math.min(availableDataLength, viewEnd + OUTSIDE_BUFFER);

    // Calculate base scales for full buffer positioning
    // Maps global data indices to screen coordinates, with visible area at [0, innerWidth]
    const baseXScale = d3.scaleLinear().domain([viewStart, viewEnd]).range([0, innerWidth]);

    // Get sorted data first (needed for both x and y scale calculations)
    const sortedData = [...seededData].sort(
      (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
    );

    // Add a fake future data point to create padding on the right
    const lastDataPoint = sortedData[sortedData.length - 1];
    const fakeFuturePoint = {
      time: new Date(new Date(lastDataPoint.time).getTime() + 60000).toISOString(), // 1 minute in the future
      open: lastDataPoint.close,
      high: lastDataPoint.close + 0.01, // Make it slightly visible for debugging
      low: lastDataPoint.close - 0.01,
      close: lastDataPoint.close,
    };
    const dataWithFake = [...sortedData, fakeFuturePoint];

    // Get buffered data (includes off-screen candles for smooth panning)
    const calculatedBufferedData = dataWithFake.slice(bufferedViewStart, bufferedViewEnd + 1);

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

    // Get visible data (center portion) - use data with fake point
    const calculatedVisibleData = dataWithFake.slice(viewStart, viewEnd + 1);

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
  }

  // For panning (panOffset !== 0), use the original buffer-based logic
  const bufferedViewStart = Math.max(
    0,
    Math.min(availableDataLength - actualBufferSize, baseViewStart + panOffset)
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

  // Get sorted data first (needed for both x and y scale calculations)
  const sortedData = [...seededData].sort(
    (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
  );

  // Add fake future data point for panning case too, but only if we're showing recent data
  let dataWithFake = sortedData;
  if (viewEnd >= availableDataLength - 1) {
    const lastDataPoint = sortedData[sortedData.length - 1];
    const fakeFuturePoint = {
      time: new Date(new Date(lastDataPoint.time).getTime() + 60000).toISOString(),
      open: lastDataPoint.close,
      high: lastDataPoint.close + 0.01,
      low: lastDataPoint.close - 0.01,
      close: lastDataPoint.close,
    };
    dataWithFake = [...sortedData, fakeFuturePoint];
  }

  // Get buffered data (includes off-screen candles for smooth panning)
  const calculatedBufferedData = dataWithFake.slice(bufferedViewStart, bufferedViewEnd + 1);

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

  // Get visible data (center portion) - use data with fake point if available
  const calculatedVisibleData = dataWithFake.slice(viewStart, viewEnd + 1);

  // Ensure we have reasonable data lengths
  const actualVisibleData = calculatedVisibleData.length > 0 ? calculatedVisibleData : [];
  const actualBufferedData =
    calculatedBufferedData.length > 0 ? calculatedBufferedData : actualVisibleData;

  // Debug logging for view calculations

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

// Create D3 chart
const createChart = ({
  svgElement,
  // chartExists,
  allChartData,
  xScale,
  yScale,
  chartLoaded,
  visibleData,
  setChartExists,
  dimensions,
  setIsZooming,
  setIsPanning,
  setCurrentViewStart,
  setCurrentViewEnd,
  setHoverData,
  setChartLoaded,
  setFixedYScaleDomain,
  fixedYScaleDomain,
  timeframe,
}: {
  svgElement: SVGSVGElement;
  // chartExists: boolean;
  allChartData: ChartData;
  xScale: d3.ScaleLinear<number, number>;
  yScale: d3.ScaleLinear<number, number>;
  chartLoaded: boolean;
  visibleData: ChartData;
  setChartExists: (value: boolean) => void;
  dimensions: ChartDimensions;
  setIsZooming: (value: boolean) => void;
  setIsPanning: (value: boolean) => void;
  setCurrentViewStart: (value: number) => void;
  setCurrentViewEnd: (value: number) => void;
  setHoverData: (value: HoverData | null) => void;
  setChartLoaded: (value: boolean) => void;
  setFixedYScaleDomain: (value: [number, number] | null) => void;
  fixedYScaleDomain: [number, number] | null;
  timeframe: ChartTimeframe | null;
}): void => {
  if (!svgElement) {
    return;
  }

  // Always clear existing chart elements before creating new ones
  d3.select(svgElement).selectAll('*').remove();

  if (
    !allChartData ||
    !Array.isArray(allChartData) ||
    allChartData.length === 0 ||
    !xScale ||
    !yScale ||
    chartLoaded ||
    !visibleData ||
    visibleData.length === 0
  ) {
    return;
  }

  setChartExists(true);
  const svg = d3.select(svgElement);

  const { width, height, margin } = dimensions;
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  // Apply data seeding if we have limited data points
  const seededData = timeframe
    ? seedEmptyDataPoints(allChartData, timeframe, CHART_DATA_POINTS)
    : allChartData;

  // Sort data by time - always use current state
  const sortedData = [...seededData].sort(
    (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
  );

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
  const { height: chartHeight, margin: chartMargin } = dimensions;
  const chartInnerHeight = chartHeight - chartMargin.top - chartMargin.bottom;

  // Create X-axis using global indices (will be updated dynamically in handleZoom)
  const xAxis = g
    .append('g')
    .attr('class', 'x-axis')
    .attr('transform', `translate(0,${chartInnerHeight})`)
    .call(
      d3
        .axisBottom(xScale)
        .tickSizeOuter(0)
        .ticks(8) // Generate 8 ticks that will slide with the data
        .tickFormat((d) => {
          // Use the scale to get the correct data index
          const dataIndex = Math.round(xScale.invert(d as number));
          // Clamp to valid range
          const clampedIndex = Math.max(0, Math.min(dataIndex, sortedData.length - 1));

          if (clampedIndex >= 0 && clampedIndex < sortedData.length) {
            const date = new Date(sortedData[clampedIndex].time);
            return formatXAxisLabel(date, timeframe);
          }
          return '';
        })
    );

  // Style the domain line to be gray
  xAxis.select('.domain').style('stroke', '#666').style('stroke-width', 1);

  // Create Y-axis
  const yAxis = g
    .append('g')
    .attr('class', 'y-axis')
    .attr('transform', `translate(${innerWidth},0)`)
    .call(d3.axisRight(yScale).tickSizeOuter(0).ticks(10).tickFormat(d3.format('.2f')));

  // Style the domain lines to be gray and remove end tick marks (nubs)
  xAxis.select('.domain').style('stroke', '#666').style('stroke-width', 1);
  yAxis.select('.domain').style('stroke', '#666').style('stroke-width', 1);

  // Style tick lines to be gray, keep labels white
  xAxis.selectAll('.tick line').style('stroke', '#666').style('stroke-width', 1);
  yAxis.selectAll('.tick line').style('stroke', '#666').style('stroke-width', 1);
  xAxis.selectAll('.tick text').style('font-size', '12px');
  yAxis.selectAll('.tick text').style('font-size', '12px');

  // Show all tick marks and labels

  // Store current transform state - separate x and y components
  let currentXTransform = d3.zoomIdentity;
  let currentYScale = 1;
  let currentYTranslate = 0;
  let panStartYTranslate = 0;

  const zoom = d3
    .zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.5, 10])
    .filter((event: Event) => {
      // Only allow drag events, not wheel events
      return (
        !(event as KeyboardEvent).ctrlKey && !(event as MouseEvent).button && event.type !== 'wheel'
      );
    });

  const handleZoomStart = (): void => {
    setIsZooming(true);
    setIsPanning(true);
    // Separate the component of y-translation that comes from wheel-zoom
    // from the component that comes from d3's panning. This prevents a "snap"
    // when starting a new pan after a previous one.
    const lastTransform = d3.zoomTransform(svg.node() as SVGSVGElement);
    const lastPanY = lastTransform.y;
    panStartYTranslate = currentYTranslate - lastPanY;

    // Hide crosshair during panning
    crosshair.select('.crosshair-x').style('opacity', 0);
    crosshair.select('.crosshair-y').style('opacity', 0);
  };

  const handleZoom = (event: d3.D3ZoomEvent<SVGSVGElement, unknown>): void => {
    const { transform } = event;

    // For drag events, only affect x-axis translation (panning)
    let constrainedX = transform.x;
    const minPanOffsetPixels = 0; // No future panning allowed - stop at newest real data

    if (transform.x < minPanOffsetPixels) {
      constrainedX = minPanOffsetPixels; // Prevent any future panning
      const constrainedTransform = d3.zoomIdentity
        .translate(constrainedX, transform.y)
        .scale(transform.k);
      svg.call(zoom.transform, constrainedTransform);
      return; // Exit early to prevent double processing
    }

    // Update x transform for panning
    currentXTransform = d3.zoomIdentity.translate(constrainedX, 0);

    // Update y translate for panning
    currentYTranslate = panStartYTranslate + transform.y;

    // Use centralized calculations for consistency
    const panTransform = d3.zoomIdentity
      .translate(constrainedX, currentYTranslate)
      .scale(currentYScale);
    const calculations = calculateChartState({
      dimensions,
      allChartData: allChartData,
      transform: panTransform,
      fixedYScaleDomain,
      timeframe,
    });

    setCurrentViewStart(calculations.viewStart);
    setCurrentViewEnd(calculations.viewEnd);

    // Apply transform to the main chart content group (includes candlesticks)
    const chartContentGroupElement = g.select<SVGGElement>('.chart-content');
    if (!chartContentGroupElement.empty()) {
      chartContentGroupElement.attr(
        'transform',
        `translate(${constrainedX}, ${currentYTranslate}) scale(1, ${currentYScale})`
      );
    }

    // Update X-axis using the same transformed scale as candlesticks
    const xAxisGroup = g.select<SVGGElement>('.x-axis');
    if (!xAxisGroup.empty()) {
      const { margin: axisMargin } = dimensions;
      const axisInnerHeight = dimensions.height - axisMargin.top - axisMargin.bottom;
      xAxisGroup.attr('transform', `translate(0,${axisInnerHeight})`);
      xAxisGroup.call(
        d3
          .axisBottom(calculations.transformedXScale)
          .ticks(8) // Generate 8 ticks that will slide with the data
          .tickSizeOuter(0)
          .tickFormat((d) => {
            // Use the transformed scale to get the correct data index
            const dataIndex = Math.round(calculations.transformedXScale.invert(d as number));
            // Clamp to valid range
            const clampedIndex = Math.max(
              0,
              Math.min(dataIndex, calculations.bufferedData.length - 1)
            );

            if (clampedIndex >= 0 && clampedIndex < calculations.bufferedData.length) {
              const date = new Date(calculations.bufferedData[clampedIndex].time);
              return formatXAxisLabel(date, timeframe);
            }
            return '';
          })
      );

      // Style the domain line to be gray
      xAxisGroup.select('.domain').style('stroke', '#666').style('stroke-width', 1);
    }

    // Update Y-axis using centralized calculations
    const yAxisGroup = g.select<SVGGElement>('.y-axis');
    if (!yAxisGroup.empty()) {
      yAxisGroup.call(
        d3
          .axisRight(calculations.transformedYScale)
          .tickSizeOuter(0)
          .ticks(10)
          .tickFormat(d3.format('.2f'))
      );

      // Reapply font-size styling to maintain consistency with initial load
      yAxisGroup.selectAll('.tick text').style('font-size', '12px');
    }
  };

  const handleZoomEnd = (): void => {
    setIsZooming(false);
    setIsPanning(false);

    // Don't show crosshair immediately - wait for mouse movement
    // The crosshair will be shown by the mousemove event on the overlay
  };

  zoom.on('start', handleZoomStart).on('zoom', handleZoom).on('end', handleZoomEnd);
  svg.call(zoom);

  // Add separate wheel event handler for vertical zooming only
  svg.on('wheel', (event: WheelEvent) => {
    event.preventDefault();

    // Only affect y-axis scaling, centered on mouse position
    const deltaY = event.deltaY;
    const scaleFactor = deltaY > 0 ? 0.98 : 1.02; // Invert for natural scrolling

    // Get mouse position relative to the chart
    const [, mouseY] = d3.pointer(event, svg.node() as SVGSVGElement);
    const { margin: wheelMargin } = dimensions;
    const relativeY = mouseY - wheelMargin.top;

    // Calculate new y scale
    const newYScale = Math.max(0.5, Math.min(10, currentYScale * scaleFactor));

    // Calculate the y translation to keep the mouse position fixed during zoom
    const scaleChange = newYScale / currentYScale;
    const newYTranslate = relativeY - (relativeY - currentYTranslate) * scaleChange;

    // Update y scale and translation
    currentYScale = newYScale;
    currentYTranslate = newYTranslate;

    // Use centralized calculations for consistency
    const wheelTransform = d3.zoomIdentity
      .translate(currentXTransform.x, currentYTranslate)
      .scale(currentYScale);
    const calculations = calculateChartState({
      dimensions,
      allChartData: allChartData,
      transform: wheelTransform,
      fixedYScaleDomain,
      timeframe,
    });

    // Apply a non-uniform scale transform to the chart content
    // This scales only the Y-axis, leaving the X-axis unaffected
    const chartContentGroupElement = g.select<SVGGElement>('.chart-content');
    if (!chartContentGroupElement.empty()) {
      chartContentGroupElement.attr(
        'transform',
        `translate(${currentXTransform.x}, ${currentYTranslate}) scale(1, ${currentYScale})`
      );
    }

    // Update X-axis using the centralized calculations
    const xAxisGroup = g.select<SVGGElement>('.x-axis');
    if (!xAxisGroup.empty()) {
      const { margin: axisMargin } = dimensions;
      const axisInnerHeight = dimensions.height - axisMargin.top - axisMargin.bottom;
      xAxisGroup.attr('transform', `translate(0,${axisInnerHeight})`);
      xAxisGroup.call(
        d3
          .axisBottom(calculations.transformedXScale)
          .ticks(8) // Generate 8 ticks that will slide with the data
          .tickSizeOuter(0)
          .tickFormat((d) => {
            // Use the transformed scale to get the correct data index
            const dataIndex = Math.round(calculations.transformedXScale.invert(d as number));
            // Clamp to valid range
            const clampedIndex = Math.max(
              0,
              Math.min(dataIndex, calculations.bufferedData.length - 1)
            );

            if (clampedIndex >= 0 && clampedIndex < calculations.bufferedData.length) {
              const date = new Date(calculations.bufferedData[clampedIndex].time);
              return formatXAxisLabel(date, timeframe);
            }
            return '';
          })
      );

      // Style the domain line to be gray
      xAxisGroup.select('.domain').style('stroke', '#666').style('stroke-width', 1);
    }

    // Update Y-axis using the centralized calculations
    const yAxisGroup = g.select<SVGGElement>('.y-axis');
    if (!yAxisGroup.empty()) {
      yAxisGroup.call(
        d3
          .axisRight(calculations.transformedYScale)
          .tickSizeOuter(0)
          .ticks(10)
          .tickFormat(d3.format('.2f'))
      );

      // Reapply font-size styling to maintain consistency with initial load
      yAxisGroup.selectAll('.tick text').style('font-size', '12px');
    }
  });

  // Add crosshair outside the chart content group so it follows cursor directly
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
      // Show crosshairs when mouse enters chart area
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

      // Ensure crosshairs are visible when mouse moves
      crosshair.select('.crosshair-x').style('opacity', 1);
      crosshair.select('.crosshair-y').style('opacity', 1);

      const [mouseX, mouseY] = d3.pointer(event);

      // Get the current transform from the zoom behavior
      const transformedXScale = currentXTransform.rescaleX(xScale);
      const mouseIndex = transformedXScale.invert(mouseX);

      // Find closest data point by index for tooltip data
      const index = Math.round(mouseIndex);

      // Use the full sorted data, not just visible data
      const sortedChartData = [...allChartData].sort(
        (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
      );

      if (!sortedChartData || sortedChartData.length === 0) {
        return;
      }

      const clampedIndex = Math.max(0, Math.min(index, sortedChartData.length - 1));
      const d = sortedChartData[clampedIndex];

      if (d) {
        // Update crosshair to follow the mouse cursor directly
        // Use raw mouse coordinates so crosshair follows cursor during panning
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

  // Set the fixed y-scale domain based on all chart data to lock it during panning
  if (allChartData && allChartData.length > 0) {
    const sortedChartData = [...allChartData].sort(
      (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
    );
    const initialYMin = d3.min(sortedChartData, (d) => d.low) as number;
    const initialYMax = d3.max(sortedChartData, (d) => d.high) as number;
    const priceRange = initialYMax - initialYMin;
    const padding = priceRange * 0.2; // Add 20% padding above and below for more labels
    setFixedYScaleDomain([initialYMin - padding, initialYMax + padding]);
  }

  setChartLoaded(true);
};

// Removed updateCurrentView - now using centralized calculateChartState

const renderCandlestickChart = (
  svgElement: SVGSVGElement,
  calculations: ChartCalculations
): void => {
  // Find the chart content group and remove existing candlesticks
  const chartContent = d3.select(svgElement).select('.chart-content');
  if (chartContent.empty()) {
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

    // Check if this is the fake candle (it will be the last one in the buffered data)
    // Fake candles are identified by being the last item and having a very small price range
    const isFakeCandle =
      bufferedIndex === calculations.bufferedData.length - 1 &&
      calculations.bufferedData.length > 0 &&
      Math.abs(d.high - d.low) < 0.02; // Fake candles have very small price range

    const isUp = d.close >= d.open;

    // make buffered candle transparent
    const opacity = isFakeCandle ? 0 : 1; // 50% opacity for fake candle
    const color = isFakeCandle ? '#ffa500' : isUp ? '#26a69a' : '#ef5350'; // Orange for fake candle

    // High-Low line
    candleSticks
      .append('line')
      .attr('x1', x)
      .attr('x2', x)
      .attr('y1', calculations.baseYScale(d.high))
      .attr('y2', calculations.baseYScale(d.low))
      .attr('stroke', color)
      .attr('stroke-width', 1)
      .style('opacity', opacity);

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
      .style('opacity', opacity);
  });
};

const getVisibleDataPoints = (
  startIndex: number,
  endIndex: number,
  chartData: ChartData,
  timeframe?: ChartTimeframe | null
): ChartData => {
  // Apply data seeding if we have limited data points
  const seededData = timeframe
    ? seedEmptyDataPoints(chartData, timeframe, CHART_DATA_POINTS)
    : chartData;

  // Always use the current state data
  const sortedData = [...seededData].sort(
    (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
  );

  // If no data, return empty array
  if (sortedData.length === 0) {
    return [];
  }

  // If indices are not properly initialized (both 0), return the most recent data
  if (startIndex === 0 && endIndex === 0) {
    const fallbackStart = Math.max(0, sortedData.length - CHART_DATA_POINTS);
    const fallbackEnd = sortedData.length - 1;
    const fallbackData = sortedData.slice(fallbackStart, fallbackEnd + 1);

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
    return slicedData;
  }

  // If we're panning to historical data (negative start), try to get what we can
  if (startIndex < 0) {
    const availableStart = Math.max(0, sortedData.length + startIndex);
    const availableEnd = Math.min(sortedData.length - 1, availableStart + CHART_DATA_POINTS - 1);
    const historicalData = sortedData.slice(availableStart, availableEnd + 1);

    if (historicalData.length > 0) {
      return historicalData;
    }
  }

  // Final fallback: return the most recent data
  const fallbackStart = Math.max(0, sortedData.length - CHART_DATA_POINTS);
  const fallbackEnd = sortedData.length - 1;
  const fallbackData = sortedData.slice(fallbackStart, fallbackEnd + 1);

  return fallbackData;
};

const D3StockChart: React.FC<D3StockChartProps> = ({ symbol }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [timeframe, setTimeframe] = useState<ChartTimeframe | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [hoverData, setHoverData] = useState<HoverData | null>(null);
  const [isZooming, setIsZooming] = useState(false);
  const [, setIsPanning] = useState(false);
  const [chartLoaded, setChartLoaded] = useState(false);
  const [dimensions, setDimensions] = useState<ChartDimensions>({
    width: 800,
    height: 400,
    margin: { top: 20, right: 60, bottom: 40, left: 20 },
  });

  // Panning visible window
  const [currentViewStart, setCurrentViewStart] = useState(0);
  const [currentViewEnd, setCurrentViewEnd] = useState(0);
  const isInitialLoad = useRef(true);

  // Track if chart already exists to avoid unnecessary recreations
  const [chartExists, setChartExists] = useState<boolean>(false);

  // Store fixed y-scale domain to prevent recalculation during panning
  const [fixedYScaleDomain, setFixedYScaleDomain] = useState<[number, number] | null>(null);

  // Define timeframes array
  const timeframes: TimeframeConfig[] = useMemo(
    () => [
      { value: '1m', label: '1m', dataPoints: DEFAULT_CHART_DATA_POINTS },
      { value: '5m', label: '5m', dataPoints: DEFAULT_CHART_DATA_POINTS },
      { value: '30m', label: '30m', dataPoints: DEFAULT_CHART_DATA_POINTS },
      { value: '1h', label: '1h', dataPoints: DEFAULT_CHART_DATA_POINTS },
      { value: '1d', label: '1d', dataPoints: DEFAULT_CHART_DATA_POINTS },
      { value: '1w', label: '1w', dataPoints: DEFAULT_CHART_DATA_POINTS },
      { value: '1M', label: '1M', dataPoints: DEFAULT_CHART_DATA_POINTS },
    ],
    []
  );

  // Chart data management
  const chartDataHook = useChartData({
    timeframes,
    bufferPoints: 100,
  });

  // Derived visible data
  const visibleData: ChartData = useMemo(() => {
    return getVisibleDataPoints(
      currentViewStart,
      currentViewEnd,
      chartDataHook.chartData,
      timeframe
    );
  }, [currentViewStart, currentViewEnd, chartDataHook.chartData, timeframe]);

  // Load saved timeframe from localStorage
  useEffect(() => {
    try {
      const savedTimeframe = getLocalStorageItem<ChartTimeframe>('chartTimeframe', '1h');
      setTimeframe(savedTimeframe);
    } catch (error) {
      setTimeframe('1h');
    }
  }, []);

  // Save timeframe to localStorage
  useEffect(() => {
    if (timeframe !== null) {
      try {
        setLocalStorageItem('chartTimeframe', timeframe);
      } catch (error) {
        // noop
      }
    }
  }, [timeframe]);

  // Load chart data when symbol or timeframe changes
  useEffect(() => {
    if (timeframe !== null) {
      isInitialLoad.current = true;
      setChartExists(false);
      setChartLoaded(false);
      setFixedYScaleDomain(null);
      chartDataHook.loadChartData(symbol, timeframe);
    }
  }, [symbol, timeframe]);

  // WebSocket integration intentionally omitted for now

  // Handle container resize
  useEffect(() => {
    const handleResize = (): void => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setDimensions((prev: ChartDimensions) => {
          const newDims = {
            ...prev,
            width: rect.width,
            height: Math.max(400, rect.height - 100),
          };
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

      if (prevDataLength === 0) {
        const newEndIndex = totalDataLength - 1;
        const newStartIndex = Math.max(0, totalDataLength - CHART_DATA_POINTS);
        setCurrentViewStart(newStartIndex);
        setCurrentViewEnd(newEndIndex);
        isInitialLoad.current = false;
        setChartExists(false);
      }

      prevDataLengthRef.current = totalDataLength;
    }
  }, [chartDataHook.chartData.length]);

  // New edge-triggered loading based on visible window
  const leftLoadInFlightRef = useRef(false);
  const rightLoadInFlightRef = useRef(false);
  useEffect(() => {
    if (!timeframe) {
      return;
    }
    const total = chartDataHook.chartData.length;
    if (total === 0) {
      return;
    }

    const EDGE_THRESHOLD = Math.max(10, Math.floor(CHART_DATA_POINTS * 0.25));

    const leftDistance = currentViewStart;
    if (
      leftDistance <= EDGE_THRESHOLD &&
      !chartDataHook.isLeftLoading &&
      !leftLoadInFlightRef.current
    ) {
      leftLoadInFlightRef.current = true;
      chartDataHook.loadMoreDataLeft(symbol, timeframe).finally(() => {
        leftLoadInFlightRef.current = false;
      });
    }

    const rightDistance = total - 1 - currentViewEnd;
    if (
      rightDistance <= EDGE_THRESHOLD &&
      !chartDataHook.isRightLoading &&
      !rightLoadInFlightRef.current
    ) {
      rightLoadInFlightRef.current = true;
      chartDataHook.loadMoreDataRight(symbol, timeframe).finally(() => {
        rightLoadInFlightRef.current = false;
      });
    }
  }, [
    currentViewStart,
    currentViewEnd,
    chartDataHook.chartData.length,
    timeframe,
    symbol,
    chartDataHook.isLeftLoading,
    chartDataHook.isRightLoading,
  ]);

  // Auto-enable live mode when user pans to the rightmost edge
  const lastRightEdgeCheckRef = useRef<number>(0);
  const RIGHT_EDGE_CHECK_INTERVAL = 1000;
  useEffect(() => {
    const dataLength = chartDataHook.chartData.length;
    const atRightEdge = currentViewEnd >= dataLength - 5;
    const now = Date.now();
    const timeSinceLastCheck = now - lastRightEdgeCheckRef.current;
    if (timeSinceLastCheck >= RIGHT_EDGE_CHECK_INTERVAL) {
      lastRightEdgeCheckRef.current = now;
      if (atRightEdge && !isLive) {
        setIsLive(true);
      } else if (!atRightEdge && isLive) {
        setIsLive(false);
      }
    }
  }, [currentViewEnd, chartDataHook.chartData.length, isLive]);

  useEffect(() => {
    // svgRef.current now points to the <svg> element in the DOM
  }, []);

  // Centralized chart rendering - only re-render when data changes, not during panning
  useEffect(() => {
    if (
      !visibleData ||
      visibleData.length === 0 ||
      !chartDataHook.chartData.length ||
      !chartExists
    ) {
      return;
    }
    if (svgRef.current) {
      const initialTransform = d3.zoomIdentity;
      const calculations = calculateChartState({
        dimensions,
        allChartData: chartDataHook.chartData,
        transform: initialTransform,
        fixedYScaleDomain,
        timeframe,
      });
      renderCandlestickChart(svgRef.current as SVGSVGElement, calculations);
    }
  }, [visibleData, chartDataHook.chartData, dimensions, fixedYScaleDomain, chartExists]);

  // Create chart when data is available and view is properly set
  useEffect(() => {
    if (
      chartDataHook.chartData.length > 0 &&
      currentViewEnd > 0 &&
      visibleData &&
      visibleData.length > 0
    ) {
      if (currentViewStart > currentViewEnd || currentViewEnd < 0) {
        const validViewStart = Math.max(0, chartDataHook.chartData.length - CHART_DATA_POINTS);
        const validViewEnd = chartDataHook.chartData.length - 1;
        setCurrentViewStart(validViewStart);
        setCurrentViewEnd(validViewEnd);
        return;
      }

      const shouldCreateChart =
        !chartExists || (chartDataHook.chartData.length > 0 && !chartLoaded);

      if (shouldCreateChart) {
        const initialTransform = d3.zoomIdentity;
        const calculations = calculateChartState({
          dimensions,
          allChartData: chartDataHook.chartData,
          transform: initialTransform,
          fixedYScaleDomain,
          timeframe,
        });

        createChart({
          svgElement: svgRef.current as SVGSVGElement,
          allChartData: chartDataHook.chartData,
          xScale: calculations.baseXScale,
          yScale: calculations.baseYScale,
          chartLoaded,
          visibleData,
          setChartExists,
          dimensions,
          setIsZooming,
          setIsPanning,
          setCurrentViewStart,
          setCurrentViewEnd,
          setHoverData,
          setChartLoaded,
          setFixedYScaleDomain,
          fixedYScaleDomain,
          timeframe,
        });
      }
    }

    return undefined;
  }, [
    chartDataHook.chartData.length,
    currentViewStart,
    currentViewEnd,
    dimensions,
    visibleData,
    fixedYScaleDomain,
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
              {((): string => {
                const actualStart = Math.max(0, currentViewStart);
                const actualEnd = Math.min(chartDataHook.chartData.length - 1, currentViewEnd);
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
            {(chartDataHook.isLeftLoading || chartDataHook.isRightLoading) && (
              <div className="flex items-center space-x-1">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                <span className="text-xs text-blue-500">Loading more data...</span>
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
