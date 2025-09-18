import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import * as d3 from 'd3';
import { ChartTimeframe, DEFAULT_CHART_DATA_POINTS } from '../types';
import { getLocalStorageItem, setLocalStorageItem } from '../utils/localStorage';
import { ChartData, useChartData } from '../hooks/useChartData';
import { useChartWebSocket } from '../hooks/useChartWebSocket';
import { TimeframeConfig } from '../utils/chartDataUtils';
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
const DATA_FETCH_THRESHOLD = 75; // Fetch more data when only this many points remain on either side
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
  const { width, height, margin } = dimensions;
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

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
    const sortedData = [...allChartData].sort(
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

    console.log('Fake data point approach:', {
      originalDataLength: sortedData.length,
      dataWithFakeLength: dataWithFake.length,
      viewStart,
      viewEnd,
      lastRealCandleIndex: sortedData.length - 1,
      fakeCandleIndex: dataWithFake.length - 1,
      scaleDomain: [viewStart, viewEnd],
      scaleRange: [0, innerWidth],
      lastRealCandleX: baseXScale(sortedData.length - 1),
      fakeCandleX: baseXScale(dataWithFake.length - 1),
    });

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

  // Get sorted data first (needed for both x and y scale calculations)
  const sortedData = [...allChartData].sort(
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

    console.log('Panning case - adding fake candle:', {
      viewEnd,
      availableDataLength,
      originalDataLength: sortedData.length,
      dataWithFakeLength: dataWithFake.length,
    });
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
  console.log('🔢 View Calculations:', {
    availableDataLength,
    idealBufferSize,
    actualBufferSize,
    panOffset: Math.round(panOffset * 100) / 100,
    indices: {
      baseViewStart,
      bufferedViewStart,
      bufferedViewEnd,
      viewStart,
      viewEnd,
    },
    dataLengths: {
      actualVisibleData: actualVisibleData.length,
      actualBufferedData: actualBufferedData.length,
    },
    scale: {
      domain: baseXScale.domain(),
      range: baseXScale.range(),
      samplePositions: {
        leftBuffer: `index ${bufferedViewStart} → x=${baseXScale(bufferedViewStart)}`,
        firstVisible: `index ${viewStart} → x=${baseXScale(viewStart)}`,
        lastVisible: `index ${viewEnd} → x=${baseXScale(viewEnd)}`,
        rightBuffer: `index ${bufferedViewEnd} → x=${baseXScale(bufferedViewEnd)}`,
      },
    },
  });

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
  setHasUserPanned,
  setCurrentViewStart,
  setCurrentViewEnd,
  checkAndLoadMoreData,
  setHoverData,
  setChartLoaded,
  setFixedYScaleDomain,
  fixedYScaleDomain,
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
  setHasUserPanned: (value: boolean) => void;
  setCurrentViewStart: (value: number) => void;
  setCurrentViewEnd: (value: number) => void;
  checkAndLoadMoreData: () => void;
  setHoverData: (value: HoverData | null) => void;
  setChartLoaded: (value: boolean) => void;
  setFixedYScaleDomain: (value: [number, number] | null) => void;
  fixedYScaleDomain: [number, number] | null;
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
    !allChartData ||
    !Array.isArray(allChartData) ||
    allChartData.length === 0 ||
    !xScale ||
    !yScale ||
    chartLoaded ||
    !visibleData ||
    visibleData.length === 0
  ) {
    console.log('createChart: Early return conditions:', {
      allChartDataLength: allChartData?.length || 0,
      allChartDataIsArray: Array.isArray(allChartData),
      hasXScale: !!xScale,
      hasYScale: !!yScale,
      chartLoaded,
      hasVisibleData: !!visibleData,
      visibleDataLength: visibleData?.length || 0,
    });
    return;
  }

  setChartExists(true);
  const svg = d3.select(svgElement);
  svg.selectAll('*').remove(); // Clear previous chart

  const { width, height, margin } = dimensions;
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  // Sort data by time - always use current state
  const sortedData = [...allChartData].sort(
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
  const { width: chartWidth, height: chartHeight, margin: chartMargin } = dimensions;
  const chartInnerWidth = chartWidth - chartMargin.left - chartMargin.right;
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
          const globalIndex = Math.round(d as number);
          // Find the data point at this global index
          if (globalIndex >= 0 && globalIndex < sortedData.length) {
            const date = new Date(sortedData[globalIndex].time);
            return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
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
    .attr('transform', `translate(${chartInnerWidth},0)`)
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

  const zoom = d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.5, 10]);

  const handleZoomStart = (): void => {
    setIsZooming(true);
    setIsPanning(true);
    setHasUserPanned(true); // Mark that user has started panning

    // Hide crosshair during panning
    crosshair.select('.crosshair-x').style('opacity', 0);
    crosshair.select('.crosshair-y').style('opacity', 0);
  };

  const handleZoom = (event: d3.D3ZoomEvent<SVGSVGElement, unknown>): void => {
    const { transform } = event;

    // Single source of truth for all calculations
    const calculations = calculateChartState({
      dimensions,
      allChartData: sortedData,
      transform,
      fixedYScaleDomain,
    });

    // Update view state using centralized calculations
    setCurrentViewStart(calculations.viewStart);
    setCurrentViewEnd(calculations.viewEnd);

    // Apply transform to the main chart content group (includes candlesticks)
    const chartContentGroupElement = g.select<SVGGElement>('.chart-content');
    if (!chartContentGroupElement.empty()) {
      chartContentGroupElement.attr('transform', calculations.transformString);
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
            const globalIndex = Math.floor(d as number);
            // Find the data point at this global index
            const sortedChartData = [...allChartData].sort(
              (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
            );
            if (globalIndex >= 0 && globalIndex < sortedChartData.length) {
              const date = new Date(sortedChartData[globalIndex].time);
              return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
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

    checkAndLoadMoreData();
  };

  const handleZoomEnd = (): void => {
    setIsZooming(false);
    setIsPanning(false);

    // Don't show crosshair immediately - wait for mouse movement
    // The crosshair will be shown by the mousemove event on the overlay
  };

  zoom.on('start', handleZoomStart).on('zoom', handleZoom).on('end', handleZoomEnd);
  svg.call(zoom);

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
      const currentTransform = d3.zoomTransform(svg.node() as SVGSVGElement);
      const transformedXScale = currentTransform.rescaleX(xScale);
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
    console.log('🔒 Y-axis locked to full data range:', [
      initialYMin - padding,
      initialYMax + padding,
    ]);
  }

  setChartLoaded(true);
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

    // Check if this is the fake candle (it will be the last one in the buffered data)
    // Fake candles are identified by being the last item and having a very small price range
    const isFakeCandle =
      bufferedIndex === calculations.bufferedData.length - 1 &&
      calculations.bufferedData.length > 0 &&
      Math.abs(d.high - d.low) < 0.02; // Fake candles have very small price range

    console.log(
      `Rendering candle ${bufferedIndex}: globalIndex=${globalIndex}, x=${x}, isFake=${isFakeCandle}`
    );

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

const getVisibleDataPoints = (
  startIndex: number,
  endIndex: number,
  chartData: ChartData
): ChartData => {
  // Always use the current state data
  const sortedData = [...chartData].sort(
    (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
  );

  // If no data, return empty array
  if (sortedData.length === 0) {
    console.log('getVisibleData: No data available');
    return [];
  }

  // If indices are not properly initialized (both 0), return the most recent data
  if (startIndex === 0 && endIndex === 0) {
    const fallbackStart = Math.max(0, sortedData.length - CHART_DATA_POINTS);
    const fallbackEnd = sortedData.length - 1;
    const fallbackData = sortedData.slice(fallbackStart, fallbackEnd + 1);

    console.log('getVisibleData: Indices not initialized, using most recent data', {
      totalData: sortedData.length,
      fallbackStart,
      fallbackEnd,
      fallbackDataLength: fallbackData.length,
    });

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
    console.log('getVisibleData: Using requested range', {
      requestedIndices: { startIndex, endIndex },
      actualIndices: { actualStartIndex, actualEndIndex },
      slicedDataLength: slicedData.length,
    });
    return slicedData;
  }

  // If we're panning to historical data (negative start), try to get what we can
  if (startIndex < 0) {
    const availableStart = Math.max(0, sortedData.length + startIndex);
    const availableEnd = Math.min(sortedData.length - 1, availableStart + CHART_DATA_POINTS - 1);
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
};

const D3StockChart: React.FC<D3StockChartProps> = ({ symbol }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [timeframe, setTimeframe] = useState<ChartTimeframe | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [hoverData, setHoverData] = useState<HoverData | null>(null);
  const [isZooming, setIsZooming] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [chartLoaded, setChartLoaded] = useState(false);
  const [visibleData, setVisibleData] = useState<ChartData>([]);
  const [allChartData, setAllChartData] = useState<ChartData>([]);

  // Panning and predictive loading state
  const [currentViewStart, setCurrentViewStart] = useState(0);
  const [currentViewEnd, setCurrentViewEnd] = useState(0);
  const [isLoadingMoreData, setIsLoadingMoreData] = useState(false);
  const isInitialLoad = useRef(true);

  // Track loading attempts to prevent infinite loops
  const lastLoadAttemptRef = useRef<{ type: 'left' | 'right'; dataLength: number } | null>(null);

  // Track when we've reached the limits of available data
  const dataLimitsRef = useRef<{ hasReachedLeftLimit: boolean; hasReachedRightLimit: boolean }>({
    hasReachedLeftLimit: false,
    hasReachedRightLimit: false,
  });

  // Track if we're currently loading data to preserve price range
  const isDataLoadingRef = useRef<boolean>(false);

  // Track if we're currently vertically panning to prevent data loading conflicts
  const isVerticallyPanningRef = useRef<boolean>(false);

  // Track if user has panned to enable data loading
  const [hasUserPanned, setHasUserPanned] = useState<boolean>(false);

  // Track last data loading check to prevent spam
  const lastDataLoadCheckRef = useRef<number>(0);
  const DATA_LOAD_CHECK_INTERVAL = 500; // Minimum 500ms between data load checks

  // Track last view indices to detect significant changes
  const lastViewIndicesRef = useRef<{ start: number; end: number } | null>(null);

  // Track if chart already exists to avoid unnecessary recreations
  const [chartExists, setChartExists] = useState<boolean>(false);

  // Transform is now handled directly in handleZoom for smooth panning

  // Store fixed y-scale domain to prevent recalculation during panning
  const [fixedYScaleDomain, setFixedYScaleDomain] = useState<[number, number] | null>(null);

  // Chart dimensions
  const [dimensions, setDimensions] = useState<ChartDimensions>({
    width: 800,
    height: 400,
    margin: { top: 20, right: 60, bottom: 40, left: 0 },
  });

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
    bufferPoints: 100, // Increased buffer for more data preloading
    onDataLoaded: (data: ChartData) => {
      // Update all chart data whenever new data is loaded
      setAllChartData(data);
    },
  });

  // WebSocket for real-time data
  const chartWebSocket = useChartWebSocket({
    symbol,
  });

  // Update visible data when view changes
  useEffect(() => {
    if (allChartData.length > 0) {
      const newVisibleData = getVisibleDataPoints(currentViewStart, currentViewEnd, allChartData);
      console.log('Updating visible data:', {
        currentViewStart,
        currentViewEnd,
        allChartDataLength: allChartData.length,
        newVisibleDataLength: newVisibleData.length,
        newVisibleDataStart: newVisibleData[0]?.time,
        newVisibleDataEnd: newVisibleData[newVisibleData.length - 1]?.time,
      });
      setVisibleData(newVisibleData);
    }
  }, [currentViewStart, currentViewEnd, allChartData]);

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
      // setChartExists(false); // Reset chart existence for new symbol/timeframe
      setHasUserPanned(false); // Reset user panning state
      setChartLoaded(false); // Reset chart loaded state
      setFixedYScaleDomain(null); // Reset fixed y-scale domain for new data

      // Reset data limits for new symbol/timeframe
      dataLimitsRef.current = {
        hasReachedLeftLimit: false,
        hasReachedRightLimit: false,
      };
      lastLoadAttemptRef.current = null; // Reset load attempt tracking

      console.log('🔄 Loading new data for symbol/timeframe:', { symbol, timeframe });
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
    const handleResize = (): void => {
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
    if (allChartData.length > 0) {
      const totalDataLength = allChartData.length;
      const prevDataLength = prevDataLengthRef.current;

      // If this is the first load, show newest data with proper buffer setup
      if (prevDataLength === 0) {
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

        setCurrentViewStart(newStartIndex);
        setCurrentViewEnd(newEndIndex);
        isInitialLoad.current = false; // Mark initial load as complete
        // setChartExists(false); // Reset chart existence for new data
      } else if (totalDataLength > prevDataLength) {
        // If data length increased (new data loaded), don't adjust view position
        // The view should only change during user interactions, not data loads
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
      }

      prevDataLengthRef.current = totalDataLength;
    }
  }, [allChartData.length]);

  // Check if we need to load more data when panning
  const checkAndLoadMoreData = useCallback(async (): Promise<void> => {
    if (
      !symbol ||
      !timeframe ||
      isLoadingMoreData ||
      isInitialLoad.current ||
      !hasUserPanned ||
      isVerticallyPanningRef.current ||
      isDataLoadingRef.current ||
      !chartExists
    ) {
      return;
    }

    // Set data loading flag immediately to prevent concurrent calls
    isDataLoadingRef.current = true;

    const totalDataLength = allChartData.length;

    // Calculate actual buffer positions based on current view
    const leftBufferRemaining = currentViewStart; // How much data is available to the left
    const rightBufferRemaining = totalDataLength - currentViewEnd - 1; // How much data is available to the right

    let shouldLoadLeft = false;
    let shouldLoadRight = false;

    // Check if we need more historical data (approaching left edge of buffer)
    if (
      leftBufferRemaining <= DATA_FETCH_THRESHOLD &&
      !chartDataHook.isLeftLoading &&
      !dataLimitsRef.current.hasReachedLeftLimit &&
      totalDataLength > 0
    ) {
      const lastAttempt = lastLoadAttemptRef.current;
      if (!(lastAttempt?.type === 'left' && lastAttempt.dataLength === totalDataLength)) {
        shouldLoadLeft = true;
        console.log('🔄 Need more historical data:', {
          leftBufferRemaining,
          threshold: DATA_FETCH_THRESHOLD,
          currentViewStart,
          totalDataLength,
          hasReachedLeftLimit: dataLimitsRef.current.hasReachedLeftLimit,
        });
      }
    }

    // Check if we need more recent data (approaching right edge of buffer)
    // Note: For future data, we're more restrictive as there might not be any data available
    if (
      rightBufferRemaining <= DATA_FETCH_THRESHOLD &&
      !chartDataHook.isRightLoading &&
      !dataLimitsRef.current.hasReachedRightLimit &&
      totalDataLength > 0
    ) {
      const lastAttempt = lastLoadAttemptRef.current;
      if (!(lastAttempt?.type === 'right' && lastAttempt.dataLength === totalDataLength)) {
        shouldLoadRight = true;
        console.log('🔄 Need more recent data:', {
          rightBufferRemaining,
          threshold: DATA_FETCH_THRESHOLD,
          currentViewEnd,
          totalDataLength,
          hasReachedRightLimit: dataLimitsRef.current.hasReachedRightLimit,
        });
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
        const prevDataLength = allChartData.length;
        await chartDataHook.loadMoreDataLeft(symbol, timeframe);

        // Check if we've reached the left limit (no more historical data available)
        // Wait a bit for the data to be processed, then check if data length increased
        setTimeout(() => {
          if (allChartData.length === prevDataLength) {
            dataLimitsRef.current.hasReachedLeftLimit = true;
            console.log('📍 Reached left data limit - no more historical data available');
          }
        }, 100);
      }

      if (shouldLoadRight) {
        lastLoadAttemptRef.current = { type: 'right', dataLength: totalDataLength };
        setIsLoadingMoreData(true);
        const prevDataLength = allChartData.length;
        await chartDataHook.loadMoreDataRight(symbol, timeframe);

        // Check if we've reached the right limit (no more future data available)
        // Wait a bit for the data to be processed, then check if data length increased
        setTimeout(() => {
          if (allChartData.length === prevDataLength) {
            dataLimitsRef.current.hasReachedRightLimit = true;
            console.log('📍 Reached right data limit - no more future data available');
          }
        }, 100);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
      // On error, mark limits as reached to prevent infinite retries
      if (shouldLoadLeft) {
        dataLimitsRef.current.hasReachedLeftLimit = true;
      }
      if (shouldLoadRight) {
        dataLimitsRef.current.hasReachedRightLimit = true;
      }
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
  useEffect((): void => {
    if (allChartData.length > 0 && !isLoadingMoreData && !isInitialLoad.current && hasUserPanned) {
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

      // Only check for data loading if enough time has passed, we're not already loading,
      // and there's a significant change
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
  const RIGHT_EDGE_CHECK_INTERVAL = 1000; // Check every 1 second to prevent rapid toggling

  useEffect(() => {
    const dataLength = allChartData.length;
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
  }, [currentViewEnd, allChartData.length, isLive]);

  useEffect(() => {
    // svgRef.current now points to the <svg> element in the DOM
    console.log('SVG element is ready:', svgRef.current);
  }, []);

  // Centralized chart rendering - only re-render when data changes, not during panning
  useEffect(() => {
    if (!visibleData || visibleData.length === 0 || !allChartData.length) {
      return;
    }
    if (svgRef.current) {
      // Create calculations for initial render (no transform)
      const initialTransform = d3.zoomIdentity;
      const calculations = calculateChartState({
        dimensions,
        allChartData,
        transform: initialTransform,
        fixedYScaleDomain,
      });

      renderCandlestickChart(svgRef.current as SVGSVGElement, calculations);
    }
  }, [visibleData, allChartData, dimensions, fixedYScaleDomain]);

  // Create chart when data is available and view is properly set
  useEffect(() => {
    if (allChartData.length > 0 && currentViewEnd > 0 && visibleData && visibleData.length > 0) {
      // Only validate that we have a reasonable range
      // Negative indices are normal when panning to historical data
      if (currentViewStart > currentViewEnd || currentViewEnd < 0) {
        console.warn('Invalid view range in chart creation effect, resetting to valid values:', {
          currentViewStart,
          currentViewEnd,
          dataLength: allChartData.length,
        });

        // Reset to valid view indices
        const validViewStart = Math.max(0, allChartData.length - CHART_DATA_POINTS);
        const validViewEnd = allChartData.length - 1;
        setCurrentViewStart(validViewStart);
        setCurrentViewEnd(validViewEnd);
        return;
      }

      // Create chart if it doesn't exist yet, or if there's a significant data change
      // Don't recreate chart after panning - this causes unwanted y-scale recalculation
      const shouldCreateChart = !chartExists;

      if (shouldCreateChart) {
        console.log(
          'Creating chart - chartExists:',
          chartExists,
          'dataLength:',
          allChartData.length,
          'visibleDataLength:',
          visibleData.length,
          'hasUserPanned:',
          hasUserPanned,
          'isPanning:',
          isPanning,
          'isZooming:',
          isZooming,
          'viewIndices:',
          { currentViewStart, currentViewEnd }
        );

        // Create calculations for chart creation
        const initialTransform = d3.zoomIdentity;
        const calculations = calculateChartState({
          dimensions,
          allChartData,
          transform: initialTransform,
          fixedYScaleDomain,
        });

        createChart({
          svgElement: svgRef.current as SVGSVGElement,
          allChartData,
          xScale: calculations.baseXScale,
          yScale: calculations.baseYScale,
          chartLoaded,
          visibleData,
          setChartExists,
          dimensions,
          setIsZooming,
          setIsPanning,
          setHasUserPanned,
          setCurrentViewStart,
          setCurrentViewEnd,
          checkAndLoadMoreData,
          setHoverData,
          setChartLoaded,
          setFixedYScaleDomain,
          fixedYScaleDomain,
        });
      }
    }

    return undefined; // Explicit return for linter
  }, [
    allChartData.length,
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
            <span>Total data: {allChartData.length}</span>
            <span>Displaying: {CHART_DATA_POINTS} points</span>
            <span>
              View:{' '}
              {(() => {
                const actualStart = Math.max(0, currentViewStart);
                const actualEnd = Math.min(allChartData.length - 1, currentViewEnd);
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
